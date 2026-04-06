"""
database.py — Synchronous SQLAlchemy engine and session factory.

All database operations in ReceiptDesigner use synchronous SQLAlchemy.
Route handlers are plain `def` (not `async def`) and use Sessions injected
via FastAPI `Depends(get_session)`.

Design decisions:
- connect_args={"check_same_thread": False} is required for SQLite when the
  engine is shared across multiple requests (FastAPI uses a thread pool).
- The engine is created once at module import time and reused for the life of
  the process.
- get_session is a generator-based FastAPI dependency; it yields a Session
  and ensures it is closed (and rolled back on error) after each request.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from server.app.config import settings

# ---------------------------------------------------------------------------
# ORM base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy ORM models."""


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


def _make_engine() -> Engine:
    db_path = Path(settings.db_path)
    # Ensure the parent directory exists (useful on first run).
    db_path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        echo=settings.debug,
    )

    # Enable WAL mode for better concurrency on SQLite.
    @event.listens_for(engine, "connect")
    def set_wal_mode(dbapi_conn: object, _connection_record: object) -> None:
        import sqlite3

        if isinstance(dbapi_conn, sqlite3.Connection):
            dbapi_conn.execute("PRAGMA journal_mode=WAL")
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return engine


engine = _make_engine()

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_session() -> Generator[Session, None, None]:
    """
    Yield a database session for use in a single request.

    FastAPI calls this as a dependency; the session is closed automatically
    after the response is sent (or on error).
    """
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
