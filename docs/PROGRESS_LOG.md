# Progress Log

Last Updated: 2026-10-22

This file maintains only recent incremental summaries (newest 3-5 items, ≤120 lines). Older entries are archived to `docs/archive/progress-YYYY-MM.md` via `/tidy-docs`.

## 2026-10-22 — 보안장비·리팩토링·저장소 정리·최종 평가
- Status: Local work bundle complete; checkpoint recorded with existing evidence, without a duplicate milestone. Worktree remains uncommitted on `feat/diagram-drawio-icons` (HEAD `f28c568`); new modules/archive files are untracked and must be included in any later authorized commit.
- Completed: dedicated security source/solution mapping, raw operation/team/monitoring preservation, explicit FW vs other security icons. Removed 29 unused TS files, obsolete static deployment/config/screenshots, clab-viewer/yaml dependencies; consolidated 6 research docs and archived 2 superseded plans. Pre-cleanup worktree backup is under ignored outputs/2026-10-22-cleanup/.
- Refactor/fixes: split diagram model/inventory/enterprise builder and removed dead inferred-topology builders/circular import; separated draw.io UI/protocol hook. Reproduced save-during-edit dirty-state loss with a failing test and fixed it. Fixed historical loaded-revision label, business title/edit entry, mobile menu CSS after Chrome reproduction.
- Verified: final make check passed (8 frontend, 76 Python; ruff, TypeScript, doc budgets/local links, production build). Retired 32 obsolete frontend tests and 12 reference-presence specs; added 2 editor regressions. Offline wheel build/import/API check includes editor bridge and split modules.
- Chrome/API: isolated :8771 has 14 assets/9 instances after 7 synthetic security devices. Existing manual revision 3/base #5 preserved; generated #6 saved as revision 4 and revision 3 reloaded. Security source choice/raw columns/monochrome icons and 640px menu navigation verified; viewport restored.
- Preservation: :8770 retains run #2/3 assets; sample/ ignored and untracked. No company data imports, live model calls, commit/push/deployment. Current evaluation and limitations: docs/evaluation.md; operations: docs/enterprise-operations.md.
- Blockers: actual/anonymized company workbooks and approved identity/export-scope rules, company authentication/Agent integration inputs.
- Next: actual ESM identity/export-scope acceptance, company auth/Agent integration. Same-content uploads still create snapshots; security raw-only fields are not normalized diff fields; no automatic asset/manual-drawing merge.

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
- Historical correction: :8770 now contains 3 pre-existing synthetic assets; preserve them. This entry originally described an empty DB. Earlier isolated `/tmp/ta-enterprise-qa` fixtures were imported. No company access, live model call, commit/push or deployment.
- Blockers: actual workbook/identity/source-scope acceptance and company Agent/auth integration inputs. Exact cables/VLAN/rack elevations and utilization require additional sources.
- Next: `docs/plans/2026-10-21-enterprise-idc-tool.md`; operations/Agent wiring in `docs/enterprise-operations.md`.


Earlier records: [2026-10-21 archive](archive/2026-10-21/PROGRESS_LOG.md).
