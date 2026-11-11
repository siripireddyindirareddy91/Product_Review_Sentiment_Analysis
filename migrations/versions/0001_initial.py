"""Initial VERDICTRA schema."""
from alembic import op
from sqlalchemy import MetaData

from backend.app.db import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def initial_metadata():
    metadata = MetaData()
    names = ("users", "datasets", "categories", "products", "stores", "reviews", "sentiment_predictions",
             "data_quality_reports", "model_versions", "model_evaluations", "topics", "topic_assignments",
             "recommendations", "audit_logs")
    for name in names:
        Base.metadata.tables[name].to_metadata(metadata)
    return metadata

def upgrade():
    initial_metadata().create_all(op.get_bind(), checkfirst=not op.get_context().as_sql)

def downgrade():
    initial_metadata().drop_all(op.get_bind(), checkfirst=not op.get_context().as_sql)
