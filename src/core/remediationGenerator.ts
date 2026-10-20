import type {
  AnalysisResult,
  CommunicationIntent,
  DeviceModel,
  NetworkSnapshot,
  OnPremVendor,
  PolicyRuleModel,
  RouteModel,
  TraceStep,
} from './types';

export interface AfpHopDiagnostic {
  hopIndex: number;
  deviceId: string;
  deviceName: string;
  vendor: OnPremVendor;
  role: DeviceModel['role'];
  securityZone: string;
  ingressInterfaceName: string;
  ingressZone: string;
  egressInterfaceName: string;
  egressZone: string;
  status: 'ALREADY_ALLOWED' | 'ACTION_REQUIRED_POLICY' | 'ACTION_REQUIRED_ROUTE' | 'TRANSIT_OK';
  matchedRuleId?: string;
  matchedRuleName?: string;
  reasonCode: TraceStep['reasonCode'];
  reasonKo: string;
}

export interface FirewallRequestTicketRow {
  ticketSeq: number;
  requestType: '신규방화벽정책신청' | '기허용정책확인' | '라우팅/스위치작업';
  actionRequired: boolean;
  targetDeviceId: string;
  targetDeviceName: string;
  vendor: OnPremVendor;
  vendorLabelKo: string;
  srcZone: string;
  srcIp: string;
  dstZone: string;
  dstIp: string;
  natTranslation: string;
  protocol: string;
  port: string;
  recommendedRuleName: string;
  existingRuleRef: string;
  expirationDate: string;
  justificationKo: string;
}

export interface VendorCliSnippet {
  deviceId: string;
  deviceName: string;
  vendor: OnPremVendor;
  vendorLabelKo: string;
  osVersion: string;
  applyCli: string;
  rollbackCli: string;
}

export interface RemediationPlan {
  ticketNo: string;
  titleKo: string;
  overallStatus: 'ALL_OPEN' | 'REQUIRES_CHANGE';
  summaryKo: string;
  hopDiagnostics: AfpHopDiagnostic[];
  ticketRows: FirewallRequestTicketRow[];
  vendorCliSnippets: VendorCliSnippet[];
  suggestedPolicyRules: PolicyRuleModel[];
  suggestedRoutes: RouteModel[];
}

export function getVendorLabelKo(vendor?: OnPremVendor): string {
  switch (vendor) {
    case 'paloalto':
      return 'Palo Alto (PAN-OS)';
    case 'fortinet':
      return 'Fortinet (FortiGate FortiOS)';
    case 'secui':
      return '시큐아이 (BLUEMAX NGF)';
    case 'ahnlab':
      return '안랩 (TrusGuard)';
    case 'cisco':
      return 'Cisco (IOS / NX-OS)';
    case 'juniper':
      return 'Juniper (Junos OS)';
    case 'arista':
      return 'Arista (EOS)';
    case 'f5':
      return 'F5 Networks (BIG-IP TMOS)';
    case 'linux':
      return 'Linux (iproute2 / iptables)';
    default:
      return '범용 온프레미스 장비';
  }
}

function inferVendor(device: DeviceModel): OnPremVendor {
  if (device.vendor) return device.vendor;
  const lower = device.name.toLowerCase();
  if (lower.includes('palo') || lower.includes('pa-') || lower.includes('pa5')) return 'paloalto';
  if (lower.includes('forti') || lower.includes('fg')) return 'fortinet';
  if (lower.includes('bluemax') || lower.includes('secui') || lower.includes('시큐아이')) return 'secui';
  if (lower.includes('trusguard') || lower.includes('ahnlab') || lower.includes('안랩')) return 'ahnlab';
  if (lower.includes('juniper') || lower.includes('srx') || lower.includes('mx') || lower.includes('qfx')) return 'juniper';
  if (lower.includes('arista') || lower.includes('eos')) return 'arista';
  if (lower.includes('cisco') || lower.includes('nexus') || lower.includes('catalyst')) return 'cisco';
  if (lower.includes('f5') || lower.includes('big-ip') || lower.includes('bigip')) return 'f5';
  if (device.role === 'host') return 'linux';
  return 'cisco';
}

