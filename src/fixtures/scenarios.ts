import { deserializeTopologyDocument, serializeTopologyDocument } from '../core/semanticHash';
import type {
  CommunicationIntent,
  IntentVerdict,
  NetworkOutcome,
  TopologyDocument,
} from '../core/types';

export type ScenarioStoryGroup =
  | '① 정상 기준선 & 불변성 검증'
  | '② L2·L3·방화벽 장애 및 보안 진단'
  | '③ 자료 미수집 & 미지원 기능 (Unknown)'
  | '④ 사내 IDC ➔ AWS 클라우드 이관 비교';

export interface ScenarioFixture {
  id: string;
  name: string;
  titleKo: string;
  shortTitleKo?: string;
  storyGroupKo?: ScenarioStoryGroup;
  categoryBadgeKo: string;
  phase: 'P1' | 'P2' | 'P3';
  precondition: string;
  situationKo: string;
  whyResultKo: string;
  inspectionHintKo?: string;
  focusDeviceId?: string;
  document: TopologyDocument;
  intent: CommunicationIntent;
  expectedNetworkOutcome: NetworkOutcome;
  expectedIntentVerdict: IntentVerdict;
  learningNotes: string[];
}

export const DEFAULT_APP_TO_DB_INTENT: CommunicationIntent = {
  id: 'app-to-db',
  name: '업무용 APP 서버 → DB 서버 접속 (PostgreSQL TCP 5432 포트 허용 필요)',
  sourceWorkload: 'app',
  destinationWorkload: 'db',
  protocol: 'tcp',
  destinationPort: 5432,
  expectedNetworkOutcome: 'allow',
  requireReturnPath: true,
  categoryKo: '핵심 업무 트랜잭션',
  criticality: 'critical',
  descriptionKo: '주문/결제 APP 서버에서 주 데이터베이스(PostgreSQL 5432)로 연결하는 필수 양방향 비즈니스 플로우',
};

/**
 * AlgoSec AppViz / AWS Reachability Analyzer style Multi-Workload Intent Matrix suite.
 * Evaluates multiple service ports & security isolation guardrails simultaneously across As-Is and To-Be snapshots.
 */
export const ENTERPRISE_MULTI_INTENTS: CommunicationIntent[] = [
  DEFAULT_APP_TO_DB_INTENT,
  {
    id: 'app-to-db-replica-5433',
    name: 'APP 서버 → DB 읽기전용 복제 포트 (TCP 5433 허용 필요)',
    sourceWorkload: 'app',
    destinationWorkload: 'db',
    protocol: 'tcp',
    destinationPort: 5433,
    expectedNetworkOutcome: 'allow',
    requireReturnPath: true,
    categoryKo: '조회/리포팅 복제본',
    criticality: 'high',
    descriptionKo: '대용량 통계/조회를 위한 Read-Replica 포트(TCP 5433). 클라우드 이관 시 보안그룹(SG) 오픈 누락이 잦은 항목',
  },
  {
    id: 'app-to-db-icmp-ping',
    name: 'APP 서버 → DB 헬스체크 Ping (ICMP 허용 필요)',
    sourceWorkload: 'app',
    destinationWorkload: 'db',
    protocol: 'icmp',
    expectedNetworkOutcome: 'allow',
    requireReturnPath: true,
    categoryKo: '인프라 모니터링',
    criticality: 'high',
    descriptionKo: '운영팀 장애 감지용 ICMP Ping 체크. AWS 이관 후 NACL/SG에서 ICMP가 막혀 알람이 울리는 대표 사례',
  },
  {
    id: 'sec-guard-app-to-db-ssh-22',
    name: '보안 통제: APP 서버 → DB 서버 직접 SSH 접속 차단 (TCP 22 차단 필수)',
    sourceWorkload: 'app',
    destinationWorkload: 'db',
    protocol: 'tcp',
    destinationPort: 22,
    expectedNetworkOutcome: 'deny',
    requireReturnPath: true,
    categoryKo: '제로트러스트 보안감사',
    criticality: 'security-guard',
    descriptionKo: '침해사고 확산(Lateral Movement) 방지를 위해 배스천(Bastion) 외 일반 APP 서버에서 DB로의 SSH(22) 직접 접속은 반드시 차단(DENY)되어야 합격(PASS)',
  },
  {
    id: 'sec-guard-app-to-db-admin-6379',
    name: '보안 통제: APP 서버 → DB 비인가 관리 포트 차단 (TCP 6379 차단 필수)',
    sourceWorkload: 'app',
    destinationWorkload: 'db',
    protocol: 'tcp',
    destinationPort: 6379,
    expectedNetworkOutcome: 'deny',
    requireReturnPath: true,
    categoryKo: '제로트러스트 보안감사',
    criticality: 'security-guard',
    descriptionKo: '허가된 DB 포트(5432) 이외의 비인가 포트(6379 등)는 방화벽/보안그룹에서 기본 차단(Default Deny)되어야 합격(PASS)',
  },
];

/**
 * T01: Same broadcast domain / subnet (172.28.10.0/24, VLAN 10)
 */
export function buildT01SameSubnet(): TopologyDocument {
  return {
    schemaVersion: 'topology-0.1',
    semantic: {
      id: 't01-same-subnet',
      name: 'T01 — 동일 대역(VLAN 10) 직접 연결',
      description: 'APP 서버와 DB 서버가 라우터를 거치지 않고 같은 네트워크 대역(172.28.10.0/24, VLAN 10)에 함께 있는 가장 단순한 구조입니다.',
      workloads: [
        { id: 'app', name: '업무용 APP 서버', tier: 'app' },
        { id: 'db', name: '데이터베이스(DB)', tier: 'db' },
      ],
      l2Domains: [{ id: 'vlan10', name: 'IDC-VLAN10', vlanId: 10, location: 'idc' }],
      devices: [
        {
          id: 'app-srv',
          name: 'app-srv (APP 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-t01',
        },
        {
          id: 'db-srv',
          name: 'db-srv (DB 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-t01',
        },
      ],
      interfaces: [
        {
          id: 'app-eth0',
          deviceId: 'app-srv',
          name: 'eth0',
          ip: '172.28.10.10/24',
          l2DomainId: 'vlan10',
          vlanId: 10,
        },
        {
          id: 'db-eth0',
          deviceId: 'db-srv',
          name: 'eth0',
          ip: '172.28.10.20/24',
          l2DomainId: 'vlan10',
          vlanId: 10,
        },
      ],
      links: [
        {
          id: 'link-app-db',
          aInterfaceId: 'app-eth0',
          bInterfaceId: 'db-eth0',
          kind: 'ethernet',
        },
      ],
      routes: [
        {
          id: 'rt-app-conn',
          deviceId: 'app-srv',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'app-eth0',
          protocol: 'connected',
          evidenceId: 'ev-t01',
        },
        {
          id: 'rt-db-conn',
          deviceId: 'db-srv',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'db-eth0',
          protocol: 'connected',
          evidenceId: 'ev-t01',
        },
      ],
      policies: [],
      bindings: {
        app: {
          workloadId: 'app',
          deviceId: 'app-srv',
          interfaceId: 'app-eth0',
          ip: '172.28.10.10',
          location: 'idc',
        },
        db: {
          workloadId: 'db',
          deviceId: 'db-srv',
          interfaceId: 'db-eth0',
          ip: '172.28.10.20',
          location: 'idc',
        },
      },
      evidences: [
        {
          id: 'ev-t01',
          sourceType: 'synthetic-lab',
          description: '동일 서브넷(172.28.10.0/24) L2 직접 연결 구성 정보',
        },
      ],
    },
    annotations: {
      snapshotId: 't01-same-subnet',
      nodes: {
        'app-srv': { x: 170, y: 170, label: 'IP: 172.28.10.10/24', group: '사내 IDC - VLAN 10' },
        'db-srv': { x: 570, y: 170, label: 'IP: 172.28.10.20/24', group: '사내 IDC - VLAN 10' },
      },
    },
  };
}

