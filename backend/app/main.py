import io
import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal
from zipfile import BadZipFile

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from . import analytics, auth, ingest, nlp, reporting
from .db import AuditLog, Base, Category, Dataset, Evaluation, ModelVersion, Prediction, Product, Quality, Recommendation, Review, Session, Store, Topic, TopicAssignment, User, engine

logger = logging.getLogger("verdictra")
SAMPLE = Path(__file__).resolve().parents[2] / "data/sample/reviews.csv"
DEMO_EMAIL = "demo@verdictra.example"
DEMO_PASSWORD = "VerdictraDemo2026"
DURABLE = not os.getenv("VERCEL") or engine.dialect.name != "sqlite"
WRITABLE = DURABLE and (not os.getenv("VERCEL") or bool(os.getenv("JWT_SECRET")))
bootstrap_lock = Lock()
app = FastAPI(title="VERDICTRA API", version="1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
router = APIRouter(prefix="/api")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"])

class Credentials(BaseModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]

class ReviewInput(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=16000)]

@lru_cache(maxsize=1)
def bootstrap():
    with bootstrap_lock, engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(551623413)"))
        Base.metadata.create_all(conn)
        with Session(bind=conn) as session:
            if session.scalar(select(Dataset.id).where(Dataset.is_demo)):
                return True
            headers, rows = ingest.read_file(SAMPLE.name, SAMPLE.read_bytes())
            _, valid, quality = ingest.validate(headers, rows)
            ingest.persist(session, "VERDICTRA Demo Dataset", valid, quality, demo=True)
            session.commit()
    return True

def database():
    bootstrap()
    with Session() as session:
        yield session

DB = Annotated[Session, Depends(database)]

def actor(session: DB, authorization: Annotated[str | None, Header()] = None):
    identifier = auth.identity(authorization)
    if identifier in (0, None):
        return None
    user = session.get(User, identifier)
    if not user:
        raise HTTPException(401, "Account no longer exists.")
    return user

Actor = Annotated[User | None, Depends(actor)]

def member(user: Actor):
    if not WRITABLE:
        raise HTTPException(503, "Account changes require durable database and JWT configuration.")
    if not user or user.role != "member":
        raise HTTPException(403, "Sign in with a personal account to make changes.")
    return user

Member = Annotated[User, Depends(member)]

def demo(session):
    return session.scalar(select(Dataset).where(Dataset.is_demo))

def accessible(session, user, dataset_id, write=False):
    if dataset_id is None and not write:
        return demo(session)
    dataset = session.get(Dataset, dataset_id)
    if dataset and ((dataset.is_demo and not write) or (user and dataset.owner_id == user.id)):
        return dataset
    raise HTTPException(404, "Dataset not found.")

def active(session: DB, user: Actor, dataset: int | None = None):
    return accessible(session, user, dataset)

Active = Annotated[Dataset, Depends(active)]

def dataset_info(session, dataset):
    quality = session.get(Quality, dataset.id)
    return {"id": dataset.id, "name": dataset.name, "is_demo": dataset.is_demo, "created_at": dataset.created_at,
            "rows": json.loads(quality.payload)["valid"] if quality else 0}

def audit(session, user, action):
    session.add(AuditLog(user_id=user.id, action=action))

@app.exception_handler(SQLAlchemyError)
async def database_error(_request: Request, error: SQLAlchemyError):
    logger.error("Database operation failed: %s", type(error).__name__)
    return JSONResponse({"detail": "The database is temporarily unavailable. Try again shortly."}, status_code=503)

@router.get("/health")
def health(session: DB):
    session.execute(text("SELECT 1"))
    return {"status": "ok", "durable_storage": DURABLE, "accounts_enabled": WRITABLE, "version": app.version}

@router.post("/auth/register", status_code=201)
def register(body: Credentials, session: DB):
    if not WRITABLE:
        raise HTTPException(503, "Registration requires durable database and JWT configuration.")
    email = body.email.lower()
    if email == DEMO_EMAIL or not auth.EMAIL.fullmatch(email):
        raise HTTPException(422, "Enter a valid personal email address.")
    user = User(email=email, password_hash=auth.password_hash(body.password))
    session.add(user)
    try:
        session.flush()
        audit(session, user, "register")
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(409, "An account with this email already exists.") from error
    return {"access_token": auth.issue(user.id), "email": user.email, "role": user.role}

