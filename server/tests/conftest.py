"""
conftest.py — pytest fixtures shared across all server tests.

Uses an in-memory SQLite database so tests are isolated and fast.
The API token is set to "test-token" for all tests.
"""

from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Set test token BEFORE importing settings so config reads it.
os.environ["RD_API_TOKEN"] = "test-token"
os.environ["RD_DB_PATH"] = ":memory:"

from server.app.db.database import Base, get_session  # noqa: E402
from server.app.main import app  # noqa: E402

# ---------------------------------------------------------------------------
# In-memory database engine shared across test session
# ---------------------------------------------------------------------------

_TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
)

_TestSessionLocal = sessionmaker(bind=_TEST_ENGINE, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def create_tables() -> None:
    """Create all tables in the in-memory DB before any test runs."""
    Base.metadata.create_all(bind=_TEST_ENGINE)


@pytest.fixture()
def session() -> Generator[Session, None, None]:
    """Yield a fresh DB session that is rolled back after each test."""
    connection = _TEST_ENGINE.connect()
    transaction = connection.begin()
    db: Session = _TestSessionLocal(bind=connection)
    yield db
    db.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(session: Session) -> Generator[TestClient, None, None]:
    """
    Return a TestClient that uses the in-memory DB session.

    Override the get_session dependency so route handlers see the test DB.
    """

    def override_get_session() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

AUTH_TOKEN = "test-token"


def login(client: TestClient) -> dict[str, str]:
    """Log in and return a dict suitable for use as cookies= kwarg."""
    resp = client.post("/api/v1/auth/login", json={"token": AUTH_TOKEN})
    assert resp.status_code == 200
    cookie_value: str = resp.cookies.get("rd_session") or ""
    return {"rd_session": cookie_value}