/**
 * T02: Canonical APP — Router (r1) — DB routed topology with complete forward & return routes.
 */
export function buildT02RoutedForwardReturn(): TopologyDocument {
  return {
    schemaVersion: 'topology-0.1',
    semantic: {
      id: 'as-is',
      name: 'T02 — 사내 IDC 기본 라우팅 구성 (As-Is 정상 기준선)',
      description: 'APP(172.28.10.10)과 DB(172.28.20.20)가 서로 다른 네트워크 대역에 있고, 가운데 IDC 코어 라우터(r1)를 통해 왕복 통신하는 표준 온프레미스 구조입니다.',
      workloads: [
        { id: 'app', name: '업무용 APP 서버', tier: 'app' },
        { id: 'db', name: '데이터베이스(DB)', tier: 'db' },
      ],
      l2Domains: [
        { id: 'vlan10', name: 'APP-VLAN10', vlanId: 10, location: 'idc' },
        { id: 'vlan20', name: 'DB-VLAN20', vlanId: 20, location: 'idc' },
      ],
      devices: [
        {
          id: 'app-srv',
          name: 'app-srv (APP 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-idc-hosts',
        },
        {
          id: 'r1',
          name: 'idc-core-r1 (코어 라우터)',
          role: 'router',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-idc-r1',
        },
        {
          id: 'db-srv',
          name: 'db-srv (DB 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-idc-hosts',
        },
      ],
      interfaces: [
        {
          id: 'app-eth0',
          deviceId: 'app-srv',
          name: 'eth0',
          ip: '172.28.10.10/24',
          l2DomainId: 'vlan10',
          vlanId: 10,
        },
        {
          id: 'r1-eth1',
          deviceId: 'r1',
          name: 'eth1',
          ip: '172.28.10.1/24',
          l2DomainId: 'vlan10',
          vlanId: 10,
        },
        {
          id: 'r1-eth2',
          deviceId: 'r1',
          name: 'eth2',
          ip: '172.28.20.1/24',
          l2DomainId: 'vlan20',
          vlanId: 20,
        },
        {
          id: 'db-eth0',
          deviceId: 'db-srv',
          name: 'eth0',
          ip: '172.28.20.20/24',
          l2DomainId: 'vlan20',
          vlanId: 20,
        },
      ],
      links: [
        {
          id: 'link-app-r1',
          aInterfaceId: 'app-eth0',
          bInterfaceId: 'r1-eth1',
          kind: 'ethernet',
        },
        {
          id: 'link-r1-db',
          aInterfaceId: 'r1-eth2',
          bInterfaceId: 'db-eth0',
          kind: 'ethernet',
        },
      ],
      routes: [
        {
          id: 'rt-app-conn',
          deviceId: 'app-srv',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'app-eth0',
          protocol: 'connected',
          evidenceId: 'ev-idc-hosts',
        },
        {
          id: 'rt-app-to-db',
          deviceId: 'app-srv',
          destinationPrefix: '172.28.20.0/24',
          nextHopIp: '172.28.10.1',
          egressInterfaceId: 'app-eth0',
          protocol: 'static',
          evidenceId: 'ev-idc-hosts',
        },
        {
          id: 'rt-r1-conn-10',
          deviceId: 'r1',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'r1-eth1',
          protocol: 'connected',
          evidenceId: 'ev-idc-r1',
        },
        {
          id: 'rt-r1-conn-20',
          deviceId: 'r1',
          destinationPrefix: '172.28.20.0/24',
          egressInterfaceId: 'r1-eth2',
          protocol: 'connected',
          evidenceId: 'ev-idc-r1',
        },
        {
          id: 'rt-db-conn',
          deviceId: 'db-srv',
          destinationPrefix: '172.28.20.0/24',
          egressInterfaceId: 'db-eth0',
          protocol: 'connected',
          evidenceId: 'ev-idc-hosts',
        },
        {
          id: 'rt-db-return-to-app',
          deviceId: 'db-srv',
          destinationPrefix: '172.28.10.0/24',
          nextHopIp: '172.28.20.1',
          egressInterfaceId: 'db-eth0',
          protocol: 'static',
          evidenceId: 'ev-idc-hosts',
        },
      ],
      policies: [],
      bindings: {
        app: {
          workloadId: 'app',
          deviceId: 'app-srv',
          interfaceId: 'app-eth0',
          ip: '172.28.10.10',
          location: 'idc',
        },
        db: {
          workloadId: 'db',
          deviceId: 'db-srv',
          interfaceId: 'db-eth0',
          ip: '172.28.20.20',
          location: 'idc',
        },
      },
      evidences: [
        {
          id: 'ev-idc-hosts',
          sourceType: 'static-config',
          description: 'APP 및 DB 서버의 IP/라우팅 테이블 전체 수집본',
        },
        {
          id: 'ev-idc-r1',
          sourceType: 'static-config',
          description: 'IDC 코어 라우터(r1) 인터페이스 및 라우팅 테이블 전체 수집본',
        },
      ],
    },
    annotations: {
      snapshotId: 'as-is',
      nodes: {
        'app-srv': { x: 120, y: 170, label: 'IP: 172.28.10.10', group: '사내 IDC - VLAN 10' },
        r1: { x: 380, y: 170, label: 'GW: .10.1 / .20.1', group: '사내 IDC 코어망' },
        'db-srv': { x: 630, y: 170, label: 'IP: 172.28.20.20', group: '사내 IDC - VLAN 20' },
      },
    },
  };
}

/**
 * T03: Missing return route from DB back to APP (mutates T02 by removing `rt-db-return-to-app`).
 */
