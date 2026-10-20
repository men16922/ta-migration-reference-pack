import type { ParsedVendorDeviceResult } from './vendorConfigParser';
import type {
  DeviceModel,
  InterfaceModel,
  LinkModel,
  OnPremVendor,
  TopologyDocument,
  WorkloadBinding,
  WorkloadModel,
} from '../core/types';

/**
 * NetBox(오픈소스 IPAM/DCIM) REST API 응답의 최소 부분집합.
 * `/api/dcim/devices/`, `/api/dcim/interfaces/`, `/api/ipam/ip-addresses/`, `/api/dcim/cables/`
 * 의 `results` 배열을 그대로 담는다. NetBox가 자산 원천(SoT)이고, 라우팅·정책은 벤더 config 파서가 채운다.
 */
export interface NetBoxRef {
  id: number;
  name?: string;
  slug?: string;
  display?: string;
}

export interface NetBoxDevice {
  id: number;
  name: string | null;
  role?: NetBoxRef | null;
  device_role?: NetBoxRef | null; // NetBox < 4.0
  device_type?: { model: string; manufacturer?: NetBoxRef | null } | null;
  platform?: NetBoxRef | null;
  site?: NetBoxRef | null;
  location?: NetBoxRef | null;
  status?: { value: string } | null;
  primary_ip4?: { address: string } | null;
  serial?: string;
  asset_tag?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface NetBoxInterface {
  id: number;
  device: NetBoxRef;
  name: string;
  mgmt_only?: boolean;
  enabled?: boolean;
  mode?: { value: 'access' | 'tagged' | 'tagged-all' } | null;
  untagged_vlan?: { vid: number } | null;
  tagged_vlans?: Array<{ vid: number }>;
  vrf?: NetBoxRef | null;
  description?: string;
  custom_fields?: Record<string, unknown>;
}

export interface NetBoxIpAddress {
  id: number;
  address: string; // CIDR e.g. "10.10.20.15/24"
  vrf?: NetBoxRef | null;
  assigned_object_type?: string | null;
  assigned_object_id?: number | null;
}

export interface NetBoxCableTermination {
  object_type: string;
  object_id: number;
}

export interface NetBoxCable {
  id: number;
  a_terminations: NetBoxCableTermination[];
  b_terminations: NetBoxCableTermination[];
}

export interface NetBoxExport {
  devices: NetBoxDevice[];
  interfaces: NetBoxInterface[];
  ip_addresses: NetBoxIpAddress[];
  cables: NetBoxCable[];
}

export interface NetBoxImportOptions {
  snapshotId?: string;
  snapshotName?: string;
  /** 장비 보안존 custom field 이름 (없으면 location → site 이름 사용) */
  securityZoneField?: string;
  /** 인터페이스 방화벽 zone custom field 이름 */
  interfaceZoneField?: string;
  /** NetBox device role slug → 엔진 장비 역할 (기본 매핑에 덮어씀) */
  roleMap?: Record<string, DeviceModel['role']>;
  /** 워크로드(서버)로 취급할 role slug */
  workloadRoles?: string[];
  collectedAt?: string;
}

export interface NetBoxImportResult {
  document: TopologyDocument;
  warnings: string[];
}

const DEFAULT_ROLE_MAP: Record<string, DeviceModel['role']> = {
  firewall: 'firewall',
  router: 'router',
  'wan-router': 'router',
  'core-switch': 'router',
  'l3-switch': 'router',
  spine: 'router',
  'distribution-switch': 'switch',
  'access-switch': 'switch',
  switch: 'switch',
  leaf: 'switch',
  'load-balancer': 'switch',
  server: 'host',
  'application-server': 'host',
  'database-server': 'host',
};

const DEFAULT_WORKLOAD_ROLES = ['server', 'application-server', 'database-server'];

const VENDOR_PATTERNS: Array<[RegExp, OnPremVendor]> = [
  [/palo/, 'paloalto'],
  [/forti/, 'fortinet'],
  [/secui|시큐아이/, 'secui'],
  [/ahnlab|안랩|trusguard/, 'ahnlab'],
  [/cisco/, 'cisco'],
  [/juniper/, 'juniper'],
  [/arista/, 'arista'],
  [/f5/, 'f5'],
  [/linux|rhel|redhat|ubuntu|centos|rocky/, 'linux'],
];

/** 벤더 config 파서(`vendorConfigParser.ts`)와 같은 hostname 정규화 규칙 → 같은 장비 id로 병합된다. */
export function netBoxDeviceId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** `vendorConfigParser.ts`의 `ensureInterface` id 규칙과 동일 → config 병합 시 케이블 링크가 유지된다. */
export function netBoxInterfaceId(deviceId: string, ifName: string): string {
  return `${deviceId}-${ifName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function detectVendor(device: NetBoxDevice): OnPremVendor {
  const haystack = [
    device.device_type?.manufacturer?.slug,
    device.device_type?.manufacturer?.name,
    device.platform?.slug,
    device.platform?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return VENDOR_PATTERNS.find(([re]) => re.test(haystack))?.[1] ?? 'generic';
}

function stringField(fields: Record<string, unknown> | undefined, key: string | undefined): string | undefined {
  if (!fields || !key) return undefined;
  const value = fields[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function importFromNetBox(
  data: NetBoxExport,
  options: NetBoxImportOptions = {},
): NetBoxImportResult {
  const warnings: string[] = [];
  const roleMap = { ...DEFAULT_ROLE_MAP, ...options.roleMap };
  const workloadRoles = new Set(options.workloadRoles ?? DEFAULT_WORKLOAD_ROLES);
  const securityZoneField = options.securityZoneField ?? 'security_zone';
  const interfaceZoneField = options.interfaceZoneField ?? 'fw_zone';
  const evidenceId = 'ev-netbox-export';

  const deviceIdByNetBoxId = new Map<number, string>();
  const roleSlugByNetBoxId = new Map<number, string>();
  const devices: DeviceModel[] = [];

  for (const nb of data.devices) {
    if (!nb.name) {
      warnings.push(`NetBox device #${nb.id}: 이름이 없어 제외했습니다.`);
      continue;
    }
    const id = netBoxDeviceId(nb.name);
    if (deviceIdByNetBoxId.has(nb.id) || devices.some((d) => d.id === id)) {
      warnings.push(`NetBox device "${nb.name}": 정규화한 id "${id}"가 중복되어 제외했습니다.`);
      continue;
    }
    const roleSlug = (nb.role ?? nb.device_role)?.slug ?? '';
    const role = roleMap[roleSlug];
    if (!role) {
      warnings.push(`NetBox device "${nb.name}": role "${roleSlug || '(없음)'}" 매핑이 없어 host로 처리했습니다.`);
    }
    const resolvedRole = role ?? 'host';
    deviceIdByNetBoxId.set(nb.id, id);
    roleSlugByNetBoxId.set(nb.id, roleSlug);
    devices.push({
      id,
      name: nb.name,
      role: resolvedRole,
      location: 'idc',
      vendor: detectVendor(nb),
      modelName: nb.device_type?.model,
      securityZone:
        stringField(nb.custom_fields, securityZoneField) ?? nb.location?.name ?? nb.site?.name,
      mgmtIp: nb.primary_ip4?.address.split('/')[0],
      // NetBox에는 라우팅·정책이 없다 → 벤더 config가 병합되기 전까지 엔진은 unknown으로 판정한다.
      completeness: {
        routingTableComplete: false,
        policyTableComplete: resolvedRole !== 'firewall',
        l2ConfigComplete: true,
      },
      enforcesPolicy: resolvedRole === 'firewall',
      defaultPolicyAction: resolvedRole === 'firewall' ? 'deny' : undefined,
      evidenceId,
    });
  }

  const ipsByInterface = new Map<number, NetBoxIpAddress[]>();
  for (const ip of data.ip_addresses) {
    if (ip.assigned_object_type !== 'dcim.interface' || ip.assigned_object_id == null) continue;
    const list = ipsByInterface.get(ip.assigned_object_id) ?? [];
    list.push(ip);
    ipsByInterface.set(ip.assigned_object_id, list);
  }

  const interfaceIdByNetBoxId = new Map<number, string>();
  const interfaces: InterfaceModel[] = [];
  for (const nbIf of data.interfaces) {
    const deviceId = deviceIdByNetBoxId.get(nbIf.device.id);
    if (!deviceId || nbIf.enabled === false) continue;
    const id = netBoxInterfaceId(deviceId, nbIf.name);
    const ips = ipsByInterface.get(nbIf.id) ?? [];
    if (ips.length > 1) {
      warnings.push(`${deviceId} ${nbIf.name}: IP ${ips.length}개 중 첫 번째(${ips[0]?.address})만 사용합니다.`);
    }
    const isTrunk = nbIf.mode?.value === 'tagged' || nbIf.mode?.value === 'tagged-all';
    interfaceIdByNetBoxId.set(nbIf.id, id);
    interfaces.push({
      id,
      deviceId,
      name: nbIf.name,
      ip: ips[0]?.address,
      vrf: ips[0]?.vrf?.name ?? nbIf.vrf?.name,
      vlanId: isTrunk ? undefined : nbIf.untagged_vlan?.vid,
      trunkVlans: isTrunk ? nbIf.tagged_vlans?.map((v) => v.vid) : undefined,
      role: nbIf.mgmt_only ? 'mgmt' : 'data',
      zone: stringField(nbIf.custom_fields, interfaceZoneField),
      description: nbIf.description || undefined,
    });
  }

  const links: LinkModel[] = [];
  for (const cable of data.cables) {
    const a = cable.a_terminations.find((t) => t.object_type === 'dcim.interface');
    const b = cable.b_terminations.find((t) => t.object_type === 'dcim.interface');
    const aId = a && interfaceIdByNetBoxId.get(a.object_id);
    const bId = b && interfaceIdByNetBoxId.get(b.object_id);
    if (!aId || !bId) {
      warnings.push(`NetBox cable #${cable.id}: 양끝 인터페이스를 찾지 못해 제외했습니다(패치패널·회선 종단 포함).`);
      continue;
    }
    links.push({ id: `nb-cable-${cable.id}`, aInterfaceId: aId, bInterfaceId: bId, kind: 'ethernet' });
  }

  const workloads: WorkloadModel[] = [];
  const bindings: Record<string, WorkloadBinding> = {};
  for (const [nbId, deviceId] of deviceIdByNetBoxId) {
    if (!workloadRoles.has(roleSlugByNetBoxId.get(nbId) ?? '')) continue;
    const dataIf = interfaces.find((i) => i.deviceId === deviceId && i.role !== 'mgmt' && i.ip);
    if (!dataIf?.ip) {
      warnings.push(`${deviceId}: 데이터 인터페이스 IP가 없어 통신 분석 대상에서 제외했습니다.`);
      continue;
    }
    const workloadId = `wl-${deviceId}`;
    workloads.push({ id: workloadId, name: deviceId });
    bindings[workloadId] = {
      workloadId,
      deviceId,
      interfaceId: dataIf.id,
      ip: dataIf.ip.split('/')[0] ?? dataIf.ip,
      location: 'idc',
    };
  }

  const nodes: TopologyDocument['annotations']['nodes'] = {};
  devices.forEach((d, idx) => {
    nodes[d.id] = { x: 120 + (idx % 6) * 200, y: 120 + Math.floor(idx / 6) * 160, label: d.name, group: d.securityZone };
  });

  const snapshotId = options.snapshotId ?? 'netbox-import';
  return {
    document: {
      schemaVersion: '2026.1',
      semantic: {
        id: snapshotId,
        name: options.snapshotName ?? 'NetBox 가져오기',
        workloads,
        devices,
        interfaces,
        links,
        routes: [],
        policies: [],
        bindings,
        evidences: [
          {
            id: evidenceId,
            sourceType: 'static-config',
            description: 'NetBox REST export (devices / interfaces / ip-addresses / cables)',
            collectedAt: options.collectedAt,
          },
        ],
      },
      annotations: { snapshotId, nodes },
    },
    warnings,
  };
}

