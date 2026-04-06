# ReceiptDesigner — Production Runbook

This document covers local testing in WSL (x86_64/amd64) and on a Raspberry Pi 4 (arm64),
and provides smoke-test commands for health, auth, and document CRUD.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | `apt install python3.12` |
| uv | latest | `pip install uv` or [astral.sh/uv](https://astral.sh/uv) |
| Node.js | 20+ | `apt install nodejs` or nvm |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker + Compose | v2 | [docs.docker.com](https://docs.docker.com/engine/install/) |

---

## 1. WSL Local Test (x86_64 / amd64)

### 1.1 Initial setup

```bash
# Clone the repo (or use your existing checkout)
cd /path/to/ReceiptDesigner

# Configure the server
cp config.toml.example config.toml
# Edit config.toml — set api_token to a strong random value:
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# Paste the output as api_token in config.toml
```

### 1.2 Build the frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ..
```

### 1.3 Install Python dependencies

```bash
uv sync --extra dev
```

### 1.4 Start the server

```bash
uv run uvicorn server.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open http://localhost:8000 in your browser.  
Enter the `api_token` from `config.toml` when prompted.

### 1.5 Run all checks

```bash
# Backend
uv run ruff check server/
uv run ruff format --check server/
uv run mypy server/
uv run pytest server/tests/ -v

# Frontend (from frontend/)
cd frontend
pnpm lint
pnpm typecheck
pnpm test --run
pnpm build
cd ..
```

---

## 2. Raspberry Pi 4 Test (Linux arm64)

The process is identical to WSL. Python 3.12 may need to be installed from deadsnakes:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.12 python3.12-venv
pip3 install uv
```

For Docker on Raspberry Pi OS (64-bit):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

The `Dockerfile` and `docker-compose.yml` use `python:3.12-slim` which has official arm64
images — no cross-compilation needed.

---

## 3. Docker (WSL + Raspberry Pi 4)

### 3.1 Build and start

```bash
# Create config
cp config.toml.example config.toml
# Edit config.toml and set api_token

# Build the image (runs frontend build + Python install inside Docker)
docker compose build

# Start the container
docker compose up -d

# Check logs
docker compose logs -f
```

### 3.2 Stop / remove

```bash
docker compose down         # stop containers (data volume preserved)
docker compose down -v      # stop + remove data volume (DESTROYS DATABASE)
```

### 3.3 Update

```bash
git pull
docker compose build
docker compose up -d
```

---

## 4. Smoke Tests

Replace `YOUR_TOKEN` with the value of `api_token` in your `config.toml`.
These use `curl` and assume the server is running on `http://localhost:8000`.

### 4.1 Health check (no auth required)

```bash
curl -s http://localhost:8000/api/health
# Expected: {"status":"ok"}
```

### 4.2 Login

```bash
curl -sc cookies.txt http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN"}'
# Expected: {"status":"ok"}
# Saves the rd_session cookie to cookies.txt for subsequent requests
```

### 4.3 List documents (requires auth)

```bash
curl -sb cookies.txt http://localhost:8000/api/v1/documents
# Expected: [] (empty list on first run)
```

### 4.4 Create a document

```bash
curl -sb cookies.txt http://localhost:8000/api/v1/documents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Receipt",
    "content": "encoder.initialize().line(\"Hello World\").newline();"
  }'
# Expected: {"id":"...","name":"Test Receipt","is_template":false,...}
```

Save the `id` from the response for the next commands:

```bash
DOC_ID="<id from above>"
```

### 4.5 Get a document

```bash
curl -sb cookies.txt "http://localhost:8000/api/v1/documents/$DOC_ID"
```

### 4.6 Update a document

```bash
curl -sb cookies.txt "http://localhost:8000/api/v1/documents/$DOC_ID" \
  -X PUT \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Receipt"}'
# Expected: {"name":"Updated Receipt",...}
```

### 4.7 Delete a document

```bash
curl -sb cookies.txt "http://localhost:8000/api/v1/documents/$DOC_ID" \
  -X DELETE
# Expected: 204 No Content
```

### 4.8 Folder CRUD

```bash
# Create folder
curl -sb cookies.txt http://localhost:8000/api/v1/folders \
  -H "Content-Type: application/json" \
  -d '{"name":"Invoices"}'

# List folders
curl -sb cookies.txt http://localhost:8000/api/v1/folders

# Rename folder (replace FOLDER_ID)
curl -sb cookies.txt "http://localhost:8000/api/v1/folders/FOLDER_ID" \
  -X PUT \
  -H "Content-Type: application/json" \
  -d '{"name":"Receipts"}'

# Delete folder
curl -sb cookies.txt "http://localhost:8000/api/v1/folders/FOLDER_ID" \
  -X DELETE
```

### 4.9 Logout

```bash
curl -sb cookies.txt http://localhost:8000/api/v1/auth/logout -X POST
# Expected: {"status":"ok"}
rm -f cookies.txt
```

---

## 5. Persistent Data

The SQLite database is stored at:
- **Native:** `server/data/receipt_designer.db` (configurable via `RD_DB_PATH`)
- **Docker:** `receipt-data` named volume → `/app/server/data/receipt_designer.db`

To back up the database:

```bash
# Native
cp server/data/receipt_designer.db receipt_designer_backup.db

# Docker
docker run --rm \
  -v receipt-designer_receipt-data:/data \
  -v $(pwd):/backup \
  alpine cp /data/receipt_designer.db /backup/receipt_designer_backup.db
```

---

## 6. Serial / USB Printer (Raspberry Pi)

For USB/serial printer access in Docker, uncomment the `devices:` section in
`docker-compose.yml` and set the path to your device:

```yaml
    devices:
      - "/dev/ttyUSB0:/dev/ttyUSB0"
```

Printer integration (API endpoints + forwarding logic) is implemented in Milestone 4.
