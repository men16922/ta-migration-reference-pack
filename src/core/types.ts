export type LocationKind = 'idc' | 'aws';
export type NetworkOutcome = 'reachable' | 'blocked' | 'unknown';
export type IntentVerdict = 'pass' | 'fail' | 'unknown';
export type ProtocolKind = 'tcp' | 'udp' | 'icmp' | 'any';

export type OnPremVendor =
  | 'paloalto'
  | 'fortinet'
  | 'secui'
  | 'ahnlab'
  | 'cisco'
  | 'juniper'
  | 'arista'
  | 'f5'
  | 'linux'
  | 'generic';

export interface VipMappingModel {
  id: string;
  vipName: string;
  vipIp: string;
  vipPort: number;
  protocol: 'tcp' | 'udp';
  poolName: string;
  poolMembers: Array<{ ip: string; port: number; status?: 'up' | 'down' }>;
  snatAutomap?: boolean;
}

export type UnsupportedFeature =
  | 'nat'
  | 'pbr'
  | 'dynamic-routing-unconverged'
  | 'vrf-leak-unsupported'
  | 'l7-proxy-unmodeled';

export interface EvidenceProvenance {
  id: string;
  sourceType: 'synthetic-lab' | 'static-config' | 'containerlab-yaml' | 'aws-design-spec' | 'batfish-fixture';
  description: string;
  collectedAt?: string;
}

export interface DataCompleteness {
  routingTableComplete: boolean;
  policyTableComplete: boolean;
  l2ConfigComplete: boolean;
}

export interface L2DomainModel {
  id: string;
  name: string;
  vlanId: number;
  location: LocationKind;
}

export interface InterfaceModel {
  id: string;
  deviceId: string;
  name: string;
  ip?: string; // CIDR e.g. "172.28.10.10/24"
  vrf?: string; // defaults to "default"
  l2DomainId?: string;
  vlanId?: number;
  trunkVlans?: number[]; // allowed VLAN IDs when used as a switch trunk interface
  role?: 'data' | 'mgmt' | 'uplink';
  zone?: string; // e.g., "Untrust", "DMZ", "Internal-Work", "DB-Secure"
  description?: string;
}

export interface RouteModel {
  id: string;
  deviceId: string;
  vrf?: string; // defaults to "default"
  destinationPrefix: string; // CIDR e.g. "172.28.20.0/24" or "0.0.0.0/0"
  nextHopIp?: string; // omitted for connected routes
  egressInterfaceId: string;
  protocol: 'connected' | 'static' | 'aws-route-table';
  administrativeDistance?: number;
  evidenceId?: string;
}

export interface PolicyRuleModel {
  id: string;
  deviceId: string;
  name?: string;
  priority: number; // lower number = evaluated first
  direction: 'ingress' | 'egress' | 'forward';
  srcZone?: string;
  dstZone?: string;
  srcPrefix?: string; // default "0.0.0.0/0"
  dstPrefix?: string; // default "0.0.0.0/0"
  protocol: ProtocolKind;
  dstPort?: number;
  action: 'allow' | 'deny';
  kind?: 'firewall-acl' | 'aws-sg' | 'aws-nacl';
  stateful?: boolean; // e.g., true for AWS SG / stateful firewall
  hitCount?: number;
  lastHitAt?: string;
  expiresAt?: string;
  owner?: string;
  ticketId?: string;
  description?: string;
  evidenceId?: string;
}

export interface DeviceModel {
  id: string;
  name: string;
  role:
    | 'host'
    | 'router'
    | 'switch'
    | 'firewall'
    | 'aws-vpc-router'
    | 'aws-tgw'
    | 'aws-vgw'
    | 'aws-dxgw';
  location: LocationKind;
  vendor?: OnPremVendor;
  modelName?: string;
  osVersion?: string;
  securityZone?: string;
  mgmtIp?: string;
  vipMappings?: VipMappingModel[];
  completeness: DataCompleteness;
  enforcesPolicy?: boolean;
  defaultPolicyAction?: 'allow' | 'deny';
  unsupportedFeaturesOnPath?: UnsupportedFeature[];
  evidenceId?: string;
}

export interface LinkModel {
  id: string;
  aInterfaceId: string;
  bInterfaceId: string;
  kind?: 'ethernet' | 'trunk' | 'vpn' | 'dx' | 'tgw-attachment';
  requiredVlan?: number;
}

export interface WorkloadModel {
  id: string;
  name: string;
  tier?: 'app' | 'db' | 'web' | 'batch' | 'shared-service';
  description?: string;
}

