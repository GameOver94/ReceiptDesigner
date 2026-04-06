"""
schemas/document.py — Pydantic request/response models for documents.

Separate models for:
  - DocumentCreate  (POST body)
  - DocumentUpdate  (PUT body — all fields optional)
  - DocumentRead    (response — includes id, timestamps, is_template)

PlaceholderMeta and PrinterSettings are embedded sub-models.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------


class PlaceholderMetaSchema(BaseModel):
    name: str
    label: str
    default_value: str | None = None
    required: bool = True


class PrinterSettingsSchema(BaseModel):
    columns: int = Field(default=48, ge=1)
    language: str = "esc-pos"
    printer_model: str = ""
    codepage_mapping: str = "epson"
    feed_before_cut: int = Field(default=4, ge=0)
    newline: str = "\n\r"
    image_mode: str = "column"


# ---------------------------------------------------------------------------
# Document models
# ---------------------------------------------------------------------------

_DEFAULT_PRINTER_SETTINGS = PrinterSettingsSchema()


class DocumentCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    content: str = ""
    placeholder_meta: list[PlaceholderMetaSchema] = []
    printer_settings: PrinterSettingsSchema = _DEFAULT_PRINTER_SETTINGS
    tags: list[str] = []
    folder_id: str | None = None


class DocumentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    content: str | None = None
    placeholder_meta: list[PlaceholderMetaSchema] | None = None
    printer_settings: PrinterSettingsSchema | None = None
    tags: list[str] | None = None
    folder_id: str | None = None
    updated_at: datetime | None = None


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    content: str
    placeholder_meta: list[PlaceholderMetaSchema]
    printer_settings: PrinterSettingsSchema
    tags: list[str]
    folder_id: str | None
    created_at: datetime
    updated_at: datetime
    is_template: bool