export function buildT03MissingReturnRoute(): TopologyDocument {
  const doc = buildT02RoutedForwardReturn();
  doc.semantic.id = 't03-missing-return-route';
  doc.semantic.name = 'T03 — DB 서버 응답 라우팅(Return Route) 누락 장애';
  doc.semantic.description =
    'APP에서 DB로 가는 패킷은 도착하지만, DB 서버에서 APP 대역(172.28.10.0/24)으로 돌아오는 라우팅 설정이 빠져 있어 왕복 통신이 끊긴 상태입니다.';
  doc.semantic.routes = doc.semantic.routes.filter((r) => r.id !== 'rt-db-return-to-app');
  doc.annotations.snapshotId = doc.semantic.id;
  return doc;
}

/**
 * T04: Restored return route (starts from T03 and restores the exact route `rt-db-return-to-app`).
 */
export function buildT04RestoredReturnRoute(): TopologyDocument {
  const broken = buildT03MissingReturnRoute();
  broken.semantic.id = 't04-restored-return-route';
  broken.semantic.name = 'T04 — 누락된 DB 응답 라우팅 복구 완료';
  broken.semantic.description = 'T03에서 빠졌던 DB 서버의 귀환 라우트(rt-db-return-to-app)를 다시 추가해 양방향 통신을 정상 복구한 상태입니다.';
  broken.semantic.routes.push({
    id: 'rt-db-return-to-app',
    deviceId: 'db-srv',
    destinationPrefix: '172.28.10.0/24',
    nextHopIp: '172.28.20.1',
    egressInterfaceId: 'db-eth0',
    protocol: 'static',
    evidenceId: 'ev-idc-hosts',
  });
  broken.annotations.snapshotId = broken.semantic.id;
  return broken;
}

/**
 * T05: Explicit security policy deny matches a flow whose intent is `deny` -> blocked + pass!
 */
export function buildT05PolicyDenyExpected(): { document: TopologyDocument; intent: CommunicationIntent } {
  const doc = buildT02RoutedForwardReturn();
  doc.semantic.id = 't05-policy-deny-expected';
  doc.semantic.name = 'T05 — 보안 차단 정책 검증 (차단됨 = 의도 달성 PASS)';
  doc.semantic.description =
    '보안 규정상 APP에서 DB(5432 포트)로 직접 붙으면 안 되는 상황에서, 방화벽(r1)이 이를 정확히 차단하여 보안 의도를 만족(PASS)한 사례입니다.';
  const r1 = doc.semantic.devices.find((d) => d.id === 'r1');
  if (r1) {
    r1.name = 'idc-fw-r1 (방화벽 겸 라우터)';
    r1.role = 'firewall';
    r1.enforcesPolicy = true;
    r1.defaultPolicyAction = 'deny';
  }
  doc.semantic.policies = [
    {
      id: 'pol-block-db-5432',
      deviceId: 'r1',
      name: 'DB-직접접속-차단-정책',
      priority: 10,
      direction: 'forward',
      srcPrefix: '172.28.10.0/24',
      dstPrefix: '172.28.20.0/24',
      protocol: 'tcp',
      dstPort: 5432,
      action: 'deny',
      kind: 'firewall-acl',
      stateful: true,
      evidenceId: 'ev-idc-r1',
    },
  ];
  doc.annotations.snapshotId = doc.semantic.id;

  const denyIntent: CommunicationIntent = {
    ...DEFAULT_APP_TO_DB_INTENT,
    id: 'app-to-db-must-be-isolated',
    name: '보안 격리 검증: 비인가 APP → DB 직접 접속 차단 필수 (목표: DENY)',
    expectedNetworkOutcome: 'deny',
  };

  return { document: doc, intent: denyIntent };
}

/**
 * T06: Policy-enforcing hop exists on path, but policy data was not collected (`policyTableComplete: false`).
 */
export function buildT06PolicyMissing(): TopologyDocument {
  const doc = buildT02RoutedForwardReturn();
  doc.semantic.id = 't06-policy-missing';
  doc.semantic.name = 'T06 — 방화벽 정책 파일 미수집 (판정 보류 UNKNOWN)';
  doc.semantic.description =
    '경로 중간에 방화벽(r1)이 존재하지만, 아직 방화벽 정책 설정 파일을 수집하지 못한 상태입니다. 함부로 "통신 가능"이나 "차단"으로 찍지 않고 UNKNOWN(판정 보류)으로 경고합니다.';
  const r1 = doc.semantic.devices.find((d) => d.id === 'r1');
  if (r1) {
    r1.name = 'idc-fw-r1 (정책 미수집 방화벽)';
    r1.role = 'firewall';
    r1.enforcesPolicy = true;
    r1.completeness.policyTableComplete = false;
  }
  doc.annotations.snapshotId = doc.semantic.id;
  return doc;
}

/**
 * T07: Path crosses an unsupported NAT feature (`unsupportedFeaturesOnPath: ['nat']`).
 */
export function buildT07UnsupportedNat(): TopologyDocument {
  const doc = buildT02RoutedForwardReturn();
  doc.semantic.id = 't07-unsupported-nat';
  doc.semantic.name = 'T07 — 미지원 기능(NAT) 구간 통과 (판정 보류 UNKNOWN)';
  doc.semantic.description =
    '경로상의 장비(r1)에 현재 분석 엔진이 모델링하지 않는 특수 NAT 설정이 걸려 있을 때, 잘못된 결과를 내는 대신 UNKNOWN으로 한계를 투명하게 표시합니다.';
  const r1 = doc.semantic.devices.find((d) => d.id === 'r1');
  if (r1) {
    r1.unsupportedFeaturesOnPath = ['nat'];
  }
  doc.annotations.snapshotId = doc.semantic.id;
  return doc;
}

/**
 * T08: View-only coordinate move on T02 (semantic hash and analysis verdict must remain identical).
 */
export function buildT08ViewOnlyMove(): TopologyDocument {
  const doc = buildT02RoutedForwardReturn();
  doc.annotations = {
    snapshotId: doc.semantic.id,
    nodes: {
      'app-srv': { x: 430, y: 95, label: '화면 위치만 옮긴 APP', group: '화면 재배치 테스트' },
      r1: { x: 250, y: 260, label: '화면 위치만 옮긴 라우터', group: '화면 재배치 테스트' },
      'db-srv': { x: 110, y: 120, label: '화면 위치만 옮긴 DB', group: '화면 재배치 테스트' },
    },
    notes: ['아이콘의 (x, y) 화면 좌표만 바꾸었으므로 실제 네트워크 의미 해시(Semantic Hash)는 T02와 100% 동일합니다.'],
  };
  return doc;
}

/**
 * T09: Serialization roundtrip (export T02 to JSON string and re-import).
 */
export function buildT09SerializationRoundtrip(): TopologyDocument {
  const original = buildT02RoutedForwardReturn();
  const raw = serializeTopologyDocument(original);
  return deserializeTopologyDocument(raw);
}