@router.post("/auth/login")
def login(body: Credentials, session: DB):
    email = body.email.lower()
    if email == DEMO_EMAIL and body.password == DEMO_PASSWORD:
        return {"access_token": auth.issue(0), "email": DEMO_EMAIL, "role": "viewer"}
    user = session.scalar(select(User).where(User.email == email))
    if not user or not auth.password_matches(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"access_token": auth.issue(user.id), "email": user.email, "role": user.role}

@router.get("/auth/me")
def profile(user: Actor, authorization: Annotated[str | None, Header()] = None):
    if user:
        return {"email": user.email, "role": user.role, "created_at": user.created_at}
    if auth.identity(authorization) == 0:
        return {"email": DEMO_EMAIL, "role": "viewer"}
    raise HTTPException(401, "Sign in to view your account.")

@router.get("/datasets/sample")
def sample():
    return FileResponse(SAMPLE, media_type="text/csv", filename="verdictra-sample.csv")

@router.get("/datasets")
def list_datasets(session: DB, user: Actor):
    query = select(Dataset).where(or_(Dataset.is_demo, Dataset.owner_id == user.id) if user else Dataset.is_demo)
    return [dataset_info(session, item) for item in session.scalars(query.order_by(Dataset.is_demo.desc(), Dataset.id.desc()))]

@router.post("/datasets/upload")
def upload(session: DB, user: Member, file: Annotated[UploadFile, File()],
           mapping: Annotated[str, Form()] = "{}", confirm: Annotated[bool, Form()] = False):
    name = file.filename or ""
    try:
        fields = json.loads(mapping)
        if not isinstance(fields, dict) or any(not isinstance(value, str) for value in fields.values()):
            raise ValueError("Column mapping must be an object of source column names.")
        headers, rows = ingest.read_file(name, file.file.read(ingest.MAX_BYTES+1))
        mapped, valid, quality = ingest.validate(headers, rows, fields)
    except (ValueError, BadZipFile, KeyError, OSError) as error:
        logger.info("Upload validation failed: %s", type(error).__name__)
        message = str(error) if type(error) is ValueError else "The file could not be read as CSV or Excel."
        raise HTTPException(422, message) from error
    result = {"headers": headers, "mapping": mapped, "quality": quality,
              "preview": [{key: row[key] for key in ingest.FIELDS} for row in valid[:5]]}
    if confirm:
        if not valid:
            raise HTTPException(422, "No valid rows to import. Fix the validation issues and try again.")
        dataset = ingest.persist(session, name, valid, quality, user.id)
        audit(session, user, f"import:{dataset.id}")
        session.commit()
        result["dataset"] = dataset_info(session, dataset)
    return result

@router.get("/datasets/{identifier}")
def dataset_details(identifier: int, session: DB, user: Actor):
    return dataset_info(session, accessible(session, user, identifier))

@router.delete("/datasets/{identifier}", status_code=204)
def remove_dataset(identifier: int, session: DB, user: Member):
    dataset = accessible(session, user, identifier, write=True)
    session.delete(dataset)
    audit(session, user, f"delete:{identifier}")
    session.commit()

@router.get("/datasets/{identifier}/quality")
def quality_report(identifier: int, session: DB, user: Actor):
    dataset = accessible(session, user, identifier)
    return json.loads(session.get(Quality, dataset.id).payload)

@router.get("/datasets/{identifier}/download")
def cleaned_dataset(identifier: int, session: DB, user: Actor):
    dataset = accessible(session, user, identifier)
    fields = ["review_id", "text", "rating", "product", "category", "verified", "date", "store", "customer_segment", "sentiment", "confidence"]
    headers = ["review_id", "review_text", "rating", "product", "category", "verified_purchase", "review_date", "store", "customer_segment", "sentiment", "confidence"]
    return reporting.export("verdictra-cleaned", "Cleaned reviews", [headers, *[[row[field] for field in fields] for row in analytics.rows_for(session, dataset.id)]], "csv")

