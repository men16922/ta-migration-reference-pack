# Google Cloud Zero-VM & Cost-Minimal Deployment Architecture

Date: 2026-10-20

## Core Design Principle: 100% Client-Side Deterministic Engine (No VM Required)

To eliminate always-on VM costs (no Compute Engine, no GKE nodes, no Linux Containerlab runner VM, no Java Batfish server VM), **TA Migration Lab** executes all analysis deterministically inside a pure TypeScript engine (`src/core/analyzer.ts`, `src/core/migrationDiff.ts`) bundled with the static web app:

- **P1 Bidirectional Reachability & Intent Engine**: Runs in `< 1 ms` in browser memory.
- **P0 Topology Viewer & Containerlab YAML/Annotation Adapter**: Runs in browser memory (`src/adapters/clabAdapter.ts`).
- **P2 External Engine Fixture Comparison**: Ingests pre-captured Batfish `BidirectionalTrace` JSON fixtures (`src/adapters/batfishAdapter.ts`) offline without running a JVM container in production.
- **P3 AWS Migration As-Is vs To-Be Diff & Markdown Report**: Runs in browser memory (`src/core/migrationDiff.ts`).

---

## Deployment Options on Google Cloud (Ordered by Lowest Cost)

### Option 1 (Recommended, $0/month): Firebase Hosting or Cloud Storage + CDN
Because `npm run build` outputs a purely static `dist/` bundle with zero server-side compute dependencies:
- **Config**: [`firebase.json`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/firebase.json)
- **Compute Instances**: `0` (No VM, no container runtime billing)
- **Estimated Monthly Cost**: **$0.00/month** within the Firebase Hosting free tier (10 GB storage, 360 MB/day transfer) or pennies per month on Google Cloud Storage.
- **Manual Deploy Command** (run only when desired by a human operator):
  ```bash
  npm run build
  npx firebase-tools deploy --only hosting
  ```

### Option 2 ($0 Idle Cost): Google Cloud Run with Scale-to-Zero (`minScale: "0"`)
When IAM/IAP integration or a container endpoint on Cloud Run is preferred:
- **Configs**: [`Dockerfile`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/Dockerfile), [`deploy/gcp/nginx.conf`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/deploy/gcp/nginx.conf), [`deploy/gcp/cloudrun-service.yaml`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/deploy/gcp/cloudrun-service.yaml)
- **Cost Guardrails Enforced in `cloudrun-service.yaml`**:
  1. `autoscaling.knative.dev/minScale: "0"` — Scales down to **zero instances** when no user is loading the page (**$0.00 idle cost**).
  2. `autoscaling.knative.dev/maxScale: "2"` — Hard ceiling to prevent unexpected traffic/billing spikes.
  3. `run.googleapis.com/cpu-throttling: "true"` — CPU is billed **only** during the few milliseconds Nginx serves static files (`index.html`, JS/CSS assets with `max-age=31536000, immutable`).
  4. `memory: "128Mi"`, `cpu: "1000m"`, `containerConcurrency: 80` — Minimal footprint; fits well inside Cloud Run's monthly free tier (2 million requests, 180,000 vCPU-seconds, 360,000 GiB-seconds free per month).
  5. **No VPC Connector / No Cloud SQL / No NAT Gateway**: Avoids all hidden fixed hourly charges on GCP.
