"""
schemas/folder.py — Pydantic request/response models for folders.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1)


class FolderUpdate(BaseModel):
    name: str = Field(min_length=1)


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
