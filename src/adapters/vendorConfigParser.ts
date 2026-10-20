import type {
  DeviceModel,
  InterfaceModel,
  LinkModel,
  OnPremVendor,
  PolicyRuleModel,
  ProtocolKind,
  RouteModel,
  TopologyDocument,
  VipMappingModel,
} from '../core/types';

export interface ParsedVendorDeviceResult {
  vendor: OnPremVendor;
  device: DeviceModel;
  interfaces: InterfaceModel[];
  routes: RouteModel[];
  policies: PolicyRuleModel[];
  vipMappings: VipMappingModel[];
  warnings: string[];
}

function netmaskToPrefixLen(mask: string): number {
  if (!mask.includes('.')) {
    const n = Number(mask);
    return Number.isNaN(n) ? 24 : n;
  }
  return mask
    .split('.')
    .map((octet) => (Number(octet) >>> 0).toString(2).replace(/0/g, '').length)
    .reduce((a, b) => a + b, 0);
}

function normalizeCidr(ipOrCidr?: string, mask?: string): string {
  const cleaned = (ipOrCidr ?? '0.0.0.0/0').trim().replace(/^"|"$/g, '');
  if (!cleaned || cleaned.toLowerCase() === 'any') return '0.0.0.0/0';
  if (cleaned.includes('/')) return cleaned;
  if (mask) {
    return `${cleaned}/${netmaskToPrefixLen(mask.trim())}`;
  }
  return `${cleaned}/32`;
}

function extractSubnet24Prefix(cidr?: string): string {
  const ipPart = (cidr ?? '10.0.0.1/24').split('/')[0] ?? '10.0.0.1';
  return ipPart.split('.').slice(0, 3).join('.');
}

function parseServiceToken(svcRaw?: string): { protocol: ProtocolKind; dstPort?: number } {
  const lower = (svcRaw ?? 'any').toLowerCase();
  if (lower.includes('icmp') || lower.includes('ping')) return { protocol: 'icmp' };
  const portMatch = lower.match(/(\d{2,5})/);
  const port = portMatch?.[1] ? Number(portMatch[1]) : undefined;
  if (lower.includes('udp') || port === 53 || port === 123 || port === 161) {
    return { protocol: 'udp', dstPort: port };
  }
  if (lower.includes('tcp') || port !== undefined) {
    return { protocol: 'tcp', dstPort: port };
  }
  return { protocol: 'any' };
}

/**
 * 설정 텍스트 내용으로부터 벤더 자동 판별
 */
export function detectVendorFromConfigText(text: string): OnPremVendor {
  if (/set\s+rulebase\s+security\s+rules|set\s+network\s+virtual-router/i.test(text)) return 'paloalto';
  if (/config\s+firewall\s+policy|config\s+system\s+interface/i.test(text)) return 'fortinet';
  if (/firewall\s+policy\s+add\s+rule-name|BLUEMAX/i.test(text)) return 'secui';
  if (/policy\s+ipv4\s+add\s+rule_name|TrusGuard/i.test(text)) return 'ahnlab';
  if (/set\s+security\s+policies\s+from-zone|set\s+routing-options\s+static/i.test(text)) return 'juniper';
  if (/ltm\s+virtual|ltm\s+pool/i.test(text)) return 'f5';
  if (/iptables\s+-|ip\s+route\s+add|inet\s+\d+\.\d+/i.test(text)) return 'linux';
  if (/Arista|Ethernet\d+\s*\n/i.test(text)) return 'arista';
  return 'cisco';
}

/**
 * 멀티벤더 온프레미스 Config 텍스트를 정규화된 디지털 트윈 엔티티로 파싱
 */
