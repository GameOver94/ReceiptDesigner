"""
models.py — SQLAlchemy ORM models for ReceiptDesigner.

All models inherit from Base (declarative base defined in database.py).
JSON columns (placeholder_meta, printer_settings, tags) are stored as TEXT
in SQLite and serialised/deserialised via SQLAlchemy's JSON type.

Foreign key relationship:
  Document.folder_id → folders.id ON DELETE SET NULL

`is_template` is a computed property on the ORM model — it is never stored
as a column because it is derived deterministically from `content`.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from server.app.db.database import Base

# ---------------------------------------------------------------------------
# Folder
# ---------------------------------------------------------------------------


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    # Back-reference so we can navigate folder → documents in code.
    documents: Mapped[list[Document]] = relationship(
        "Document",
        back_populates="folder",
        passive_deletes=True,
    )


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # JSON columns: stored as TEXT in SQLite, serialised automatically by SQLAlchemy.
    placeholder_meta: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    printer_settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    folder_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    folder: Mapped[Folder | None] = relationship("Folder", back_populates="documents")

    @property
    def is_template(self) -> bool:
        """Derived: true when content contains at least one {{ placeholder."""
        return bool(re.search(r"\{\{", self.content))
