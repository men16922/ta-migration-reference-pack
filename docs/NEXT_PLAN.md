# Next Plan

Last Updated: 2026-10-22

Authority: `docs/plans/2026-10-21-enterprise-idc-tool.md`. User direction supersedes assistant-first P8 and the old FPMS/AWS simulator roadmap.

## Priority 1 — Enterprise acceptance

- [ ] [manual] First acceptance action: preview an approved real/anonymized ESM workbook in a separate DB, check sheet/header mappings and export filters before import. Cover server/equipment/security/WEB/WAS/DB sources; confirm group/site/hostname vs asset ID/serial, host renames and endpoint identity. Company workbook input is still missing.
- [ ] [manual] Confirm organization-scoped source catalogs before enabling full replacement for separately managed company/center exports.
- [ ] [manual] Connect company Agent: `AssetKnowledgeTools` + existing Strands registration or HTTP endpoint. Validate real-model citations and scope handling using approved data; no paid calls without authorization.
- [ ] [manual] Bind company SSO/roles and audit identity before any shared deployment. Current app is local/loopback only.

## Priority 2 — Evidence-driven extensions

- [ ] [manual] Prioritize remaining UX/data gaps from `docs/evaluation.md`: no-change upload skipping/retention, raw-only security-field diffs, manual drawing update comparison.

- [ ] [manual] Validate company naming/notation against the monochrome IDC/business drawings. Firewall/zone/communication can already be drawn manually; confirmed subnet/connection/rack records remain necessary only for verified physical/rack/port views.
- [ ] [manual] Confirm ESM CPU/memory/disk performance export or Zabbix API permissions. Store metrics separately with period/statistic/unit/source; do not derive p95 from daily averages.
- [ ] [manual] Confirm company sizing input contract only when sizing export is requested; no duplicate sizing engine.

## Product boundary

- Main workflow: Excel registration → asset verification → IDC/business diagrams → change history.
- Knowledge is separate, versioned and searched through the company AI Agent. Agent tools are read-only and return source citations.
- No network-lab navigation, firewall automatic remediation, policy audit, AWS migration simulation or arbitrary readiness score in the product.
- Local core and browser/backup validation results live in STATUS/PROGRESS_LOG; do not seed the operational database with fixtures.

## Rules

- `[auto]`: locally deterministic work with a concrete input and acceptance condition.
- `[manual]`: company input, access or deployment decision required. Do not assume approval from elapsed time.
- Commit/push/publication require existing explicit authorization.
