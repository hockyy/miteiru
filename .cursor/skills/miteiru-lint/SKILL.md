---
name: miteiru-lint
description: Run Miteiru smell checks and tests after code changes. Use when finishing a feature, reviewing local diffs, or the user asks to lint, check smells, or run the bug bot locally.
---
# Miteiru local review

1. Run `npm run lint:smells`.
2. Run `npm test` if behavior changed.
3. Optionally run `npm run lint:eslint` (not yet CI-green).
4. If the user asked for Bugbot, also launch the Cursor `bugbot` subagent on uncommitted or branch changes.

Fix smell findings before declaring the task done.