/**
 * NetBox 자산 위에 벤더 running-config 파싱 결과(라우팅·정책·실 IP/zone)를 덧씌운다.
 * `mergeParsedConfigIntoTopology`와 달리 NetBox 장비 메타데이터(모델·보안존·관리 IP)와 케이블 링크를 보존한다.
 */
export function overlayVendorConfig(
  doc: TopologyDocument,
  parsed: ParsedVendorDeviceResult,
): NetBoxImportResult {
  const warnings = [...parsed.warnings];
  const next: TopologyDocument = structuredClone(doc);
  const sem = next.semantic;
  const deviceId = parsed.device.id;
  const existing = sem.devices.find((d) => d.id === deviceId);

  if (existing) {
    existing.vendor = parsed.vendor;
    existing.osVersion = parsed.device.osVersion ?? existing.osVersion;
    existing.vipMappings = parsed.vipMappings.length ? parsed.vipMappings : existing.vipMappings;
    existing.completeness = { ...existing.completeness, routingTableComplete: true, policyTableComplete: true };
  } else {
    warnings.push(`${deviceId}: config는 있지만 NetBox 자산에 없습니다 — 자산 등록 누락을 확인하세요.`);
    sem.devices.push(parsed.device);
  }

  for (const parsedIf of parsed.interfaces) {
    const nbIf = sem.interfaces.find((i) => i.id === parsedIf.id);
    if (!nbIf) {
      sem.interfaces.push(parsedIf);
      continue;
    }
    if (parsedIf.ip && nbIf.ip && parsedIf.ip !== nbIf.ip) {
      warnings.push(`${parsedIf.id}: NetBox IP ${nbIf.ip}와 config IP ${parsedIf.ip}가 다릅니다 — config 값을 사용합니다.`);
    }
    nbIf.ip = parsedIf.ip ?? nbIf.ip;
    nbIf.zone = parsedIf.zone ?? nbIf.zone;
  }

  sem.routes = [...sem.routes.filter((r) => r.deviceId !== deviceId), ...parsed.routes];
  sem.policies = [...sem.policies.filter((p) => p.deviceId !== deviceId), ...parsed.policies];
  return { document: next, warnings };
}