function buildFirewallCliForVendor(params: {
  vendor: OnPremVendor;
  device: DeviceModel;
  ruleName: string;
  srcZone: string;
  dstZone: string;
   ingressIfName: string;
  egressIfName: string;
  srcIp: string;
  dstIp: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  port?: number;
  ticketNo: string;
  expirationDate: string;
}): { applyCli: string; rollbackCli: string } {
  const {
    vendor,
    ruleName,
    srcZone,
    dstZone,
    ingressIfName,
    egressIfName,
    srcIp,
    dstIp,
    protocol,
    port,
    ticketNo,
    expirationDate,
  } = params;
  const protoUpper = protocol.toUpperCase();
  const portStr = port ? String(port) : 'ANY';
  const serviceObjName = port ? `SVC_${protoUpper}_${port}` : 'any';

  switch (vendor) {
    case 'paloalto':
      return {
        applyCli: [
          `# [Palo Alto PAN-OS] ${params.device.name} 방화벽 정책 투입 스크립트 (${ticketNo})`,
          `configure`,
          ...(port
            ? [
                `set service ${serviceObjName} protocol ${protocol} port ${port}`,
              ]
            : []),
          `set rulebase security rules ${ruleName} from "${srcZone}" to "${dstZone}" source ${srcIp}/32 destination ${dstIp}/32 application any service ${serviceObjName} action allow log-end yes description "${ticketNo} Exp:${expirationDate}"`,
          `commit description "${ticketNo} 방화벽 정책 반영"`,
          `exit`,
        ].join('\n'),
        rollbackCli: [
          `# [Palo Alto PAN-OS 원복(Rollback)]`,
          `configure`,
          `delete rulebase security rules ${ruleName}`,
          `commit description "Rollback ${ticketNo}"`,
          `exit`,
        ].join('\n'),
      };

    case 'fortinet':
      return {
        applyCli: [
          `# [Fortinet FortiOS] ${params.device.name} 방화벽 정책 투입 스크립트 (${ticketNo})`,
          `config firewall address`,
          `    edit "H_${srcIp}"`,
          `        set subnet ${srcIp} 255.255.255.255`,
          `    next`,
          `    edit "H_${dstIp}"`,
          `        set subnet ${dstIp} 255.255.255.255`,
          `    next`,
          `end`,
          ...(port
            ? [
                `config firewall service custom`,
                `    edit "${serviceObjName}"`,
                `        set protocol TCP/UDP/SCTP`,
                `        set ${protocol}-portrange ${port}`,
                `    next`,
                `end`,
              ]
            : []),
          `config firewall policy`,
          `    edit 0`,
          `        set name "${ruleName}"`,
          `        set srcintf "${ingressIfName}"`,
          `        set dstintf "${egressIfName}"`,
          `        set srcaddr "H_${srcIp}"`,
          `        set dstaddr "H_${dstIp}"`,
          `        set action accept`,
          `        set schedule "always"`,
          `        set service "${port ? serviceObjName : 'ALL'}"`,
          `        set logtraffic all`,
          `        set comments "${ticketNo} (만료일: ${expirationDate})"`,
          `    next`,
          `end`,
        ].join('\n'),
        rollbackCli: [
          `# [Fortinet FortiOS 원복(Rollback)]`,
          `config firewall policy`,
          `    delete "${ruleName}"`,
          `end`,
        ].join('\n'),
      };

    case 'secui':
      return {
        applyCli: [
          `# [시큐아이 BLUEMAX NGF] ${params.device.name} 방화벽 정책 작업 지시서 (${ticketNo})`,
          `configure terminal`,
          `object network host H_${srcIp} ip ${srcIp}/32`,
          `object network host H_${dstIp} ip ${dstIp}/32`,
          ...(port ? [`object service ${serviceObjName} proto ${protocol} dst-port ${port}`] : []),
          `firewall policy add rule-name "${ruleName}" \\`,
          `  src-zone "${srcZone}" src-object "H_${srcIp}" \\`,
          `  dst-zone "${dstZone}" dst-object "H_${dstIp}" \\`,
          `  service "${port ? serviceObjName : 'ANY'}" action permit log enable \\`,
          `  expire-date "${expirationDate}" description "${ticketNo}"`,
          `firewall policy commit`,
          `exit`,
        ].join('\n'),
        rollbackCli: [
          `# [시큐아이 BLUEMAX NGF 원복(Rollback)]`,
          `configure terminal`,
          `firewall policy delete rule-name "${ruleName}"`,
          `firewall policy commit`,
          `exit`,
        ].join('\n'),
      };

    case 'ahnlab':
      return {
        applyCli: [
          `# [안랩 TrusGuard] ${params.device.name} 방화벽 정책 작업 지시서 (${ticketNo})`,
          `config`,
          `object ip_address add name "H_${srcIp}" ip "${srcIp}/32"`,
          `object ip_address add name "H_${dstIp}" ip "${dstIp}/32"`,
          ...(port ? [`object service add name "${serviceObjName}" protocol ${protoUpper} port ${port}`] : []),
          `policy ipv4 add rule_name "${ruleName}" \\`,
          `  in_if "${ingressIfName}" out_if "${egressIfName}" \\`,
          `  src_addr "H_${srcIp}" dst_addr "H_${dstIp}" \\`,
          `  service "${port ? serviceObjName : 'ANY'}" action allow log enable \\`,
          `  expire "${expirationDate}" desc "${ticketNo}"`,
          `apply`,
          `save`,
        ].join('\n'),
        rollbackCli: [
          `# [안랩 TrusGuard 원복(Rollback)]`,
          `config`,
          `policy ipv4 del rule_name "${ruleName}"`,
          `apply`,
          `save`,
        ].join('\n'),
      };

    case 'juniper':
      return {
        applyCli: [
          `# [Juniper Junos OS] ${params.device.name} 보안 정책 투입 스크립트 (${ticketNo})`,
          `configure`,
          ...(port
            ? [`set applications application ${serviceObjName} protocol ${protocol} destination-port ${port}`]
            : []),
          `set security zones security-zone ${srcZone} address-book address H_${srcIp} ${srcIp}/32`,
          `set security zones security-zone ${dstZone} address-book address H_${dstIp} ${dstIp}/32`,
          `set security policies from-zone ${srcZone} to-zone ${dstZone} policy ${ruleName} match source-address H_${srcIp} destination-address H_${dstIp} application ${port ? serviceObjName : 'any'}`,
          `set security policies from-zone ${srcZone} to-zone ${dstZone} policy ${ruleName} then permit`,
          `set security policies from-zone ${srcZone} to-zone ${dstZone} policy ${ruleName} then log session-close`,
          `commit check`,
          `commit comment "${ticketNo}"`,
        ].join('\n'),
        rollbackCli: [
          `# [Juniper Junos OS 원복(Rollback)]`,
          `configure`,
          `rollback 1`,
          `commit comment "Rollback ${ticketNo}"`,
        ].join('\n'),
      };

    case 'linux':
      return {
        applyCli: [
          `# [Linux iptables / nftables] ${params.device.name} 호스트 방화벽 허용 (${ticketNo})`,
          `sudo iptables -I FORWARD 1 -s ${srcIp}/32 -d ${dstIp}/32 -p ${protocol}${port ? ` --dport ${port}` : ''} -m comment --comment "${ruleName}" -j ACCEPT`,
          `sudo iptables-save | sudo tee /etc/sysconfig/iptables >/dev/null`,
        ].join('\n'),
        rollbackCli: [
          `# [Linux iptables 원복(Rollback)]`,
          `sudo iptables -D FORWARD -s ${srcIp}/32 -d ${dstIp}/32 -p ${protocol}${port ? ` --dport ${port}` : ''} -m comment --comment "${ruleName}" -j ACCEPT`,
        ].join('\n'),
      };

    default:
      return {
        applyCli: [
          `! [Cisco IOS/NX-OS / Arista EOS] ${params.device.name} ACL 허용 (${ticketNo})`,
          `configure terminal`,
          `ip access-list extended ACL_${srcZone.toUpperCase()}_IN`,
          `  remark ${ticketNo} ${ruleName} (Exp: ${expirationDate})`,
          `  10 permit ${protocol} host ${srcIp} host ${dstIp}${port ? ` eq ${portStr}` : ''}`,
          `end`,
          `write memory`,
        ].join('\n'),
        rollbackCli: [
          `! [Cisco / Arista ACL 원복(Rollback)]`,
          `configure terminal`,
          `ip access-list extended ACL_${srcZone.toUpperCase()}_IN`,
          `  no 10`,
          `end`,
        ].join('\n'),
      };
  }
}

