# Progress Log

Last Updated: 2026-10-22

This file maintains only recent incremental summaries (newest 3-5 items, ≤120 lines). Older entries are archived to `docs/archive/progress-YYYY-MM.md` via `/tidy-docs`.

## 2026-10-22 — WEB/WAS/DB 인스턴스와 흑백 수동 구성도
- Status: Local implementation verified; real company workbook/SSO/Agent acceptance remains pending.
- Changed: schema v3 component snapshots, source-scoped merge/replace/diffs, exact host association, raw component detail and Agent lookup; enterprise IDC aggregate/business detail; monochrome role-specific icons; local draw.io embed with monochrome firewall/network/connection palette, separate revisions/history, conflict detection and stale-source notice. Inspired by local `diagram-bot`, without importing AWS/model workflow.
- Verified: `make check` passed (38 frontend, 73 Python tests; ruff, TypeScript, 12 reference specs, build). Component coexistence/endpoint identities/version diff/citations and manual network persistence/scope separation tests pass. Draw.io golden refreshed for the final DB icon geometry; diagram suite rerun.
- Data/UI: `outputs/2026-10-21-enterprise-idc/esm-synthetic-example.xlsx` has five synthetic sheets: 6 servers + 1 NAS, WEB 2 / WAS 4 / DB 3. Imported all five through the API into isolated `/tmp/ta-enterprise-qa-v2/inventory.db` (:8771), 9/9 instances linked. Chrome verified monochrome business tiers and distinct icons, manual firewall/switch/line insertion, save and reopening; source/target binding additionally checked through document API/tests. Earlier drawings remain revisioned.
- Notes: same filename is accepted; merge compares identity/values. Identical uploads currently create another registration snapshot, with zero value changes. Endpoint identity changes can add a new instance; do not silently remove old instances in merge mode.
- Next: actual company workbook identity/export-scope acceptance and existing Agent/auth integration. No commit/push, external publication or model calls.

## 2026-10-21 — 합성 명명 규칙의 운영 기본값 제거
- Diagnosis: a hostname-only asset `a1p-erp-was01` was assigned ERP/production/WAS under defaults; web import ignored an explicitly supplied manual classification profile. Both were reproduced with API regression tests.
- Fix: no naming/shared-code rules by default; explicit ESM fields remain authoritative. Web registration receives the configured profile. Synthetic rules moved to `kit/examples/classify-synthetic.json`; demo and legacy naming tests opt in explicitly.
- Verified: `make check` passed (38 frontend tests, 64 Python tests, ruff, TypeScript, 12 reference specs and build). The two regression cases and classification rollback tests pass; classifier/diagram/web/import suites passed 37 tests. Running local servers were restarted with the fix.
- Remaining acceptance input: real/anonymized ESM workbooks, identity/source-scope rules, company Agent registration/API and auth integration. Workspace samples remain four images; no ESM/Zabbix/company Agent connector is available.

## 2026-10-21 — 등록·업무 분류의 원자적 확정
- Diagnosis: injected classification failures before/after classification left run #2 committed over prior run #1; token retries could report success without completed classification.
- Fix: import finalization runs classification before outer commit; nested classification writes use a savepoint. Asset rows, FTS, classification and token now roll back together.
- Verified: both failure cases retain the previous snapshot and retry successfully; independent reader cannot see the unfinished snapshot. Enterprise import tests: 14 passed. Full gate: 38 frontend / 61 Python tests plus ruff, TypeScript, 12 specs and build passed; after adding the reader regression, the final Python suite passed all 62 tests.
- Runtime: restarted local operational and isolated QA servers with the fix. Company workbook/Agent/SSO acceptance remains pending; no company data or live model calls.
- Next: actual workbook/identity/source-scope acceptance and company Agent/auth wiring in `docs/NEXT_PLAN.md`.