@router.get("/reviews")
def reviews(session: DB, dataset: Active, page: Annotated[int, Query(ge=1, le=100000)] = 1,
            size: Annotated[int, Query(ge=1, le=100)] = 12, search: Annotated[str, Query(max_length=200)] = "",
            product: str | None = None, category: str | None = None, sentiment: Literal["positive", "neutral", "negative"] | None = None,
            rating: Annotated[float | None, Query(ge=1, le=5)] = None, verified: bool | None = None,
            start: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
            end: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
            sort: Literal["newest", "oldest"] = "newest", disagreement: bool = False):
    if start and end and start > end:
        raise HTTPException(422, "Start date must precede end date.")
    query = analytics.joined(dataset.id)
    for condition in [Review.text.icontains(search, autoescape=True) if search else None,
                      Product.name == product if product else None, Category.name == category if category else None,
                      Prediction.sentiment == sentiment if sentiment else None, Review.rating == rating if rating is not None else None,
                      Review.verified == verified if verified is not None else None, Review.date >= start if start else None,
                      Review.date <= end if end else None, analytics.disagreement() if disagreement else None]:
        if condition is not None:
            query = query.where(condition)
    count = session.scalar(select(func.count()).select_from(query.subquery()))
    order = (Review.date.asc().nulls_last(), Review.id.asc()) if sort == "oldest" else (Review.date.desc().nulls_last(), Review.id.desc())
    return {"total": count, "page": page, "size": size, "items": [dict(row) for row in session.execute(query.order_by(*order).offset((page-1)*size).limit(size)).mappings()]}

@router.get("/reviews/sentiment-summary")
def sentiment_summary(session: DB, dataset: Active):
    return analytics.aggregate(session, dataset.id)[0]

def evaluation(session, dataset):
    if dataset.is_demo:
        return demo_evaluation()[1]
    query = select(ModelVersion, Evaluation).join(Evaluation, Evaluation.model_id == ModelVersion.id).where(ModelVersion.dataset_id == dataset.id).order_by(ModelVersion.id.desc())
    row = session.execute(query.limit(1)).first()
    return {**json.loads(row[1].payload), "version": f"model-{row[0].id}"} if row else None

@lru_cache(maxsize=1)
def demo_evaluation():
    headers, rows = ingest.read_file(SAMPLE.name, SAMPLE.read_bytes())
    _, valid, _ = ingest.validate(headers, rows)
    samples = [{"text": row["review_text"], "rating": row["rating"], "product": row["product"], "store": row["store"],
                "customer_segment": row["customer_segment"], "date": row["review_date"]} for row in valid]
    model, report = nlp.train(samples)
    report["version"] = "demo-ml-1"
    return model, report

@router.post("/reviews/predict")
def predict(body: ReviewInput, session: DB, dataset: Active):
    if not nlp.clean(body.text):
        raise HTTPException(422, "Enter review text with usable words.")
    if dataset.is_demo:
        return nlp.model_prediction(demo_evaluation()[0], body.text, "demo-ml-1")
    version = session.scalar(select(ModelVersion).where(ModelVersion.dataset_id == dataset.id, ModelVersion.status == "ready").order_by(ModelVersion.id.desc()).limit(1))
    if not version:
        return nlp.lexical_prediction(body.text)
    import joblib
    return nlp.model_prediction(joblib.load(io.BytesIO(version.artifact)), body.text, f"model-{version.id}")

@router.get("/reviews/{identifier}")
def review_details(identifier: int, session: DB, dataset: Active):
    item = session.execute(analytics.joined(dataset.id).where(Review.id == identifier)).mappings().first()
    if item is None:
        raise HTTPException(404, "Review not found.")
    row = dict(item)
    expected = nlp.rating_label(row["rating"])
    return {**row, "rating_sentiment": expected, "disagreement": expected != row["sentiment"],
            "explanation": "Rating-derived and text-derived sentiment can differ because of mixed experiences, context, or model error. Inspect the original text before drawing conclusions."}

@router.get("/analytics/overview")
def overview(session: DB, dataset: Active, threshold: Annotated[float, Query(ge=1, le=100)] = 15):
    return analytics.overview(session, dataset.id, threshold)

@router.get("/analytics/products")
def products(session: DB, dataset: Active):
    return analytics.product_details(session, dataset.id)

@router.get("/analytics/categories")
def categories(session: DB, dataset: Active):
    return analytics.aggregate(session, dataset.id, "category")

@router.get("/analytics/trends")
def trend(session: DB, dataset: Active, period: Literal["day", "week", "month"] = "month",
          threshold: Annotated[float, Query(ge=1, le=100)] = 15, product_id: int | None = None):
    return analytics.trends(session, dataset.id, period, threshold, product_id)

@router.get("/analytics/segments")
def segments(session: DB, dataset: Active, dimension: Literal["verified", "category", "store", "segment", "rating", "period"] = "verified"):
    return analytics.aggregate(session, dataset.id, dimension)

