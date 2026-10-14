import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_test_db(tmp_path, monkeypatch):
    """Isolate database for each test to ensure hermetic test execution."""
    test_db = tmp_path / "test_observations.db"
    monkeypatch.setenv("BACKEND_DB_PATH", str(test_db))


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)
