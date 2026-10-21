# Lessons

Last Updated: 2026-10-22

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

- 2026-10-22 drawing-save race: a successful PUT must clear dirty state only if the live XML still equals the submitted XML; a delayed-response regression reproduced newer edits being marked saved. Applies to: `src/console/useDrawioDocument.ts`, `src/console/__tests__/DrawioEditor.test.tsx`.
- 2026-10-22 responsive navigation: hiding `.atlas-nav` unconditionally below 42rem defeats the React menu-open state; Chrome at 640px reproduced invisible navigation after toggling. Let mounting control visibility and use a stacked layout. Applies to: `src/App.tsx`, `src/styles.css`.
- 2026-10-22 cleanup checkpoint: `git diff --stat` omits untracked replacement modules and archives; inspect `git status` too, preserve the pre-cleanup worktree backup, and include the new files in any authorized commit. Applies to: `outputs/2026-10-22-cleanup/manifest.json`, checkpoint/ship.

- 2026-10-21 ESM semantics: `용도=운영` is environment, not business name; OS kind/version, representative/management/service IP and server/equipment sources must be separate. Raw screenshot header names may be truncated. Applies to: `ingest`, `store`, `classify`.
- 2026-10-21 local upload: the Vite proxy may change Host port while preserving Origin; accept checked loopback proxy origins plus a custom non-simple request header, without enabling CORS or remote writes. Native Chrome picker verified upload without changing extension file-URL permission. Applies to: `web/imports.py`.

- 2026-10-21 kit-web-sqlite: under real uvicorn a FastAPI sync generator dependency and its handler can run on different threadpool workers, so a default sqlite3 connection raised ProgrammingError (500); `TestClient` and sequential requests did not reproduce it — only concurrent requests against a real server. Open per-request `AtlasStore(..., check_same_thread=False)`. Applies to: `kit/src/onprem_atlas/web`, `kit/tests/test_web.py`.
- 2026-10-21 kit-gate: `make check` now runs `make kit` with `kit/.venv/bin/python` if present, else `python3`; it fails without openpyxl/pytest/ruff — run `make kit-setup` on a fresh machine. Applies to: `Makefile`, `kit/`.
- 2026-10-21 zsh-glob: in this shell `rm -f path/atlas.db*` aborts the whole command line with "no matches found" when nothing matches; list files explicitly. Applies to: Bash tool commands.
- 2026-10-21 carbon-ui-shell: `@carbon/react` `<SideNav>` uses `position: fixed; z-index: 8000` and overlaps `.cds--content` on viewports `< 66rem` (`1056px`) or when nested inside `<Header>`; use the in-flow `.atlas-shell` navigation grid rather than a fixed `<SideNav>`. Applies to: `src/App.tsx`.
- 2026-10-21 carbon-grid-props: `@carbon/react` `<Grid>` prop for condensed spacing is lowercase `condensed` (not `Condensed`), enforced by `tsc --noEmit`. Applies to: `src/console/pages/*.tsx`.
