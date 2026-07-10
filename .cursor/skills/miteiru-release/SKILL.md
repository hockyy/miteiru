---
name: miteiru-release
description: Bump Miteiru version, write docs/whats-new release notes, commit, and push. Use when the user asks to release, bump version, add what's new, ship a version, or publish miteiru.
---

# Miteiru release

## Workflow

1. **Review changes** since last release tag:
   ```bash
   git status
   git log -5 --oneline
   git diff
   ```

2. **Bump version** in `package.json` only (semver patch unless user says minor/major):
   ```json
   "version": "X.Y.Z"
   ```

3. **Regenerate lockfile** (do not hand-edit dependency versions in `package-lock.json`):
   ```bash
   npm install --package-lock-only
   ```
   If the lockfile is corrupted, delete it and run `npm install`.

4. **Add what's new** — create `docs/whats-new/X.Y.Z.md` matching existing files:

   ```markdown
   # What's New in Miteiru X.Y.Z

   Changes since [vPREV](https://github.com/hockyy/miteiru/releases/tag/vPREV).

   ## Features
   - ...

   ## Fixes
   - ...

   ## Developer notes
   - ...

   **Full Changelog**: https://github.com/hockyy/miteiru/compare/vPREV...vX.Y.Z
   ```

   Previous version = current `package.json` version before bump. One file per release; user may ask only for the new version (not backfill all).

5. **Commit** (PowerShell — use multiple `-m` flags, not heredoc):
   ```bash
   git add -A
   git commit -m "Release vX.Y.Z with <short summary>." -m "<optional body bullets>"
   ```

6. **Push**:
   ```bash
   git push origin HEAD
   git status
   ```

## Conventions

| Item | Location |
|------|----------|
| Version source of truth | `package.json` → `useMiteiruVersion` reads app version via IPC |
| What's new docs | `docs/whats-new/{version}.md` |
| Release commit style | `Release vX.Y.Z with ...` (see `git log`) |
| Compare URL base | `https://github.com/hockyy/miteiru/compare/vA...vB` |

## Do not

- Use `replace_all` on `package-lock.json` for version bumps (corrupts dependency entries).
- Commit secrets (`.env`, API keys).
- Force-push `main` unless explicitly requested.
- Skip what's-new when user asks for a release with notes.

## Example

User: "bump version, add whats new, commit, push"

→ Bump `7.2.0` → `7.3.0`, add `docs/whats-new/7.3.0.md`, `npm install --package-lock-only`, commit, push.
