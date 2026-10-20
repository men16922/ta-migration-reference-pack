# Agent Brief

Last Updated: 2026-10-20

This file is a compressed context for session start (≤60 lines). For details, open linked documents only when needed.

> ▶ NEXT SESSION: All P0–P3 core milestones and T01–T12 fixtures are implemented and verified (`make check` green). See `docs/NEXT_PLAN.md` for optional post-MVP enhancements.

## Snapshot

**TA Migration Lab** is a 100% VM-free, vendor-neutral IDC network learning, topology visualization, deterministic bidirectional reachability analysis, and AWS migration intent comparison web application (`TypeScript + React + Vite + Vitest`). It implements the Semantic Network Snapshot & ViewAnnotations model (`src/core/types.ts`), deterministic IPv4 bidirectional reachability engine (`src/core/analyzer.ts`), Containerlab YAML/annotations adapter (`src/adapters/clabAdapter.ts`), Batfish fixture adapter (`src/adapters/batfishAdapter.ts`), AWS Migration Intent Diff engine (`src/core/migrationDiff.ts`), and Google Cloud Zero-VM deployment configs (`firebase.json`, `deploy/gcp/cloudrun-service.yaml`).

## Active Work

Authority: `docs/NEXT_PLAN.md`.

1. **Completed**: P1 Semantic Model & Engine (`T01`–`T12` verified), P0 Read-Only Viewer & Containerlab Adapter, P2 Batfish Fixture Adapter, P3 AWS Migration Intent Diff UI, and Google Cloud Zero-VM configs.

## Read Order

1. Current State: `docs/STATUS.md`
2. Next Work: `docs/NEXT_PLAN.md`
3. Recent Log: `docs/PROGRESS_LOG.md`
4. Architecture & Evaluations: `docs/p0-viewer-evaluation.md`, `docs/gcp-cost-minimal-architecture.md`, `fixtures/execution-evidence.json`

## Commands

- Verification Gate: `make check`
- Unit & Component Tests: `npm test`
- Production Build: `npm run build`

## Guardrails

- Synthetic/public data only; never connect to corporate networks, live Docker sockets from the browser, or live AWS/GCP accounts during automated loops.
- Keep `networkOutcome` (`reachable`/`blocked`/`unknown`) and `intentVerdict` (`pass`/`fail`/`unknown`) strictly separated; never flatten VRFs or guess uncollected policy/route tables.
