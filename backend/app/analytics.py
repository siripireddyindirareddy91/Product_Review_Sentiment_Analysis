from collections import Counter
from datetime import date, timedelta

from sqlalchemy import case, func, select

from .db import Category, Prediction, Product, Review, Store
from .nlp import LABELS, keywords_for, rating_label

def joined(dataset_id):
    return (select(Review.id, Review.text, Review.rating, Review.verified, Review.date, Review.segment.label("customer_segment"),
                   Review.external_id.label("review_id"), Product.id.label("product_id"), Product.name.label("product"),
                   Category.name.label("category"), Store.name.label("store"), Prediction.sentiment, Prediction.confidence,
                   Prediction.model_version).join(Product, Product.id == Review.product_id).join(Category, Category.id == Product.category_id)
            .join(Prediction, Prediction.review_id == Review.id).outerjoin(Store, Store.id == Review.store_id)
            .where(Review.dataset_id == dataset_id))

def rows_for(session, dataset_id, limit=None):
    statement = joined(dataset_id).order_by(Review.date.desc().nulls_last(), Review.id.desc())
    if limit:
        statement = statement.limit(limit)
    return [dict(row) for row in session.execute(statement).mappings()]

def disagreement():
    target = case((Review.rating < 3, "negative"), (Review.rating > 3, "positive"), else_="neutral")
    return target != Prediction.sentiment

def metrics():
    return [func.count(Review.id).label("total"), func.avg(Review.rating).label("rating"),
            func.sum(case((Review.verified, 1), else_=0)).label("verified"),
            *[func.sum(case((Prediction.sentiment == label, 1), else_=0)).label(label) for label in LABELS]]

def rounded_metrics(row):
    result = dict(row)
    result["rating"] = round(float(result["rating"] or 0), 2)
    for label in [*LABELS, "verified"]:
        result[label] = result[label] or 0
        result[label + "_pct"] = round(result[label] * 100 / (result["total"] or 1), 1)
    return result

def aggregate(session, dataset_id, dimension=None):
    groups = {
        "product": [Product.id.label("id"), Product.name.label("name"), Category.name.label("category")],
        "category": [Category.name.label("name")],
        "verified": [case((Review.verified, "Verified"), else_="Unverified").label("name")],
        "store": [Store.name.label("name")],
        "segment": [Review.segment.label("name")],
        "rating": [Review.rating.label("name")],
        "period": [func.substr(Review.date, 1, 7).label("name")],
    }
    columns = groups.get(dimension, [])
    query = (select(*columns, *metrics()).select_from(Review).join(Prediction, Prediction.review_id == Review.id)
             .join(Product, Product.id == Review.product_id).join(Category, Category.id == Product.category_id)
             .outerjoin(Store, Store.id == Review.store_id).where(Review.dataset_id == dataset_id))
    if columns:
        query = query.where(columns[0].is_not(None)).group_by(*columns).order_by(func.count(Review.id).desc(), columns[0])
    return [rounded_metrics(row) for row in session.execute(query).mappings()]

def trends(session, dataset_id, period="month", threshold=15, product_id=None):
    query = (select(Review.date, *metrics()).select_from(Review).join(Prediction, Prediction.review_id == Review.id)
             .where(Review.dataset_id == dataset_id, Review.date.is_not(None)).group_by(Review.date).order_by(Review.date))
    if product_id:
        query = query.where(Review.product_id == product_id)
    buckets = {}
    for row in session.execute(query).mappings():
        day = date.fromisoformat(row["date"])
        key = day.isoformat() if period == "day" else (day-timedelta(days=day.weekday())).isoformat() if period == "week" else day.strftime("%Y-%m")
        bucket = buckets.setdefault(key, dict(period=key, total=0, rating=0, verified=0, positive=0, negative=0, neutral=0))
        for label in ["total", "verified", *LABELS]:
            bucket[label] += row[label]
        bucket["rating"] += float(row["rating"]) * row["total"]
    series = []
    for bucket in buckets.values():
        bucket["rating"] /= bucket["total"]
        item = rounded_metrics(bucket)
        previous = series[-1] if series else None
        item["negative_change"] = round(item["negative_pct"] - previous["negative_pct"], 1) if previous else None
        item["spike"] = bool(previous and min(previous["total"], item["total"]) >= 5 and item["negative_change"] >= threshold)
        series.append(item)
    return series

def product_details(session, dataset_id):
    products = aggregate(session, dataset_id, "product")
    rows = rows_for(session, dataset_id, limit=5000)
    grouped = {}
    for row in rows:
        grouped.setdefault(row["product_id"], []).append(row)
    for product in products:
        examples = grouped.get(product["id"], [])
        for label, field in [("negative", "complaint"), ("positive", "feature")]:
            phrases = keywords_for([row for row in examples if row["sentiment"] == label], 1)
            product[field] = phrases[0]["term"] if phrases else None
    return sorted(products, key=lambda item: (-item["negative_pct"], -item["total"], item["name"]))

def overview(session, dataset_id, threshold=15):
    totals = aggregate(session, dataset_id)[0]
    products = aggregate(session, dataset_id, "product")
    categories = aggregate(session, dataset_id, "category")
    rows = rows_for(session, dataset_id, limit=2500)
    trend = trends(session, dataset_id, threshold=threshold)
    highest = max(categories, key=lambda item: item["negative"], default=None)
    totals.update(products=len(products), categories=len(categories),
                  top_complaint_category=highest["name"] if highest and highest["negative"] else None,
                  disagreement=session.scalar(select(func.count()).select_from(joined(dataset_id).where(disagreement()).subquery())))
    return {"metrics": totals, "trends": trend, "products": sorted(products, key=lambda product: (-product["positive_pct"], -product["total"])),
            "categories": categories, "keywords": keywords_for(rows),
            "recent_complaints": [row for row in rows if row["sentiment"] == "negative"][:5],
            "alerts": [row for row in trend if row["spike"]]}

def recommendations(topics, product_stats):
    result = []
    risks = {row["id"]: row for row in product_stats}
    for topic in topics:
        negative = topic["distribution"]["negative"]
        if not negative:
            continue
        examples = [row for row in topic["reviews"] if row["sentiment"] == "negative"][:3]
        affected = list(dict.fromkeys(row["product"] for row in examples))
        if not affected:
            continue
        rate = negative / topic["count"]
        priority = "High" if rate >= 0.45 and negative >= 5 else "Medium" if rate >= 0.25 else "Low"
        terms = ", ".join(topic["terms"][:3])
        result.append({"issue": f"Negative feedback associated with {terms}", "priority": priority,
                       "affected": affected, "examples": examples,
                       "evidence": f'{negative} of {topic["count"]} assigned reviews ({rate:.0%}) were classified negative.',
                       "action": f"Review the cited feedback about {terms} with the product owner and check whether the issue can be reproduced.",
                       "explanation": "Topics group related terms from review text. Sample size and automated sentiment can affect these results."})
    if risks:
        worst = max(risks.values(), key=lambda row: (row["negative_pct"], row["total"]))
        if worst["negative"]:
            result.append({"issue": f'Negative sentiment for {worst["name"]}', "priority": "High" if worst["negative_pct"] >= 35 and worst["total"] >= 10 else "Medium",
                           "affected": [worst["name"]], "examples": [],
                           "evidence": f'{worst["negative"]} of {worst["total"]} reviews were classified negative ({worst["negative_pct"]}%).',
                           "action": "Inspect the product’s lowest-rated and negative reviews for recurring failures, then validate them against support records.",
                           "explanation": "Ranked by the share of negative reviews. Compare sample sizes before prioritizing."})
    return result