function buildRouteCliForVendor(params: {
  vendor: OnPremVendor;
  device: DeviceModel;
  dstPrefix: string;
  nextHopIp: string;
  egressIfName: string;
  ticketNo: string;
}): { applyCli: string; rollbackCli: string } {
  const { vendor, device, dstPrefix, nextHopIp, egressIfName, ticketNo } = params;
  switch (vendor) {
    case 'juniper':
      return {
        applyCli: [
          `# [Juniper Junos OS] ${device.name} 정적 라우팅 추가 (${ticketNo})`,
          `configure`,
          `set routing-options static route ${dstPrefix} next-hop ${nextHopIp}`,
          `commit check`,
          `commit comment "${ticketNo} Static Route"`,
        ].join('\n'),
        rollbackCli: [
          `configure`,
          `delete routing-options static route ${dstPrefix} next-hop ${nextHopIp}`,
          `commit comment "Rollback ${ticketNo}"`,
        ].join('\n'),
      };
    case 'fortinet':
      return {
        applyCli: [
          `# [Fortinet FortiOS] ${device.name} 정적 라우팅 추가 (${ticketNo})`,
          `config router static`,
          `    edit 0`,
          `        set dst ${dstPrefix}`,
          `        set gateway ${nextHopIp}`,
          `        set device "${egressIfName}"`,
          `        set comment "${ticketNo}"`,
          `    next`,
          `end`,
        ].join('\n'),
        rollbackCli: `# FortiOS에서 해당 Static Route ID 삭제`,
      };
    case 'paloalto':
      return {
        applyCli: [
          `# [Palo Alto PAN-OS] ${device.name} Virtual Router 정적 라우팅 추가 (${ticketNo})`,
          `configure`,
          `set network virtual-router default routing-table ip static-route RT_${dstPrefix.replace(/[./]/g, '_')} destination ${dstPrefix} interface ${egressIfName} next-hop ip-address ${nextHopIp}`,
          `commit`,
        ].join('\n'),
        rollbackCli: [
          `configure`,
          `delete network virtual-router default routing-table ip static-route RT_${dstPrefix.replace(/[./]/g, '_')}`,
          `commit`,
        ].join('\n'),
      };
    case 'linux':
      return {
        applyCli: [
          `# [Linux iproute2] ${device.name} 라우팅 테이블 추가 (${ticketNo})`,
          `sudo ip route replace ${dstPrefix} via ${nextHopIp} dev ${egressIfName}`,
        ].join('\n'),
        rollbackCli: `sudo ip route del ${dstPrefix} via ${nextHopIp} dev ${egressIfName}`,
      };
    default:
      return {
        applyCli: [
          `! [${getVendorLabelKo(vendor)}] ${device.name} 정적 라우팅 추가 (${ticketNo})`,
          `configure terminal`,
          `ip route ${dstPrefix} ${nextHopIp}`,
          `end`,
          `write memory`,
        ].join('\n'),
        rollbackCli: [
          `configure terminal`,
          `no ip route ${dstPrefix} ${nextHopIp}`,
          `end`,
        ].join('\n'),
      };
  }
}

