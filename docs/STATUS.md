# Status

Last Updated: 2026-10-22

## Current Baseline

- ESM-backed local workspace with browser Excel preview/commit, explicit source and merge/replace modes, raw row/file hash provenance, snapshot history and search.
- Schema v3 migrates v1/v2 additively; source-scoped asset/component snapshots and separate revisioned drawings. Revision checks reject stale commits; token retries are idempotent; missing-column updates cannot silently erase existing values.
- Browser registration commits assets, search index, classification and token together. Failure injection before/after classification proves rollback and retry; a second database connection sees only the previous completed snapshot until commit.
- ESM mappings cover server/equipment/security and WEB/WAS/DB screenshots. Security types remain distinct; operation/team/secondary owner/monitoring columns are preserved as raw data. Deployments use host/product/endpoint/business identity, exact scoped host association, and separate counts; raw rows and prior snapshots survive other source updates.
- Default classification has no naming/shared-code rules. Confirmed profiles are explicit; browser imports use the same configured profile as the read API. Synthetic classification is isolated in an examples JSON used explicitly by demo/tests.
- Console: dashboard, Excel registration, IDC diagrams, business systems, assets with source detail, registration/change history. Unused TS network lab/adapters/fixtures and static-only deploy configs are removed; readiness/developer menus remain excluded.
- Diagrams: monochrome IDC aggregate and business detail (ITSM hierarchy, internally `project`), site/network equipment + WEB/WAS/DB tiers. Local draw.io 32.4.1 embed reuses diagram-bot cache; custom monochrome palette, manual firewall/zone/connection editing, source-separated revisions/history/download. New inventory marks saved drawings stale without overwriting them.
- Separate knowledge database preserves versions/source hashes and filters by host-bound groups. `AssetKnowledgeTools` provides read-only asset/knowledge lookup and diagram action data. Optional Strands registration adapter exists; actual company integration remains unverified.
- `make atlas` builds/serves the app and API locally without data reset. Backup/verify CLI preserves database and uploaded originals; restored-copy use is tested.

## Verification

- New source-import tests cover multi-source coexistence, partial updates/full replace, provenance, stale/concurrent confirms, token retry, malformed/empty files, duplicate identity, cross-site rejection and loopback proxy acceptance.
- Knowledge tests cover version history, permission revocation and read-only tool citations; v1 migration and portable backup/restore have dedicated checks.
- Chrome: actual synthetic file selection → preview → server registration → equipment registration (3 assets coexist), original-row detail, business diagram and draw.io download verified. Native file picker used; extension permissions unchanged.
- Final gate results are recorded in the newest `docs/PROGRESS_LOG.md` entry. Tests use synthetic data and do not establish company production readiness.

- Final cleanup gate: 8 frontend / 76 Python tests, TypeScript/ruff/build/doc links passed. Offline wheel import/API verified. Chrome security source/detail/icons, drawing save/history and narrow-screen navigation verified. See `docs/evaluation.md` for exact limits.

## Active Focus

`docs/NEXT_PLAN.md` → enterprise ESM acceptance and company Agent integration. Detailed plan: `docs/plans/2026-10-21-enterprise-idc-tool.md`.

## Open Risks / Dependencies

- Samples are images, not actual workbooks: complete headers, sheet layout, identifiers and export filters need acceptance against a real/anonymized workbook.
- Current UI supports server/equipment/security/WEB/WAS/DB sources; group/site/hostname and endpoint identity require company acceptance for renamed hosts, clustered endpoints and cross-source overlap.
- Company SSO/roles and actual Agent endpoint/registration module are not available locally. Loopback-only operation is supported; shared deployment is not authorized or verified.
- Zabbix server version/API role/host-item permissions and ESM performance export format are unknown. Usage ingestion is not required to draw asset architecture.
- Logical asset grouping and declared redundancy are supported. Rack elevations, cable/port paths and verified network relationships require additional source data.
