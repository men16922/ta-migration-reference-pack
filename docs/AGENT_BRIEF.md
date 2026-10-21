# Agent Brief

Last Updated: 2026-10-22

> ▶ NEXT SESSION: Read `docs/plans/2026-10-21-enterprise-idc-tool.md`, then preview an approved real/anonymized ESM workbook in a separate acceptance DB; compare sheet/header mappings and identity/export scope before committing data. If no workbook is available, report that dependency rather than importing screenshots. Current limits: `docs/evaluation.md`.

## Snapshot

**Onprem Atlas** is a local ESM Excel inventory and IDC architecture tool (Python/FastAPI/SQLite + React/Carbon).
User scope: useful internal enterprise tool, not a demo. Knowledge is maintained in a separate store and searched through the company AI Agent. No MCP.

- Excel browser upload → sheet/header mapping preview → errors/changes → explicit registration. Source-scoped merge/replace preserves other inventory sources; partial files default to merge.
- Preserves source hashes, raw rows, registration runs; separates representative/management/service IP, ownership, business hierarchy, environment, equipment categories and HA declarations.
- Monochrome IDC/business diagrams; WEB/WAS/DB instances attach to hosts without inflating asset counts. Local draw.io edit/history preserves manually drawn firewall/zone/communication separately from source snapshots. No inferred /24 or network links.
- Slim console: dashboard, Excel registration, IDC diagram, business systems, assets/detail, registration/change history. Unused TS network lab/adapters/fixtures and static-only deployment removed; historical docs consolidated in docs/archive/.
- Separate versioned knowledge DB; group-scoped searches + read-only Agent tools with source citations. Live company Agent/model and company SSO are not connected.
- Portable backups include SQLite + uploaded originals, hashes and integrity verification. v1 inventory migration preserves historical rows.

- Security source preserves solution types and raw operation/team/monitoring columns. Final local evaluation: `docs/evaluation.md`.

## Active Work

Authority: `docs/NEXT_PLAN.md` and `docs/plans/2026-10-21-enterprise-idc-tool.md`.
Earlier P8 assistant-first and migration-simulator plans are superseded for the product.
Real ESM acceptance, actual company Agent integration and relationship sources remain external dependencies.
Work bundle committed and pushed as `0b4e617` on `feat/diagram-drawio-icons`. Porting wiki for the company-repo menu: `docs/wiki/README.md` (entry `docs/wiki/00-start-here.md`, index `llms.txt`).
At checkpoint, :8770 uses `kit/local/atlas.db` (run #2/3 assets); :8771 uses `/tmp/ta-enterprise-qa-v2/inventory.db` (14 synthetic assets/9 instances, six sources, drawing revisions 1–4). Recheck processes before restarting; temporary QA storage is not a durable backup.

## Commands

- `make kit-setup` — local Python dependencies (test + web).
- `make check` — offline deterministic gate; `make doc-budget` — documentation budgets.
- `make atlas` — build and serve UI/API at http://127.0.0.1:8770 using `kit/local/atlas.db`; never resets or seeds data.
- Development: API :8770 + `npm run dev -- --host 127.0.0.1` (:5173).
- Operations and Agent wiring: `docs/enterprise-operations.md`.

## Guardrails

- Synthetic data only for automated validation. Company sample captures stay local (`sample/` ignored); never copy real rows into fixtures or public docs.
- Upload writes are loopback-only, bounded and origin checked. Shared deployment must bind company authentication/authorization before exposure.
- Preserve mixed WIP. No commit, push, external publication, paid model call or company network access without authorization.
- `src/styles.css` may contain layout using Carbon tokens; do not override Carbon component internals.
