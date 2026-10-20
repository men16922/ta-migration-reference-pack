import YAML from 'yaml';
import type {
  DeviceModel,
  InterfaceModel,
  LinkModel,
  NodeAnnotation,
  TopologyDocument,
  ViewAnnotations,
} from '../core/types';

export interface ContainerlabNodeDef {
  kind?: string;
  image?: string;
  labels?: Record<string, string>;
  exec?: string[];
}

export interface ContainerlabLinkDef {
  endpoints: [string, string];
}

export interface ContainerlabYamlSchema {
  name: string;
  topology: {
    nodes: Record<string, ContainerlabNodeDef>;
    links?: ContainerlabLinkDef[];
  };
}

export interface ClabViewerAnnotationsSchema {
  nodeAnnotations?: Array<{
    id: string;
    position?: { x: number; y: number };
    label?: string;
    group?: string;
    icon?: string;
  }>;
}

/**
 * Exports a TopologyDocument into `@containerlab/clab-viewer` compatible
 * `{ yaml, annotations }` strings.
 */
export function exportToContainerlabArtifacts(doc: TopologyDocument): {
  yaml: string;
  annotations: string;
} {
  const nodes: Record<string, ContainerlabNodeDef> = {};
  for (const dev of doc.semantic.devices) {
    const devIfs = doc.semantic.interfaces.filter((i) => i.deviceId === dev.id);
    const devRoutes = doc.semantic.routes.filter((r) => r.deviceId === dev.id);
    const execCmds: string[] = [];

    for (const iface of devIfs) {
      if (iface.ip) {
        execCmds.push(`ip addr add ${iface.ip} dev ${iface.name}`);
      }
    }
    for (const rt of devRoutes) {
      if (rt.protocol === 'static' && rt.nextHopIp) {
        execCmds.push(`ip route add ${rt.destinationPrefix} via ${rt.nextHopIp} dev ${rt.egressInterfaceId}`);
      }
    }

    nodes[dev.id] = {
      kind: dev.role === 'router' ? 'linux' : dev.role === 'switch' ? 'bridge' : 'linux',
      image: dev.location === 'aws' ? 'aws-synthetic/node:latest' : 'alpine:3.20',
      labels: {
        'ta.name': dev.name,
        'ta.role': dev.role,
        'ta.location': dev.location,
        'ta.routingComplete': String(dev.completeness.routingTableComplete),
        'ta.policyComplete': String(dev.completeness.policyTableComplete),
      },
      ...(execCmds.length > 0 ? { exec: execCmds } : {}),
    };
  }

  const ifMap = new Map<string, InterfaceModel>();
  for (const iface of doc.semantic.interfaces) {
    ifMap.set(iface.id, iface);
  }

  const links: ContainerlabLinkDef[] = [];
  for (const link of doc.semantic.links) {
    const aIf = ifMap.get(link.aInterfaceId);
    const bIf = ifMap.get(link.bInterfaceId);
    if (aIf && bIf) {
      links.push({
        endpoints: [`${aIf.deviceId}:${aIf.name}`, `${bIf.deviceId}:${bIf.name}`],
      });
    }
  }

  const clabObj: ContainerlabYamlSchema = {
    name: doc.semantic.id,
    topology: {
      nodes,
      links,
    },
  };

  const clabAnnotations: ClabViewerAnnotationsSchema = {
    nodeAnnotations: Object.entries(doc.annotations.nodes).map(([id, ann]) => ({
      id,
      position: { x: ann.x, y: ann.y },
      label: ann.label,
      group: ann.group,
      icon: ann.icon,
    })),
  };

  return {
    yaml: YAML.stringify(clabObj),
    annotations: JSON.stringify(clabAnnotations, null, 2),
  };
}

/**
 * Imports a Containerlab YAML + optional annotations JSON into a TopologyDocument.
 * IMPORTANT: If a node has no L3 routes or explicit `ta.routingComplete: "true"` label,
 * `routingTableComplete` is set to `false` so cable-only diagrams never falsely claim reachability.
 */
