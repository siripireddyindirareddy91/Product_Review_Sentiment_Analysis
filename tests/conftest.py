import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

workspace = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(workspace.name, 'test.db').as_posix()}"
os.environ["JWT_SECRET"] = "pytest-session-key-for-isolated-database"
os.environ.pop("VERCEL", None)

from backend.app.main import app, engine

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as active:
        yield active
    engine.dispose()
    workspace.cleanup()
