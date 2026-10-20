# Status

Last Updated: 2026-10-21

## Current Baseline

- **Pure IBM Carbon On-Premise FPMS & Network Digital Twin Console (`src/App.tsx`, `src/styles.css`)**:
  - Built 100% with authentic **IBM Carbon Design System (`@carbon/react`, `@carbon/icons-react`, `@carbon/styles`)** with zero custom CSS overrides (`src/styles.css` is a 5-line body reset) and no overlapping fixed `<SideNav>`.
  - Designed with an **AWS VPC / Reachability Analyzer / Security Groups** mental model:
    1. **통신 경로 분석기 & 토폴로지 맵 (`PathFinderView.tsx`, `TopologyCanvas.tsx`, `remediationGenerator.ts`)**: Real-time Connectivity Tests table (`REACHABLE` vs `BLOCKED`), 1-click firewall remediation (`⚡ 즉시 방화벽 허용`), Hop-by-Hop visual trace (`ProgressIndicator` + `ClickableTile` hop cards), 5-Zone VPC-style architecture map, vendor CLI generator, and CSV/MOP export.
    2. **방화벽 정책 감사 & 자동 정리 (`FirewallAuditView.tsx`, `firewallAuditEngine.ts`)**: Integrates `rea@6.5.0` reverse-engineered algorithms from `cidr-tools@13.0.4` (`subparts4`, `biggestPowerOfTwo4`, `mergeIntervalsRaw4`, `excludeCidr4`, `containsCoalescedCidr4`), `ipaddr.js@2.5.0`, and OpenWrt `luci-app-firewall@24.10.0` (`synthesizeLuciRuleSummary`).
    3. **멀티벤더 Config 파서 & 인벤토리 빌더 (`TopologyBuilderView.tsx`, `vendorConfigParser.ts`)**: Carbon `ContentSwitcher` + `StructuredListWrapper` AST preview for 9 On-Premise vendors (`Palo Alto`, `Fortinet`, `시큐아이 BLUEMAX`, `안랩 TrusGuard`, `Cisco`, `Juniper`, `Arista`, `F5 BIG-IP`, `Linux`) + GUI rule/route forms.
    4. **야간 작업 사전 시뮬레이터 (`PreChangeSimulatorView.tsx`) & 장비 상세 모달 (`DeviceInspectorDrawer.tsx`)**: Pre/post-change regression matrix and Carbon `ComposedModal` resource inspector.
- **On-Prem Asset Kit (`kit/`, Python `onprem-atlas`)**: ESM xlsx → SQLite (sync runs, raw rows, FTS5 search), project classification (naming regex > ESM system-name column, shared infra), readiness review (8 rules), sync diff, read-only FastAPI (`onprem-atlas serve`). Plan: `docs/plans/2026-10-21-onprem-asset-kit.md` (P1/P2/P2.5 done; P3–P8 open).
- **Console (`src/App.tsx`, `src/console/`)**: IBM Cloud-style Carbon shell (g100 header + header asset search, in-flow left nav) with dashboard, projects, project detail, assets, readiness review, sync history; the old FPMS app lives on as 네트워크 분석(실험) (`src/components/NetworkLab.tsx`). Screenshots: `docs/images/atlas-*.png`. Demo: `make atlas-demo` + `npm run dev`.
- **Chat-agent engine tools (`src/agent/engineTools.ts`)**: deterministic reachability / firewall request draft / policy findings / change simulation / migration compare, for in-app function calling (no MCP).
- **Remote Repository**: `https://github.com/men16922/ta-migration-reference-pack` (`main`).
- **Verification Gate**: `make check` (`doc-budget` + `tsc --noEmit` + `12/12 specs` + `vitest run` 8 test files / 34 tests + `kit` ruff + 35 pytest + `vite build`) passing 100% offline.

## Active Focus

Authority: `docs/NEXT_PLAN.md`.

0. P3 project-scoped draw.io diagram + console diagram page; P8 assistant panel; P0 decisions K2–K6 pending (`docs/NEXT_PLAN.md`).

## Open Risks

- None blocking; 100% VM-free, zero-idle-cost architecture preserved.
