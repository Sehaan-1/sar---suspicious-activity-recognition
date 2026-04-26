# GitHub Push Instructions (SAR Project)

This guide is tailored to this repository: `sar---suspicious-activity-recognition`.

## 1. Update `.gitignore` First (Mandatory)

Your current `.gitignore` is missing runtime/model/cache patterns that can bloat the repo.

Append the following lines to `.gitignore`:

```gitignore
# Models / ML artifacts
*.pt
*.onnx
*.pth

# SQLite runtime
*.db
*.db-shm
*.db-wal

# Python env/cache
ai_worker/venv/
.venv/
**/__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Media/runtime output
media/
media_data/
clips/
thumbs/

# Node/build caches
node_modules/
dist/
.vite/
.cache/
coverage/
```

## 2. Lockfile Guidance

- Keep `package-lock.json` committed (for npm reproducibility).
- Do not commit `ai_worker/venv`.

## 3. Check What Is Currently Tracked

Run from project root:

```powershell
git status
git ls-files
```

## 4. If Wrong Files Were Already Committed

Prefer a **new cleanup commit** (safe for collaboration).  
Use history rewrite only if secrets were committed.

### 4.1 Cleanup commit approach (recommended)

```powershell
git rm -r --cached ai_worker/venv media media_data clips thumbs
git rm --cached *.db *.db-shm *.db-wal
git add .gitignore
git add .
git commit -m "chore: clean tracked runtime artifacts and tighten gitignore"
```

If wildcard removal fails in PowerShell, remove specific paths shown by `git status`.

### 4.2 History rewrite (only when secrets were committed)

- Rewrite history only if sensitive values were pushed.
- Rotate/revoke secrets immediately after rewrite.

## 5. First Push / Regular Push Commands

If repo is not initialized:

```powershell
git init
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
```

Stage and commit:

```powershell
git add .
git commit -m "feat: phase-5 analytics, camera management, ROI improvements"
```

Push:

```powershell
git push -u origin main
```

## 6. Pre-Push Verification Checklist

- `git status` is clean after commit.
- `git diff --cached --name-only` contains only expected files.
- No `venv`, model weights, SQLite runtime files, media clips, or caches are staged.
- No secrets in `.env` are tracked.
- `package-lock.json` is present (if npm is used).

## 7. Recommended Commit Strategy

Use small commits:

1. `chore: harden gitignore and remove runtime artifacts`
2. `feat: analytics sync and dashboard updates`
3. `feat: camera and ROI workflow improvements`
4. `docs: add deployment and known-issues notes`

This gives cleaner history for interviews and portfolio review.