@router.get("/analytics/complaints")
def complaints(session: DB, dataset: Active):
    return {"reviews": [dict(row) for row in session.execute(analytics.joined(dataset.id).where(Prediction.sentiment == "negative").order_by(Review.date.desc().nulls_last()).limit(30)).mappings()],
            "categories": sorted(analytics.aggregate(session, dataset.id, "category"), key=lambda item: -item["negative"])}

def topic_data(session, dataset):
    query = select(Topic).where(Topic.dataset_id == dataset.id).order_by(Topic.id)
    stored = session.scalars(query).all()
    if stored:
        return [{"id": item.id, **json.loads(item.payload)} for item in stored]
    if engine.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 551630000 + dataset.id})
        stored = session.scalars(query).all()
        if stored:
            return [{"id": item.id, **json.loads(item.payload)} for item in stored]
    result = []
    for topic in nlp.topics_for(analytics.rows_for(session, dataset.id, 2500)):
        assignments = topic.pop("assignments")
        entry = Topic(dataset_id=dataset.id, payload=json.dumps(topic))
        session.add(entry)
        session.flush()
        session.add_all(TopicAssignment(topic_id=entry.id, review_id=identifier, relevance=relevance) for identifier, relevance in assignments)
        result.append({"id": entry.id, **topic})
    if result:
        session.commit()
    return result

@router.get("/topics")
def topics(session: DB, dataset: Active):
    return topic_data(session, dataset)

@router.get("/topics/{identifier}/reviews")
def topic_reviews(identifier: int, session: DB, dataset: Active, page: Annotated[int, Query(ge=1, le=1000)] = 1):
    item = session.get(Topic, identifier)
    if item is None or item.dataset_id != dataset.id:
        raise HTTPException(404, "Topic not found.")
    query = (analytics.joined(dataset.id).join(TopicAssignment, TopicAssignment.review_id == Review.id)
             .where(TopicAssignment.topic_id == identifier).order_by(TopicAssignment.relevance.desc()).offset((page-1)*20).limit(20))
    return [dict(row) for row in session.execute(query).mappings()]

def recommendation_data(session, dataset):
    query = select(Recommendation).where(Recommendation.dataset_id == dataset.id).order_by(Recommendation.id)
    stored = session.scalars(query).all()
    if stored:
        return [{"id": item.id, **json.loads(item.payload)} for item in stored]
    topics = topic_data(session, dataset)
    if engine.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 551660000 + dataset.id})
        stored = session.scalars(query).all()
        if stored:
            return [{"id": item.id, **json.loads(item.payload)} for item in stored]
    results = []
    for item in analytics.recommendations(topics, analytics.aggregate(session, dataset.id, "product")):
        if not item["examples"] and item["affected"]:
            statement = analytics.joined(dataset.id).where(Product.name == item["affected"][0], Prediction.sentiment == "negative").limit(3)
            item["examples"] = [dict(row) for row in session.execute(statement).mappings()]
        entry = Recommendation(dataset_id=dataset.id, payload=json.dumps(item))
        session.add(entry)
        session.flush()
        results.append({"id": entry.id, **item})
    if results:
        session.commit()
    return results

@router.get("/recommendations")
def recommendations(session: DB, dataset: Active):
    return recommendation_data(session, dataset)

@router.get("/recommendations/{identifier}")
def recommendation_details(identifier: int, session: DB, dataset: Active):
    item = next((item for item in recommendation_data(session, dataset) if item["id"] == identifier), None)
    if item is None:
        raise HTTPException(404, "Recommendation not found.")
    return item

def train_task(version_id, dataset_id):
    import joblib
    with Session() as session:
        version = session.get(ModelVersion, version_id)
        if not version:
            return
        try:
            model, report = nlp.train(analytics.rows_for(session, dataset_id))
            artifact = io.BytesIO()
            joblib.dump(model, artifact, compress=3)
            version.artifact = artifact.getvalue()
            version.status = "ready"
            session.add(Evaluation(model_id=version_id, payload=json.dumps(report)))
            session.commit()
        except Exception:
            logger.exception("Training failed for model %s", version_id)
            session.rollback()
            version = session.get(ModelVersion, version_id)
            if version:
                version.status = "failed"
                session.commit()