export function parseVendorConfigText(
  rawText: string,
  explicitVendor?: OnPremVendor,
): ParsedVendorDeviceResult {
  const vendor = explicitVendor ?? detectVendorFromConfigText(rawText);
  const lines = rawText
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let hostname = `onprem-${vendor}-01`;
  const interfaces: InterfaceModel[] = [];
  const routes: RouteModel[] = [];
  const policies: PolicyRuleModel[] = [];
  const vipMappings: VipMappingModel[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    const mHost =
      line.match(/^hostname\s+"?([A-Za-z0-9._-]+)"?/i) ||
      line.match(/set\s+(?:deviceconfig\s+system\s+hostname|system\s+host-name|hostname)\s+"?([A-Za-z0-9._-]+)"?/i);
    if (mHost?.[1]) {
      hostname = mHost[1];
      break;
    }
  }

  const deviceId = hostname.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const ensureInterface = (ifName?: string, ipCidr?: string, zone?: string): InterfaceModel => {
    const cleanName = (ifName ?? 'eth0').replace(/^"|"$/g, '');
    const ifId = `${deviceId}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let found = interfaces.find((i) => i.id === ifId || i.name === cleanName);
    if (!found) {
      found = {
        id: ifId,
        deviceId,
        name: cleanName,
        ip: ipCidr,
        zone,
      };
      interfaces.push(found);
    } else {
      if (ipCidr) found.ip = ipCidr;
      if (zone) found.zone = zone;
    }
    return found;
  };

  if (vendor === 'paloalto') {
    for (const line of lines) {
      const mIf = line.match(/set\s+network\s+interface\s+ethernet\s+(\S+)\s+layer3\s+ip\s+(\S+)/i);
      if (mIf) {
        const iface = ensureInterface(mIf[1], normalizeCidr(mIf[2]));
        const prefix = `${extractSubnet24Prefix(iface.ip)}.0/24`;
        routes.push({
          id: `${deviceId}-conn-${iface.name}`,
          deviceId,
          destinationPrefix: prefix,
          egressInterfaceId: iface.id,
          protocol: 'connected',
        });
      }
      const mZone = line.match(/set\s+zone\s+"?([^"\s]+)"?\s+network\s+layer3\s+(\S+)/i);
      if (mZone) {
        ensureInterface(mZone[2], undefined, mZone[1]);
      }
      const mRt = line.match(
        /static-route\s+(\S+)\s+destination\s+(\S+)\s+interface\s+(\S+)\s+next-hop\s+ip-address\s+(\S+)/i,
      );
      if (mRt) {
        const iface = ensureInterface(mRt[3]);
        routes.push({
          id: `${deviceId}-rt-${mRt[1] ?? 'static'}`,
          deviceId,
          destinationPrefix: normalizeCidr(mRt[2]),
          nextHopIp: mRt[4],
          egressInterfaceId: iface.id,
          protocol: 'static',
        });
      }
      const mRule = line.match(
        /set\s+rulebase\s+security\s+rules\s+"?([^"\s]+)"?\s+from\s+"?([^"\s]+)"?\s+to\s+"?([^"\s]+)"?\s+source\s+(\S+)\s+destination\s+(\S+).*?service\s+(\S+)\s+action\s+(allow|deny)/i,
      );
      if (mRule) {
        const svc = parseServiceToken(mRule[6]);
        policies.push({
          id: `${deviceId}-rule-${policies.length + 1}`,
          deviceId,
          name: mRule[1] ?? `PA_RULE_${policies.length + 1}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcZone: mRule[2],
          dstZone: mRule[3],
          srcPrefix: normalizeCidr(mRule[4]),
          dstPrefix: normalizeCidr(mRule[5]),
          protocol: svc.protocol,
          dstPort: svc.dstPort,
          action: (mRule[7] ?? 'allow').toLowerCase() === 'allow' ? 'allow' : 'deny',
          stateful: true,
        });
      }
    }
  } else if (vendor === 'fortinet') {
    let section: 'none' | 'interface' | 'policy' | 'route' = 'none';
    let currentObj: Record<string, string> = {};
    const flushFortiObj = () => {
      if (section === 'interface' && currentObj.edit) {
        const ipParts = (currentObj.ip ?? '').split(/\s+/);
        const cidr = ipParts[0] ? normalizeCidr(ipParts[0], ipParts[1]) : undefined;
        const iface = ensureInterface(currentObj.edit, cidr, currentObj.alias || currentObj.edit);
        if (cidr) {
          const prefix = `${extractSubnet24Prefix(cidr)}.0/24`;
          routes.push({
            id: `${deviceId}-conn-${iface.name}`,
            deviceId,
            destinationPrefix: prefix,
            egressInterfaceId: iface.id,
            protocol: 'connected',
          });
        }
      } else if (section === 'policy' && currentObj.edit) {
        const svc = parseServiceToken(currentObj.service ?? 'any');
        const srcRaw = (currentObj.srcaddr ?? '0.0.0.0/0').replace(/^H_/, '');
        const dstRaw = (currentObj.dstaddr ?? '0.0.0.0/0').replace(/^H_/, '');
        policies.push({
          id: `${deviceId}-fg-pol-${currentObj.edit}`,
          deviceId,
          name: currentObj.name ?? `FG-POLICY-${currentObj.edit}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcZone: currentObj.srcintf,
          dstZone: currentObj.dstintf,
          srcPrefix: normalizeCidr(srcRaw),
          dstPrefix: normalizeCidr(dstRaw),
          protocol: svc.protocol,
          dstPort: svc.dstPort,
          action: (currentObj.action ?? '').toLowerCase() === 'accept' ? 'allow' : 'deny',
          stateful: true,
        });
      } else if (section === 'route' && currentObj.edit) {
        const dstParts = (currentObj.dst ?? '0.0.0.0/0').split(/\s+/);
        const dstPrefix = normalizeCidr(dstParts[0], dstParts[1]);
        const iface = ensureInterface(currentObj.device ?? 'port1');
        routes.push({
          id: `${deviceId}-fg-rt-${currentObj.edit}`,
          deviceId,
          destinationPrefix: dstPrefix,
          nextHopIp: currentObj.gateway,
          egressInterfaceId: iface.id,
          protocol: 'static',
        });
      }
      currentObj = {};
    };

    for (const line of lines) {
      if (/^config\s+system\s+interface/i.test(line)) {
        section = 'interface';
      } else if (/^config\s+firewall\s+policy/i.test(line)) {
        section = 'policy';
      } else if (/^config\s+router\s+static/i.test(line)) {
        section = 'route';
      } else if (/^end$/i.test(line)) {
        flushFortiObj();
        section = 'none';
      } else if (/^next$/i.test(line)) {
        flushFortiObj();
      } else {
        const mEdit = line.match(/^edit\s+"?([^"]+)"?/i);
        if (mEdit?.[1]) {
          flushFortiObj();
          currentObj.edit = mEdit[1];
        }
        const mSet = line.match(/^set\s+(\S+)\s+(.+)$/i);
        if (mSet?.[1] && mSet[2]) {
          currentObj[mSet[1].toLowerCase()] = mSet[2].replace(/^"|"$/g, '');
        }
      }
    }
  } else if (vendor === 'secui' || vendor === 'ahnlab') {
    for (const line of lines) {
      const mIf = line.match(/interface\s+(\S+)\s+ip\s+(\S+)(?:\s+zone\s+"?([^"\s]+)"?)?/i);
      if (mIf) {
        const iface = ensureInterface(mIf[1], normalizeCidr(mIf[2]), mIf[3]);
        const prefix = `${extractSubnet24Prefix(iface.ip)}.0/24`;
        routes.push({
          id: `${deviceId}-conn-${iface.name}`,
          deviceId,
          destinationPrefix: prefix,
          egressInterfaceId: iface.id,
          protocol: 'connected',
        });
      }
      const mBm = line.match(
        /rule[-_]name\s+"([^"]+)".*?(?:src-zone|in_if)\s+"([^"]+)".*?(?:src-ip|src-object|src_addr)\s+"?(?:H_)?([^"\s]+)"?.*?(?:dst-zone|out_if)\s+"([^"]+)".*?(?:dst-ip|dst-object|dst_addr)\s+"?(?:H_)?([^"\s]+)"?.*?service\s+"([^"]+)".*?action\s+(permit|allow|deny|drop)/i,
      );
      if (mBm) {
        const svc = parseServiceToken(mBm[6]);
        const act = (mBm[7] ?? 'permit').toLowerCase();
        policies.push({
          id: `${deviceId}-kr-pol-${policies.length + 1}`,
          deviceId,
          name: mBm[1] ?? `KR_POL_${policies.length + 1}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcZone: mBm[2],
          dstZone: mBm[4],
          srcPrefix: normalizeCidr(mBm[3]),
          dstPrefix: normalizeCidr(mBm[5]),
          protocol: svc.protocol,
          dstPort: svc.dstPort,
          action: act === 'permit' || act === 'allow' ? 'allow' : 'deny',
          stateful: true,
        });
      }
    }
  } else if (vendor === 'juniper') {
    for (const line of lines) {
      const mIf = line.match(/set\s+interfaces\s+(\S+)\s+unit\s+\d+\s+family\s+inet\s+address\s+(\S+)/i);
      if (mIf) {
        const iface = ensureInterface(mIf[1], normalizeCidr(mIf[2]));
        const prefix = `${extractSubnet24Prefix(iface.ip)}.0/24`;
        routes.push({
          id: `${deviceId}-conn-${iface.name}`,
          deviceId,
          destinationPrefix: prefix,
          egressInterfaceId: iface.id,
          protocol: 'connected',
        });
      }
      const mRt = line.match(/set\s+routing-options\s+static\s+route\s+(\S+)\s+next-hop\s+(\S+)/i);
      if (mRt) {
        const iface = interfaces[0] ?? ensureInterface('ge-0/0/0');
        routes.push({
          id: `${deviceId}-junos-rt-${routes.length + 1}`,
          deviceId,
          destinationPrefix: normalizeCidr(mRt[1]),
          nextHopIp: mRt[2],
          egressInterfaceId: iface.id,
          protocol: 'static',
        });
      }
      const mPol = line.match(
        /set\s+security\s+policies\s+from-zone\s+(\S+)\s+to-zone\s+(\S+)\s+policy\s+(\S+)\s+match\s+source-address\s+(\S+)\s+destination-address\s+(\S+)\s+application\s+(\S+)/i,
      );
      if (mPol) {
        const svc = parseServiceToken(mPol[6]);
        const srcClean = (mPol[4] ?? '0.0.0.0/0').replace(/^H_/, '');
        const dstClean = (mPol[5] ?? '0.0.0.0/0').replace(/^H_/, '');
        policies.push({
          id: `${deviceId}-junos-pol-${policies.length + 1}`,
          deviceId,
          name: mPol[3] ?? `JUNOS_POL_${policies.length + 1}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcZone: mPol[1],
          dstZone: mPol[2],
          srcPrefix: normalizeCidr(srcClean),
          dstPrefix: normalizeCidr(dstClean),
          protocol: svc.protocol,
          dstPort: svc.dstPort,
          action: 'allow',
          stateful: true,
        });
      }
    }
  } else if (vendor === 'f5') {
    const pools = new Map<string, Array<{ ip: string; port: number; status?: 'up' | 'down' }>>();
    for (const line of lines) {
      const mSelf = line.match(/net\s+self\s+(\S+)\s*\{?\s*address\s+(\S+)/i);
      if (mSelf) {
        ensureInterface(mSelf[1], normalizeCidr(mSelf[2]), 'DMZ');
      }
      const mPool = line.match(/ltm\s+pool\s+(\S+)\s+members\s+([0-9.:,\s]+)/i);
      if (mPool?.[1] && mPool[2]) {
        const members = mPool[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((token) => {
            const [ip = '127.0.0.1', portStr = '80'] = token.split(':');
            return { ip, port: Number(portStr), status: 'up' as const };
          });
        pools.set(mPool[1], members);
      }
      const mVs = line.match(/ltm\s+virtual\s+(\S+)\s+destination\s+(\d+\.\d+\.\d+\.\d+):(\d+)\s+pool\s+(\S+)/i);
      if (mVs) {
        const vsName = mVs[1] ?? 'vs_default';
        const vipIp = mVs[2] ?? '172.16.10.100';
        const vipPort = Number(mVs[3] ?? 443);
        const poolName = mVs[4] ?? 'pool_default';
        vipMappings.push({
          id: `vip-${vsName}`,
          vipName: vsName,
          vipIp,
          vipPort,
          protocol: 'tcp',
          poolName,
          poolMembers: pools.get(poolName) ?? [],
          snatAutomap: true,
        });
      }
    }
  } else if (vendor === 'linux') {
    for (const line of lines) {
      const mInet = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+\/\d+).*?\s(\S+)$/);
      if (mInet) {
        const iface = ensureInterface(mInet[2], mInet[1]);
        const prefix = `${extractSubnet24Prefix(mInet[1])}.0/24`;
        routes.push({
          id: `${deviceId}-conn-${iface.name}`,
          deviceId,
          destinationPrefix: prefix,
          egressInterfaceId: iface.id,
          protocol: 'connected',
        });
      }
      const mDef = line.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)/i);
      if (mDef) {
        const iface = ensureInterface(mDef[2]);
        routes.push({
          id: `${deviceId}-rt-default`,
          deviceId,
          destinationPrefix: '0.0.0.0/0',
          nextHopIp: mDef[1],
          egressInterfaceId: iface.id,
          protocol: 'static',
        });
      }
      const mIpt = line.match(
        /iptables\s+-[AI]\s+\S+\s+(?:\d+\s+)?-s\s+(\S+)\s+-d\s+(\S+)\s+-p\s+(tcp|udp|icmp)(?:\s+--dport\s+(\d+))?.*?-j\s+(ACCEPT|DROP|REJECT)/i,
      );
      if (mIpt) {
        policies.push({
          id: `${deviceId}-ipt-${policies.length + 1}`,
          deviceId,
          name: `IPTABLES_RULE_${policies.length + 1}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcPrefix: normalizeCidr(mIpt[1]),
          dstPrefix: normalizeCidr(mIpt[2]),
          protocol: (mIpt[3] ?? 'tcp').toLowerCase() as ProtocolKind,
          dstPort: mIpt[4] ? Number(mIpt[4]) : undefined,
          action: (mIpt[5] ?? 'ACCEPT').toUpperCase() === 'ACCEPT' ? 'allow' : 'deny',
          stateful: true,
        });
      }
    }
  } else {
    // Cisco IOS / NX-OS & Arista EOS
    let currentIf: InterfaceModel | undefined;
    let currentAclName = 'ACL_IN';
    for (const line of lines) {
      const mIf = line.match(/^interface\s+(\S+)/i);
      if (mIf) {
        currentIf = ensureInterface(mIf[1]);
        continue;
      }
      const mIp = line.match(/^ip\s+address\s+(\d+\.\d+\.\d+\.\d+(?:\/\d+)?)(?:\s+(\d+\.\d+\.\d+\.\d+))?/i);
      if (mIp && currentIf) {
        currentIf.ip = normalizeCidr(mIp[1], mIp[2]);
        const prefix = `${extractSubnet24Prefix(currentIf.ip)}.0/24`;
        routes.push({
          id: `${deviceId}-conn-${currentIf.name}`,
          deviceId,
          destinationPrefix: prefix,
          egressInterfaceId: currentIf.id,
          protocol: 'connected',
        });
        continue;
      }
      const mRt = line.match(
        /^ip\s+route\s+(\d+\.\d+\.\d+\.\d+(?:\/\d+)?)\s+(?:(\d+\.\d+\.\d+\.\d+)\s+)?(\d+\.\d+\.\d+\.\d+)/i,
      );
      if (mRt) {
        const dstPrefix = normalizeCidr(mRt[1], mRt[2]);
        const nextHop = mRt[3];
        const egressIf = interfaces[0] ?? ensureInterface('Ethernet1');
        routes.push({
          id: `${deviceId}-rt-${routes.length + 1}`,
          deviceId,
          destinationPrefix: dstPrefix,
          nextHopIp: nextHop,
          egressInterfaceId: egressIf.id,
          protocol: 'static',
        });
      }
      const mAcl = line.match(/^ip\s+access-list\s+extended\s+(\S+)/i);
      if (mAcl?.[1]) {
        currentAclName = mAcl[1];
      }
      const mAce = line.match(
        /^(?:\d+\s+)?(permit|deny)\s+(tcp|udp|ip|icmp)\s+(?:host\s+(\S+)|(\S+))\s+(?:host\s+(\S+)|(\S+))(?:\s+eq\s+(\d+))?/i,
      );
      if (mAce) {
        const rawProto = (mAce[2] ?? 'ip').toLowerCase();
        const proto: ProtocolKind = rawProto === 'ip' ? 'any' : (rawProto as ProtocolKind);
        const src = mAce[3] ?? mAce[4];
        const dst = mAce[5] ?? mAce[6];
        policies.push({
          id: `${deviceId}-acl-${policies.length + 1}`,
          deviceId,
          name: `${currentAclName}_${policies.length + 1}`,
          priority: (policies.length + 1) * 10,
          direction: 'forward',
          srcPrefix: normalizeCidr(src),
          dstPrefix: normalizeCidr(dst),
          protocol: proto,
          dstPort: mAce[7] ? Number(mAce[7]) : undefined,
          action: (mAce[1] ?? 'permit').toLowerCase() === 'permit' ? 'allow' : 'deny',
          stateful: false,
        });
      }
    }
  }

  const isFirewall =
    vendor === 'paloalto' ||
    vendor === 'fortinet' ||
    vendor === 'secui' ||
    vendor === 'ahnlab' ||
    policies.length > 0;

  const role: DeviceModel['role'] =
    vendor === 'f5'
      ? 'switch'
      : vendor === 'linux' && policies.length === 0
        ? 'host'
        : isFirewall
          ? 'firewall'
          : 'router';

  const device: DeviceModel = {
    id: deviceId,
    name: `${hostname} (${vendor.toUpperCase()})`,
    role,
    location: 'idc',
    vendor,
    modelName: `${vendor.toUpperCase()} Appliance`,
    securityZone: isFirewall ? '보안관문 (Imported)' : '온프레미스 인프라',
    vipMappings: vipMappings.length > 0 ? vipMappings : undefined,
    completeness: {
      routingTableComplete: true,
      policyTableComplete: true,
      l2ConfigComplete: true,
    },
    enforcesPolicy: isFirewall,
    defaultPolicyAction: isFirewall ? 'deny' : 'allow',
  };

  if (interfaces.length === 0) {
    warnings.push('인터페이스 구문이 감지되지 않아 기본 관리 포트(eth0)를 생성했습니다.');
    ensureInterface('eth0', '10.254.99.1/24', 'Trust');
  }

  return {
    vendor,
    device,
    interfaces,
    routes,
    policies,
    vipMappings,
    warnings,
  };
}

