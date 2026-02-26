# ReceiptDesigner — Agent Context

This file is read by OpenCode at the start of every session. It provides the context all agents
need to work on this project correctly.

## What This Project Is

ReceiptDesigner is a web app for authoring, previewing, and printing receipts using
[ReceiptLine](https://github.com/receiptline/receiptline) markdown. It runs in two deployment
modes:

- **Demo** — static site (GitHub Pages), browser `localStorage` for storage, Web Serial or
  export for printing. No server required.
- **Production** — self-hosted Python + FastAPI server, SQLite database, server-forwarded
  ESC/POS printing (TCP or USB/serial).

## Architecture in One Paragraph

The frontend is a Svelte 5 + Vite SPA. The editor is CodeMirror 6. Receipt.js runs entirely
in the browser to render SVG previews and generate ESC/POS bytes. The storage adapter pattern
(`LocalStorageAdapter` vs `ApiAdapter`) switches at runtime via `window.__APP_CONFIG__.mode`.
The Python server **never parses ReceiptLine markdown** — it is a transparent binary proxy that
receives an ESC/POS blob from the browser and forwards it to a printer via TCP socket or
pyserial. SQLAlchemy is used synchronously throughout.

## Current Milestone

**Milestone 1 — Core Editor (Demo Mode)**

- Svelte + Vite + TypeScript scaffold
- CodeMirror 6 with basic ReceiptLine syntax highlighting
- Receipt.js live SVG preview (300 ms debounce)
- Printer settings panel (CPL, language, command)
- Paper width presets (58 mm / 80 mm / custom)
- Export: SVG and PNG
- `LocalStorageAdapter`: save/load/delete documents
- CI: GitHub Actions — frontend lint + typecheck + build on push to `main` and PRs
- GitHub Pages deploy on version tags `v*` only, gated on CI

## Canonical References

Read these before writing any code:

- `docs/design.md` — full architecture, data models, API design, UI layout, milestones,
  agent roles. This is the single source of truth for all decisions.
- `docs/coding-style.md` — all code style rules, naming conventions, testing conventions.

## Agents

Three specialized subagents handle different concerns:

| Agent | File | Scope |
|-------|------|-------|
| `frontend` | `.opencode/agents/frontend.md` | `frontend/` |
| `backend` | `.opencode/agents/backend.md` | `server/` |
| `devops` | `.opencode/agents/devops.md` | `.github/`, `Dockerfile`, `docker-compose.yml` |

Invoke them with `@frontend`, `@backend`, or `@devops`.

## Tech Stack Quick Reference

| Layer | Choice |
|-------|--------|
| Frontend framework | Svelte 5 + Vite |
| Language (frontend) | TypeScript strict |
| Editor | CodeMirror 6 |
| Receipt rendering + ESC/POS | Receipt.js (browser only) |
| Frontend package manager | pnpm |
| Backend language | Python 3.12+ |
| Backend framework | FastAPI |
| Database | SQLite via SQLAlchemy 2 (sync) |
| Validation | Pydantic v2 |
| Python package manager | uv |
| Python linting/formatting | ruff |
| Python type checking | mypy --strict |
| Frontend testing | Vitest + Playwright |
| Python testing | pytest + httpx.TestClient (sync) |

## Non-Negotiable Rules

1. **No `any` in TypeScript.** Use `unknown` + type guards.
2. **Svelte 5 runes only** — `$props()`, `$state()`, `$derived()`, `$effect()`. No legacy syntax.
3. **No enums** — use `const` objects with `as const`.
4. **Sync SQLAlchemy only** — no `async def` route handlers, no `await` in DB code.
5. **Server never parses ReceiptLine** — ESC/POS generation is 100% browser-side.
6. **All Receipt.js calls via `lib/receiptjs.ts`** — never directly in a component.
7. **All print operations via `lib/printing.ts`** — never directly in a component.
8. **Preview debounce ≥ 300 ms** — never call `toSVG()` on every keystroke.
9. **Storage adapter accessed only through `adapterStore`.**
10. **CSS tokens only** — `--rd-*` custom properties from `styles/tokens.css`. No hardcoded values.
11. **Conventional Commits** — `feat(scope): description`, `fix(scope): ...`, `chore(scope): ...`
12. **No force-push to `main`.**

## MCP Tools

- **`context7`** — use for up-to-date library docs (Svelte 5, CodeMirror 6, FastAPI,
  SQLAlchemy 2, Pydantic v2). Prompt: `use context7`.
- **`gh_grep`** — use for real-world code examples from GitHub (Receipt.js, CodeMirror
  extensions, etc.). Prompt: `use gh_grep`.

## Placeholder Syntax

```
{{field_name}}           Scalar placeholder
{{date}} {{time}} {{datetime}}   Built-in date/time (auto-filled from system clock)
{{#items}}               Line-item block start
{{item_name}} | {{qty}}  Fields inside line-item block
{{/items}}               Line-item block end
```

All placeholder resolution is in `frontend/src/lib/variables.ts`. The server stores document
content as an opaque string — it never evaluates placeholders.

## Project Layout (planned)

```
ReceiptDesigner/
├── docs/
│   ├── design.md
│   └── coding-style.md
├── frontend/           ← Svelte + Vite SPA (Milestone 1+)
├── server/             ← Python + FastAPI (Milestone 3+)
├── .github/workflows/  ← CI/CD (Milestone 1+)
├── Dockerfile          ← (Milestone 3+)
├── docker-compose.yml  ← (Milestone 3+)
├── opencode.json       ← MCP servers config
├── AGENTS.md           ← This file
└── .opencode/agents/   ← Agent definitions
```
