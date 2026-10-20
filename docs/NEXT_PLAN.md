# Next Plan

Last Updated: 2026-10-21

Rolling plan containing open work (things to do) only. Completed history is in `docs/COMPLETED_SUMMARY.md`.

## Priority 0 — Completed P0–P4 Enterprise Platform Overhaul (`T01`–`T12` + v2.0 Studio All Green)

All P1 (Semantic Model & Deterministic Engine), P0 (REA Reverse-Engineered 3-Mode Topology Studio & Containerlab YAML/Annotation Adapter), P2 (Offline Batfish Fixture Evaluator), P3 (AWS Migration As-Is vs To-Be Intent Studio), P4 (Forward Predict What-If Mutator, IP Fabric Diagnostic Continue Mode, AlgoSec AppViz Multi-Intent Matrix, and Offline Config Importer), and Google Cloud Zero-VM deployment configurations are implemented and verified via `make check` (4 test suites, 18/18 tests passing).

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