/**
 * AFP (Automatic Firewall Pathfinding) & 벤더별 작업지시서/신청서 생성 엔진
 */
export function generateRemediationPlan(
  snapshot: NetworkSnapshot,
  intent: CommunicationIntent,
  result: AnalysisResult,
  options?: { ticketNo?: string; titleKo?: string; expirationDate?: string },
): RemediationPlan {
  const ticketNo = options?.ticketNo ?? `SR-2026-${Math.floor(1000 + (intent.destinationPort ?? 443) % 8999)}`;
  const expirationDate = options?.expirationDate ?? '2027-10-21';
  const deviceMap = new Map(snapshot.devices.map((d) => [d.id, d]));
  const ifMap = new Map(snapshot.interfaces.map((i) => [i.id, i]));
  const policyMap = new Map(snapshot.policies.map((p) => [p.id, p]));

  const srcBinding = snapshot.bindings[intent.sourceWorkload];
  const dstBinding = snapshot.bindings[intent.destinationWorkload];
  const srcIp = srcBinding?.ip ?? result.forwardTrace.flow.srcIp;
  const dstIp = dstBinding?.ip ?? result.forwardTrace.flow.dstIp;

  // F5 VIP NAT 매핑 탐지
  let natTranslation = 'NAT 없음 (Real IP 직결)';
  for (const dev of snapshot.devices) {
    for (const vip of dev.vipMappings ?? []) {
      if (vip.vipIp === dstIp || vip.poolMembers.some((m) => m.ip === dstIp)) {
        natTranslation = `${dev.name}: VIP ${vip.vipIp}:${vip.vipPort} ➔ Pool(${vip.poolName}) Real IP ${dstIp}`;
      }
    }
  }

  // 경유 장비별로 Step 그룹화 (Forward + Reverse 경로 통합 진단)
  const allSteps: Array<{ traceDir: 'forward' | 'reverse'; step: TraceStep }> = [
    ...result.forwardTrace.steps.map((step) => ({ traceDir: 'forward' as const, step })),
    ...(result.reverseTrace?.steps.map((step) => ({ traceDir: 'reverse' as const, step })) ?? []),
  ];

  const hopDiagnostics: AfpHopDiagnostic[] = [];
  const ticketRows: FirewallRequestTicketRow[] = [];
  const vendorCliSnippets: VendorCliSnippet[] = [];
  const suggestedPolicyRules: PolicyRuleModel[] = [];
  const suggestedRoutes: RouteModel[] = [];

  const visitedHopKeys = new Set<string>();
  const forwardPolicyRequiredDevices = new Set<string>();
  let hopCounter = 1;
  let ticketCounter = 1;

  for (const { traceDir, step } of allSteps) {
    const dev = deviceMap.get(step.deviceId);
    if (!dev) continue;

    // Stateful 방화벽에서 정방향(Forward) 신규 허용 정책이 이미 생성된 경우,
    // 동일 장비의 역방향(Reverse) 응답 패킷은 Stateful 세션 테이블에 의해 자동 허용되므로 중복 신청 제외
    if (
      traceDir === 'reverse' &&
      step.stage === 'POLICY_EVAL' &&
      forwardPolicyRequiredDevices.has(dev.id)
    ) {
      continue;
    }

    const vendor = inferVendor(dev);
    const ingressIf = step.ingressInterfaceId ? ifMap.get(step.ingressInterfaceId) : undefined;
    const egressIf = step.egressInterfaceId ? ifMap.get(step.egressInterfaceId) : undefined;

    // 해당 장비에서 가장 중요한 이벤트(정책 평가 또는 라우팅 실패) 추출
    if (
      step.stage === 'POLICY_EVAL' ||
      step.reasonCode === 'NO_ROUTE' ||
      step.reasonCode === 'ROUTING_TABLE_INCOMPLETE' ||
      step.reasonCode === 'TRUNK_VLAN_MISSING'
    ) {
      const hopKey = `${traceDir}:${dev.id}:${step.stage}:${step.reasonCode}`;
      if (visitedHopKeys.has(hopKey)) continue;
      visitedHopKeys.add(hopKey);

      // 동일 장비의 앞뒤 스텝에서 ingress / egress 인터페이스 보완
      const deviceSteps = allSteps
        .filter((s) => s.traceDir === traceDir && s.step.deviceId === dev.id)
        .map((s) => s.step);
      const resolvedIngressIf =
        ingressIf ??
        deviceSteps.map((s) => (s.ingressInterfaceId ? ifMap.get(s.ingressInterfaceId) : undefined)).find(Boolean);
      const resolvedEgressIf =
        egressIf ??
        deviceSteps.map((s) => (s.egressInterfaceId ? ifMap.get(s.egressInterfaceId) : undefined)).find(Boolean);

      const ingressIfName = resolvedIngressIf?.name ?? 'eth0';
      const egressIfName = resolvedEgressIf?.name ?? 'eth1';
      const ingressZone = resolvedIngressIf?.zone ?? dev.securityZone ?? 'Trust';
      const egressZone = resolvedEgressIf?.zone ?? dev.securityZone ?? 'Untrust';

      const flowSrcIp = step.beforeHeader.srcIp;
      const flowDstIp = step.beforeHeader.dstIp;
      const flowProto = step.beforeHeader.protocol;
      const flowPort = step.beforeHeader.dstPort;

      if (step.stage === 'POLICY_EVAL' && step.outcome === 'continue') {
        const matchedPolicy = step.referencedPolicyId ? policyMap.get(step.referencedPolicyId) : undefined;
        hopDiagnostics.push({
          hopIndex: hopCounter++,
          deviceId: dev.id,
          deviceName: dev.name,
          vendor,
          role: dev.role,
          securityZone: dev.securityZone ?? '보안관문',
          ingressInterfaceName: ingressIfName,
          ingressZone,
          egressInterfaceName: egressIfName,
          egressZone,
          status: 'ALREADY_ALLOWED',
          matchedRuleId: matchedPolicy?.id,
          matchedRuleName: matchedPolicy?.name,
          reasonCode: step.reasonCode,
          reasonKo: `기허용 정책 매칭 완료 (${matchedPolicy?.name ?? step.referencedPolicyId ?? 'Stateful Return'}) — 추가 작업 불필요`,
        });

        if (traceDir === 'forward') {
          ticketRows.push({
            ticketSeq: ticketCounter++,
            requestType: '기허용정책확인',
            actionRequired: false,
            targetDeviceId: dev.id,
            targetDeviceName: dev.name,
            vendor,
            vendorLabelKo: getVendorLabelKo(vendor),
            srcZone: ingressZone,
            srcIp: `${flowSrcIp}/32`,
            dstZone: egressZone,
            dstIp: `${flowDstIp}/32`,
            natTranslation,
            protocol: flowProto.toUpperCase(),
            port: flowPort ? String(flowPort) : 'ANY',
            recommendedRuleName: matchedPolicy?.name ?? 'STATEFUL_SESSION_PASS',
            existingRuleRef: `${matchedPolicy?.id ?? 'stateful'} (기허용)`,
            expirationDate: matchedPolicy?.expiresAt ?? '상시운용',
            justificationKo: '경유 방화벽에 이미 허용 정책이 존재하여 신청 제외 가능',
          });
        }
      } else if (step.stage === 'POLICY_EVAL' && (step.outcome === 'blocked' || step.outcome === 'unknown')) {
        if (traceDir === 'forward') {
          forwardPolicyRequiredDevices.add(dev.id);
        }
        const ruleName = `ALLOW_${flowSrcIp.replace(/\./g, '_')}_TO_${flowDstIp.replace(/\./g, '_')}_${flowProto.toUpperCase()}${flowPort ? `_${flowPort}` : ''}`;

        hopDiagnostics.push({
          hopIndex: hopCounter++,
          deviceId: dev.id,
          deviceName: dev.name,
          vendor,
          role: dev.role,
          securityZone: dev.securityZone ?? '보안관문',
          ingressInterfaceName: ingressIfName,
          ingressZone,
          egressInterfaceName: egressIfName,
          egressZone,
          status: 'ACTION_REQUIRED_POLICY',
          reasonCode: step.reasonCode,
          reasonKo: `[신규 정책 신청 대상] ${ingressZone}(${ingressIfName}) ➔ ${egressZone}(${egressIfName}) 구간 ${flowProto.toUpperCase()}/${flowPort ?? 'ANY'} 허용 룰 미존재로 차단됨`,
        });

        ticketRows.push({
          ticketSeq: ticketCounter++,
          requestType: '신규방화벽정책신청',
          actionRequired: true,
          targetDeviceId: dev.id,
          targetDeviceName: dev.name,
          vendor,
          vendorLabelKo: getVendorLabelKo(vendor),
          srcZone: ingressZone,
          srcIp: `${flowSrcIp}/32`,
          dstZone: egressZone,
          dstIp: `${flowDstIp}/32`,
          natTranslation,
          protocol: flowProto.toUpperCase(),
          port: flowPort ? String(flowPort) : 'ANY',
          recommendedRuleName: ruleName,
          existingRuleRef: step.referencedPolicyId
            ? `명시적 차단룰(${step.referencedPolicyId}) 상위에 추가 필요`
            : '암묵적 차단(Default Deny) — 신규 등록 필요',
          expirationDate,
          justificationKo: options?.titleKo ?? intent.name ?? `${flowSrcIp} ➔ ${flowDstIp} 업무 연동 정책 신청`,
        });

        const cli = buildFirewallCliForVendor({
          vendor,
          device: dev,
          ruleName,
          srcZone: ingressZone,
          dstZone: egressZone,
          ingressIfName,
          egressIfName,
          srcIp: flowSrcIp,
          dstIp: flowDstIp,
          protocol: flowProto,
          port: flowPort,
          ticketNo,
          expirationDate,
        });

        vendorCliSnippets.push({
          deviceId: dev.id,
          deviceName: dev.name,
          vendor,
          vendorLabelKo: getVendorLabelKo(vendor),
          osVersion: dev.osVersion ?? getVendorLabelKo(vendor),
          applyCli: cli.applyCli,
          rollbackCli: cli.rollbackCli,
        });

        suggestedPolicyRules.push({
          id: `auto-${dev.id}-${Date.now().toString(36).slice(-4)}-${ticketCounter}`,
          deviceId: dev.id,
          name: ruleName,
          priority: 5,
          direction: 'forward',
          srcZone: ingressZone,
          dstZone: egressZone,
          srcPrefix: `${flowSrcIp}/32`,
          dstPrefix: `${flowDstIp}/32`,
          protocol: flowProto,
          dstPort: flowPort,
          action: 'allow',
          stateful: true,
          expiresAt: expirationDate,
          ticketId: ticketNo,
          description: `${ticketNo} 자동 설계 방화벽 허용 정책`,
        });
      } else if (step.reasonCode === 'NO_ROUTE' || step.reasonCode === 'ROUTING_TABLE_INCOMPLETE') {
        // 해당 장비의 연결된 인터페이스 중 적절한 업링크 탐색
        const devInterfaces = snapshot.interfaces.filter((i) => i.deviceId === dev.id);
        const fallbackIf = resolvedEgressIf ?? devInterfaces[0];
        const fallbackIfName = fallbackIf?.name ?? 'eth0';
        const dstSubnet = flowDstIp.split('.').slice(0, 3).join('.') + '.0/24';
        const peerLink = snapshot.links.find(
          (l) => l.aInterfaceId === fallbackIf?.id || l.bInterfaceId === fallbackIf?.id,
        );
        const peerIfId =
          peerLink?.aInterfaceId === fallbackIf?.id ? peerLink?.bInterfaceId : peerLink?.aInterfaceId;
        const peerIf = peerIfId ? ifMap.get(peerIfId) : undefined;
        const nextHopIp = (peerIf?.ip ? peerIf.ip.split('/')[0] : undefined) ?? '10.254.0.1';

        hopDiagnostics.push({
          hopIndex: hopCounter++,
          deviceId: dev.id,
          deviceName: dev.name,
          vendor,
          role: dev.role,
          securityZone: dev.securityZone ?? '코어/분배망',
          ingressInterfaceName: ingressIfName,
          ingressZone,
          egressInterfaceName: fallbackIfName,
          egressZone,
          status: 'ACTION_REQUIRED_ROUTE',
          reasonCode: step.reasonCode,
          reasonKo: `[라우팅 누락] 목적지 대역(${dstSubnet})으로 향하는 Static/Dynamic 경로가 라우팅 테이블에 없습니다.`,
        });

        ticketRows.push({
          ticketSeq: ticketCounter++,
          requestType: '라우팅/스위치작업',
          actionRequired: true,
          targetDeviceId: dev.id,
          targetDeviceName: dev.name,
          vendor,
          vendorLabelKo: getVendorLabelKo(vendor),
          srcZone: ingressZone,
          srcIp: `${flowSrcIp}/32`,
          dstZone: egressZone,
          dstIp: dstSubnet,
          natTranslation,
          protocol: 'L3-ROUTE',
          port: `Next-Hop ${nextHopIp}`,
          recommendedRuleName: `STATIC_ROUTE_${dstSubnet}`,
          existingRuleRef: '라우팅 누락 (NO_ROUTE)',
          expirationDate: '영구(라우팅)',
          justificationKo: `${dev.name}에서 ${dstSubnet} 대역 경로 추가 (${fallbackIfName} ➔ ${nextHopIp})`,
        });

        const cli = buildRouteCliForVendor({
          vendor,
          device: dev,
          dstPrefix: dstSubnet,
          nextHopIp,
          egressIfName: fallbackIfName,
          ticketNo,
        });

        vendorCliSnippets.push({
          deviceId: dev.id,
          deviceName: dev.name,
          vendor,
          vendorLabelKo: getVendorLabelKo(vendor),
          osVersion: dev.osVersion ?? getVendorLabelKo(vendor),
          applyCli: cli.applyCli,
          rollbackCli: cli.rollbackCli,
        });

        if (fallbackIf) {
          suggestedRoutes.push({
            id: `auto-rt-${dev.id}-${ticketCounter}`,
            deviceId: dev.id,
            destinationPrefix: dstSubnet,
            nextHopIp,
            egressInterfaceId: fallbackIf.id,
            protocol: 'static',
          });
        }
      }
    }
  }

  const requiredCount = ticketRows.filter((r) => r.actionRequired).length;
  const alreadyOpenCount = ticketRows.filter((r) => !r.actionRequired).length;
  const overallStatus = requiredCount === 0 && result.networkOutcome === 'reachable' ? 'ALL_OPEN' : 'REQUIRES_CHANGE';

  const summaryKo =
    overallStatus === 'ALL_OPEN'
      ? `출발지(${srcIp})에서 목적지(${dstIp}:${intent.destinationPort ?? 'ANY'})까지 경유하는 모든 방화벽(${alreadyOpenCount}개소) 및 L3 스위치 경로가 이미 정상 허용(ALLOW)되어 있습니다. 추가 방화벽 신청이 필요하지 않습니다.`
      : `경로 자동 탐색(AFP) 결과, 경유 구간 중 ${alreadyOpenCount}개 방화벽은 기허용 상태이며, ${requiredCount}개 장비(${ticketRows
          .filter((r) => r.actionRequired)
          .map((r) => r.targetDeviceName)
          .join(', ')})에 신규 정책/라우팅 작업이 필요합니다.`;

  return {
    ticketNo,
    titleKo: options?.titleKo ?? intent.name ?? `${srcIp} ➔ ${dstIp} 경로 분석 및 방화벽 정책 설계`,
    overallStatus,
    summaryKo,
    hopDiagnostics,
    ticketRows,
    vendorCliSnippets,
    suggestedPolicyRules,
    suggestedRoutes,
  };
}

