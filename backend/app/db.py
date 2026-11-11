import os
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

def now():
    return datetime.now(timezone.utc).isoformat()

def database_url():
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("STORAGE_URL")
    if url:
        return url.replace("postgres://", "postgresql://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
    return "sqlite:////tmp/verdictra.db" if os.getenv("VERCEL") else "sqlite:///./verdictra.db"

url = database_url()
engine = create_engine(url, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_size": 2, "max_overflow": 2, "pool_recycle": 300}))
Session = sessionmaker(engine, expire_on_commit=False)

if url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    role: Mapped[str] = mapped_column(default="member")
    created_at: Mapped[str] = mapped_column(default=now)

class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str]
    is_demo: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[str] = mapped_column(default=now)

class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    name: Mapped[str]
    __table_args__ = (UniqueConstraint("dataset_id", "name"),)

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str]
    __table_args__ = (UniqueConstraint("category_id", "name"),)

class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    name: Mapped[str]
    __table_args__ = (UniqueConstraint("dataset_id", "name"),)

class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id", ondelete="SET NULL"))
    text: Mapped[str]
    rating: Mapped[float]
    verified: Mapped[bool]
    date: Mapped[str | None]
    segment: Mapped[str | None]
    external_id: Mapped[str | None]
    fingerprint: Mapped[str]
    __table_args__ = (UniqueConstraint("dataset_id", "fingerprint"), UniqueConstraint("dataset_id", "external_id"), Index("ix_reviews_dataset_date", "dataset_id", "date"),)

class Prediction(Base):
    __tablename__ = "sentiment_predictions"
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True)
    sentiment: Mapped[str]
    confidence: Mapped[float]
    model_version: Mapped[str]

class Quality(Base):
    __tablename__ = "data_quality_reports"
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), primary_key=True)
    payload: Mapped[str]

class ModelVersion(Base):
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    status: Mapped[str]
    artifact: Mapped[bytes | None]
    created_at: Mapped[str] = mapped_column(default=now)

class Evaluation(Base):
    __tablename__ = "model_evaluations"
    model_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id", ondelete="CASCADE"), primary_key=True)
    payload: Mapped[str]

class Topic(Base):
    __tablename__ = "topics"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    payload: Mapped[str]

class TopicAssignment(Base):
    __tablename__ = "topic_assignments"
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True)
    relevance: Mapped[float]

class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    payload: Mapped[str]

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str]
    created_at: Mapped[str] = mapped_column(default=now)
