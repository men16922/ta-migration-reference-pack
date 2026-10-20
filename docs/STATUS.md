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
- **Remote Repository**: `https://github.com/men16922/ta-migration-reference-pack` (`main`).
- **Verification Gate**: `make check` (`doc-budget` + `tsc --noEmit` + `12/12 specs` + `vitest run` 5 test files / 24 tests + `vite build`) passing 100% offline.

## Active Focus

Authority: `docs/NEXT_PLAN.md`.

0. All On-Premise FPMS & Network Digital Twin features, REA reconstructions, and 24/24 tests are complete and pushed to `origin/main`.

## Open Risks

- None blocking; 100% VM-free, zero-idle-cost architecture preserved.
