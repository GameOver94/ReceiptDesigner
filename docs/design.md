# ReceiptDesigner — Design Document

**Version:** 0.9
**Date:** 2026-03-08
**Status:** Living document — update with each milestone

---

## 1. Project Overview

ReceiptDesigner is a web application for authoring, previewing, and printing receipts and tickets
using JavaScript encoder code powered by [`@point-of-sale/receipt-printer-encoder`](https://github.com/NielsLeenheer/ReceiptPrinterEncoder). It is a
hobby project that adds a modern UI, a
document / template system with a rich placeholder engine, and a self-hosted production backend
with ESC/POS printer support.

### 1.1 Goals

- Provide a clean, modern editor for receipt printer encoder JS code with a live multi-tab receipt preview.
- Unified document model: any saved document that contains placeholders acts as a template;
  documents without placeholders are printed directly. No separate type is needed.
- Placeholder system with three modes: scalar fill-in, CSV batch printing, and CSV line-item
  injection, plus a combined JSON mode for nested data.
- Export to SVG, PNG, and PDF from the browser (demo mode, no server required).
- In the self-hosted production mode, the browser generates ESC/POS commands and either sends
  them directly to a USB/serial printer via the Web Serial API, or forwards them to the server
  which relays them to a network or serial printer.
- Be hostable as a static demo on GitHub Pages and as a full-stack app on a private server.

### 1.2 Non-Goals (v1)

- Multi-user accounts (may be added later).
- Cloud synchronisation.
- Mobile-first or native app packaging (Electron etc.).

---

## 2. Core Concepts and Terminology

These definitions are canonical. All code, comments, and documentation must use these terms
consistently.

### 2.1 Document

A **Document** is any saved encoder JS code file with associated metadata and printer
settings. It is the single top-level storage entity in the system.

- A document is **plain** when its content contains no placeholder syntax. It can be loaded into
  the editor and printed directly.
- A document is a **template** when its content contains one or more placeholder tags. The
  `is_template` flag is derived automatically from the content — it is never set manually.
- There is no separate "Template" type. The UI may filter or label documents differently based on
  `is_template`, but the underlying model is identical.

### 2.2 Placeholder

A **Placeholder** is a tagged region in a document's encoder JS code content that is replaced with
real data before printing or before the document is loaded into the editor for manual editing.

There are five placeholder kinds (see Section 6 for full syntax):

| Kind | Syntax | Filled by |
|------|--------|-----------|
| **Scalar** | `{{field_name}}` | Fill-in dialog or one column of a CSV row |
| **Date/Time** | `{{date}}`, `{{time}}`, `{{datetime}}` | System clock (overridable) |
| **Random** | `{{random:length:charset}}` | Browser CSPRNG (`crypto.getRandomValues`) |
| **Line-item block** | `{{#items}} ... {{/items}}` | Rows of a CSV or the `items` array in JSON |
| **Combined** | All of the above together | A JSON payload with scalar fields + `items` array |

### 2.3 Print Job

A **Print Job** is the act of sending a fully-resolved encoder JS document (all placeholders
replaced) as ESC/POS commands to a physical printer. ESC/POS bytes are always generated in the
browser by executing the encoder JS code via `lib/encoder.ts`. In demo mode on supported browsers, the job is sent directly via the Web Serial API.
In demo mode on unsupported browsers, or when no printer is connected, a print job produces a
downloadable file instead.

### 2.4 Printer Profile

A **Printer Profile** is a named set of encoder options (columns, language, printer model, codepage mapping, feed-before-cut, newline, image mode) that is stored alongside each document and can be shared as a default. In
production mode it also references a physical printer connection.

---

## 3. Architecture Overview

The project has two independently deployable artifacts that share the same frontend codebase.

```
┌──────────────────────────────────────────────────────────────┐
│                           BROWSER                            │
│                                                              │
│  ┌──────────────┐   ┌──────────────────────────────────────┐ │
│  │  Editor      │──▶│  receipt-printer-encoder             │ │
│  │  (Svelte +   │   │  lib/encoder.ts  → multi-tab preview │ │
│  │  CodeMirror) │   │  (Text / Hex / Commands / Binary)    │ │
│  └──────────────┘   │  ESC/POS bytes for printing          │ │
│         │           └──────────────────────────────────────┘ │
│  ┌──────▼──────────────────────────────────────────────────┐ │
│  │                App State (Svelte stores)                │ │
│  │        documents · placeholders · settings              │ │
│  └──────┬──────────────────────────────────────────────────┘ │
│         │                                                    │
│  ┌──────▼──────┐   ┌────────────────────────────────────┐   │
│  │ Storage     │   │ Print / Export                     │   │
│  │ Adapter     │   │  Path A: Web Serial API (direct)   │   │
│  │ (see §9.1)  │   │  Path B: POST ESC/POS → server TCP │   │
│  └──────┬──────┘   │  Path C: POST ESC/POS → server USB │   │
│         │          │  Export: SVG / PNG / PDF           │   │
│         │          └────────────────────────────────────┘   │
└─────────┼────────────────────────┬────────────────────────────┘
          │  REST API              │  POST binary ESC/POS blob
          │  (prod only)           │  (prod only, paths B & C)
┌─────────▼────────────────────────▼──────────────────────────┐
│                  SERVER (Python + FastAPI)                   │
│                                                             │
│  ┌─────────────┐   ┌─────────────────────────────────────┐ │
│  │  REST API   │   │  Printer Service                    │ │
│  │  (FastAPI)  │   │  Receives ESC/POS binary from       │ │
│  └──────┬──────┘   │  browser, forwards to:              │ │
│         │          │   • TCP socket (network printer)    │ │
│  ┌──────▼──────┐   │   • pyserial (USB/serial printer)   │ │
│  │  SQLite DB  │   │  No ESC/POS generation on server.   │ │
│  │  (SQLAlchemy│   └─────────────────────────────────────┘ │
│  │   sync ORM) │                                           │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Deployment Modes

| Mode | Description | Storage | Printing |
|------|-------------|---------|----------|
| **Demo** | Static site (GitHub Pages or any CDN) | Browser `localStorage` | Export (SVG / PNG / PDF); **Web Serial** direct-to-printer (Chrome/Edge/Opera only) |
| **Production** | Self-hosted Python server + frontend built files served by the same process | SQLite | Web Serial (Path A); server TCP forwarding to network printer (Path B); server USB/serial forwarding via `pyserial` (Path C) |

The frontend is identical in both modes. A small runtime config object
(`window.__APP_CONFIG__`) switches the storage adapter at startup. In demo mode this config
is baked into the static build. In production mode the FastAPI server injects it into
`index.html` before serving via `StaticFiles`. The server runs as a single process — no
separate static file server is needed.

---

## 4. Feature Specification

### 4.1 Editor

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| F-01 | JavaScript encoder code editor with syntax highlighting | Must | Both |
| F-02 | Live multi-tab preview (Text / Hex / Commands / Binary) rendered by receipt-printer-encoder | Must | Both |
| F-03 | Configurable preview width (columns: 24–96) | Must | Both |
| F-04 | Zoom control on the preview pane | Should | Both |
| F-05 | Language selector (en, de, fr, es, pt, nl, …) | Should | Both |
| F-06 | Landscape / portrait toggle | Should | Both |
| F-07 | Line spacing toggle | Should | Both |
| F-08 | Placeholder tag highlighting (`{{field}}`, `{{#items}}…{{/items}}`) | Should | Both |
| F-09 | Snippet toolbar covering the full encoder API (barcode, QR code, image, HR, paper cut, text styles, alignment, columns, placeholder, etc.) | Could | Both |
| F-10 | Split view (editor left, preview right) with draggable divider | Must | Both |
| F-11 | Paper width preset selector (58 mm → 32 cpl, 80 mm → 48 cpl, custom) | Should | Both |

### 4.2 Document Management

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| D-01 | New blank document | Must | Both |
| D-02 | Save document (name + content + printer settings) | Must | Both |
| D-03 | Open a saved document into the editor | Must | Both |
| D-04 | Delete a document | Must | Both |
| D-05 | Duplicate a document | Should | Both |
| D-06 | Export document as `.receipt` plain-text file | Should | Both |
| D-07 | Import `.receipt` / `.txt` file | Should | Both |
| D-08 | Auto-save while editing (debounced, 1 s) | Should | Both |
| D-09 | Document list panel with search / filter (plain vs. template) | Must | Both |
| D-10 | Import / export all documents as a JSON archive | Should | Both |

### 4.3 Placeholder / Template Features

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| PL-01 | Detect placeholders in content and show `is_template` badge | Must | Both |
| PL-02 | Scalar fill-in dialog: one form field per `{{field}}` | Must | Both |
| PL-03 | Auto-fill `{{date}}`, `{{time}}`, `{{datetime}}` from system clock | Must | Both |
| PL-04 | CSV batch mode: upload CSV, print one receipt per row | Must | Both |
| PL-05 | CSV line-item mode: upload CSV, each row becomes one `{{#items}}` iteration | Must | Both |
| PL-06 | Preview resolved output before printing in batch/line-item mode | Must | Both |
| PL-07 | JSON combined mode: supply scalars + `items` array together in the fill-in dialog | Could | Both |
| PL-08 | Declare variable metadata per document (label, default, required flag) | Should | Both |

### 4.4 Export

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| E-01 | Export as SVG | Must | Both |
| E-02 | Export as PNG (canvas render of the Text preview) | Must | Both |
| E-03 | Export as PDF (browser print dialog with `@media print` CSS) | Should | Both |
| E-04 | Copy SVG to clipboard | Could | Both |

### 4.5 Printing

ESC/POS commands are generated by `receipt-printer-encoder` (via `lib/encoder.ts`) in the browser for all three print paths.

#### Path A — Web Serial (demo + production, Chrome/Edge/Opera only)

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| WS-01 | Request Web Serial port and connect to USB/serial printer | Must | Both |
| WS-02 | Print current (resolved) document via Web Serial | Must | Both |
| WS-03 | Show browser compatibility warning when Web Serial is unavailable | Must | Both |
| WS-04 | Batch print from CSV via Web Serial | Should | Both |

#### Paths B & C — Server-forwarded printing (production only)

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| P-01 | List configured printers from server | Must | Prod |
| P-02 | Select active printer | Must | Prod |
| P-03 | Print current (resolved) document: browser generates ESC/POS, POSTs binary blob to server | Must | Prod |
| P-04 | Printer status display (online / offline / error) | Should | Prod |
| P-05 | Print confirmation dialog showing SVG preview | Should | Prod |
| P-06 | Batch print from CSV (one job per row) | Must | Prod |
| P-07 | Printer configuration UI (cpl, command, encoding, margins, etc.) | Should | Prod |

### 4.6 Settings

| ID | Feature | Priority | Mode |
|----|---------|----------|------|
| S-01 | Default printer profile (columns, language, printer model) | Must | Both |
| S-02 | UI theme (light / dark) | Could | Both |
| S-03 | Editor font size | Could | Both |
| S-04 | Auto-save toggle | Should | Both |

---

## 5. Technology Stack

### 5.1 Frontend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript (strict) | Type safety, IDE support |
| Framework | **Svelte 5 + Vite** | Single-file components, compiled output, minimal runtime, low learning curve for non-web-devs |
| State management | **Svelte stores** (built-in) | No extra dependency; `writable` / `derived` stores cover all needs |
| Editor | CodeMirror 6 | Extensible, community Svelte wrapper available, custom syntax highlighting |
| Receipt rendering | `@point-of-sale/receipt-printer-encoder` | Browser-side ESC/POS encoder; executes user-written JS to build a multi-tab preview and ESC/POS byte stream |
| Icons | **lucide-svelte** | Consistent 1.5 px stroke set, tree-shakeable Svelte components, MIT licence |
| Styling | CSS custom properties + scoped `<style>` in `.svelte` files | Svelte scopes styles per component natively; tokens via CSS variables |
| Export (PDF) | Browser `window.print()` with `@media print` CSS | Zero dependency, works as a static file |
| Export (PNG) | Canvas render from Text preview | Rasterises the Text tab character grid to PNG |
| HTTP client | `fetch` (native) | No dependency |

### 5.2 Backend (Production)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | **Python 3.12+** | Familiar to the project author; mature ecosystem for serial/USB I/O |
| HTTP server | **FastAPI** | Modern, async-capable, automatic OpenAPI docs, Pydantic for validation |
| Database | **SQLite** via `sqlalchemy` (sync) | Zero-config, single file, no separate process; single-user app needs no async DB |
| ORM / query | **SQLAlchemy 2 (sync)** + `alembic` for migrations | Type-safe queries, standard Python ORM; sync API is simpler and sufficient |
| Data validation | **Pydantic v2** | Integrated with FastAPI; defines request/response schemas |
| Printer (network) | Raw TCP socket (`socket` stdlib) | Forward the binary ESC/POS blob received from the browser to port 9100; no parsing needed |
| Printer (USB/serial) | `pyserial` | Write raw bytes received from the browser to the serial device; no parsing needed |
| Process manager | `uvicorn` + `supervisord` or `systemd` (self-hosted) | Standard Python async server toolchain |

> **Note on server role:** The Python server **never generates or transforms ESC/POS bytes**.
> ESC/POS command bytes are generated entirely in the browser by `receipt-printer-encoder` (via `lib/encoder.ts`). The server
> receives a binary blob and forwards it to the appropriate printer connection. This means Node.js
> is **not required** on the server at all.

> **Note on async:** FastAPI supports both sync and async route handlers. This project uses
> **synchronous** SQLAlchemy and synchronous route handlers for all database operations.
> The app is single-user; there is no concurrency problem that async DB access would solve,
> and the sync API is significantly simpler. Printer forwarding (writing bytes to a TCP socket
> or serial port) is fast enough that it can also be handled synchronously.

### 5.3 Tooling

| Item | Choice |
|------|--------|
| Frontend package manager | `pnpm` |
| Python package manager | `uv` (or `pip` + `venv` if preferred) |
| Frontend linting | ESLint (flat config) + `@typescript-eslint` + `eslint-plugin-svelte` |
| Frontend formatting | Prettier + `prettier-plugin-svelte` |
| Python linting / formatting | `ruff` (replaces flake8 + black + isort) |
| Python type checking | `mypy` (strict) |
| Frontend testing | Vitest (unit), Playwright (e2e) |
| Python testing | `pytest` |
| CI | GitHub Actions |

---

## 6. Placeholder Syntax

Placeholders live inside encoder JS code content. They are processed entirely in the
frontend — for live preview, fill-in dialogs, and ESC/POS generation before printing. The
server never sees or resolves placeholder syntax.

### 6.1 Scalar Placeholders

```
{{field_name}}
```

Replaced with a single string value. Field names are lowercase with underscores.

Examples:
```
encoder.text('{{shop_name}}').newline();
encoder.text('{{date}} {{time}}').newline();
encoder.rule();
encoder.text('Customer: {{customer_name}}').newline();
encoder.text('Total: {{total}}').newline();
```

### 6.2 Built-in Date/Time Placeholders

| Placeholder | Replaced with | Format |
|-------------|---------------|--------|
| `{{date}}` | Current date | `YYYY-MM-DD` (locale-aware) |
| `{{time}}` | Current time | `HH:MM:SS` |
| `{{datetime}}` | Current date and time | `YYYY-MM-DD HH:MM:SS` |

These auto-fill from the system clock when a document is resolved. They can be overridden by
providing a value in the fill-in dialog or in the CSV/JSON data.

### 6.3 Built-in Random Placeholder

```text
{{random:length}}
{{random:length:A-Z,a-z,0-9,#%<>}}
```

Generates a random string with the requested `length` using browser-grade randomness
(`crypto.getRandomValues`).

- Supported charset tokens:
  - `A-Z` uppercase letters
  - `a-z` lowercase letters
  - `0-9` digits
- Any other token is treated as literal characters (for example `#%<>`).
- Tokens are comma-separated; duplicates are removed.
- If charset is omitted or empty, default charset is `A-Z,a-z,0-9`.

Examples:

```js
encoder.line('PIN: {{random:6:0-9}}');
encoder.line('Password: {{random:20:A-Z,a-z,0-9,#%<>}}');
```

When the same random value must be reused multiple times in one receipt, assign it
once to a JavaScript variable and print that variable where needed:

```js
const password = '{{random:20}}';

encoder
  .initialize()
  .codepage('auto')
  .rule()
  .line('Text')
  .line('{{datetime}}')
  .line(password)
  .newline();
```

The placeholder is resolved before encoder execution, so all references to
`password` in that run use the same generated random string.

### 6.4 Line-Item Block

```
{{#items}}
encoder.text('{{item_name}} {{quantity}} {{price}}').newline();
{{/items}}
```

The entire block between `{{#items}}` and `{{/items}}` is repeated once per row in the
supplied CSV (line-item mode) or once per element in the `items` array (JSON mode). Fields
inside the block are resolved per-row.

### 6.5 CSV Batch Mode

One receipt is printed per CSV row. All scalar placeholders in the document are matched to
CSV column headers (case-insensitive). The `{{#items}}` block is not used in this mode.

Example CSV for a scalar-only template:
```csv
customer_name,total,date
Alice,12.50,2026-03-01
Bob,8.00,2026-03-01
```

### 6.6 CSV Line-Item Mode

One receipt is printed for the entire CSV. Each CSV row becomes one iteration of the
`{{#items}}` block. Scalar placeholders outside the block must be filled via the dialog or
provided as fixed values in the document.

Example CSV for a line-item template:
```csv
item_name,quantity,price
Asparagus,1,1.00
Broccoli,2,2.00
Carrot,3,3.00
```

### 6.7 JSON Combined Mode

The JSON combined mode allows supplying all placeholder data in one structured object — useful
for programmatic use or for the `PlaceholderMeta` fill-in dialog internally. It is handled
entirely in the frontend by `variables.ts` before ESC/POS generation.

The data shape (scalars + `items` array) that `variables.ts` accepts:

```json
{
  "shop_name": "Green Grocers",
  "customer_name": "Alice",
  "total": "15.50",
  "items": [
    { "item_name": "Asparagus", "quantity": "1", "price": "1.00" },
    { "item_name": "Broccoli",  "quantity": "2", "price": "2.00" }
  ]
}
```

In production mode, the same data shape can also be supplied via the fill-in dialog when
working with complex templates that have both scalar fields and line items.

---

## 7. Data Models

### 7.1 Document

The single storage entity. `is_template` is a computed/derived field, not stored.

```python
# Pydantic model (server)
class Document(BaseModel):
    id: str                          # UUID4
    name: str
    description: str | None = None
    content: str                     # encoder JS code (may contain placeholders)
    placeholder_meta: list[PlaceholderMeta] = []
    printer_settings: PrinterSettings
    tags: list[str] = []
    folder_id: str | None = None     # None = root; FK → folders.id ON DELETE SET NULL
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def is_template(self) -> bool:
        return bool(re.search(r'\{\{', self.content))
```

```typescript
// TypeScript interface (frontend)
interface ReceiptDocument {
  id: string;
  name: string;
  description?: string;
  content: string;           // encoder JS code (may contain placeholders)
  placeholderMeta: PlaceholderMeta[];
  printerSettings: PrinterSettings;
  tags: string[];
  folderId: string | null;   // null = root; FK → folders.id ON DELETE SET NULL
  createdAt: string;         // ISO 8601
  updatedAt: string;
  isTemplate: boolean;       // derived: true if content contains {{
}
```

### 7.2 PlaceholderMeta

Optional metadata declared per document to improve the fill-in dialog UX.

```python
class PlaceholderMeta(BaseModel):
    name: str              # matches {{name}} in content
    label: str             # human-readable label shown in dialog
    default_value: str | None = None
    required: bool = True
```

### 7.3 PrinterSettings

```python
class PrinterSettings(BaseModel):
    columns: int = 48                    # characters per line (24–96)
    language: str = 'en'                 # BCP 47 language code (en, de, fr, es, pt, nl, …)
    printer_model: str = 'generic/text'  # receipt-printer-encoder printer model string
    codepage_mapping: str = 'zjiang'     # codepage mapping identifier
    feed_before_cut: int = 0             # extra feed lines before cut (0–10)
    newline: str = '\n'                  # newline character(s) used by encoder
    image_mode: str = 'column'           # column | page
```

### 7.4 Folder

Single-level grouping for documents. Folders cannot be nested.

**Design decisions:**
- A `Folder` is a first-class entity with its own `id`, `name`, and `created_at`.
  This allows atomic rename (update one row, not every document in the folder).
- `Document.folder_id` is a nullable FK: `NULL` means the document lives at the root.
- Deleting a folder sets `folder_id = NULL` on all contained documents (SQL
  `ON DELETE SET NULL`). No documents are ever deleted implicitly.

```python
# Pydantic model (server)
class Folder(BaseModel):
    id: str        # UUID4
    name: str
    created_at: datetime
```

```typescript
// TypeScript interface (frontend)
interface Folder {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
}
```

`ReceiptDocument.folderId` is `string | null` — `null` means root.

The `StorageAdapter` interface exposes:
```typescript
listFolders(): Promise<Folder[]>
createFolder(name: string): Promise<Folder>
renameFolder(id: string, name: string): Promise<Folder>
deleteFolder(id: string): Promise<void>  // moves docs to root
```

### 7.5 PrinterConfig (server-side, not stored in DB)

Defined in `config.toml` on the server. Not editable via the API (intentional — avoids
exposing raw network/device paths to the frontend).

```toml
[[printers]]
id          = "main_counter"
name        = "Front Desk Epson TM-T20"
connection  = "tcp"           # tcp | usb | serial
host        = "192.168.1.100"
port        = 9100

  [printers.settings]
  cpl       = 48
  command   = "epson"
  language  = "en"
  cutting   = true
  spacing   = false

[[printers]]
id          = "kitchen"
name        = "Kitchen Star TSP100"
connection  = "serial"
device      = "/dev/ttyUSB0"

  [printers.settings]
  cpl       = 42
  command   = "star"
  language  = "en"
```

---

## 8. API Design (Production Server)

All endpoints are prefixed `/api/v1`.  
Content-Type: `application/json`.  
Error shape: `{ "detail": "<message>" }` (FastAPI default).

### 8.0 Authentication

All `/api/v1/*` endpoints require a valid API token except `POST /api/v1/auth/login`.

The token is configured in `config.toml` (or via an environment variable) when the server is
first set up. Authentication flow:

1. User visits the app for the first time (or cookie has expired). The frontend detects the
   missing/invalid cookie and shows a login screen with a single token input field.
2. User enters the token. Frontend POSTs it to `POST /api/v1/auth/login`.
3. Server validates the token. On success it sets a long-lived `HttpOnly` `SameSite=Strict`
   cookie (`rd_session`). The cookie is never readable by JavaScript.
4. All subsequent requests include the cookie automatically. The server validates it on every
   request via a FastAPI dependency.
5. The cookie has a configurable max-age (default 90 days). On expiry the user is prompted
   to re-enter the token.

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/auth/login` | No | Validate token, set session cookie |
| POST | `/api/v1/auth/logout` | Yes | Clear session cookie |

In demo mode (static build) no authentication exists — the auth endpoints are not present.

### 8.1 Documents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/documents` | List all documents (with `is_template` derived field) |
| GET | `/api/v1/documents/{id}` | Get single document |
| POST | `/api/v1/documents` | Create document |
| PUT | `/api/v1/documents/{id}` | Update document |
| DELETE | `/api/v1/documents/{id}` | Delete document |
| GET | `/api/v1/documents/export` | Export all documents as JSON archive |
| POST | `/api/v1/documents/import` | Import documents from JSON archive |

### 8.2 Folders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/folders` | List all folders |
| POST | `/api/v1/folders` | Create folder |
| PUT | `/api/v1/folders/{id}` | Rename folder |
| DELETE | `/api/v1/folders/{id}` | Delete folder (moves its documents to root) |

### 8.3 Printers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/printers` | List configured printers with live status |
| GET | `/api/v1/printers/{id}/status` | Get printer status |
| POST | `/api/v1/printers/{id}/print` | Forward ESC/POS binary blob to printer (see below) |

#### Print job request

The browser generates ESC/POS bytes using `receipt-printer-encoder` (via `lib/encoder.ts`), then POSTs the raw binary to
this endpoint. The server forwards the bytes to the printer without any transformation.

```
Content-Type: application/octet-stream
Body: <raw ESC/POS bytes>
```

Response:

```json
{ "status": "success", "bytes_sent": 1234 }
```

The server does **not** resolve placeholders, parse ReceiptLine markdown, or understand receipt
content. It is a transparent binary forwarding proxy.

#### Batch print request

Batch jobs are queued server-side. The browser POSTs all jobs at once; the server queues them,
processes them sequentially, and exposes a progress endpoint the frontend polls.

```json
POST /api/v1/printers/{id}/print/batch
Content-Type: application/json

{
  "jobs": [
    "<base64-encoded ESC/POS bytes for row 1>",
    "<base64-encoded ESC/POS bytes for row 2>"
  ]
}
```

Response (immediate, before jobs are processed):

```json
{ "batch_id": "uuid", "total": 2 }
```

Progress polling:

```
GET /api/v1/printers/{id}/print/batch/{batch_id}
```

```json
{
  "batch_id": "uuid",
  "total": 2,
  "completed": 1,
  "failed": 0,
  "status": "running"   // running | done | error
}
```

The frontend polls this endpoint every 1–2 s and updates a progress indicator until
`status` is `done` or `error`.

---

## 9. Frontend Architecture

### 9.1 Storage Adapter Pattern

The storage layer is abstracted behind a JavaScript interface. At startup `main.ts` reads
`window.__APP_CONFIG__.mode` and creates the appropriate adapter.

```typescript
interface StorageAdapter {
  listDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document>;
  saveDocument(doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>): Promise<Document>;
  updateDocument(id: string, doc: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
}
```

- **`LocalStorageAdapter`** — Serialises/deserialises JSON in `localStorage`. No server needed.
  Used in demo mode.
- **`ApiAdapter`** — Calls `/api/v1/*` endpoints with `fetch`. Used in production mode.

The adapter instance is held in a Svelte writable store (`adapterStore`) and accessed from
other stores, never imported directly into components.

### 9.2 Svelte Stores

| Store | Responsibility |
|-------|----------------|
| `documentStore` | Document list, current document, dirty flag, auto-save timer |
| `editorStore` | Raw editor content (may differ from saved), printer settings |
| `previewStore` | Debounced multi-tab preview output from receipt-printer-encoder |
| `placeholderStore` | Detected placeholder names, fill-in dialog state, CSV data |
| `printerStore` | Printer list and selected printer (prod only, empty in demo) |
| `settingsStore` | App-level settings (theme, font size, default printer profile) |

### 9.3 Editor (CodeMirror 6)

CodeMirror 6 is instantiated in a Svelte component using a Svelte action (`use:codemirror`).
Custom extensions:

- `javascriptSyntax` — standard JavaScript (`@codemirror/lang-javascript`) syntax highlighting,
  since document content is encoder JS code.
- `placeholderHighlight` — marks `{{...}}` and `{{#...}}...{{/...}}` regions in a distinct
  colour so they are visually distinct from encoder code.

The editor supports the full JavaScript language. The encoder API is always available as
`encoder` in document scope — users call `encoder.text(...)`, `encoder.newline()`, `encoder.rule()`,
etc. The SVG/text preview reflects what the encoder produces given the current printer settings.

### 9.4 Preview (receipt-printer-encoder)

The `previewStore` debounces editor changes by 300 ms. When the encoder JS code or printer
settings change, it:

1. Instantiates `ReceiptPrinterEncoder` with the current `PrinterSettings` (columns, language,
   printer model, codepage mapping, feed-before-cut, newline, image mode).
2. Executes the user's encoder JS code via a browser `Function` call with `encoder` provided in
   document scope.
3. Calls `encoder.encode()` to obtain a `Uint8Array` of raw ESC/POS bytes.
4. Parses the byte stream into a structured `TextLine[]` array (per-character cell model
   matching the ReceiptPrinterPlayground layout).

This execution model is **not a security sandbox**. Preview runs trusted user-authored JavaScript
in the current page context, so code can access normal browser globals and APIs.

The `Preview.svelte` component renders four tabs:

| Tab | Content |
|-----|---------|
| **Text** | Per-character cell grid: Font A (13 × 16 px) / Font B (10 × 16 px); invert, bold, italic, underline, scale, and alignment applied per character/line |
| **Commands** | Decoded command list (command name, parameters, description) |
| **Encoded** | Raw encoded ESC/POS byte output shown as a hex dump |
| **Output** | Downloadable ESC/POS output as a `.bin` file |

All rendering happens in the browser — no server round-trip for preview.

### 9.5 Placeholder Resolution (Frontend)

The `variables.ts` utility module handles all placeholder logic in the browser:

1. **Detection** — scan content for `{{field}}` and `{{#block}}…{{/block}}` with a regex;
   return a deduplicated list of names.
2. **Scalar resolution** — accept a `Record<string, string>` map, replace all `{{field}}`
   occurrences. Built-in `{{date}}`, `{{time}}`, `{{datetime}}` are pre-populated from
   `new Date()` before the map is applied. Built-in `{{random:length[:charset]}}` placeholders
   are generated with `crypto.getRandomValues`.
3. **Line-item resolution** — accept a `Record<string, string>[]` array; repeat the block
   body once per element, replacing field names within the block.
4. **Combined resolution** — accept `{ scalars: Record<string, string>, items: Record<string, string>[] }`;
   apply scalar resolution first, then line-item resolution.

### 9.6 Print Dispatch (`lib/printing.ts`)

The `printing.ts` module is the single entry point for all print operations in the frontend.
Components never call `receipt-printer-encoder` or `@point-of-sale/webserial-receipt-printer` directly.

Responsibilities:

1. **ESC/POS generation** — call `lib/encoder.ts` (`executeEncoder`) with the resolved encoder JS content and
   the active `PrinterSettings` to produce a `Uint8Array` of ESC/POS bytes.
2. **Path selection** — decide which print path to use:
   - If `window.__APP_CONFIG__.mode === 'demo'` or no server printer is selected: attempt Path A
     (Web Serial). If `navigator.serial` is unavailable, show a browser compatibility warning.
   - If a server printer is selected (production mode): use Path B or C depending on the
     printer's `connection` type as reported by the server.
3. **Path A execution** — use `@point-of-sale/webserial-receipt-printer` / Web Serial API to write bytes directly to
   the selected port.
4. **Path B/C execution** — POST the raw `Uint8Array` as `application/octet-stream` to
   `/api/v1/printers/{id}/print`.
5. **Result** — return a `PrintResult` object: `{ status: 'success'|'error'|'unavailable', message?: string }`.

Public API:

```typescript
// Print a single resolved document
print(resolvedContent: string, settings: PrinterSettings, printerId?: string): Promise<PrintResult>

// Print multiple resolved documents (batch)
printBatch(jobs: Array<{ content: string, settings: PrinterSettings }>, printerId?: string): Promise<PrintResult[]>
```

---

## 10. UI Layout

### 10.1 Overall Structure

The application is a single-page layout using CSS Grid. There are four named regions:

```
┌─────────────────────────────────────────────────────────────┐
│                        Top Bar                              │
├──────────┬──────────────────────┬───────────┬──────────────┤
│          │  Snippet Toolbar     │           │              │
│   Left   ├──────────────────────┤  Preview  │   Printer    │
│ Sidebar  │      Editor          │           │   Settings   │
│          ├──────────────────────┤           │   Sidebar    │
│          │  CSV Data Table      │           │              │
│          │  (when CSV loaded)   │           │              │
└──────────┴──────────────────────┴───────────┴──────────────┘
```

The left sidebar and right sidebar are always present in the DOM but can be
collapsed. The CSV data table row only appears when a CSV file is loaded.

### 10.2 Top Bar

A single horizontal bar spanning the full width at the top. Contents, left to right:

- **App logo / name** — "ReceiptDesigner", left-aligned.
- **Document actions** — New, Save, Rename, Delete buttons (icon + label).
- **Mode indicator** — a small badge showing "Demo" or "Production".
- **Global settings button** — gear icon, opens the app settings dialog (theme, font
  size, default printer profile).

The top bar does not scroll and is always visible.

### 10.3 Left Sidebar — Document List

A vertical panel on the far left. Behaviour:

- **Expanded** — shows a file-manager-style document list with folder support.
  Folders can be created, renamed, and deleted. Documents are moved between folders
  via a "Move to ▸" submenu in the document's kebab (⋮) menu. The submenu lists all
  available folders plus "Root (no folder)". A search/filter input sits at the top of
  the list. Drag-and-drop is deferred to a future milestone.
- **Collapsed** — shrinks to a narrow icon rail. A single icon represents the
  document list; clicking it re-expands the panel.

The last state (expanded / collapsed) is persisted in `localStorage`.

Thumbnail previews are deferred to a future milestone.

### 10.4 Left Column — Editor Area

The left-centre column contains two vertically stacked regions:

**Snippet Toolbar** (top, fixed height): a row of icon buttons that insert
encoder API snippets at the cursor position in the editor. Covers the full
encoder API feature set (text, barcode, image, separator, etc.). Always visible
while the editor is active.

**Editor** (middle, fills remaining height): the CodeMirror 6 editor. Takes up all
available vertical space below the snippet toolbar. When a CSV is loaded the editor
shrinks to share vertical space with the CSV data table below it.

**CSV Data Table** (bottom, only when a CSV is loaded): a scrollable table showing
the loaded CSV data — one row per record, one column per field. Allows the user to
see what data will be merged during batch printing. Dismissed when the CSV is
unloaded.

### 10.5 Preview Pane

The centre-right panel shows the live multi-tab receipt preview rendered by receipt-printer-encoder.

- The Text tab is centred on a neutral grey background that suggests paper/roll context
  without a literal frame graphic.
- The preview updates with a 300 ms debounce as the user types.
- **Batch navigation bar** (bottom of preview pane, only when a CSV is loaded): a
  compact control row with "Previous" / "Next" buttons and a "Row N of M" indicator.
  Switching rows re-renders the preview with the data from that CSV row substituted
  into the placeholders. This lets the user visually check each record before
  printing.

### 10.6 Right Sidebar — Printer Settings

A fixed-width panel on the far right. Open by default. Contains:

- **Paper width preset** — 58 mm / 80 mm / custom (numeric input).
- **Columns** — numeric input; auto-calculated from paper width but overridable.
- **Printer model** — dropdown for selecting the receipt-printer-encoder printer model.
- **Printer selection** — visible in production mode only; hidden in demo mode.

The right sidebar can be collapsed to an icon rail (same pattern as the left sidebar)
to maximise preview width when needed.

### 10.7 Responsive Behaviour

The app targets desktop browsers on screens ≥ 1280 px wide. No mobile layout is
planned for v1. On narrower screens a "viewport too small" notice is shown rather
than attempting a degraded layout.

---

## 11. Printing Pipeline

ESC/POS commands are **always generated in the browser** by `receipt-printer-encoder` (via `lib/encoder.ts`). The server is
a transparent forwarding proxy — it never generates or transforms ESC/POS bytes.

### Path A — Web Serial (demo + production, Chrome/Edge/Opera)

```
Browser
  │
  │  1. Resolve placeholders in content (variables.ts)
  │  2. lib/encoder.ts (receipt-printer-encoder) → ESC/POS byte array
  │  3. @point-of-sale/webserial-receipt-printer / Web Serial API
  │
  ▼
USB/Serial Printer (direct, no server involved)
```

### Path B — Server TCP forward (production, any browser)

```
Browser                          Server (Python + FastAPI)
  │                                       │
  │  1. Resolve placeholders              │
  │  2. lib/encoder.ts                    │
  │     → ESC/POS bytes                   │
  │                                       │
  │  POST /api/v1/printers/{id}/print     │
  │  Content-Type: application/octet-stream
  │  Body: <raw ESC/POS bytes>            │
  │ ─────────────────────────────────────▶│
  │                                       │  3. socket.connect(host, 9100)
  │                                       │  4. socket.sendall(bytes)
  │                                       │  5. socket.close()
  │                                       │
  │  { "status": "success",               │        Network Printer
  │    "bytes_sent": 1234 }               │        (port 9100)
  │ ◀─────────────────────────────────────│ ──────────────────▶
```

### Path C — Server serial forward (production, any browser)

```
Browser                          Server (Python + FastAPI)
  │                                       │
  │  1. Resolve placeholders              │
  │  2. lib/encoder.ts                    │
  │     → ESC/POS bytes                   │
  │                                       │
  │  POST /api/v1/printers/{id}/print     │
  │  Content-Type: application/octet-stream
  │  Body: <raw ESC/POS bytes>            │
  │ ─────────────────────────────────────▶│
  │                                       │  3. serial.write(bytes)
  │                                       │
  │  { "status": "success",               │        USB/Serial Printer
  │    "bytes_sent": 1234 }               │        (/dev/ttyUSB0 etc.)
  │ ◀─────────────────────────────────────│ ──────────────────▶
```

### printer_service.py responsibilities

- Holds a registry of open connections (TCP socket or `serial.Serial`), lazily connected on first use.
- Wraps each forwarding operation in a timeout (default 15 s, configurable).
- Returns a status dict: `{ status: "success"|"timeout"|"offline"|"error", bytes_sent: int }`.
- Never logs raw ESC/POS byte streams — logs only printer ID, job byte size, and status.

---

## 12. Project Structure

```
ReceiptDesigner/
├── docs/
│   ├── design.md               # This document
│   └── coding-style.md
│
├── frontend/                   # Svelte + Vite SPA
│   ├── public/
│   │       └── (static assets — Receipt.js files removed; encoder is an npm package)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor.svelte
│   │   │   ├── Preview.svelte
│   │   │   ├── Toolbar.svelte
│   │   │   ├── DocumentList.svelte
│   │   │   ├── PlaceholderDialog.svelte
│   │   │   ├── BatchCsvDialog.svelte
│   │   │   ├── PrinterPanel.svelte
│   │   │   └── common/         # Button.svelte, Dialog.svelte, etc.
│   │   ├── stores/
│   │   │   ├── documentStore.ts
│   │   │   ├── editorStore.ts
│   │   │   ├── previewStore.ts
│   │   │   ├── placeholderStore.ts
│   │   │   ├── printerStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── adapters/
│   │   │   ├── types.ts         # StorageAdapter interface
│   │   │   ├── localStorageAdapter.ts
│   │   │   └── apiAdapter.ts
│   │   ├── lib/
│   │   │   ├── encoder.ts       # Thin wrapper around receipt-printer-encoder (executeEncoder, encodeToBytes)
│   │   │   ├── actions.ts       # Svelte actions (focusOnMount, etc.)
│   │   │   ├── variables.ts     # Placeholder detection & resolution
│   │   │   ├── printing.ts      # Print path selection: Web Serial (Path A) or server POST (B/C)
│   │   │   └── codemirror/
│   │   │       ├── javascriptSyntax.ts
│   │   │       ├── placeholderHighlight.ts
│   │   │       └── editorSetup.ts
│   │   ├── styles/
│   │   │   ├── global.css
│   │   │   └── tokens.css       # CSS custom properties
│   │   ├── types/
│   │   │   └── index.ts         # Document, PrinterSettings, etc.
│   │   ├── App.svelte
│   │   └── main.ts
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── server/                     # Python + FastAPI backend
│   ├── app/
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── config.py           # Load config.toml + env vars
│   │   ├── routes/
│   │   │   ├── documents.py
│   │   │   └── printers.py
│   │   ├── services/
│   │   │   └── printer_service.py   # Forwards raw ESC/POS bytes to TCP socket or pyserial
│   │   ├── db/
│   │   │   ├── models.py       # SQLAlchemy ORM models
│   │   │   ├── database.py     # Sync engine + session factory
│   │   │   └── migrations/     # Alembic migration scripts
│   │   └── schemas/
│   │       ├── document.py     # Pydantic request/response models
│   │       └── printer.py
│   ├── config.toml             # Printer definitions + server settings
│   ├── requirements.txt
│   └── pyproject.toml
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-pages.yml    # Build frontend → GitHub Pages (on version tags only)
│
├── Dockerfile                  # Multi-stage: Node build stage + Python runtime stage
├── docker-compose.yml          # Production self-hosting (mounts config.toml + DB volume)
└── README.md
```

---

## 13. Milestones

### Milestone 1 — Core Editor (Demo Mode)

- Svelte + Vite + TypeScript scaffold.
- CodeMirror 6 with JavaScript syntax highlighting (encoder code).
- receipt-printer-encoder multi-tab preview (Text / Hex / Commands / Binary) with 300 ms debounce.
- Printer settings panel (columns, language, printer model, codepage mapping, feed-before-cut — preview only).
- Paper width presets (58 mm / 80 mm / custom).
- Export: SVG and PNG.
- `LocalStorageAdapter`: save/load/delete documents.
- **CI (basic):** GitHub Actions workflow — frontend lint + typecheck + build on every push to `main` and on pull requests.
- **GitHub Pages deploy:** triggered only on version tags (`v*`), gated on CI passing.

### Milestone 2 — Placeholder System (Demo Mode)

- Placeholder detection in editor (visual highlight).
- `{{date}}`, `{{time}}`, `{{datetime}}` auto-fill.
- Scalar fill-in dialog.
- CSV batch mode (browser-side, multiple preview + download).
- CSV line-item mode.
- `PlaceholderMeta` editor (label, default, required).
- **Web Serial (Path A):** `printing.ts` + `@point-of-sale/webserial-receipt-printer` integration; browser compatibility warning when Web Serial is unavailable.

### Milestone 3 — Server + Database

- FastAPI scaffold with Python project structure.
- SQLite schema via SQLAlchemy + Alembic.
- `/api/v1/documents` CRUD endpoints.
- `ApiAdapter` in frontend, `window.__APP_CONFIG__` runtime switch.
- Server serves built frontend static files via `StaticFiles` (single process, no separate static server).
- **Authentication:** API token in `config.toml`; `POST /api/v1/auth/login` sets a long-lived `HttpOnly` cookie; all other API endpoints require the cookie; frontend login screen on first visit or cookie expiry.
- **CI (backend added):** Python lint (`ruff`) + typecheck (`mypy`) + `pytest` added to the CI workflow.
- **Docker:**
  - Multi-stage `Dockerfile`: Stage 1 builds the frontend with Node.js + pnpm; Stage 2 is a lean Python image that copies the built frontend dist and runs uvicorn. No Node.js in the final image.
  - `docker-compose.yml` mounts `config.toml` and the SQLite database file as named volumes so they survive container restarts.
  - For USB/serial printing (Path C), `docker-compose.yml` includes a commented `devices:` entry (e.g. `/dev/ttyUSB0`) — this must be configured by the user for their specific host.

### Milestone 4 — Printing

- `config.toml` printer definitions.
- `/api/v1/printers` and `/api/v1/printers/{id}/print` endpoints.
- `printer_service.py`: TCP socket forwarding (Path B) and `pyserial` forwarding (Path C).
- Printer status polling in UI (every 5–10 s).
- Print confirmation dialog.
- Batch print from CSV: server-side job queue with `GET .../batch/{id}` progress endpoint; frontend polls and shows progress indicator.
- Web Serial batch print (Path A) handled entirely in the browser with its own progress indicator.

### Milestone 5 — Polish

- Dark mode.
- Snippet toolbar (full encoder API feature set).
- Keyboard shortcuts.
- **CI (full):** frontend Vitest unit tests + Playwright e2e tests added to the CI workflow.

---

## 14. Agent Roles and Instructions

### Agent 1 — Frontend Agent

**Scope:** `frontend/`

**Responsibilities:**
- Svelte component development (Editor, Preview, Toolbar, dialogs).
- CodeMirror 6 integration and custom JavaScript / placeholder syntax extensions.
- Svelte store implementation.
- CSS custom properties token system, scoped component styles.
- `LocalStorageAdapter` and `ApiAdapter`.
- All placeholder resolution logic in `lib/variables.ts`.
- Print dispatch in `lib/printing.ts`: ESC/POS generation via `lib/encoder.ts` (receipt-printer-encoder), Web Serial printing via `@point-of-sale/webserial-receipt-printer` (Path A), and binary POST to server (Paths B & C).
- Export functionality (SVG, PNG, PDF).

**Instructions:**
- One concern per `.svelte` file. If a component exceeds ~150 lines of template, split it.
- All encoder calls go through `lib/encoder.ts`; never call receipt-printer-encoder directly in a component.
- All print operations go through `lib/printing.ts`; never call `receipt-printer-encoder` or `@point-of-sale/webserial-receipt-printer` directly from a component or store.
- Preview updates must be debounced (≥ 300 ms). Never call `toSVG()` on every keystroke.
- The storage adapter is accessed only through the `adapterStore`; never imported directly.
- The frontend bundle must work as a completely static file with no server. Test this before marking any task done.
- Follow `docs/coding-style.md` strictly.

### Agent 2 — Backend Agent

**Scope:** `server/`

**Responsibilities:**
- FastAPI route handlers and middleware.
- SQLAlchemy models, Alembic migrations.
- `printer_service.py`: receive raw ESC/POS binary blob from the browser and forward it to:
  - a TCP socket (`socket` stdlib) for network printers (Path B).
  - a serial port via `pyserial` for USB/serial printers (Path C).
- Config loading from `config.toml`.

**Instructions:**
- All request bodies are validated by Pydantic models before any business logic runs.
- Database sessions are injected via FastAPI `Depends` — never create a session ad-hoc.
- Printer connections are managed by the service registry, not opened per-request.
- The server **never** parses ReceiptLine markdown or generates ESC/POS bytes. It receives bytes from the browser and forwards them verbatim.
- Each forwarding operation must have a hard timeout (configurable, default 15 s).
- Never log raw ESC/POS bytes. Log printer ID, job byte count, and status only.
- Use sync SQLAlchemy and sync route handlers for all DB operations.
- Follow `docs/coding-style.md` strictly.

### Agent 3 — DevOps / CI Agent

**Scope:** `.github/`, `Dockerfile`, `docker-compose.yml`, root config files.

**Responsibilities:**
- GitHub Actions CI workflow — grows across milestones:
  - Milestone 1: frontend lint + typecheck + build.
  - Milestone 3: add Python `ruff` + `mypy` + `pytest`.
  - Milestone 5: add frontend Vitest unit tests + Playwright e2e tests.
- GitHub Pages deployment for the frontend demo (triggered on version tags `v*` only).
- Multi-stage `Dockerfile`: Stage 1 builds frontend (Node.js + pnpm); Stage 2 is a lean Python image running uvicorn. No Node.js in the final image.
- `docker-compose.yml`: mounts `config.toml` and SQLite DB as volumes; includes commented `devices:` example for USB/serial printer access.

**Instructions:**
- CI runs on every push to `main` and on every pull request.
- GitHub Pages deployment is triggered by `on: push: tags: 'v*'` only, and only after CI passes.
- The final Docker image must not contain Node.js — it is used only in the build stage.
- The `docker-compose.yml` `devices:` entry for serial printers is included but commented out with a clear instruction for the user to configure it for their host.
- Cache pnpm store and pip/uv cache between CI runs.

---

## 15. Open Questions

| # | Question | Status | Decision needed by |
|---|----------|--------|--------------------|
| 1 | ~~Should the server support WebSocket for real-time printer status, or is polling sufficient?~~ | **Resolved** — polling every 5–10 s. No WebSocket. Sufficient for single-user use; avoids async complexity. | — |
| 2 | ~~Authentication for the self-hosted server (none, HTTP basic auth, API token)?~~ | **Resolved** — API token. Entered once in a setup UI; stored server-side and returned as a long-lived `HttpOnly` cookie so the browser sends it automatically on every subsequent request. No re-entry needed. | — |
| 3 | ~~Should the server serve the built frontend static files (single process), or run a separate static file server?~~ | **Resolved** — single process. FastAPI serves both the REST API and the built frontend via `StaticFiles`. No separate static server needed. | — |
| 4 | ~~`receiptline` Python port vs. Node.js subprocess: is there a pure Python alternative?~~ | **Resolved** — no server-side ReceiptLine transform needed; ESC/POS generated in browser by `receipt-printer-encoder` (via `lib/encoder.ts`). | — |
| 5 | ~~Should batch CSV print jobs be queued (with visible progress) or fire-and-forget?~~ | **Resolved** — queued server-side with a progress polling endpoint. Frontend polls for job status and displays a progress indicator. | — |