/**
 * T10: Trunk VLAN missing — VLAN 20 is pruned from the only trunk link between switches.
 */
export function buildT10TrunkVlanMissing(): TopologyDocument {
  return {
    schemaVersion: 'topology-0.1',
    semantic: {
      id: 't10-trunk-vlan-missing',
      name: 'T10 — 스위치 트렁크 포트에 VLAN 20 누락 장애',
      description: 'APP과 DB가 같은 VLAN 20 대역(172.28.20.0/24)에 있지만, 두 스위치(sw1 ↔ sw2)를 잇는 트렁크 케이블에서 VLAN 20 허용 설정이 빠져 통신이 끊긴 사례입니다.',
      workloads: [
        { id: 'app', name: '업무용 APP 서버', tier: 'app' },
        { id: 'db', name: '데이터베이스(DB)', tier: 'db' },
      ],
      l2Domains: [{ id: 'vlan20', name: 'DATA-VLAN20', vlanId: 20, location: 'idc' }],
      devices: [
        {
          id: 'app-srv',
          name: 'app-srv (APP 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
        },
        {
          id: 'sw1',
          name: 'idc-tor-sw1 (랙1 스위치)',
          role: 'switch',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
        },
        {
          id: 'sw2',
          name: 'idc-tor-sw2 (랙2 스위치)',
          role: 'switch',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
        },
        {
          id: 'db-srv',
          name: 'db-srv (DB 서버)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
        },
      ],
      interfaces: [
        { id: 'app-eth0', deviceId: 'app-srv', name: 'eth0', ip: '172.28.20.10/24', vlanId: 20 },
        { id: 'sw1-acc1', deviceId: 'sw1', name: 'Ethernet1', vlanId: 20 },
        { id: 'sw1-trunk1', deviceId: 'sw1', name: 'Ethernet48', trunkVlans: [10, 30] }, // VLAN 20 누락!
        { id: 'sw2-trunk1', deviceId: 'sw2', name: 'Ethernet48', trunkVlans: [10, 20, 30] },
        { id: 'sw2-acc1', deviceId: 'sw2', name: 'Ethernet1', vlanId: 20 },
        { id: 'db-eth0', deviceId: 'db-srv', name: 'eth0', ip: '172.28.20.20/24', vlanId: 20 },
      ],
      links: [
        { id: 'link-app-sw1', aInterfaceId: 'app-eth0', bInterfaceId: 'sw1-acc1', kind: 'ethernet' },
        { id: 'link-sw1-sw2-trunk', aInterfaceId: 'sw1-trunk1', bInterfaceId: 'sw2-trunk1', kind: 'trunk', requiredVlan: 20 },
        { id: 'link-sw2-db', aInterfaceId: 'sw2-acc1', bInterfaceId: 'db-eth0', kind: 'ethernet' },
      ],
      routes: [
        {
          id: 'rt-app-conn',
          deviceId: 'app-srv',
          destinationPrefix: '172.28.20.0/24',
          egressInterfaceId: 'app-eth0',
          protocol: 'connected',
        },
        {
          id: 'rt-db-conn',
          deviceId: 'db-srv',
          destinationPrefix: '172.28.20.0/24',
          egressInterfaceId: 'db-eth0',
          protocol: 'connected',
        },
      ],
      policies: [],
      bindings: {
        app: {
          workloadId: 'app',
          deviceId: 'app-srv',
          interfaceId: 'app-eth0',
          ip: '172.28.20.10',
          location: 'idc',
        },
        db: {
          workloadId: 'db',
          deviceId: 'db-srv',
          interfaceId: 'db-eth0',
          ip: '172.28.20.20',
          location: 'idc',
        },
      },
    },
    annotations: {
      snapshotId: 't10-trunk-vlan-missing',
      nodes: {
        'app-srv': { x: 95, y: 170, label: 'VLAN 20 (.20.10)', group: '랙 1' },
        sw1: { x: 280, y: 170, label: '트렁크 허용: [10, 30] ❌', group: '랙 1 스위치' },
        sw2: { x: 470, y: 170, label: '트렁크 허용: [10,20,30]', group: '랙 2 스위치' },
        'db-srv': { x: 645, y: 170, label: 'VLAN 20 (.20.20)', group: '랙 2' },
      },
    },
  };
}

/**
 * T11: Migration Endpoint Rebinding (To-Be AWS Hybrid Path)
 */
