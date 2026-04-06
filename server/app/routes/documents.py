"""
routes/documents.py — /api/v1/documents CRUD endpoints.

All handlers are synchronous (`def`, not `async def`).
Business logic is intentionally thin here — the DB is the source of truth
and SQLAlchemy handles the mapping.

Routes:
  GET    /api/v1/documents         — list all documents
  POST   /api/v1/documents         — create a document
  GET    /api/v1/documents/{id}    — get a single document
  PUT    /api/v1/documents/{id}    — replace/update a document
  DELETE /api/v1/documents/{id}    — delete a document
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.db.database import get_session
from server.app.db.models import Document
from server.app.routes.auth import require_auth
from server.app.schemas.document import DocumentCreate, DocumentRead, DocumentUpdate

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    dependencies=[Depends(require_auth)],
)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=list[DocumentRead], summary="List all documents")
def list_documents(session: Session = Depends(get_session)) -> list[DocumentRead]:
    docs = session.query(Document).order_by(Document.updated_at.desc()).all()
    return [DocumentRead.model_validate(d) for d in docs]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("", response_model=DocumentRead, status_code=201, summary="Create a document")
def create_document(body: DocumentCreate, session: Session = Depends(get_session)) -> DocumentRead:
    doc = Document(
        name=body.name,
        description=body.description,
        content=body.content,
        placeholder_meta=[pm.model_dump() for pm in body.placeholder_meta],
        printer_settings=body.printer_settings.model_dump(),
        tags=body.tags,
        folder_id=body.folder_id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return DocumentRead.model_validate(doc)


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------


@router.get("/{doc_id}", response_model=DocumentRead, summary="Get a document")
def get_document(doc_id: str, session: Session = Depends(get_session)) -> DocumentRead:
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentRead.model_validate(doc)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.put("/{doc_id}", response_model=DocumentRead, summary="Update a document")
def update_document(
    doc_id: str, body: DocumentUpdate, session: Session = Depends(get_session)
) -> DocumentRead:
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.name is not None:
        doc.name = body.name
    if body.description is not None:
        doc.description = body.description
    # Allow explicit None to clear description
    if "description" in body.model_fields_set and body.description is None:
        doc.description = None
    if body.content is not None:
        doc.content = body.content
    if body.placeholder_meta is not None:
        doc.placeholder_meta = [pm.model_dump() for pm in body.placeholder_meta]
    if body.printer_settings is not None:
        doc.printer_settings = body.printer_settings.model_dump()
    if body.tags is not None:
        doc.tags = body.tags
    # folder_id can be explicitly set to None (move to root)
    if "folder_id" in body.model_fields_set:
        doc.folder_id = body.folder_id

    doc.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(doc)
    return DocumentRead.model_validate(doc)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{doc_id}", status_code=204, summary="Delete a document")
def delete_document(doc_id: str, session: Session = Depends(get_session)) -> None:
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    session.delete(doc)
    session.commit()