## 2026-10-21 — ESM 기반 사내 IDC 도구로 범위 전환 및 로컬 업무 흐름 검증
- Status: Local core implemented/verified; company-data/Agent/SSO acceptance pending.
- Changed: slim Carbon console + Excel preview/commit + source-scoped merge/replace + v2 schema/provenance + raw asset detail; declared business/HA + equipment categories + no invented subnet/links; separate versioned/group-scoped knowledge + read-only Agent tools; portable backup/verify; static UI serving (`make atlas`).
- Verified: `make check` passed (9 Vitest files / 38 tests, 59 pytest, ruff, TypeScript, 12 reference specs, build). Strands SDK 1.61.1 registers 5 tools; direct asset/knowledge calls pass without a model call. Schema migration and portable backup/restore tested.
- Browser: Chrome native file picker → server preview/commit → equipment preview/commit (3 coexist) → source-row detail → business diagram → draw.io download. Fixed loopback proxy origin rejection, HA-label overlap and detail-modal HTML nesting warning found during UI validation. Rechecked detail UI and 38 frontend tests/build; built app/API verified together on port 8770.
- Scope: local production DB remains empty; only isolated `/tmp/ta-enterprise-qa` fixtures were imported. No company access, live model call, commit/push or deployment.
- Blockers: actual workbook/identity/source-scope acceptance and company Agent/auth integration inputs. Exact cables/VLAN/rack elevations and utilization require additional sources.
- Next: `docs/plans/2026-10-21-enterprise-idc-tool.md`; operations/Agent wiring in `docs/enterprise-operations.md`.

## 2026-10-21 — Kit P3: IDC/Project draw.io Diagrams + Console 구성도
- Status: Completed
- Changed: `kit/src/onprem_atlas/diagram` (idc/project views, deterministic box layout, layout JSON + draw.io XML, style table), CLI `diagram`, API `/api/diagram/idc`, `/api/diagram/project/{code}` (`?format=drawio`), `kit/tests/test_diagram.py` + `tests/golden/mini-erp.drawio`; console `src/console/pages/DiagramPage.tsx` (SVG viewer, zoom/fit, detail panel, download), 구성도 nav, project detail 구성도/자산 tabs; `index.html` favicon/title; screenshot script logs HTTP ≥400.
- Verified: `make check` green (vitest 35, kit 43 pytest, build); demo 5,000 assets: IDC 60 boxes, project ≤60 servers drawn individually, aggregated above `max_nodes`; render ≈30ms; draw.io desktop exports `docs/images/drawio-*.png` (opens fine); Playwright 8 pages zero console errors.
- Icons (goal 2026-10-21): every server/aggregate/network card carries a draw.io built-in vector icon (`DEFAULT_STYLES["icon"]`: web_server, server, storage, firewall, load_balancer, layer_3_switch) as a child cell; layout JSON has `icon`; test + golden updated; verified by draw.io desktop PNG export (`docs/images/drawio-*.png`). Company icon set → replace the table.
- Blockers: None. Arrows are inferred (zone tiers) until a relationship source exists.
- Next: P8 assistant panel; diagram focus view; P4 after K3.

## 2026-10-21 — Kit P2/P2.5 + Read API + IBM Cloud-Style Carbon Console (P7 shell)
- Status: Completed
- Changed: `kit/src/onprem_atlas/{classify,review,diff,web}`, CLI `classify/review/diff/serve`, synth drift; `src/App.tsx` (console shell), `src/console/*` (dashboard, projects, project detail, assets, review, sync), `src/components/NetworkLab.tsx` (old app as 네트워크 분석(실험) page), `src/styles.css` (shell layout), `vite.config.ts` (/api proxy), `Makefile` (`atlas-demo`), `scripts/console_screenshots.py`, `docs/images/atlas-*.png`.
- Verified: `make check` green (vitest 34, kit 35 pytest incl. real-uvicorn concurrency test, build); live run on synthetic 5,000 assets × 2 syncs — 4,954 assets, 154 projects, readiness 99%, diff +40/−49/~84; Playwright screenshots of 6 pages with zero console errors.
- Blockers: None. Found+fixed: sqlite cross-thread 500 under real uvicorn (TestClient did not reproduce).
- Next: P3 project diagram (draw.io), P8 assistant panel, P4 after K3.