export function buildT11MigrationEndpointRebinding(): TopologyDocument {
  return {
    schemaVersion: 'topology-0.1',
    semantic: {
      id: 'to-be',
      name: 'T11 — DB 서버 AWS 클라우드 이전 완료 (정상 하이브리드 경로)',
      description: 'APP은 사내 IDC(172.28.10.10)에 남고 DB만 AWS VPC(10.60.20.30)로 이전한 후, 전용선(DX)/TGW 라우팅과 NACL·보안그룹(SG)이 모두 정상 구성된 상태입니다.',
      workloads: [
        { id: 'app', name: '업무용 APP 서버', tier: 'app' },
        { id: 'db', name: '데이터베이스(DB)', tier: 'db' },
      ],
      devices: [
        {
          id: 'app-srv',
          name: 'app-srv (사내 APP)',
          role: 'host',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-hybrid-idc',
        },
        {
          id: 'r1',
          name: 'idc-edge-r1 (IDC 경계 라우터)',
          role: 'router',
          location: 'idc',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-hybrid-idc',
        },
        {
          id: 'tgw-1',
          name: 'aws-tgw (AWS 트랜짓 게이트웨이)',
          role: 'aws-tgw',
          location: 'aws',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-aws-tgw',
        },
        {
          id: 'vpc-rt-1',
          name: 'aws-vpc-rt (VPC 라우터/NACL)',
          role: 'aws-vpc-router',
          location: 'aws',
          enforcesPolicy: true,
          defaultPolicyAction: 'deny',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-aws-vpc',
        },
        {
          id: 'aws-db-eni',
          name: 'aws-rds-db (이전된 AWS DB)',
          role: 'host',
          location: 'aws',
          enforcesPolicy: true,
          defaultPolicyAction: 'deny',
          completeness: { routingTableComplete: true, policyTableComplete: true, l2ConfigComplete: true },
          evidenceId: 'ev-aws-sg',
        },
      ],
      interfaces: [
        { id: 'app-eth0', deviceId: 'app-srv', name: 'eth0', ip: '172.28.10.10/24' },
        { id: 'r1-eth1', deviceId: 'r1', name: 'eth1', ip: '172.28.10.1/24' },
        { id: 'r1-dx0', deviceId: 'r1', name: 'dx-vif0', ip: '169.254.100.1/30' },
        { id: 'tgw-dx-att', deviceId: 'tgw-1', name: 'att-dx', ip: '169.254.100.2/30' },
        { id: 'tgw-vpc-att', deviceId: 'tgw-1', name: 'att-vpc-prod', ip: '10.60.0.1/24' },
        { id: 'vpc-tgw-if', deviceId: 'vpc-rt-1', name: 'tgw-eni', ip: '10.60.0.2/24' },
        { id: 'vpc-sub-if', deviceId: 'vpc-rt-1', name: 'subnet-db-rt', ip: '10.60.20.1/24' },
        { id: 'aws-db-eth0', deviceId: 'aws-db-eni', name: 'eni-0db1', ip: '10.60.20.30/24' },
      ],
      links: [
        { id: 'link-app-r1', aInterfaceId: 'app-eth0', bInterfaceId: 'r1-eth1', kind: 'ethernet' },
        { id: 'link-r1-tgw', aInterfaceId: 'r1-dx0', bInterfaceId: 'tgw-dx-att', kind: 'dx' },
        { id: 'link-tgw-vpc', aInterfaceId: 'tgw-vpc-att', bInterfaceId: 'vpc-tgw-if', kind: 'tgw-attachment' },
        { id: 'link-vpc-db', aInterfaceId: 'vpc-sub-if', bInterfaceId: 'aws-db-eth0', kind: 'ethernet' },
      ],
      routes: [
        {
          id: 'rt-app-to-aws-db',
          deviceId: 'app-srv',
          destinationPrefix: '10.60.0.0/16',
          nextHopIp: '172.28.10.1',
          egressInterfaceId: 'app-eth0',
          protocol: 'static',
          evidenceId: 'ev-hybrid-idc',
        },
        {
          id: 'rt-r1-to-aws',
          deviceId: 'r1',
          destinationPrefix: '10.60.0.0/16',
          nextHopIp: '169.254.100.2',
          egressInterfaceId: 'r1-dx0',
          protocol: 'static',
          evidenceId: 'ev-hybrid-idc',
        },
        {
          id: 'rt-tgw-to-vpc',
          deviceId: 'tgw-1',
          destinationPrefix: '10.60.0.0/16',
          egressInterfaceId: 'tgw-vpc-att',
          protocol: 'aws-route-table',
          evidenceId: 'ev-aws-tgw',
        },
        {
          id: 'rt-vpc-local-db',
          deviceId: 'vpc-rt-1',
          destinationPrefix: '10.60.20.0/24',
          egressInterfaceId: 'vpc-sub-if',
          protocol: 'connected',
          evidenceId: 'ev-aws-vpc',
        },
        {
          id: 'rt-aws-db-default',
          deviceId: 'aws-db-eni',
          destinationPrefix: '172.28.10.0/24',
          nextHopIp: '10.60.20.1',
          egressInterfaceId: 'aws-db-eth0',
          protocol: 'aws-route-table',
          evidenceId: 'ev-aws-vpc',
        },
        {
          id: 'rt-vpc-to-idc',
          deviceId: 'vpc-rt-1',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'vpc-tgw-if',
          protocol: 'aws-route-table',
          evidenceId: 'ev-aws-vpc',
        },
        {
          id: 'rt-tgw-to-idc',
          deviceId: 'tgw-1',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'tgw-dx-att',
          protocol: 'aws-route-table',
          evidenceId: 'ev-aws-tgw',
        },
        {
          id: 'rt-r1-conn-app',
          deviceId: 'r1',
          destinationPrefix: '172.28.10.0/24',
          egressInterfaceId: 'r1-eth1',
          protocol: 'connected',
          evidenceId: 'ev-hybrid-idc',
        },
      ],
      policies: [
        {
          id: 'nacl-allow-idc-to-db',
          deviceId: 'vpc-rt-1',
          name: 'NACL-사내APP-DB접속-허용',
          priority: 100,
          direction: 'forward',
          srcPrefix: '172.28.10.0/24',
          dstPrefix: '10.60.20.0/24',
          protocol: 'tcp',
          dstPort: 5432,
          action: 'allow',
          kind: 'aws-nacl',
          stateful: false,
          evidenceId: 'ev-aws-vpc',
        },
        {
          id: 'nacl-allow-db-return-to-idc',
          deviceId: 'vpc-rt-1',
          name: 'NACL-DB응답패킷-허용',
          priority: 110,
          direction: 'reverse' as 'forward',
          srcPrefix: '10.60.20.0/24',
          dstPrefix: '172.28.10.0/24',
          protocol: 'tcp',
          action: 'allow',
          kind: 'aws-nacl',
          stateful: false,
          evidenceId: 'ev-aws-vpc',
        },
        {
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
          evidenceId: 'ev-aws-sg',
        },
      ],
      bindings: {
        app: {
          workloadId: 'app',
          deviceId: 'app-srv',
          interfaceId: 'app-eth0',
          ip: '172.28.10.10',
          location: 'idc',
        },
        db: {
          workloadId: 'db',
          deviceId: 'aws-db-eni',
          interfaceId: 'aws-db-eth0',
          ip: '10.60.20.30',
          location: 'aws',
        },
      },
      evidences: [
        { id: 'ev-hybrid-idc', sourceType: 'static-config', description: '사내 IDC 경계 라우터 DX VIF 및 정적 라우트 설정' },
        { id: 'ev-aws-tgw', sourceType: 'aws-design-spec', description: 'AWS Transit Gateway 라우팅 테이블 설계서' },
        { id: 'ev-aws-vpc', sourceType: 'aws-design-spec', description: 'AWS VPC 서브넷 라우팅 테이블 및 NACL 설계서' },
        { id: 'ev-aws-sg', sourceType: 'aws-design-spec', description: 'AWS RDS 보안그룹(Security Group) 인바운드 허용 규칙' },
      ],
    },
    annotations: {
      snapshotId: 'to-be',
      nodes: {
        'app-srv': { x: 75, y: 170, label: 'IP: 172.28.10.10', group: '사내 IDC' },
        r1: { x: 220, y: 170, label: 'IDC 경계 라우터', group: '사내 IDC' },
        'tgw-1': { x: 375, y: 170, label: 'Direct Connect / TGW', group: 'AWS 하이브리드' },
        'vpc-rt-1': { x: 525, y: 170, label: 'VPC 라우터 + NACL', group: 'AWS 운영 VPC' },
        'aws-db-eni': { x: 675, y: 170, label: '새 IP: 10.60.20.30', group: 'AWS 운영 VPC' },
      },
    },
  };
}

/**
 * T12: DB moved to AWS (10.60.20.30), but AWS Security Group / NACL policy evidence is incomplete (`policyTableComplete: false`).
 */
