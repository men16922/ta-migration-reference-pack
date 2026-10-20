# Decisions

Record of architectural or hard-to-undo choices (provider, infra, data model, doc policy, public workflow).

## 2026-10-21 — 100% Pure IBM Carbon Design System (Zero Custom CSS Overrides) & AWS Reachability UX
- **Decision**: Strip `src/styles.css` down to a 5-line `html, body` reset, remove the fixed `<SideNav>` overlay, use top `<Header>` + `<ContentSwitcher>` + `<ComposedModal>` inspector, and structure the main workspace around an AWS Reachability Analyzer / Security Groups mental model.
- **Reason**: Custom CSS overrides diluted Carbon's design tokens, and `@carbon/react`'s `position: fixed; z-index: 8000` `<SideNav>` overlapped `<Content>` on viewports `< 66rem` (`1056px`). Structuring connectivity checks as an interactive Reachability Analyzer table makes multi-firewall path diagnosis immediately self-explanatory.
- **Impact**: 100% of screen width is usable without sidebar overlap at any viewport size, and all styling is governed strictly by `@carbon/styles/css/styles.min.css`.

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