/**
 * 사내 그룹웨어 결재 및 보안팀 제출용 방화벽 오픈 신청서 CSV 변환
 */
export function exportTicketsToCsv(plan: RemediationPlan): string {
  const headers = [
    '신청티켓번호',
    '순번',
    '신청구분',
    '작업필요여부',
    '대상장비명',
    '벤더/OS',
    '출발지Zone',
    '출발지IP',
    '목적지Zone',
    '목적지IP',
    'VIP/NAT변환',
    '프로토콜',
    '포트',
    '권고정책명',
    '기존정책매칭현황',
    '만료예정일',
    '신청사유',
  ];
  const rows = plan.ticketRows.map((r) =>
    [
      plan.ticketNo,
      r.ticketSeq,
      r.requestType,
      r.actionRequired ? '작업필수' : '기허용(제외가능)',
      r.targetDeviceName,
      r.vendorLabelKo,
      r.srcZone,
      r.srcIp,
      r.dstZone,
      r.dstIp,
      r.natTranslation,
      r.protocol,
      r.port,
      r.recommendedRuleName,
      r.existingRuleRef,
      r.expirationDate,
      r.justificationKo,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  );
  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}

/**
 * 사내 결재 문서 및 작업 지시서(MOP) Markdown 변환
 */
export function exportTicketsToMarkdown(plan: RemediationPlan): string {
  const lines: string[] = [
    `# [온프레미스 방화벽 정책 신청 및 작업 지시서] ${plan.ticketNo}`,
    `- **제목**: ${plan.titleKo}`,
    `- **AFP 자동 진단 요약**: ${plan.summaryKo}`,
    ``,
    `## 1. 경유 방화벽 정책 신청 내역표`,
    `| 순번 | 구분 | 작업여부 | 대상 방화벽/장비 | 벤더 | 출발지 Zone / IP | 목적지 Zone / IP | 서비스/포트 | 권고 정책명 | 만료일 |`,
    `| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- | :---: |`,
    ...plan.ticketRows.map(
      (r) =>
        `| ${r.ticketSeq} | ${r.requestType} | ${r.actionRequired ? '**신규신청**' : '기허용'} | ${r.targetDeviceName} | ${r.vendorLabelKo} | ${r.srcZone} (${r.srcIp}) | ${r.dstZone} (${r.dstIp}) | ${r.protocol}/${r.port} | \`${r.recommendedRuleName}\` | ${r.expirationDate} |`,
    ),
    ``,
    `## 2. 장비 담당자 투입용 벤더별 CLI 스크립트`,
  ];

  for (const snippet of plan.vendorCliSnippets) {
    lines.push(
      `### ${snippet.deviceName} (${snippet.vendorLabelKo})`,
      '```bash',
      snippet.applyCli,
      '```',
      `#### 비상 원복(Rollback) 스크립트`,
      '```bash',
      snippet.rollbackCli,
      '```',
      ``,
    );
  }

  return lines.join('\n');
}