## 2026-10-21 — On-Prem Asset Kit P1 (`kit/` onprem-atlas: ESM xlsx → SQLite)
- Status: Completed (P1); P0 decisions K2–K6 pending
- Changed: `kit/` (ingest mapping/validate/xlsx, SQLite store with sync runs + FTS5 trigram, synthetic 5,000-row ESM generator, CLI `inspect/import/runs/search/issues/synth`, 23 pytest), `Makefile` (`kit`, `kit-setup`), `src/agent/engineTools.ts`, `src/adapters/netboxAdapter.ts` (+ vitest), plans `docs/plans/2026-10-21-onprem-asset-kit.md`, `2026-10-21-operator-console-redesign.md`. Removed MCP server and TS ESM adapter.
- Verified: `make check` green (vitest 7 files / 32 tests, kit ruff + 23 pytest, vite build); 5,000-row import ≈0.8s.
- Blockers: None (K3 sizing input contract blocks P4 only)
- Next: P2 sync-run diff + readiness review, P2.5 project classification.

## 2026-10-21 — Pure IBM Carbon Cloud Console UX, 4-Target REA Reverse Engineering & GitHub Repo Push
- Status: Completed
- Changed: `src/styles.css`, `src/App.tsx`, `src/components/{PathFinderView,FirewallAuditView,TopologyBuilderView,PreChangeSimulatorView,TopologyCanvas,DeviceInspectorDrawer}.tsx`, `src/core/firewallAuditEngine.ts`, `src/core/__tests__/onpremEngines.test.ts`, `src/components/__tests__/App.test.tsx`, `docs/rea-reconstruction-ledger.md`
- Verified: `make check` (`doc-budget` OK, `tsc --noEmit` 0 errors, `12/12 specs valid`, `vitest run` 5 test files / 24 tests passed, `vite build` succeeded) and pushed to `https://github.com/men16922/ta-migration-reference-pack` (`17e8d1a`).
- Blockers: None
- Next: Optional static bundle deployment to Firebase Hosting or Cloud Run (`docs/NEXT_PLAN.md`).

## 2026-10-21 — Rebuild as IBM Carbon On-Premise Integrated FPMS & Network Digital Twin Commercial Console
- Status: Completed
- Changed: `package.json`, `vite.config.ts`, `src/main.tsx`, `src/core/remediationGenerator.ts`, `src/adapters/vendorConfigParser.ts`, `src/fixtures/onPremEnterpriseTopology.ts`
- Verified: `make check` passed 100%.
- Blockers: None
- Next: Completed pure Carbon & REA refinement above.

## 2026-10-21 — Complete TA Migration Lab v2.0 Enterprise Platform Overhaul & REA Reverse Engineering Integration
- Status: Completed
- Changed: `src/core/types.ts`, `src/core/analyzer.ts`, `src/core/whatIfMutator.ts`, `src/adapters/clabAdapter.ts`, `src/fixtures/scenarios.ts`, `src/core/__tests__/whatIfAndDiagnostic.test.ts`
- Verified: `make check` passed 100%.
- Blockers: None
- Next: Superseded by On-Premise IBM Carbon FPMS & Digital Twin pivot.

## 2026-10-20 — Complete P1/P0/P2/P3 implementation, T01–T12 evidence, and GCP Zero-VM configs
- Status: Completed
- Changed: `src/core/*`, `src/fixtures/scenarios.ts`, `src/adapters/*`, `fixtures/execution-evidence.json`, `Dockerfile`, `firebase.json`, `deploy/gcp/*`
- Verified: `make check` passed 100%.
- Blockers: None
- Next: Completed.
