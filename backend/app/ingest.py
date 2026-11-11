import csv
import hashlib
import io
import json
from collections import Counter
from datetime import date, datetime

from sqlalchemy import select

from .db import Category, Dataset, Prediction, Product, Quality, Review, Store
from .nlp import clean, lexical_prediction

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 20000
REQUIRED = ["review_text", "rating", "product", "category", "verified_purchase"]
ALIASES = {
    "review_text": ["review", "text", "body", "comment", "review body", "content"],
    "rating": ["stars", "score", "star rating", "overall"],
    "product": ["product name", "item", "item name", "asin"],
    "category": ["product category", "department"],
    "verified_purchase": ["verified", "is verified", "verified purchase"],
    "review_date": ["date", "timestamp", "review time", "created at"],
    "store": ["store name", "merchant", "retailer"],
    "customer_segment": ["segment", "customer group"],
    "review_id": ["id", "external id", "review identifier"],
}
FIELDS = list(ALIASES)

def normalized(text):
    return " ".join(clean(text).split())

def read_file(name, content):
    if len(content) > MAX_BYTES:
        raise ValueError("Upload is limited to 8 MB.")
    if name.lower().endswith(".csv"):
        source = csv.reader(io.StringIO(content.decode("utf-8-sig")))
        return read_rows(source)
    if name.lower().endswith(".xlsx"):
        from openpyxl import load_workbook
        from zipfile import ZipFile
        with ZipFile(io.BytesIO(content)) as archive:
            if sum(info.file_size for info in archive.infolist()) > 64 * 1024 * 1024:
                raise ValueError("Expanded workbook is too large.")
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        try:
            return read_rows(workbook.active.iter_rows(values_only=True))
        finally:
            workbook.close()
    raise ValueError("Upload a UTF-8 CSV or Excel .xlsx workbook.")

def read_rows(source):
    source = iter(source)
    headers = [str(item or "").strip() for item in next(source, [])]
    if not headers or any(not name for name in headers) or len(headers) != len(set(headers)):
        raise ValueError("Provide a header row with unique, non-empty column names.")
    rows = []
    for values in source:
        if not any(value is not None and str(value).strip() for value in values):
            continue
        if len(rows) >= MAX_ROWS:
            raise ValueError("Upload is limited to 20,000 records.")
        rows.append(dict(zip(headers, values)))
    return headers, rows

def automatic_mapping(headers):
    lookup = {normalized(header): header for header in headers}
    return {field: next((lookup[normalized(alias)] for alias in [field, *aliases] if normalized(alias) in lookup), "")
            for field, aliases in ALIASES.items()}

def parse_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return datetime.fromisoformat(str(value).strip().replace("Z", "+00:00")).date().isoformat()

def validate(headers, rows, custom=None):
    mapping = automatic_mapping(headers)
    if custom:
        if any(field not in FIELDS or (name and name not in headers) for field, name in custom.items()):
            raise ValueError("Column mapping refers to an unknown field or header.")
        mapping.update(custom)
    missing_columns = [field for field in REQUIRED if not mapping[field]]
    used = [name for name in mapping.values() if name]
    if len(set(used)) != len(used):
        raise ValueError("Map each source column to a single field.")
    quality = Counter()
    issues, valid, seen, identifiers = [], [], set(), set()
    for i, row in enumerate(rows, start=2):
        raw = {field: row.get(column) for field, column in mapping.items()}
        values = {key: str(value if value is not None else "").strip() for key, value in raw.items()}
        errors = []
        for field in REQUIRED:
            if not values[field]:
                quality["missing_values"] += 1
                errors.append(f"Missing {field}")
        if values["review_text"] and not clean(values["review_text"]):
            errors.append("Review text has no usable tokens")
        if len(values["review_text"]) > 16000 or any(len(values[field]) > 240 for field in FIELDS if field != "review_text"):
            errors.append("A value exceeds the maximum field length")
        rating = 0
        if values["rating"]:
            try:
                rating = float(values["rating"])
                if not 1 <= rating <= 5:
                    raise ValueError()
            except ValueError:
                quality["invalid_ratings"] += 1
                errors.append("Rating must be between 1 and 5")
        verified = values["verified_purchase"].lower()
        if verified and verified not in {"true", "false", "yes", "no", "1", "0", "y", "n", "1.0", "0.0"}:
            quality["invalid_booleans"] += 1
            errors.append("Invalid verified purchase value")
        review_date = None
        if values["review_date"]:
            try:
                review_date = parse_date(raw["review_date"])
                if review_date > date.today().isoformat():
                    raise ValueError()
            except (TypeError, ValueError, OverflowError):
                quality["invalid_dates"] += 1
                errors.append("Invalid or future review date")
        signature = json.dumps([clean(values["review_text"]), normalized(values["product"]), normalized(values["category"])], ensure_ascii=False)
        fingerprint = hashlib.sha256(signature.encode()).hexdigest()
        external_id = values["review_id"] or None
        if fingerprint in seen or (external_id and external_id in identifiers):
            quality["duplicates"] += 1
            errors.append("Duplicate review text/product/category or review ID")
        if errors:
            if len(issues) < 50:
                issues.append({"row": i, "issues": errors})
            continue
        seen.add(fingerprint)
        if external_id:
            identifiers.add(external_id)
        valid.append({**values, "review_id": external_id, "rating": rating, "review_date": review_date,
                      "verified_purchase": verified in {"true", "yes", "1", "1.0", "y"}, "fingerprint": fingerprint})
    report = {key: quality[key] for key in ["missing_values", "invalid_ratings", "invalid_booleans", "invalid_dates", "duplicates"]}
    report.update(total=len(rows), valid=len(valid), invalid=len(rows)-len(valid), missing_columns=missing_columns,
                  status="ready" if valid else "blocked", issues=issues)
    return mapping, valid, report

def persist(session, name, rows, report, owner_id=None, demo=False):
    dataset = Dataset(name=name[:160], owner_id=owner_id, is_demo=demo)
    session.add(dataset)
    session.flush()
    session.add(Quality(dataset_id=dataset.id, payload=json.dumps(report)))
    categories, products, stores = {}, {}, {}
    imported = []
    for row in rows:
        category_key = normalized(row["category"])
        if category_key not in categories:
            category = Category(dataset_id=dataset.id, name=row["category"])
            session.add(category)
            session.flush()
            categories[category_key] = category.id
        category_id = categories[category_key]
        product_key = (category_id, normalized(row["product"]))
        if product_key not in products:
            product = Product(category_id=category_id, name=row["product"])
            session.add(product)
            session.flush()
            products[product_key] = product.id
        store_key = normalized(row["store"])
        if store_key and store_key not in stores:
            store = Store(dataset_id=dataset.id, name=row["store"])
            session.add(store)
            session.flush()
            stores[store_key] = store.id
        review = Review(dataset_id=dataset.id, product_id=products[product_key], store_id=stores.get(store_key),
                        text=row["review_text"], rating=row["rating"], verified=row["verified_purchase"],
                        date=row["review_date"], segment=row["customer_segment"] or None,
                        external_id=row["review_id"], fingerprint=row["fingerprint"])
        imported.append(review)
    session.add_all(imported)
    session.flush()
    for review in imported:
        prediction = lexical_prediction(review.text)
        session.add(Prediction(review_id=review.id, sentiment=prediction["sentiment"], confidence=prediction["confidence"],
                               model_version=prediction["model_version"]))
    session.flush()
    return dataset
