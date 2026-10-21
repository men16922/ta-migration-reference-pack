# Decisions

Record of architectural or hard-to-undo choices (provider, infra, data model, doc policy, public workflow).

## 2026-10-21 — Separate deployments and manual monochrome drawings
- **Decision**: WEB/WAS/DB rows become component snapshots keyed by scoped host/product/endpoint/business, linked to exact scoped hosts. Editable drawings have their own append-only revisions per IDC/business scope and retain their source run.
- **Reason**: ESM shows multiple URLs/ports/SIDs per host; the user will draw firewall/network/communication manually and prefers monochrome company-style diagrams.
- **Impact**: Schema v3; physical asset totals stay stable; ambiguous hosts remain unresolved. Asset imports never overwrite manual drawings. Drawing annotations do not become verified inventory/network evidence. Reuse diagram-bot's local draw.io approach without its AWS/model stack.

## 2026-10-21 — Enterprise ESM inventory first; separate knowledge and company Agent
- **Decision**: Product scope is Excel registration, inventory/provenance, IDC/business diagrams and change history. Remove FPMS lab, readiness scores and developer navigation from the shipped app. Keep operational data and knowledge in separate SQLite stores; provide read-only source-citing tools to the existing company Agent.
- **Reason**: User supplied actual ESM screenshot structure and explicitly requested a useful internal enterprise tool, not a demonstration platform or duplicate company systems.
- **Impact**: Supersedes assistant-first P8 and FPMS/AWS simulator priorities. ESM download stays manual through SSO; subsequent import is automated. No inferred network topology by default. Shared deployment and live Agent integration need company-side inputs.

## 2026-10-22 — Current product only; preserve historical evidence separately
- **Decision**: Remove unused TS network lab/analysis/adapters/fixtures, static-only cloud deployment files and their dependencies. Consolidate research into `docs/archive/2026-10-21/network-research.md`; archive superseded plans and decisions. Keep Python compatibility/review utilities with their regression tests.
- **Reason**: The enterprise workflow is inventory and editable IDC diagrams. Inactive learning features and contradictory deployment/docs obscure that workflow.
- **Impact**: Carbon shell layout CSS is allowed; component internals remain unchanged. Current docs point to the operations guide, product plan and evaluation. Removed worktree files are backed up locally; company inputs/DB/harness are preserved.

Earlier decisions: [historical record](archive/2026-10-21/DECISIONS.md).
