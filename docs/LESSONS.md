# Lessons

Last Updated: 2026-10-21

Repo-specific facts an agent learned the hard way, one per line, newest first. Read before
starting work; append when a blocker, gate failure, or repair taught you something the docs did
not say. Keep it under 40 lines — `/tidy-docs` compresses older entries into `docs/DECISIONS.md`
or `docs/COMPLETED_SUMMARY.md` when they stop being surprises.

Format (one line each, no prose paragraphs):

```text
- YYYY-MM-DD <area>: <what is true and how you found out>. Applies to: <path/command>.
```

Not for: task status (that is `docs/PROGRESS_LOG.md`), open work (`docs/NEXT_PLAN.md`), or
decisions with rationale (`docs/DECISIONS.md`).

## Entries

- 2026-10-21 kit-web-sqlite: under real uvicorn a FastAPI sync generator dependency and its handler can run on different threadpool workers, so a default sqlite3 connection raised ProgrammingError (500); `TestClient` and sequential requests did not reproduce it — only concurrent requests against a real server. Open per-request `AtlasStore(..., check_same_thread=False)`. Applies to: `kit/src/onprem_atlas/web`, `kit/tests/test_web.py`.
- 2026-10-21 playwright-browser: Python playwright here expects chromium build 1208 but the cache has 1223; pass `CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`. Applies to: `scripts/console_screenshots.py`.
- 2026-10-21 kit-gate: `make check` now runs `make kit` with `kit/.venv/bin/python` if present, else `python3`; it fails without openpyxl/pytest/ruff — run `make kit-setup` on a fresh machine. Applies to: `Makefile`, `kit/`.
- 2026-10-21 zsh-glob: in this shell `rm -f path/atlas.db*` aborts the whole command line with "no matches found" when nothing matches; list files explicitly. Applies to: Bash tool commands.
- 2026-10-21 carbon-ui-shell: `@carbon/react` `<SideNav>` uses `position: fixed; z-index: 8000` and overlaps `.cds--content` on viewports `< 66rem` (`1056px`) or when nested inside `<Header>`; omit fixed `<SideNav>` and pair `<Header>` with a top `<ContentSwitcher>` inside `<Content>`. Applies to: `src/App.tsx`.
- 2026-10-21 carbon-grid-props: `@carbon/react` `<Grid>` prop for condensed spacing is lowercase `condensed` (not `Condensed`), enforced by `tsc --noEmit`. Applies to: `src/components/*.tsx`.