@router.post("/ml/train", status_code=202)
def train_model(background: BackgroundTasks, session: DB, user: Member, dataset: Active):
    accessible(session, user, dataset.id, write=True)
    if engine.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 551690000 + dataset.id})
    pending = session.scalar(select(ModelVersion).where(ModelVersion.dataset_id == dataset.id, ModelVersion.status == "training"))
    if pending:
        return {"id": pending.id, "status": pending.status}
    rows = analytics.rows_for(session, dataset.id)
    classes = {label: set() for label in nlp.LABELS}
    for row in rows:
        classes[nlp.rating_label(row["rating"])].add(nlp.clean(row["text"]))
    if min(map(len, classes.values())) < 5:
        raise HTTPException(422, "Training needs at least five unique reviews in each rating-derived class.")
    version = ModelVersion(dataset_id=dataset.id, status="training")
    session.add(version)
    session.flush()
    audit(session, user, f"train:{dataset.id}")
    session.commit()
    background.add_task(train_task, version.id, dataset.id)
    return {"id": version.id, "status": version.status}

@router.get("/ml/models")
def models(session: DB, dataset: Active):
    if dataset.is_demo:
        return [{"id": "demo-ml-1", "status": "ready", "created_at": None}]
    query = select(ModelVersion.id, ModelVersion.status, ModelVersion.created_at).where(ModelVersion.dataset_id == dataset.id).order_by(ModelVersion.id.desc())
    return [dict(row) for row in session.execute(query).mappings()]

@router.get("/ml/evaluate")
def evaluate(session: DB, dataset: Active):
    return evaluation(session, dataset)

@router.get("/ml/confusion-matrix")
def confusion(session: DB, dataset: Active):
    result = evaluation(session, dataset)
    return {key: result[key] for key in ("labels", "matrix")} if result else None

@router.get("/ml/errors")
def errors(session: DB, dataset: Active):
    result = evaluation(session, dataset)
    return {key: result[key] for key in ("errors", "dimensions")} if result else {"errors": [], "dimensions": {}}

Report = Literal["executive", "products", "complaints", "model", "quality"]

@router.get("/reports/summary")
def summary(session: DB, dataset: Active):
    return {"dataset": dataset_info(session, dataset), "metrics": analytics.aggregate(session, dataset.id)[0],
            "definitions": "Sentiment shares divide each predicted class count by the total. Average rating uses the source star ratings.",
            "limitations": "Synthetic demo reviews are illustrative. Predictions can disagree with ratings. Text-based topics summarize at most 2,500 reviews."}

@router.get("/reports/export")
def export_report(session: DB, dataset: Active, report: Report = "executive", format: Literal["csv", "xlsx", "pdf"] = "csv"):
    metadata = summary(session, dataset)
    title = f"VERDICTRA {report.title()} Report"
    rows = [[title], ["Dataset", dataset.name], ["Dataset source", "Synthetic demo" if dataset.is_demo else "User upload"],
            ["Records", metadata["dataset"]["rows"]], ["Definitions", metadata["definitions"]], ["Limitations", metadata["limitations"]], []]
    if report == "executive":
        rows += [[key, value] for key, value in metadata["metrics"].items()]
    elif report in ("products", "complaints"):
        records = analytics.product_details(session, dataset.id) if report == "products" else analytics.aggregate(session, dataset.id, "category")
        columns = list(records[0]) if records else []
        rows += [columns, *[[item[key] for key in columns] for item in records]]
    elif report == "quality":
        quality = quality_report(dataset.id, session, None) if dataset.is_demo else json.loads(session.get(Quality, dataset.id).payload)
        rows += [[key, value] for key, value in quality.items() if not isinstance(value, list)]
        rows += [[], ["Source row", "Issues"], *[[item["row"], "; ".join(item["issues"])] for item in quality["issues"]]]
    else:
        result = evaluation(session, dataset)
        if not result:
            raise HTTPException(404, "Train a model for this dataset before exporting its evaluation.")
        rows += [["Model", result["selected"]], ["Method", result["methodology"]], ["Training rows", result["training_rows"]], ["Holdout rows", result["holdout_rows"]]]
        columns = ["name", "cv_macro_f1", "macro_f1", "weighted_f1", "accuracy", "precision", "recall"]
        rows += [columns, *[[item[key] for key in columns] for item in result["comparison"]]]
        rows += [[], ["Actual / predicted", *result["labels"]], *[[label, *counts] for label, counts in zip(result["labels"], result["matrix"])]]
    return reporting.export(f"verdictra-{report}", title, rows, format)

app.include_router(router)
