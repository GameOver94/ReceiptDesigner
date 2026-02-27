# ReceiptDesigner — WSL Dev Environment Setup

Step-by-step checklist for setting up a fresh Ubuntu 25.10 WSL environment to work on this
project. Run every command in the WSL terminal unless noted otherwise.

---

## 1. Install WSL

> Run this in **PowerShell (Administrator)** on Windows — not in WSL.

- [x] Install WSL with Ubuntu 25.10:
  ```powershell
  wsl --install -d Ubuntu-24.04
  ```
- [x] Restart Windows when prompted.
- [x] Open the **Ubuntu 24.04** app from the Start menu and complete the first-run setup
      (create a Unix username and password).

---

## 2. Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

- [x] System packages are up to date.

---

## 3. Install system dependencies

```bash
sudo apt install -y git curl unzip build-essential ripgrep
```

- [ ] `git` — version control
- [ ] `curl` — used by several installers below
- [ ] `unzip` — needed by some tool installers
- [ ] `build-essential` — C toolchain (required by some Python/Node native modules)
- [ ] `ripgrep` — fast code search; OpenCode uses it internally

---

## 4. Configure Git

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global core.autocrlf false
```

- [x] `user.name` set
- [x] `user.email` set
- [x] `core.autocrlf false` — prevents Git from mangling line endings between WSL and Windows

---

## 5. Install Node.js via fnm

[fnm](https://github.com/Schniz/fnm) is a fast Node version manager.

```bash
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 25
fnm use 25
fnm default 25
```

- [x] fnm installed
- [x] Node 25 installed and set as default
- [x] Verify: `node --version` prints `v25.x.x`
- [x] Verify: `npm --version` prints a version number

---

## 6. Install pnpm

pnpm is the package manager for the frontend.

```bash
npm install -g pnpm
```

- [x] pnpm installed
- [x] Verify: `pnpm --version` prints a version number

---

## 7. Install Python 3.14

Ubuntu 25.10 ships Python 3.14 in the default repos — no PPA needed.

```bash
sudo apt install -y python3.14 python3.14-venv python3.14-dev
```

- [x] Python 3.14 installed
- [x] Verify: `python3 --version` prints `Python 3.14.x`

---

## 8. Install uv

[uv](https://github.com/astral-sh/uv) is the Python package manager for the backend.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

- [x] uv installed
- [x] Verify: `uv --version` prints a version number

---

## 9. Install the GitHub CLI

The GitHub CLI (`gh`) is needed to run `opencode github install` and to create PRs from the
terminal.

```bash
sudo apt install -y gh
```

- [x] gh installed
- [x] Authenticate: `gh auth login` (follow the prompts — choose GitHub.com → HTTPS → browser)
- [x] Verify: `gh auth status` shows you are logged in

---

## 10. Install OpenCode

```bash
curl -fsSL https://opencode.ai/install | bash
source ~/.bashrc
```

- [x] OpenCode installed
- [x] Verify: `opencode --version` prints a version number

---

## 11. Copy the project into the WSL filesystem

> Working from `/mnt/c/...` is functional but slow. Copy the project into the WSL filesystem
> for much better `pnpm install` and build performance.

```bash
mkdir -p ~/code
cp -r /mnt/c/Users/patri/Desktop/ReceiptDesigner ~/code/ReceiptDesigner
cd ~/code/ReceiptDesigner
```

- [x] Project copied to `~/code/ReceiptDesigner`
- [x] Verify: `ls` shows `docs/`, `AGENTS.md`, `opencode.json`, etc.

---

## 12. Verify the project opens in OpenCode

```bash
cd ~/code/ReceiptDesigner
opencode
```

- [ ] OpenCode starts without errors
- [ ] Run `/init` inside OpenCode to confirm it reads `AGENTS.md` correctly

---

## 13. (Optional) Connect VS Code

Install the **WSL extension** in VS Code on Windows, then from WSL:

```bash
code ~/code/ReceiptDesigner
```

- [ ] VS Code opens with the project root in the WSL filesystem

---

## What you do NOT need to install manually

These are handled automatically:

| Tool | How it gets installed |
|------|-----------------------|
| TypeScript / Svelte / ESLint LSP servers | OpenCode auto-installs when it detects `.svelte`/`.ts` files |
| Pyright | Added to the Python project with `uv add --dev pyright` when scaffolding the backend (Milestone 3) |
| Docker | Only needed for Milestone 3 — install [Docker Desktop with WSL backend](https://docs.docker.com/desktop/wsl/) when you get there |

---

## Quick verification — all tools at once

Run this after completing the checklist to confirm everything is on your `PATH`:

```bash
node --version      # v20.x.x
pnpm --version      # 9.x.x or later
python3.12 --version # Python 3.12.x
uv --version        # 0.x.x
gh --version        # gh version x.x.x
opencode --version  # x.x.x
git --version       # git version x.x.x
rg --version        # ripgrep x.x.x
```