export function importFromContainerlabArtifacts(
  rawYaml: string,
  rawAnnotationsJson?: string,
): TopologyDocument {
  const parsed = YAML.parse(rawYaml) as ContainerlabYamlSchema;
  if (!parsed || typeof parsed !== 'object' || !parsed.topology || !parsed.topology.nodes) {
    throw new Error('Invalid Containerlab YAML: missing topology.nodes');
  }

  const snapshotId = parsed.name || 'clab-imported';
  const devices: DeviceModel[] = [];
  const interfaces: InterfaceModel[] = [];
  const links: LinkModel[] = [];

  const ensureInterface = (deviceId: string, ifName: string): InterfaceModel => {
    const ifId = `${deviceId}-${ifName}`;
    let existing = interfaces.find((i) => i.id === ifId);
    if (!existing) {
      existing = {
        id: ifId,
        deviceId,
        name: ifName,
      };
      interfaces.push(existing);
    }
    return existing;
  };

  for (const [nodeId, nodeDef] of Object.entries(parsed.topology.nodes)) {
    const labels = nodeDef?.labels ?? {};
    const roleRaw = labels['ta.role'] as DeviceModel['role'] | undefined;
    const locationRaw = (labels['ta.location'] as DeviceModel['location'] | undefined) ?? 'idc';
    const hasExplicitCompleteLabel = labels['ta.routingComplete'] === 'true';

    devices.push({
      id: nodeId,
      name: nodeId,
      role: roleRaw ?? (nodeDef?.kind === 'bridge' ? 'switch' : 'host'),
      location: locationRaw,
      completeness: {
        // Never assume a bare YAML topology has complete routing unless explicitly declared
        routingTableComplete: hasExplicitCompleteLabel,
        policyTableComplete: labels['ta.policyComplete'] !== 'false',
        l2ConfigComplete: true,
      },
    });

    for (const cmd of nodeDef?.exec ?? []) {
      const addrMatch = cmd.match(/ip\s+addr\s+add\s+([0-9./]+)\s+dev\s+(\S+)/);
      if (addrMatch && addrMatch[1] && addrMatch[2]) {
        const iface = ensureInterface(nodeId, addrMatch[2]);
        iface.ip = addrMatch[1];
      }
    }
  }

  for (const [idx, linkDef] of (parsed.topology.links ?? []).entries()) {
    const [epA, epB] = linkDef.endpoints;
    const [devA, ifNameA] = epA.split(':');
    const [devB, ifNameB] = epB.split(':');
    if (!devA || !ifNameA || !devB || !ifNameB) {
      throw new Error(`Invalid Containerlab endpoint format in link #${idx}: ${epA} <-> ${epB}`);
    }
    const ifA = ensureInterface(devA, ifNameA);
    const ifB = ensureInterface(devB, ifNameB);
    links.push({
      id: `clab-link-${idx + 1}`,
      aInterfaceId: ifA.id,
      bInterfaceId: ifB.id,
      kind: 'ethernet',
    });
  }

  const nodeAnnotationsMap: Record<string, NodeAnnotation> = {};
  if (rawAnnotationsJson) {
    const parsedAnn = JSON.parse(rawAnnotationsJson) as ClabViewerAnnotationsSchema;
    for (const item of parsedAnn.nodeAnnotations ?? []) {
      nodeAnnotationsMap[item.id] = {
        x: item.position?.x ?? 100,
        y: item.position?.y ?? 150,
        label: item.label,
        group: item.group,
        icon: item.icon,
      };
    }
  } else {
    devices.forEach((dev, idx) => {
      nodeAnnotationsMap[dev.id] = {
        x: 120 + idx * 200,
        y: 180,
        label: dev.name,
      };
    });
  }

  const annotations: ViewAnnotations = {
    snapshotId,
    nodes: nodeAnnotationsMap,
  };

  return {
    schemaVersion: 'topology-0.1',
    semantic: {
      id: snapshotId,
      name: `Containerlab Topology (${snapshotId})`,
      workloads: [],
      devices,
      interfaces,
      links,
      routes: [],
      policies: [],
      bindings: {},
    },
    annotations,
  };
}

/**
 * REA Reverse-Engineered Pattern from `@containerlab/clab-viewer/dist/component.mjs`:
 * Locates the exact 1-based startLine and endLine of a node block inside `topology.nodes`
 * so the Split / Code view can highlight `.clab-line-selected` when a node is selected on the canvas.
 */
export function findNodeLineRangeInYaml(
  rawYaml: string,
  nodeId: string,
): { startLine: number; endLine: number } | null {
  if (!rawYaml || !nodeId) return null;
  const lines = rawYaml.split(/\r?\n/);
  const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let inNodesSection = false;
  let nodesIndent = -1;
  let startLine = -1;
  let nodeIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.search(/\S/);

    if (!inNodesSection) {
      if (/^nodes\s*:/.test(trimmed)) {
        inNodesSection = true;
        nodesIndent = indent;
      }
      continue;
    }

    if (indent <= nodesIndent && !/^nodes\s*:/.test(trimmed)) {
      break;
    }

    const nodeHeaderRegex = new RegExp(`^['"]?${escaped}['"]?\\s*:`);
    if (startLine === -1) {
      if (indent > nodesIndent && nodeHeaderRegex.test(trimmed)) {
        startLine = i + 1;
        nodeIndent = indent;
      }
    } else {
      if (indent <= nodeIndent) {
        return { startLine, endLine: i };
      }
    }
  }

  if (startLine !== -1) {
    return { startLine, endLine: lines.length };
  }
  return null;
}

