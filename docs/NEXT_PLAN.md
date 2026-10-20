# Next Plan

Last Updated: 2026-10-21

Rolling plan containing open work (things to do) only. Completed history is in `docs/COMPLETED_SUMMARY.md`.

## Priority 0 — Completed P0–P4 Enterprise Platform Overhaul (`T01`–`T12` + v2.0 Studio All Green)

All P1 (Semantic Model & Deterministic Engine), P0 (REA Reverse-Engineered 3-Mode Topology Studio & Containerlab YAML/Annotation Adapter), P2 (Offline Batfish Fixture Evaluator), P3 (AWS Migration As-Is vs To-Be Intent Studio), P4 (Forward Predict What-If Mutator, IP Fabric Diagnostic Continue Mode, AlgoSec AppViz Multi-Intent Matrix, and Offline Config Importer), and Google Cloud Zero-VM deployment configurations are implemented and verified via `make check` (5 test files, 24/24 tests passing).

## Priority 1 — On-Prem Asset Kit (`docs/plans/2026-10-21-onprem-asset-kit.md`)

Python `kit/` package `onprem-atlas` (done 2026-10-21: P1 ingest/store/CLI, P2 diff + readiness review, P2.5 project classification, read-only FastAPI, P7 console shell + dashboard): ESM xlsx → SQLite → on-prem draw.io diagrams + sizing input export. No agent, policy chatbot, AWS review, or sizing math (company already has them).

- [ ] [manual] P0 decide K2–K6 (real ESM headers, sizing input contract, draw.io spec, utilization source, project naming rules). K1 done: `onprem-atlas` in `kit/`.
- [ ] [auto] P3 graph + project/focus deterministic layout + draw.io XML (diagrams are per project, never all 5,000).
- [ ] [auto] P4 sizing bridge (export input, import results, To-Be labels) — after K3.
- [ ] [auto] P5 agent tool functions + optional Strands adapter.
- [ ] [auto] P6 `docs/wiki` + `llms.txt` + L0–L4 porting cards.
- [ ] [auto] P7 remainder: project diagram page (after P3), header search suggestions, asset detail side panel. Shell, dashboard, projects, assets, review, sync pages done.
- [ ] [auto] P8 Gemini/Copilot-style docked assistant panel + SSE contract + reference Strands agent (no MCP).

Superseded for this scope: §0.3 TF1–TF8 of `docs/plans/2026-10-21-operator-console-redesign.md`.

## Optional Future Backlog

- [ ] [manual] Deploy static bundle (`dist/`) to Firebase Hosting or scale-to-zero Google Cloud Run in target GCP project (`docs/gcp-cost-minimal-architecture.md`).

## Rules

- Read `docs/AGENT_BRIEF.md` → `docs/status.md` → this file in order before starting work.
- Design snapshots for large tasks live in `docs/plans/YYYY-MM-DD-<topic>.md`.

### Automation Tags (for overnight loop)

- `[auto]` — Only for items verifiable via local, deterministic, offline gate (`make check`).
- `[manual]` — Requires human judgment, feel, or external service. Skipped by the unattended loop.
- `[blocked]` — Unmet dependencies or 2 accumulated Blockers (runner marks automatically). Lift after human review.
- **No Tag = Not for unattended run** (security default). The runner only consumes `[auto]`.