export function buildT12MigrationPolicyNotCollected(): TopologyDocument {
  const doc = buildT11MigrationEndpointRebinding();
  doc.semantic.id = 't12-migration-policy-not-collected';
  doc.semantic.name = 'T12 — AWS 이전 후 DB 보안그룹(SG) 미수집 (판정 보류 UNKNOWN)';
  doc.semantic.description =
    'DB를 AWS(10.60.20.30)로 옮기는 네트워크 경로는 설계되었으나, 정작 AWS RDS 보안그룹(Security Group) 설정이 아직 확인되지 않아 전환 승인을 보류(UNKNOWN)하는 시나리오입니다.';
  const awsDb = doc.semantic.devices.find((d) => d.id === 'aws-db-eni');
  if (awsDb) {
    awsDb.completeness.policyTableComplete = false;
  }
  doc.semantic.policies = doc.semantic.policies.filter((p) => p.deviceId !== 'aws-db-eni');
  doc.annotations.snapshotId = doc.semantic.id;
  return doc;
}

export function getAllScenarioFixtures(): ScenarioFixture[] {
  const t05 = buildT05PolicyDenyExpected();
  return [
    {
      id: 'T01',
      name: 'same-subnet',
      shortTitleKo: '동일 VLAN 10 직접 통신',
      storyGroupKo: '① 정상 기준선 & 불변성 검증',
      titleKo: 'T01 [기초] 같은 네트워크 대역(VLAN 10) 안에서 직접 통신',
      categoryBadgeKo: '🟢 정상 통신',
      phase: 'P1',
      precondition: 'Complete lab model with two interfaces in the same broadcast domain',
      situationKo: 'APP 서버(172.28.10.10)와 DB 서버(172.28.10.20)가 라우터 없이 같은 스위치/VLAN 10 대역에 물려 있습니다.',
      whyResultKo: '같은 서브넷(172.28.10.0/24)이므로 게이트웨이를 거치지 않고 직접 패킷을 주고받아 왕복 통신이 즉시 성공(PASS)합니다.',
      inspectionHintKo: '장비 app-srv와 db-srv를 클릭해 동일 대역(172.28.10.0/24) Connected 라우트만으로 왕복 연결됨을 확인하세요.',
      focusDeviceId: 'app-srv',
      document: buildT01SameSubnet(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '두 서버 모두 172.28.10.0/24 대역에 속해 있어 Connected(직접 연결) 라우트로 즉시 통신합니다.',
        '가는 길(APP → DB)과 돌아오는 길(DB → APP) 모두 성공하여 최종 판정은 PASS입니다.',
      ],
    },
    {
      id: 'T02',
      name: 'routed-forward-return',
      shortTitleKo: 'IDC 코어 라우터 왕복 정상',
      storyGroupKo: '① 정상 기준선 & 불변성 검증',
      titleKo: 'T02 [기본] 사내 IDC 라우터를 통한 정상 왕복 통신 (As-Is 기준)',
      categoryBadgeKo: '🟢 정상 통신',
      phase: 'P1',
      precondition: 'Complete model with connected and static routes in both directions',
      situationKo: 'APP 서버(172.28.10.10)와 DB 서버(172.28.20.20)가 서로 다른 대역에 있고, 코어 라우터(r1)가 중간에서 연결합니다.',
      whyResultKo: 'APP → 라우터(r1) → DB로 가는 길(Forward)과 DB → 라우터(r1) → APP으로 돌아오는 길(Reverse) 라우팅이 모두 완비되어 있어 왕복 통신에 성공(PASS)합니다.',
      inspectionHintKo: '우측 인스펙터에서 db-srv의 귀환 라우트를 삭제해 보거나, r1 라우터에 방화벽 정책을 추가하며 실시간 What-If 실험을 해보세요.',
      focusDeviceId: 'r1',
      document: buildT02RoutedForwardReturn(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '온프레미스(As-Is) 대표 정상 모델입니다: APP(172.28.10.10) ↔ 코어 라우터(r1) ↔ DB(172.28.20.20).',
        '뒤이어 나오는 장애 시나리오(T03) 및 AWS 이전 시나리오(T11, T12)의 비교 기준점 역할을 합니다.',
      ],
    },
    {
      id: 'T03',
      name: 'missing-return-route',
      shortTitleKo: 'DB 응답 라우트(Return) 누락',
      storyGroupKo: '② L2·L3·방화벽 장애 및 보안 진단',
      titleKo: 'T03 [장애] DB 서버에 응답 경로(Return Route)가 빠졌을 때',
      categoryBadgeKo: '🔴 통신 실패 (장애)',
      phase: 'P1',
      precondition: 'Remove DB return route from a declared-complete route table; no alternate route exists',
      situationKo: 'APP에서 DB로 가는 라우팅은 정상이지만, DB 서버에서 APP 대역(172.28.10.0/24)으로 돌아가는 라우팅 1줄을 삭제한 상황입니다.',
      whyResultKo: '패킷이 DB까지는 도착(Forward 성공)하지만, DB가 응답 패킷을 돌려보낼 길을 찾지 못해(NO_ROUTE) 최종 통신은 차단(BLOCKED / FAIL)됩니다.',
      inspectionHintKo: '상단의 [✨ 원클릭 해결] 버튼을 누르면 db-srv에 빠진 귀환 라우트(172.28.10.0/24 via 172.28.20.1)가 즉시 복구되어 PASS로 바뀝니다!',
      focusDeviceId: 'db-srv',
      document: buildT03MissingReturnRoute(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'blocked',
      expectedIntentVerdict: 'fail',
      learningNotes: [
        '현업에서 가장 흔한 실수 중 하나입니다: 가는 길만 열어두고 돌아오는 길(Return Path) 라우팅을 빠뜨린 경우입니다.',
        '아래 패킷 여정 타임라인에서 [가는 길]은 DELIVERED(도착)이지만 [돌아오는 길]에서 NO_ROUTE로 막힌 것을 정확히 볼 수 있습니다.',
      ],
    },
    {
      id: 'T04',
      name: 'restored-return-route',
      shortTitleKo: 'DB 응답 라우트 복구 완료',
      storyGroupKo: '② L2·L3·방화벽 장애 및 보안 진단',
      titleKo: 'T04 [복구] 빠졌던 DB 응답 경로를 다시 추가하여 정상 복구',
      categoryBadgeKo: '🟢 장애 복구 완료',
      phase: 'P1',
      precondition: 'Restore the exact route removed in T03',
      situationKo: 'T03 장애 원인이었던 DB 서버의 귀환 라우트(172.28.10.0/24 -> 172.28.20.1)를 다시 복구한 상황입니다.',
      whyResultKo: 'DB가 응답 패킷을 코어 라우터(r1)로 돌려보낼 수 있게 되어 역방향 경로까지 살아나고 다시 정상(PASS)으로 돌아옵니다.',
      inspectionHintKo: 'T02(정상) ➔ T03(장애) ➔ T04(복구)의 시맨틱 해시(Semantic Hash)가 T02와 정확히 동일하게 복원됨을 확인하세요.',
      focusDeviceId: 'db-srv',
      document: buildT04RestoredReturnRoute(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        'T02(정상) → T03(응답 경로 삭제 시 실패) → T04(복구 시 재성공) 과정을 통해 분석 엔진의 일관성을 증명합니다.',
      ],
    },
    {
      id: 'T05',
      name: 'policy-deny-expected',
      shortTitleKo: '방화벽 보안 차단 (차단=PASS)',
      storyGroupKo: '② L2·L3·방화벽 장애 및 보안 진단',
      titleKo: 'T05 [보안] 금지된 통신을 방화벽이 잘 막았을 때 (차단 = 합격!)',
      categoryBadgeKo: '🛡️ 보안 차단 = 합격(PASS)',
      phase: 'P2',
      precondition: 'Supported explicit deny matches required blocked flow; no alternate accepted path',
      situationKo: '보안 규정상 이 APP 서버가 DB(5432 포트)에 직접 접근하면 안 되는 상황(목표 의도: DENY)이며, 방화벽에 차단 규칙을 넣었습니다.',
      whyResultKo: '네트워크 통신 자체는 막혔지만(BLOCKED), 우리의 보안 목표가 "차단하는 것(DENY)"이었으므로 의도 달성 판정은 합격(PASS)이 됩니다!',
      inspectionHintKo: '툴바의 [가상 진행(Continue 진단 모드)]를 켜면 방화벽 뒤쪽 라우팅이 어떻게 구성되어 있는지도 미리 확인해 볼 수 있습니다.',
      focusDeviceId: 'r1',
      document: t05.document,
      intent: t05.intent,
      expectedNetworkOutcome: 'blocked',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '왜 결과를 2가지 축(1. 실제 통신 여부 / 2. 의도 달성 여부)으로 나누는지 보여주는 핵심 사례입니다.',
        '무작정 통신이 안 된다고 실패(FAIL)가 아니라, 막아야 할 통신이 확실히 막혔다면 보안 검증은 성공(PASS)입니다.',
      ],
    },
    {
      id: 'T06',
      name: 'policy-missing',
      shortTitleKo: '방화벽 정책 미수집 (Unknown)',
      storyGroupKo: '③ 자료 미수집 & 미지원 기능 (Unknown)',
      titleKo: 'T06 [자료부족] 경로 중간의 방화벽 설정 파일을 아직 못 받았을 때',
      categoryBadgeKo: '⚠️ 판정 보류 (UNKNOWN)',
      phase: 'P1',
      precondition: 'A policy-dependent hop exists but policy data was not collected',
      situationKo: '라우팅 연결은 다 되어 있지만, 중간에 있는 방화벽(r1)의 보안 정책표를 아직 전달받지 못한(미수집) 상태입니다.',
      whyResultKo: '방화벽 정책을 모르는데 "선이 연결되어 있으니 통신된다"고 거짓말하면 대형 사고가 납니다. 따라서 정직하게 판정 보류(UNKNOWN)를 띄웁니다.',
      inspectionHintKo: '[✨ 원클릭 해결] 버튼을 눌러 방화벽(r1)의 정책 수집 완료 전환 및 허용 규칙 추가 시 어떻게 PASS로 전환되는지 확인하세요.',
      focusDeviceId: 'r1',
      document: buildT06PolicyMissing(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'unknown',
      expectedIntentVerdict: 'unknown',
      learningNotes: [
        '경로가 없는 것(T03: BLOCKED)과 자료를 아직 덜 모은 것(T06: UNKNOWN)을 엄격히 구분합니다.',
        '실무 마이그레이션 검토 시 추가로 어떤 자료(방화벽 정책표)를 요청해야 하는지 바로 알려줍니다.',
      ],
    },
    {
      id: 'T07',
      name: 'unsupported-nat',
      shortTitleKo: '미지원 기능 NAT 포함 (Unknown)',
      storyGroupKo: '③ 자료 미수집 & 미지원 기능 (Unknown)',
      titleKo: 'T07 [한계명시] 분석기가 지원하지 않는 특수 기능(NAT)이 껴 있을 때',
      categoryBadgeKo: '⚠️ 판정 보류 (UNKNOWN)',
      phase: 'P1',
      precondition: 'Analysis path crosses a NAT feature not modeled by the selected engine',
      situationKo: '경로 중간 라우터(r1)에 현재 기본 분석기가 해석하지 않는 동적 NAT 설정이 걸려 있는 상황입니다.',
      whyResultKo: '분석기가 모르는 기능을 무시하고 대충 추측하지 않고, "NAT 구간이 포함되어 있어 확답할 수 없음(UNKNOWN)"으로 안전하게 멈춥니다.',
      inspectionHintKo: '장비 r1의 미지원 기능(NAT) 경고를 확인하고, [✨ 원클릭 해결]로 순수 L3 라우팅 전환 시 결과를 비교해 보세요.',
      focusDeviceId: 'r1',
      document: buildT07UnsupportedNat(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'unknown',
      expectedIntentVerdict: 'unknown',
      learningNotes: [
        'AI나 엉성한 도구가 흔히 저지르는 "모르는데 아는 척 판정하기"를 원천 차단하는 안전장치입니다.',
      ],
    },
    {
      id: 'T08',
      name: 'view-only-move',
      shortTitleKo: '아이콘 배치 변경 불변성',
      storyGroupKo: '① 정상 기준선 & 불변성 검증',
      titleKo: 'T08 [불변성] 마우스로 화면 아이콘 위치만 이리저리 옮겼을 때',
      categoryBadgeKo: '🟢 그림 이동 불변 검증',
      phase: 'P1',
      precondition: 'Move visual coordinates only; T02 semantics and result must not change',
      situationKo: 'T02 구성도에서 서버와 라우터의 화면 배치 좌표(x, y)와 라벨만 마음대로 옮겨 놓은 상태입니다.',
      whyResultKo: '보기 좋게 그림 위치를 옮겼을 뿐 실제 케이블·IP·라우팅 설정은 그대로이므로, 네트워크 고유 지문(Semantic Hash)과 결과는 T02와 100% 똑같습니다.',
      inspectionHintKo: '캔버스에서 장비를 드래그하거나 [아이콘 위치 이동해보기]를 눌러도 상단 Semantic Hash가 변하지 않는 것을 확인하세요.',
      focusDeviceId: 'app-srv',
      document: buildT08ViewOnlyMove(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '구성도 우측 상단의 Semantic Hash 값(sem-d34e83274f84221b)을 T02와 비교해 보세요 — 글자 하나도 안 바뀌고 동일합니다!',
        '아래 [아이콘 위치 이동해보기] 버튼을 아무리 눌러도 해시값은 절대 변하지 않습니다.',
      ],
    },
    {
      id: 'T09',
      name: 'serialization-roundtrip',
      shortTitleKo: 'JSON 내보내기/불러오기 무결성',
      storyGroupKo: '① 정상 기준선 & 불변성 검증',
      titleKo: 'T09 [저장/불러오기] 구성도를 파일로 저장했다가 다시 불러왔을 때',
      categoryBadgeKo: '🟢 저장/복원 무결성',
      phase: 'P1',
      precondition: 'Export/import T02 preserves semantic model and deterministic result',
      situationKo: 'T02 모델을 JSON 파일로 내보내기(Export)한 뒤 다시 불러오기(Import)한 상태입니다.',
      whyResultKo: '저장 전과 불러온 후의 Semantic Hash 및 모든 경로 추적 단계가 100% 일치합니다.',
      inspectionHintKo: '툴바의 [분할(Split) 뷰]를 눌러 실제 Containerlab YAML과 JSON 구조가 어떻게 직렬화되는지 확인하세요.',
      focusDeviceId: 'r1',
      document: buildT09SerializationRoundtrip(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '설계 파일을 팀원끼리 주고받거나 Git에 저장해도 분석 결과가 절대 달라지지 않음을 보장합니다.',
      ],
    },
    {
      id: 'T10',
      name: 'trunk-vlan-missing',
      shortTitleKo: '스위치 트렁크 VLAN 20 누락',
      storyGroupKo: '② L2·L3·방화벽 장애 및 보안 진단',
      titleKo: 'T10 [L2장애] 스위치 트렁크 포트에 VLAN 20 허용을 빼먹었을 때',
      categoryBadgeKo: '🔴 통신 실패 (L2 VLAN 장애)',
      phase: 'P2',
      precondition: 'Supported VLAN model removes required VLAN from only available trunk; all relevant data complete',
      situationKo: 'APP과 DB가 같은 VLAN 20(172.28.20.0/24)에 있지만, 랙1 스위치(sw1)와 랙2 스위치(sw2) 사이 트렁크 포트에 VLAN 10, 30만 허용하고 VLAN 20을 빠뜨렸습니다.',
      whyResultKo: 'IP 주소 설정은 완벽해 보여도, 2계층 스위치 트렁크(sw1-trunk1)에서 VLAN 20 태그가 붙은 패킷을 버리므로 통신이 차단(BLOCKED / FAIL)됩니다.',
      inspectionHintKo: 'sw1 스위치의 Ethernet48 트렁크 포트에 VLAN 20이 빠져 있습니다. [✨ 원클릭 해결] 버튼으로 VLAN 20을 즉시 추가해 보세요!',
      focusDeviceId: 'sw1',
      document: buildT10TrunkVlanMissing(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'blocked',
      expectedIntentVerdict: 'fail',
      learningNotes: [
        '"IP도 같은 대역이고 케이블도 꽂혀 있는데 왜 안 되지?" 할 때 가장 흔한 2계층(L2) 스위치 트렁크 설정 실수를 잡아냅니다.',
      ],
    },
    {
      id: 'T11',
      name: 'migration-endpoint-rebinding',
      shortTitleKo: 'AWS 하이브리드 이관 완료 (PASS)',
      storyGroupKo: '④ 사내 IDC ➔ AWS 클라우드 이관 비교',
      titleKo: 'T11 [AWS이전] DB 서버를 AWS 클라우드(10.60.20.30)로 성공적으로 옮겼을 때',
      categoryBadgeKo: '☁️ AWS 이전 성공 (PASS)',
      phase: 'P3',
      precondition: 'Evaluate same workload intent with changed DB address and complete supported AWS path model',
      situationKo: 'APP은 사내 IDC(172.28.10.10)에 그대로 두고, DB만 AWS 클라우드(10.60.20.30)로 이전했습니다. 전용선(DX)/TGW 라우팅과 AWS NACL, RDS 보안그룹(SG)까지 모두 반영된 상태입니다.',
      whyResultKo: 'DB의 IP가 바뀌었지만 "APP → DB(5432) 통신"이라는 업무 요구사항을 새 AWS 주소로 자동 매핑해, 8단계 왕복 하이브리드 경로가 모두 정상 통과(PASS)함을 확인했습니다.',
      inspectionHintKo: 'AWS 구간 장비(tgw-1, vpc-rt-1, aws-db-eni)를 클릭해 무상태(Stateless) NACL과 상태유지(Stateful) 보안그룹의 왕복 동작을 확인하세요.',
      focusDeviceId: 'aws-db-eni',
      document: buildT11MigrationEndpointRebinding(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'reachable',
      expectedIntentVerdict: 'pass',
      learningNotes: [
        '클라우드 마이그레이션의 핵심: IP 숫자가 바뀌어도 "논리적 워크로드(app -> db)" 기준으로 이전 전(T02)과 이전 후(T11)를 비교합니다.',
        'AWS의 무상태(Stateless) NACL과 상태 유지(Stateful) 보안그룹(Security Group)의 차이까지 반영해 왕복 경로를 검증합니다.',
      ],
    },
    {
      id: 'T12',
      name: 'migration-policy-not-collected',
      shortTitleKo: 'AWS RDS 보안그룹 미수집 (보류)',
      storyGroupKo: '④ 사내 IDC ➔ AWS 클라우드 이관 비교',
      titleKo: 'T12 [AWS주의] DB를 AWS로 옮겼는데 RDS 보안그룹(SG) 확인이 안 됐을 때',
      categoryBadgeKo: '⚠️ AWS 이전 보류 (UNKNOWN)',
      phase: 'P3',
      precondition: 'DB moved to AWS but target/source policy evidence remains incomplete',
      situationKo: 'DB를 AWS(10.60.20.30)로 옮기는 전용선·라우팅 설계는 끝났지만, 정작 도착지인 AWS RDS의 보안그룹(Security Group) 규칙이 아직 수집되지 않았습니다.',
      whyResultKo: '라우팅만 보고 성급하게 "마이그레이션 문제없음(PASS)" 도장을 찍지 않고, 보안그룹 확인 전까지 판정 보류(UNKNOWN)로 전환 사고를 막아줍니다.',
      inspectionHintKo: '[✨ 원클릭 해결]을 눌러 AWS RDS 보안그룹(SG-RDS-5432-인바운드허용)이 수집되었을 때 전환 승인으로 바뀌는 과정을 시뮬레이션하세요.',
      focusDeviceId: 'aws-db-eni',
      document: buildT12MigrationPolicyNotCollected(),
      intent: DEFAULT_APP_TO_DB_INTENT,
      expectedNetworkOutcome: 'unknown',
      expectedIntentVerdict: 'unknown',
      learningNotes: [
        '좌측 메뉴의 [🔀 As-Is vs To-Be 마이그레이션 비교] 탭을 누르시면 사내 IDC(T02)와 AWS(T11/T12)를 좌우 한눈에 비교하실 수 있습니다.',
      ],
    },
  ];
}