/**
 * 파싱된 장비 정보를 기존 TopologyDocument에 병합하고 동일 서브넷 인터페이스를 자동 링크 연결
 */
export function mergeParsedConfigIntoTopology(
  doc: TopologyDocument,
  parsed: ParsedVendorDeviceResult,
): TopologyDocument {
  const nextDoc: TopologyDocument = structuredClone(doc);
  const { device, interfaces, routes, policies } = parsed;

  nextDoc.semantic.devices = [
    ...nextDoc.semantic.devices.filter((d) => d.id !== device.id),
    device,
  ];
  nextDoc.semantic.interfaces = [
    ...nextDoc.semantic.interfaces.filter((i) => i.deviceId !== device.id),
    ...interfaces,
  ];
  nextDoc.semantic.routes = [
    ...nextDoc.semantic.routes.filter((r) => r.deviceId !== device.id),
    ...routes,
  ];
  nextDoc.semantic.policies = [
    ...nextDoc.semantic.policies.filter((p) => p.deviceId !== device.id),
    ...policies,
  ];

  for (const newIf of interfaces) {
    if (!newIf.ip) continue;
    const newSubnetPrefix = extractSubnet24Prefix(newIf.ip);
    const peerIf = nextDoc.semantic.interfaces.find(
      (other) =>
        other.deviceId !== device.id &&
        other.ip &&
        extractSubnet24Prefix(other.ip) === newSubnetPrefix,
    );
    if (peerIf) {
      const linkExists = nextDoc.semantic.links.some(
        (l) =>
          (l.aInterfaceId === newIf.id && l.bInterfaceId === peerIf.id) ||
          (l.aInterfaceId === peerIf.id && l.bInterfaceId === newIf.id),
      );
      if (!linkExists) {
        const autoLink: LinkModel = {
          id: `link-auto-${device.id}-${peerIf.id}`,
          aInterfaceId: newIf.id,
          bInterfaceId: peerIf.id,
          kind: 'ethernet',
        };
        nextDoc.semantic.links.push(autoLink);
      }
    }
  }

  if (!nextDoc.annotations.nodes[device.id]) {
    const count = Object.keys(nextDoc.annotations.nodes).length;
    nextDoc.annotations.nodes[device.id] = {
      x: 320 + (count % 4) * 230,
      y: 480,
      label: `${device.name}`,
      group: device.securityZone ?? 'Imported Zone',
    };
  }

  return nextDoc;
}

