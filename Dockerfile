# ReceiptDesigner — Multi-stage Dockerfile
#
# Stage 1: Build the frontend (Node.js + pnpm)
# Stage 2: Production Python runtime (no Node.js)
#
# Compatible with amd64 (WSL / x86_64) and arm64 (Raspberry Pi 4).
# Build: docker build -t receipt-designer .
# Run:   docker run -p 8000:8000 -v $(pwd)/config.toml:/app/config.toml receipt-designer

# ---------------------------------------------------------------------------
# Stage 1 — Frontend build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install pnpm
RUN npm install -g pnpm

# Copy only the dependency manifests first so Docker can cache the install layer.
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/

WORKDIR /build/frontend
RUN pnpm install --frozen-lockfile

# Copy the rest of the frontend source and build.
COPY frontend/ ./
RUN pnpm build
# Output: /build/frontend/dist/

# ---------------------------------------------------------------------------
# Stage 2 — Python production runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production

# System dependencies for pyserial (USB/serial printing, Milestone 4).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast Python dependency installation.
RUN pip install --no-cache-dir uv

# Copy Python dependency manifest and install deps.
COPY pyproject.toml ./
RUN uv pip install --system --no-cache "."

# Copy server source.
COPY server/ ./server/

# Copy the built frontend dist from Stage 1.
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist/

# Create the data directory for SQLite.
RUN mkdir -p /app/server/data

# Default environment — override these at runtime.
ENV RD_HOST=0.0.0.0 \
    RD_PORT=8000 \
    RD_DB_PATH=/app/server/data/receipt_designer.db \
    RD_FRONTEND_DIST=/app/frontend/dist \
    RD_CONFIG_PATH=/app/config.toml

VOLUME ["/app/server/data"]

EXPOSE 8000

# Use exec form so SIGTERM is forwarded correctly.
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
