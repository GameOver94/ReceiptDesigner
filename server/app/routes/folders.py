"""
routes/folders.py — /api/v1/folders CRUD endpoints.

All handlers are synchronous (`def`, not `async def`).

Routes:
  GET    /api/v1/folders       — list all folders (ordered by name)
  POST   /api/v1/folders       — create a folder
  PUT    /api/v1/folders/{id}  — rename a folder
  DELETE /api/v1/folders/{id}  — delete a folder (docs moved to root)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.db.database import get_session
from server.app.db.models import Document, Folder
from server.app.routes.auth import require_auth
from server.app.schemas.folder import FolderCreate, FolderRead, FolderUpdate

router = APIRouter(
    prefix="/folders",
    tags=["folders"],
    dependencies=[Depends(require_auth)],
)


@router.get("", response_model=list[FolderRead], summary="List all folders")
def list_folders(session: Session = Depends(get_session)) -> list[FolderRead]:
    folders = session.query(Folder).order_by(Folder.name).all()
    return [FolderRead.model_validate(f) for f in folders]


@router.post("", response_model=FolderRead, status_code=201, summary="Create a folder")
def create_folder(body: FolderCreate, session: Session = Depends(get_session)) -> FolderRead:
    folder = Folder(name=body.name)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return FolderRead.model_validate(folder)


@router.put("/{folder_id}", response_model=FolderRead, summary="Rename a folder")
def rename_folder(
    folder_id: str, body: FolderUpdate, session: Session = Depends(get_session)
) -> FolderRead:
    folder = session.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = body.name
    session.commit()
    session.refresh(folder)
    return FolderRead.model_validate(folder)


@router.delete("/{folder_id}", status_code=204, summary="Delete a folder")
def delete_folder(folder_id: str, session: Session = Depends(get_session)) -> None:
    folder = session.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Move all documents in this folder to the root (folder_id = NULL).
    # This mirrors the ON DELETE SET NULL FK behaviour in LocalStorageAdapter.
    session.query(Document).filter(Document.folder_id == folder_id).update(
        {"folder_id": None}, synchronize_session="fetch"
    )

    session.delete(folder)
    session.commit()
