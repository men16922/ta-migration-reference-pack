# Agent Brief

Last Updated: 2026-10-21

This file is a compressed context for session start (≤60 lines). For details, open linked documents only when needed.

> ▶ NEXT SESSION: All P0–P4 and On-Premise IBM Carbon FPMS & Network Digital Twin milestones (24/24 tests) are verified (`make check` green) and pushed to `origin/main`. See `docs/NEXT_PLAN.md` for optional deployment tasks.

## Snapshot

**On-Premise FPMS & Network Digital Twin Console (`ta-migration-reference-pack`)** is a 100% VM-free, pure **IBM Carbon Design System (`@carbon/react` + `@carbon/styles`)** web application (`TypeScript + React + Vite + Vitest`) modeled after **AWS Reachability Analyzer / Security Groups** and commercial On-Premise FPMS/Digital Twin solutions (**NxPortrait, Firescan, Tufin, Forward Enterprise, Batfish**). It includes deterministic bidirectional reachability (`src/core/analyzer.ts`), multi-firewall AFP & CLI remediation (`src/core/remediationGenerator.ts`), `rea@6.5.0` reverse-engineered CIDR set-algebra & OpenWrt `fw4` policy audit (`src/core/firewallAuditEngine.ts`, `docs/rea-reconstruction-ledger.md`), and a 9-vendor config parser (`src/adapters/vendorConfigParser.ts`).

## Active Work

Authority: `docs/NEXT_PLAN.md`.

1. **Completed**: Pure IBM Carbon UI overhaul, AWS Reachability Analyzer UX, 4-target `rea@6.5.0` precision reverse engineering (`cidr-tools`, `ipaddr.js`, `luci-app-firewall`, `@containerlab/clab-viewer`), 24/24 tests, and GitHub push (`https://github.com/men16922/ta-migration-reference-pack`).

## Read Order

1. Current State: `docs/STATUS.md`
2. Next Work: `docs/NEXT_PLAN.md`
3. Recent Log: `docs/PROGRESS_LOG.md`
4. Reverse-Engineering & Architecture: `docs/rea-reconstruction-ledger.md`, `docs/gcp-cost-minimal-architecture.md`, `fixtures/execution-evidence.json`

## Commands

- Verification Gate: `make check`
- Doc Budget Check: `make doc-budget`
- Unit & Component Tests: `npm test`
- Production Build: `npm run build`

## Guardrails

- Synthetic/public data only; never connect to corporate networks, live Docker sockets from the browser, or live AWS/GCP accounts during automated loops.
- Keep `src/styles.css` free of custom component CSS overrides so `@carbon/styles` governs 100% of styling.
