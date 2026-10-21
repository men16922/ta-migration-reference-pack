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

## 2026-10-21 — 100% Pure IBM Carbon Design System (Zero Custom CSS Overrides) & AWS Reachability UX
- **Decision**: Strip `src/styles.css` down to a 5-line `html, body` reset, remove the fixed `<SideNav>` overlay, use top `<Header>` + `<ContentSwitcher>` + `<ComposedModal>` inspector, and structure the main workspace around an AWS Reachability Analyzer / Security Groups mental model.
- **Reason**: Custom CSS overrides diluted Carbon's design tokens, and `@carbon/react`'s `position: fixed; z-index: 8000` `<SideNav>` overlapped `<Content>` on viewports `< 66rem` (`1056px`). Structuring connectivity checks as an interactive Reachability Analyzer table makes multi-firewall path diagnosis immediately self-explanatory.
- **Impact**: 100% of screen width is usable without sidebar overlap at any viewport size, and all styling is governed strictly by `@carbon/styles/css/styles.min.css`.

## 2026-10-21 — Console Shell Layout CSS Allowed; Old App Becomes 네트워크 분석(실험)
- **Decision**: `src/styles.css` may hold shell layout CSS (grid, in-flow nav, page header, KPI sizing) using Carbon tokens; Carbon components stay unmodified. The previous FPMS console becomes a single page `NetworkLab` inside the new IBM Cloud-style shell.
- **Reason**: The IBM Cloud console layout (header + pushing left nav + widget grid) needs layout rules that Carbon does not ship without the fixed `SideNav`, which overlapped content (LESSONS).
- **Impact**: Supersedes the earlier "zero custom CSS" guardrail.

## 2026-10-21 — Python Kit `onprem-atlas` in `kit/`; TS ESM Adapter Removed
- **Decision**: The asset kit is the Python package `onprem-atlas` (module `onprem_atlas`, CLI `onprem-atlas`) under `kit/`, gated by `make kit` inside `make check`. The interim TypeScript ESM adapter / xlsx reader (and `exceljs`, `tsx`) were removed to avoid two implementations.
- **Reason**: The company agent (Strands/boto), policy DB (SQLite) and diagram-bot are Python, so copy-porting is cheapest; one implementation of mapping/validation rules.
- **Impact**: `make check` needs `python3` with openpyxl + pytest + ruff, or `make kit-setup` (`kit/.venv`).

## 2026-10-21 — UI: Carbon IBM Cloud Console Style, Gemini/Copilot-Style Assistant, No MCP
- **Decision**: Keep Carbon and model the shell on the IBM Cloud console. The assistant is a docked right panel like Gemini Cloud Assist (GCP) / Copilot (Azure). MCP is excluded; the assistant talks to the backend over an SSE contract, and the company plugs its existing Strands agent into it.
- **Reason**: MCP cannot be integrated when the server runs on EC2 in the company environment; the company agent is already Strands-based.
- **Impact**: Plan `docs/plans/2026-10-21-onprem-asset-kit.md` §9, NEXT_PLAN P7–P8.

## 2026-10-21 — ESM xlsx as Asset Source, diagram-bot Pipeline Alignment, MCP Deferred
- **Decision**: Treat the product as an on-prem enterprise platform for AWS migration, modeled on `men16922/diagram-bot` (snapshot → graph → views → deterministic layout → draw.io, review, diff, tool-only chat agent). Sync assets from ESM xlsx exports (no API); Zabbix later. NetBox is optional, not on the critical path. Chat model is GPT 6 Luna in the company cloud tenant. The MCP server wrapper was removed; `src/agent/engineTools.ts` stays as in-app chat function tools.
- **Reason**: ESM has no usable API; diagram-bot already proved the pipeline and chat-tool pattern; an MCP layer only pays off when an external chat UI or other agents must share the tools.
- **Impact**: Data/feature gaps tracked as TD1–TD9 / TF1–TF10 in `docs/plans/2026-10-21-operator-console-redesign.md` §0. Implementation location (D7) and design system (D6) pending.

## 2026-10-21 — REA (`rea@6.5.0`) Precision Reverse Engineering of Real Open-Source Distributions
- **Decision**: Download and reverse-engineer `cidr-tools@13.0.4`, `ipaddr.js@2.5.0`, `luci-app-firewall@24.10.0` (OpenWrt `fw4`), and `@containerlab/clab-viewer@0.1.0` using `/Users/men1692/Desktop/AI/rea`, porting `subparts4`, `biggestPowerOfTwo4`, `mergeIntervalsRaw4`, `excludeCidr4`, `containsCoalescedCidr4`, and `synthesizeLuciRuleSummary` into `src/core/firewallAuditEngine.ts`.
- **Reason**: Enables mathematically exact CIDR set difference (`excludeCidr4`), coalesced multi-subnet shadowing detection (`containsCoalescedCidr4`), and normalized firewall rule summaries backed by verifiable REA Evidence JSONs (`docs/rea-reconstruction-ledger.md`).
- **Impact**: Firewall audit engine detects multi-rule coalesced shadowing and calculates exact residual CIDR blocks.

## 2026-10-20 — Reorder Execution (`P1 -> P0 -> P3`) & Single TypeScript Stack
- **Decision**: Implement the P1 Semantic Model & Deterministic Reachability Engine in pure TypeScript first, shared directly with the React/Vite UI and Vitest suite without a separate backend server.
- **Reason**: Eliminates backend VM/runtime dependencies, enables sub-millisecond deterministic testing of `T01`–`T12`, and allows the UI to run as a static bundle.
- **Impact**: Zero compute servers or VMs needed; `make check` verifies types, 12 scenario fixtures, UI components, and production bundle offline.

## 2026-10-20 — Isolated Viewer Adapter + Google Cloud Zero-VM Architecture
- **Decision**: Use an isolated React `TopologyCanvas` paired with `clabAdapter.ts`, and target Firebase Hosting ($0 static) or Google Cloud Run with `minScale: "0"` and `cpu-throttling: "true"`.
- **Reason**: Static/scale-to-zero hosting avoids all VM costs on Google Cloud.
- **Impact**: Idle cloud cost is $0.00/month with no Compute Engine, GKE, or Linux lab runner VM required.