export interface WorkloadBinding {
  workloadId: string;
  deviceId: string;
  interfaceId: string;
  ip: string; // host IP without CIDR e.g. "172.28.10.10"
  location: LocationKind;
}

export interface NetworkSnapshot {
  id: string;
  name: string;
  description?: string;
  workloads: WorkloadModel[];
  devices: DeviceModel[];
  interfaces: InterfaceModel[];
  l2Domains?: L2DomainModel[];
  links: LinkModel[];
  routes: RouteModel[];
  policies: PolicyRuleModel[];
  bindings: Record<string, WorkloadBinding>;
  evidences?: EvidenceProvenance[];
}

export interface NodeAnnotation {
  x: number;
  y: number;
  label?: string;
  group?: string;
  icon?: string;
}

export interface ViewAnnotations {
  snapshotId: string;
  nodes: Record<string, NodeAnnotation>;
  notes?: string[];
}

export interface TopologyDocument {
  schemaVersion: string;
  semantic: NetworkSnapshot;
  annotations: ViewAnnotations;
}

export interface CommunicationIntent {
  id: string;
  name?: string;
  sourceWorkload: string;
  destinationWorkload: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  destinationPort?: number;
  expectedNetworkOutcome: 'allow' | 'deny';
  requireReturnPath: boolean;
  categoryKo?: string;
  criticality?: 'critical' | 'high' | 'security-guard';
  descriptionKo?: string;
}

export interface AnalysisOptions {
  /**
   * IP Fabric-style diagnostic mode: continues tracing downstream hops after a policy/route drop
   * to reveal secondary issues, while strictly preserving `networkOutcome = 'blocked'`.
   */
  diagnosticContinueMode?: boolean;
}

export interface FlowHeader {
  srcIp: string;
  dstIp: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  dstPort?: number;
  vrf: string;
  vlanId?: number;
}

export type TraceStage =
  | 'ENDPOINT_INIT'
  | 'L2_SWITCHING'
  | 'TRUNK_VLAN_CHECK'
  | 'L3_ROUTING'
  | 'POLICY_EVAL'
  | 'LINK_TRANSIT'
  | 'COMPLETENESS_GUARD'
  | 'UNSUPPORTED_FEATURE_GUARD'
  | 'DESTINATION_DELIVERED';

export type StepOutcome = 'continue' | 'delivered' | 'blocked' | 'unknown';

export interface TraceStep {
  stepIndex: number;
  stage: TraceStage;
  deviceId: string;
  deviceName: string;
  ingressInterfaceId?: string;
  egressInterfaceId?: string;
  beforeHeader: FlowHeader;
  afterHeader: FlowHeader;
  outcome: StepOutcome;
  reasonCode:
    | 'ORIGINATED'
    | 'SAME_SUBNET_L2'
    | 'TRUNK_VLAN_ALLOWED'
    | 'TRUNK_VLAN_MISSING'
    | 'L2_CONFIG_INCOMPLETE'
    | 'ROUTE_MATCHED_CONNECTED'
    | 'ROUTE_MATCHED_STATIC'
    | 'ROUTE_MATCHED_AWS'
    | 'NO_ROUTE'
    | 'ROUTING_TABLE_INCOMPLETE'
    | 'VRF_MISMATCH'
    | 'POLICY_ALLOWED'
    | 'POLICY_DENIED'
    | 'POLICY_DATA_MISSING'
    | 'UNSUPPORTED_FEATURE'
    | 'HOP_LIMIT_EXCEEDED'
    | 'LINK_DOWN_OR_UNCONNECTED'
    | 'DELIVERED_TO_TARGET';
  reason: string;
  referencedRouteId?: string;
  referencedPolicyId?: string;
  evidenceId?: string;
  hypotheticalContinuation?: boolean;
}

export interface UnidirectionalTrace {
  direction: 'forward' | 'reverse';
  flow: FlowHeader;
  outcome: NetworkOutcome;
  steps: TraceStep[];
  finalReasonCode: TraceStep['reasonCode'] | 'BINDING_MISSING';
  finalReason: string;
}

export interface AnalysisResult {
  snapshotId: string;
  semanticHash: string;
  intentId: string;
  sourceBinding?: WorkloadBinding;
  destinationBinding?: WorkloadBinding;
  networkOutcome: NetworkOutcome;
  intentVerdict: IntentVerdict;
  forwardTrace: UnidirectionalTrace;
  reverseTrace?: UnidirectionalTrace;
  assumptions: string[];
  limitations: string[];
  uncollectedItems: string[];
}
