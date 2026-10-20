# Status

Last Updated: 2026-10-21

## Current Baseline

- **IBM Carbon On-Premise FPMS & Network Digital Twin Console (`src/App.tsx`, `src/styles.css`)**:
  - Built on **IBM Carbon Design System (`@carbon/react`, `@carbon/icons-react`)** with `g10` (Light) and `g100` (Dark SOC) theme switching.
  - Benchmark of On-Premise commercial solutions (**지란지교 NxPortrait**, **파이어스캔(Firescan)**, **Tufin SecureTrack/SecureChange**, **Forward Enterprise**, **Batfish**):
    1. **경로 자동 탐색 & 방화벽 신청 설계 (`PathFinderView.tsx` + `remediationGenerator.ts`)**: AFP (Automatic Firewall Pathfinding) across L3 switches (`Arista EOS`, `Cisco NX-OS`, `Juniper Junos`), L4 VIP (`F5 BIG-IP`), and multi-zone firewalls (`Palo Alto PAN-OS`, `Fortinet FortiOS`, `시큐아이 BLUEMAX NGF`, `안랩 TrusGuard`). Automatically distinguishes already-allowed firewalls (`ALLOW`) from blocked firewalls (`BLOCKED`), exports Firewall Request Tickets (CSV/Markdown), generates vendor-native CLI & Rollback scripts, and supports one-click Digital Twin policy application.
    2. **방화벽 정책 감사 & ISMS-P 진단 (`FirewallAuditView.tsx` + `firewallAuditEngine.ts`)**: Detects `SHADOWED` (100% masked dead rules), `REDUNDANT` (duplicate rules), `OVERLY_PERMISSIVE` (`ANY` open rules), `HIGH_RISK_PORT` (`Telnet 23`, `RDP 3389`), and `EXPIRED_OR_UNUSED` rules with ISMS-P compliance scoring and cleanup CLI generation.
    3. **멀티벤더 Config 파서 & 인벤토리 빌더 (`TopologyBuilderView.tsx` + `vendorConfigParser.ts`)**: Parses 9 On-Premise vendor configurations (`Palo Alto`, `Fortinet`, `시큐아이 BLUEMAX`, `안랩 TrusGuard`, `Cisco`, `Juniper`, `Arista`, `F5 BIG-IP`, `Linux`) into normalized Digital Twin entities and auto-links matching subnets.
    4. **야간 작업 사전 시뮬레이터 & MOP (`PreChangeSimulatorView.tsx`)**: Pre-change vs post-change comparison across critical enterprise flows, regression detection, and Method of Procedure (MOP) report generation.
- **Verification Gate**: `make check` (`doc-budget` + `tsc --noEmit` + `vitest run` 5 test suites / 23 tests + `vite build`) passing 100% offline.

## Active Focus

Authority: `docs/NEXT_PLAN.md`.

0. All On-Premise FPMS & Network Digital Twin commercial workflows and 23/23 automated tests are complete and green.

## Open Risks

- None blocking; 100% VM-free, zero-idle-cost architecture preserved.
