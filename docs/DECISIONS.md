# Decisions

Record of architectural or hard-to-undo choices (provider, infra, data model, doc policy, public workflow).

## 2026-10-20 — Reorder Execution (`P1 -> P0 -> P3`) & Single TypeScript Stack
- **Decision**: Implement the P1 Semantic Model & Deterministic Reachability Engine in pure TypeScript first, shared directly with the React/Vite UI and Vitest suite without a separate backend server.
- **Reason**: Eliminates backend VM/runtime dependencies, enables sub-millisecond deterministic testing of `T01`–`T12`, and allows the UI to run as a static bundle.
- **Impact**: Zero compute servers or VMs needed; `make check` verifies types, 12 scenario fixtures, UI components, and production bundle offline.

## 2026-10-20 — Isolated Viewer Adapter + Google Cloud Zero-VM Architecture
- **Decision**: Use an isolated React SVG `TopologyCanvas` paired with `clabAdapter.ts` (while locking `@containerlab/clab-viewer@0.1.0` for contract verification), and target Firebase Hosting ($0 static) or Google Cloud Run with `minScale: "0"` and `cpu-throttling: "true"`.
- **Reason**: `@containerlab/clab-viewer` direct mount shares module state across instances, whereas P3 requires side-by-side As-Is/To-Be comparison; static/scale-to-zero hosting avoids all VM costs on Google Cloud.
- **Impact**: Idle cloud cost is $0.00/month with no Compute Engine, GKE, or Linux lab runner VM required.

## 2026-10-20 — Core Architecture & Verification Boundaries (`README.md`)
- **Decision**: Separate topology semantics from visual layout annotations; implement a deterministic closed-world educational analyzer where uncollected data or unsupported features return `unknown`; compare AWS migration intents via logical workload IDs rather than raw IP strings; restrict LLMs to explanation drafting only.
- **Reason**: Prevents false confidence ("green but wrong" reachability) and keeps core educational and migration intent verification deterministic and offline-testable.
- **Impact**: All P1–P3 analyzer rules and T01–T12 fixture assertions enforce explicit `reachable`/`blocked`/`unknown` and `pass`/`fail`/`unknown` separation.
