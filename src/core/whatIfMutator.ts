import type {
  DataCompleteness,
  NetworkSnapshot,
  PolicyRuleModel,
  RouteModel,
  TopologyDocument,
} from './types';

export interface QuickFixMetadata {
  scenarioId: string;
  available: boolean;
  buttonLabelKo: string;
  actionSummaryKo: string;
  beforeAfterPreviewKo: string;
  targetDeviceId?: string;
}

export function cloneSnapshot(snapshot: NetworkSnapshot): NetworkSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as NetworkSnapshot;
}

export function cloneDocument(doc: TopologyDocument): TopologyDocument {
  return JSON.parse(JSON.stringify(doc)) as TopologyDocument;
}

/**
 * Toggles a security policy rule's action between 'allow' and 'deny'.
 */
export function togglePolicyRuleAction(snapshot: NetworkSnapshot, ruleId: string): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const rule = next.policies.find((p) => p.id === ruleId);
  if (rule) {
    rule.action = rule.action === 'allow' ? 'deny' : 'allow';
  }
  return next;
}

/**
 * Adds a new security policy rule or replaces one with the same ID.
 */
export function upsertPolicyRule(snapshot: NetworkSnapshot, rule: PolicyRuleModel): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const idx = next.policies.findIndex((p) => p.id === rule.id);
  if (idx >= 0) {
    next.policies[idx] = { ...rule };
  } else {
    next.policies.push({ ...rule });
  }
  return next;
}

/**
 * Removes a route by ID from the snapshot.
 */
export function removeRouteById(snapshot: NetworkSnapshot, routeId: string): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  next.routes = next.routes.filter((r) => r.id !== routeId);
  return next;
}

/**
 * Adds or updates a route in the snapshot.
 */
export function upsertRoute(snapshot: NetworkSnapshot, route: RouteModel): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const idx = next.routes.findIndex((r) => r.id === route.id);
  if (idx >= 0) {
    next.routes[idx] = { ...route };
  } else {
    next.routes.push({ ...route });
  }
  return next;
}

/**
 * Toggles a VLAN ID on a switch trunk interface.
 */
export function toggleTrunkVlanOnInterface(
  snapshot: NetworkSnapshot,
  interfaceId: string,
  vlanId: number,
): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const iface = next.interfaces.find((i) => i.id === interfaceId);
  if (!iface) return next;

  const current = iface.trunkVlans ?? [];
  if (current.includes(vlanId)) {
    iface.trunkVlans = current.filter((v) => v !== vlanId);
  } else {
    iface.trunkVlans = [...current, vlanId].sort((a, b) => a - b);
  }
  return next;
}

/**
 * Updates a device's data completeness flags (routingTableComplete, policyTableComplete, l2ConfigComplete).
 */
export function setDeviceCompleteness(
  snapshot: NetworkSnapshot,
  deviceId: string,
  patch: Partial<DataCompleteness>,
): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const dev = next.devices.find((d) => d.id === deviceId);
  if (dev) {
    dev.completeness = {
      ...dev.completeness,
      ...patch,
    };
  }
  return next;
}

/**
 * Clears unsupported features on a device (e.g. simulating NAT removal or static bypass).
 */
export function clearUnsupportedFeaturesOnDevice(
  snapshot: NetworkSnapshot,
  deviceId: string,
): NetworkSnapshot {
  const next = cloneSnapshot(snapshot);
  const dev = next.devices.find((d) => d.id === deviceId);
  if (dev) {
    dev.unsupportedFeaturesOnPath = [];
  }
  return next;
}

/**
 * Returns Korean Quick-Fix metadata for scenarios that have an actionable fault or missing evidence.
 */
