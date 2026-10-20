# P0 Evaluation Note — `@containerlab/clab-viewer` vs Internal Isolated Viewer Adapter

Date: 2026-10-20
Locked Package Inspected: `@containerlab/clab-viewer@0.1.0` (MIT License, tarball sha1 `6f37112a91a8b3e0e9bed9b723e3f77836e348a9`)

## 1. Inspected Public Entrypoints & Types

From `node_modules/@containerlab/clab-viewer/dist/index.d.ts` and `types.d.ts`:

```ts
/** Mount one read-only canvas. Use the HTML component for multiple isolated diagrams. */
export declare function mountViewer(container: Element, options: MountViewerOptions): ViewerHandle;
```

- `MountViewerOptions`: accepts `yaml: string`, `annotations?: string`, `theme?: "light" | "dark"`, `viewerOptions?: ViewerOptions` (including `onNodeSelect?: (id: string | null) => void`), `onReady`, `onError`.
- `ViewerHandle`: provides `unmount(): void`.

## 2. Architectural Findings & Constraints

1. **Single-Instance Store Sharing**:
   - As documented in `index.d.ts` (*"Mount one read-only canvas. Use the HTML component for multiple isolated diagrams"*), calling `mountViewer` directly multiple times in the same JS module shares global state.
   - However, **P3 (AWS Migration Intent Diff)** requires rendering **two interactive topologies side by side** (`As-Is IDC` and `To-Be AWS`) with synchronized trace step highlighting, completeness badges, and independent node selection.
2. **Separation of Topology Semantics vs Layout Annotations**:
   - Containerlab separates `.clab.yml` (nodes and link endpoints) from `.clab.annotations.json` (`nodeAnnotations` with `{ id, position: { x, y }, label, group }`).
   - However, a raw `.clab.yml` file only guarantees L1/L2 link endpoints—it does **not** guarantee that complete L3 routing tables or firewall policies were collected.
   - Our `src/adapters/clabAdapter.ts` (`exportToContainerlabArtifacts` / `importFromContainerlabArtifacts`) preserves this exact split while enforcing the closed-world rule: imported YAML nodes without explicit `ta.routingComplete: "true"` metadata default to `routingTableComplete: false` (`unknown` outcome rather than false `reachable`).
3. **Why an Isolated React SVG Viewer Adapter (`TopologyCanvas.tsx`) is Primary**:
   - Zero shared global store: multiple `<TopologyCanvas />` instances mount side by side in the same DOM without iframe overhead or store collisions.
   - First-class rendering of **Forward/Reverse Trace overlays**, **Completeness indicators**, and **Live T08 Coordinate Nudge (`semanticHash` invariance proof)**.
   - Works deterministically in headless JSDOM/Vitest tests as well as every browser without requiring WebGL or a Linux backend runner.