/**
 * 9대 온프레미스 벤더별 실제 Config 샘플 모음 (TopologyBuilderView에서 원클릭 로드 지원)
 */
export const VENDOR_SAMPLE_CONFIGS: Record<OnPremVendor, { titleKo: string; sampleText: string }> = {
  paloalto: {
    titleKo: 'Palo Alto Networks (PAN-OS 11.1 - PA-5220)',
    sampleText: `set deviceconfig system hostname fw-extranet-pa3260
set network interface ethernet ethernet1/1 layer3 ip 10.254.3.10/24
set network interface ethernet ethernet1/2 layer3 ip 10.60.10.1/24
set zone Core-Backbone network layer3 ethernet1/1
set zone Extranet-Zone network layer3 ethernet1/2
set network virtual-router default routing-table ip static-route RT_DEFAULT destination 0.0.0.0/0 interface ethernet1/1 next-hop ip-address 10.254.3.1
set rulebase security rules ALLOW-WAS-TO-EXTRANET from Core-Backbone to Extranet-Zone source 10.10.20.0/24 destination 10.60.10.0/24 service service-tcp-8443 action allow`,
  },
  fortinet: {
    titleKo: 'Fortinet FortiGate (FortiOS 7.4 - FG-1000F)',
    sampleText: `config system global
    set hostname "fw-branch-fg600f"
end
config system interface
    edit "port1"
        set ip 10.254.2.10 255.255.255.0
        set alias "Core-Backbone"
    next
    edit "port2"
        set ip 10.70.10.1 255.255.255.0
        set alias "Branch-Zone"
    next
end
config router static
    edit 1
        set dst 0.0.0.0 0.0.0.0
        set gateway 10.254.2.1
        set device "port1"
    next
end
config firewall policy
    edit 10
        set name "ALLOW_BRANCH_TO_WAS"
        set srcintf "port2"
        set dstintf "port1"
        set srcaddr "10.70.10.0/24"
        set dstaddr "10.10.20.0/24"
        set service "TCP_8080"
        set action accept
    next
end`,
  },
  secui: {
    titleKo: '시큐아이 BLUEMAX NGF (국산 DB/망분리 방화벽)',
    sampleText: `hostname fw-card-bluemax
interface eth0 ip 10.254.3.20/24 zone "Backbone-Untrust"
interface eth1 ip 10.80.20.1/24 zone "Card-PCI-Zone"
firewall policy add rule-name "ALLOW_WAS_TO_CARD_DB" src-zone "Backbone-Untrust" src-ip "10.10.20.15/32" dst-zone "Card-PCI-Zone" dst-ip "10.80.20.100/32" service "TCP/1521" action permit`,
  },
  ahnlab: {
    titleKo: '안랩 TrusGuard (국산 공공/인프라 방화벽)',
    sampleText: `hostname fw-soc-trusguard
interface eth0 ip 10.254.4.20/24 zone "Backbone"
interface eth1 ip 10.95.10.1/24 zone "SOC-Monitor-Zone"
policy ipv4 add rule_name "ALLOW_SYSLOG_514" in_if "eth0" src_addr "10.10.20.0/24" out_if "eth1" dst_addr "10.95.10.50/32" service "UDP_514" action allow`,
  },
  cisco: {
    titleKo: 'Cisco IOS-XE / NX-OS (Nexus 93180YC L3 스위치)',
    sampleText: `hostname sw-dist-nexus02
interface Ethernet1/1
  ip address 10.254.12.10 255.255.255.0
interface Vlan40
  ip address 10.40.10.1 255.255.255.0
ip route 0.0.0.0 0.0.0.0 10.254.12.1
ip access-list extended ACL_VLAN40_IN
  10 permit tcp 10.40.10.0/24 10.10.20.0/24 eq 8080`,
  },
  juniper: {
    titleKo: 'Juniper Junos OS (MX204 / QFX5120 / SRX)',
    sampleText: `set system host-name rtr-partner-mx204
set interfaces ge-0/0/0 unit 0 family inet address 198.51.100.10/24
set interfaces ge-0/0/1 unit 0 family inet address 172.20.10.1/24
set routing-options static route 0.0.0.0/0 next-hop 198.51.100.2
set security policies from-zone Partner to-zone DMZ policy ALLOW_B2B_API match source-address 172.20.10.0/24 destination-address 172.16.10.0/24 application TCP_443`,
  },
  arista: {
    titleKo: 'Arista EOS (DCS-7050X3 데이터센터 Spine 스위치)',
    sampleText: `! Arista EOS Configuration
hostname spine-sw-arista02
interface Ethernet1
  ip address 10.254.1.10/24
interface Ethernet2
  ip address 10.254.20.1/24
ip route 10.10.20.0/24 10.254.1.2`,
  },
  f5: {
    titleKo: 'F5 Networks BIG-IP LTM (TMOS VIP & Pool)',
    sampleText: `hostname adc-f5-internal
net self self_dmz { address 172.16.10.15/24 vlan vlan10 }
ltm pool pool_was_cluster members 10.10.20.15:8080, 10.10.20.16:8080
ltm virtual vs_internal_api_8443 destination 172.16.10.150:8443 pool pool_was_cluster`,
  },
  linux: {
    titleKo: 'Linux Server (RHEL / Ubuntu iproute2 & iptables)',
    sampleText: `hostname batch-settlement-01
inet 10.10.20.88/24 brd 10.10.20.255 scope global eth0
default via 10.10.20.1 dev eth0
iptables -A FORWARD -s 10.10.20.0/24 -d 10.50.30.100/32 -p tcp --dport 1521 -j ACCEPT`,
  },
  generic: {
    titleKo: '범용 온프레미스 L3 장비',
    sampleText: `hostname generic-gw-01
interface eth0
  ip address 10.254.1.99/24`,
  },
};