export function getScenarioQuickFixInfo(scenarioId: string): QuickFixMetadata {
  switch (scenarioId) {
    case 'T03':
      return {
        scenarioId: 'T03',
        available: true,
        targetDeviceId: 'db-srv',
        buttonLabelKo: '✨ 원클릭 해결: DB 귀환 라우트(172.28.10.0/24) 복구하기',
        actionSummaryKo:
          'db-srv 장비에 누락된 역방향 정적 라우트(172.28.10.0/24 via 172.28.20.1, eth0)를 즉시 추가합니다.',
        beforeAfterPreviewKo: '예상 변화: BLOCKED (FAIL) ➔ REACHABLE (PASS)',
      };
    case 'T05':
      return {
        scenarioId: 'T05',
        available: true,
        targetDeviceId: 'r1',
        buttonLabelKo: '🧪 What-If 실험: 만약 방화벽 차단 규칙을 허용(ALLOW)으로 실수하면?',
        actionSummaryKo:
          '방화벽(r1)의 DB 직접접속 차단 규칙(pol-block-db-5432)을 ALLOW로 변경해 보안 규정 위반(FAIL)이 발생하는지 테스트합니다.',
        beforeAfterPreviewKo: '예상 변화: BLOCKED (보안 합격 PASS) ➔ REACHABLE (보안 위반 FAIL!)',
      };
    case 'T06':
      return {
        scenarioId: 'T06',
        available: true,
        targetDeviceId: 'r1',
        buttonLabelKo: '✨ 원클릭 해결: 미수집 방화벽(r1) 정책 수집 완료 및 TCP/5432 허용 반영',
        actionSummaryKo:
          '방화벽(r1)의 정책 수집 상태(policyTableComplete)를 true로 전환하고, 확인된 DB 허용 규칙(TCP 5432 ALLOW)을 등록합니다.',
        beforeAfterPreviewKo: '예상 변화: UNKNOWN (판정 보류) ➔ REACHABLE (PASS)',
      };
    case 'T07':
      return {
        scenarioId: 'T07',
        available: true,
        targetDeviceId: 'r1',
        buttonLabelKo: '✨ 원클릭 해결: 코어 라우터(r1) 동적 NAT 구간을 순수 L3 라우팅으로 전환',
        actionSummaryKo:
          '장비(r1)의 미지원 기능(unsupportedFeaturesOnPath: ["nat"])을 해제하여 결정론적 L3 경로 검증이 가능하도록 전환합니다.',
        beforeAfterPreviewKo: '예상 변화: UNKNOWN (판정 보류) ➔ REACHABLE (PASS)',
      };
    case 'T10':
      return {
        scenarioId: 'T10',
        available: true,
        targetDeviceId: 'sw1',
        buttonLabelKo: '✨ 원클릭 해결: 스위치(sw1) 트렁크 포트(Ethernet48)에 VLAN 20 추가',
        actionSummaryKo:
          '랙1 스위치(sw1)의 트렁크 포트 허용 VLAN 목록을 [10, 30]에서 [10, 20, 30]으로 수정하여 2계층 단절을 복구합니다.',
        beforeAfterPreviewKo: '예상 변화: BLOCKED (TRUNK_VLAN_MISSING) ➔ REACHABLE (PASS)',
      };
    case 'T12':
      return {
        scenarioId: 'T12',
        available: true,
        targetDeviceId: 'aws-db-eni',
        buttonLabelKo: '✨ 원클릭 해결: AWS RDS 보안그룹(SG) 수집 완료 및 5432 인바운드 허용 반영',
        actionSummaryKo:
          '이전된 AWS RDS(aws-db-eni)의 보안그룹 수집 완료 플래그를 켜고 사내 APP 대역(172.28.10.0/24) 인바운드 허용 규칙을 추가합니다.',
        beforeAfterPreviewKo: '예상 변화: UNKNOWN (전환 보류) ➔ REACHABLE (이관 승인 PASS)',
      };
    default:
      return {
        scenarioId,
        available: false,
        buttonLabelKo: '현재 시나리오는 정상 상태입니다 (우측 장비 패널에서 자유롭게 장애 실험 가능)',
        actionSummaryKo: '우측 장비 설정 드로어에서 라우트 삭제, 방화벽 차단, VLAN 제거 등을 직접 조작해 보세요.',
        beforeAfterPreviewKo: '실시간 What-If 조작 가능',
      };
  }
}

/**
 * Applies the canonical one-click remediation or What-If experiment for a given scenario ID.
 */
export function applyScenarioQuickFix(snapshot: NetworkSnapshot, scenarioId: string): NetworkSnapshot {
  switch (scenarioId) {
    case 'T03':
      return upsertRoute(snapshot, {
        id: 'rt-db-return-to-app',
        deviceId: 'db-srv',
        destinationPrefix: '172.28.10.0/24',
        nextHopIp: '172.28.20.1',
        egressInterfaceId: 'db-eth0',
        protocol: 'static',
        evidenceId: 'ev-whatif-fix',
      });
    case 'T05':
      return togglePolicyRuleAction(snapshot, 'pol-block-db-5432');
    case 'T06': {
      const withComplete = setDeviceCompleteness(snapshot, 'r1', { policyTableComplete: true });
      return upsertPolicyRule(withComplete, {
        id: 'pol-allow-db-5432-collected',
        deviceId: 'r1',
        name: '수집된-방화벽-DB허용-규칙',
        priority: 10,
        direction: 'forward',
        srcPrefix: '172.28.10.0/24',
        dstPrefix: '172.28.20.0/24',
        protocol: 'tcp',
        dstPort: 5432,
        action: 'allow',
        kind: 'firewall-acl',
        stateful: true,
        evidenceId: 'ev-whatif-collected',
      });
    }
    case 'T07':
      return clearUnsupportedFeaturesOnDevice(snapshot, 'r1');
    case 'T10':
      return toggleTrunkVlanOnInterface(snapshot, 'sw1-trunk1', 20);
    case 'T12': {
      const withComplete = setDeviceCompleteness(snapshot, 'aws-db-eni', { policyTableComplete: true });
      return upsertPolicyRule(withComplete, {
        id: 'sg-rds-allow-5432',
        deviceId: 'aws-db-eni',
        name: 'SG-RDS-5432-인바운드허용',
        priority: 10,
        direction: 'ingress',
        srcPrefix: '172.28.10.0/24',
        dstPrefix: '10.60.20.30/32',
        protocol: 'tcp',
        dstPort: 5432,
        action: 'allow',
        kind: 'aws-sg',
        stateful: true,
        evidenceId: 'ev-aws-sg-collected',
      });
    }
    default:
      return cloneSnapshot(snapshot);
  }
}
