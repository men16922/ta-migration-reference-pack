import type { DeviceModel, NetworkSnapshot, OnPremVendor, PolicyRuleModel } from './types';
import { getVendorLabelKo } from './remediationGenerator';

export type AuditFindingKind =
  | 'SHADOWED'
  | 'REDUNDANT'
  | 'PARTIAL_OVERLAP'
  | 'OVERLY_PERMISSIVE'
  | 'HIGH_RISK_PORT'
  | 'EXPIRED_OR_UNUSED';

export type AuditSeverity = 'critical' | 'high' | 'medium';

export interface FirewallAuditFinding {
  id: string;
  deviceId: string;
  deviceName: string;
  vendor: OnPremVendor;
  vendorLabelKo: string;
  ruleId: string;
  ruleName: string;
  rulePriority: number;
  kind: AuditFindingKind;
  kindLabelKo: string;
  severity: AuditSeverity;
  ismsComplianceRef: string;
  maskingRuleId?: string;
  maskingRuleName?: string;
  residualCidrs?: string[];
  luciMatchSummary?: string;
  detailKo: string;
  recommendationKo: string;
  cleanupCli: string;
}

export interface FirewallAuditReport {
  totalRulesScanned: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  complianceScore: number; // 0 ~ 100
  findings: FirewallAuditFinding[];
}

// ============================================================================
// REA Reverse-Engineered CIDR Interval Algebra from `cidr-tools@13.0.4`
// Evidence ID: ev_0fcaead6f4cd53e6e210930a5c333e12be87b06ba5120f2449710aed8e345ba8
// Root Artifact SHA-256: 2198cdf2e9be128f2575e543b9cc8c2b54d5f0078e93b19d533bb849835bb19a
// ============================================================================

export interface Ipv4Interval {
  start: number;
  end: number;
  prefixLen: number;
}

const HOST_MASKS_4 = Int32Array.from({ length: 33 }, (_, i) => (i === 32 ? -1 : (1 << i) - 1));

export function formatIPv4Fast(n: number): string {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

export function ipToUint32(ip: string): number {
  const parts = ip.trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return 0;
  }
  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = parts;
  return (((p0 << 24) >>> 0) + (p1 << 16) + (p2 << 8) + p3) >>> 0;
}

export function parseCidrRange(cidr?: string): Ipv4Interval {
  const normalized =
    !cidr || cidr === 'any' || cidr === '*' ? '0.0.0.0/0' : cidr.includes('/') ? cidr : `${cidr}/32`;
  const [ipStr = '0.0.0.0', lenStr = '32'] = normalized.split('/');
  const prefixLen = Math.max(0, Math.min(32, Number(lenStr)));
  const v4num = ipToUint32(ipStr);
  const mask = HOST_MASKS_4[Math.max(32 - prefixLen, 0)] ?? 0;
  const start = (v4num & ~mask) >>> 0;
  const end = (v4num | mask) >>> 0;
  return { start, end, prefixLen };
}

function biggestPowerOfTwo4(num: number): number {
  if (num >= 4294967296) return 4294967296;
  return (1 << (31 - Math.clz32(num))) >>> 0;
}

/**
 * Reconstructed from `cidr-tools` `subparts4`:
 * Decomposes an arbitrary [pStart, pEnd] IPv4 integer interval into the minimal set of aligned CIDR blocks.
 */
export function subparts4(pStart: number, pEnd: number): string[] {
  const output: string[] = [];
  let start = pStart;
  while (start <= pEnd) {
    const size = pEnd - start + 1;
    const lowBit = (start & -start) >>> 0;
    const blockSize = lowBit !== 0 && lowBit <= size ? lowBit : biggestPowerOfTwo4(size);
    const prefixLen = Math.clz32(blockSize - 1);
    output.push(`${formatIPv4Fast(start)}/${prefixLen}`);
    start += blockSize;
    if (blockSize === 0) break;
  }
  return output;
}

/**
 * Reconstructed from `cidr-tools` `mergeIntervalsRaw4`:
 * Coalesces overlapping and adjacent IPv4 intervals.
 */
export function mergeIntervalsRaw4(
  intervals: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (intervals.length < 2) return intervals.map((iv) => ({ ...iv }));
  const sorted = intervals
    .map((iv) => ({ ...iv }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  let cur = sorted[0]!;
  merged.push(cur);
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start <= cur.end + 1) {
      if (next.end > cur.end) cur.end = next.end;
    } else {
      cur = { start: next.start, end: next.end };
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Reconstructed from `cidr-tools` `subtractSorted4` & `excludeCidr`:
 * Subtracts `excludeCidrs` from `baseCidrs` and returns the minimal aligned CIDR list.
 */
export function excludeCidr4(baseCidrs: string[], excludeCidrs: string[]): string[] {
  const bases = mergeIntervalsRaw4(baseCidrs.map((c) => parseCidrRange(c)));
  const excls = mergeIntervalsRaw4(excludeCidrs.map((c) => parseCidrRange(c)));
  if (excls.length === 0) {
    return bases.flatMap((b) => subparts4(b.start, b.end));
  }
  const remainders: Array<{ start: number; end: number }> = [];
  let j = 0;
  for (const base of bases) {
    let start = base.start;
    const end = base.end;
    while (j < excls.length && excls[j]!.end < start) j++;
    let k = j;
    while (k < excls.length && excls[k]!.start <= end && start <= end) {
      const excl = excls[k]!;
      if (excl.start > start) {
        remainders.push({ start, end: excl.start - 1 });
      }
      start = excl.end + 1;
      k++;
    }
    if (start <= end) {
      remainders.push({ start, end });
    }
  }
  return remainders.flatMap((r) => subparts4(r.start, r.end));
}

/**
 * Reconstructed from `cidr-tools` `containsCidr`:
 * Checks whether an array of earlier CIDRs (possibly coalesced across multiple rules)
 * 100% covers `targetCidr`.
 */
export function containsCoalescedCidr4(coveringCidrs: string[], targetCidr?: string): boolean {
  if (coveringCidrs.length === 0) return false;
  const target = parseCidrRange(targetCidr);
  const v4a = coveringCidrs.map((c) => parseCidrRange(c)).sort((a, b) => a.start - b.start);
  let cur = target.start;
  for (const iv of v4a) {
    if (iv.start > cur) break;
    if (iv.end >= cur) {
      if (iv.end >= target.end) return true;
      cur = iv.end + 1;
    }
  }
  return false;
}

export function isPrefixSubset(subCidr?: string, superCidr?: string): boolean {
  return containsCoalescedCidr4([superCidr ?? '0.0.0.0/0'], subCidr);
}

export function isPrefixOverlap(cidrA?: string, cidrB?: string): boolean {
  const a = parseCidrRange(cidrA);
  const b = parseCidrRange(cidrB);
  return a.start <= b.end && b.start <= a.end;
}

// ============================================================================
// REA Reverse-Engineered Rule Formatter from `luci-app-firewall@24.10.0`
// Evidence ID: ev_ee089d1b0150593078dc07661106acee493af7672748a49a7200708085f3515a
// Root Artifact SHA-256: 8a31e0eb8abf74df92818d462ceecebac66e476fc2d279e426f8677fa999f5ad
// ============================================================================

export function synthesizeLuciRuleSummary(rule: PolicyRuleModel): string {
  const dirLabel =
    rule.direction === 'forward'
      ? 'Forwarded'
      : rule.direction === 'ingress'
        ? 'Incoming'
        : 'Outgoing';
  const protoLabel = rule.protocol === 'any' ? 'any protocol' : `protocol ${rule.protocol.toUpperCase()}`;
  const srcZoneLabel = rule.srcZone ? `Zone [${rule.srcZone}]` : 'any zone';
  const dstZoneLabel = rule.dstZone ? `Zone [${rule.dstZone}]` : 'any zone';
  const portLabel = rule.dstPort !== undefined ? `, port ${rule.dstPort}` : '';
  const actionLabel = rule.action === 'allow' ? 'ACCEPT' : 'DROP/REJECT';
  return `${dirLabel} IPv4, ${protoLabel} | From ${srcZoneLabel} IP ${rule.srcPrefix ?? '0.0.0.0/0'} ➔ To ${dstZoneLabel} IP ${rule.dstPrefix ?? '0.0.0.0/0'}${portLabel} ➔ [${actionLabel}]`;
}

export function isRuleSubsetOf(subRule: PolicyRuleModel, superRule: PolicyRuleModel): boolean {
  if (subRule.direction !== superRule.direction) return false;
  if (!isPrefixSubset(subRule.srcPrefix, superRule.srcPrefix)) return false;
  if (!isPrefixSubset(subRule.dstPrefix, superRule.dstPrefix)) return false;

  const protoMatch = superRule.protocol === 'any' || superRule.protocol === subRule.protocol;
  if (!protoMatch) return false;

  const portMatch = superRule.dstPort === undefined || superRule.dstPort === subRule.dstPort;
  return portMatch;
}

const HIGH_RISK_PORTS: Record<number, string> = {
  21: 'FTP (평문 파일전송)',
  23: 'Telnet (평문 원격터미널 - ISMS-P 금지)',
  445: 'SMB (랜섬웨어 전파 고위험 포트)',
  3389: 'RDP (원격 데스크톱 광역 노출)',
  1521: 'Oracle DB (DB 포트 광역 노출)',
  3306: 'MySQL DB (DB 포트 광역 노출)',
  5432: 'PostgreSQL DB (DB 포트 광역 노출)',
};

function buildCleanupCli(device: DeviceModel, vendor: OnPremVendor, rule: PolicyRuleModel): string {
  const ruleNameOrId = rule.name ?? rule.id;
  switch (vendor) {
    case 'paloalto':
      return [
        `# [Palo Alto PAN-OS] 비정상/위험 방화벽 정책 제거 (${rule.id})`,
        `configure`,
        `delete rulebase security rules ${ruleNameOrId}`,
        `commit description "Audit Cleanup: ${ruleNameOrId} (${rule.id})"`,
      ].join('\n');
    case 'fortinet':
      return [
        `# [Fortinet FortiOS] 비정상/위험 방화벽 정책 제거 (${rule.id})`,
        `config firewall policy`,
        `    delete "${ruleNameOrId}"`,
        `end`,
      ].join('\n');
    case 'secui':
      return [
        `# [시큐아이 BLUEMAX NGF] 보안감사 지적 정책 삭제 (${rule.id})`,
        `configure terminal`,
        `firewall policy delete rule-name "${ruleNameOrId}"`,
        `firewall policy commit`,
      ].join('\n');
    case 'ahnlab':
      return [
        `# [안랩 TrusGuard] 보안감사 지적 정책 삭제 (${rule.id})`,
        `config`,
        `policy ipv4 del rule_name "${ruleNameOrId}"`,
        `apply`,
        `save`,
      ].join('\n');
    case 'juniper':
      return [
        `# [Juniper Junos OS] 보안 정책 비활성화 및 삭제 (${rule.id})`,
        `configure`,
        `delete security policies from-zone ${rule.srcZone ?? 'Trust'} to-zone ${rule.dstZone ?? 'Untrust'} policy ${ruleNameOrId}`,
        `commit comment "Audit Cleanup ${rule.id}"`,
      ].join('\n');
    default:
      return [
        `! [${device.name}] ACL 룰 제거 (${rule.id})`,
        `configure terminal`,
        `no ip access-list extended ${ruleNameOrId}`,
        `end`,
      ].join('\n');
  }
}

/**
 * 온프레미스 방화벽 정책 전수 감사 엔진 (cidr-tools & luci-app-firewall 역공학 알고리즘 내장)
 */
export function auditFirewallPolicies(
  snapshot: NetworkSnapshot,
  referenceDate = '2026-10-21',
): FirewallAuditReport {
  const findings: FirewallAuditFinding[] = [];
  const firewalls = snapshot.devices.filter((d) => d.role === 'firewall' || d.enforcesPolicy);
  let totalRulesScanned = 0;

  for (const fw of firewalls) {
    const vendor: OnPremVendor = fw.vendor ?? 'paloalto';
    const vendorLabelKo = getVendorLabelKo(vendor);
    const rules = snapshot.policies
      .filter((p) => p.deviceId === fw.id)
      .slice()
      .sort((a, b) => a.priority - b.priority);

    totalRulesScanned += rules.length;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule) continue;
      const ruleName = rule.name ?? rule.id;
      const luciMatchSummary = synthesizeLuciRuleSummary(rule);

      // 1. 상위 우선순위 룰과의 관계 검사 (SHADOWED / REDUNDANT)
      let maskedByEarlier = false;
      for (let j = 0; j < i; j++) {
        const earlier = rules[j];
        if (!earlier) continue;
        if (isRuleSubsetOf(rule, earlier)) {
          maskedByEarlier = true;
          const earlierName = earlier.name ?? earlier.id;
          if (earlier.action !== rule.action) {
            findings.push({
              id: `audit-shadow-${rule.id}`,
              deviceId: fw.id,
              deviceName: fw.name,
              vendor,
              vendorLabelKo,
              ruleId: rule.id,
              ruleName,
              rulePriority: rule.priority,
              kind: 'SHADOWED',
              kindLabelKo: '가려진 죽은 정책 (Shadowed Rule)',
              severity: 'critical',
              ismsComplianceRef: 'ISMS-P 2.6.3 (접근통제 정책의 정합성 및 오설정 방지)',
              maskingRuleId: earlier.id,
              maskingRuleName: earlierName,
              luciMatchSummary,
              detailKo: `우선순위 ${rule.priority}번 [${ruleName}] (${rule.action.toUpperCase()}) 정책이 상위 ${earlier.priority}번 [${earlierName}] (${earlier.action.toUpperCase()}, ${earlier.srcPrefix ?? '0.0.0.0/0'} ➔ ${earlier.dstPrefix ?? '0.0.0.0/0'}) 정책에 100% 가려져 절대 실행되지 않습니다.`,
              recommendationKo: `상위 차단/허용 정책(${earlierName})과의 우선순위를 재조정하거나 불필요한 죽은 룰(${ruleName})을 즉시 삭제하십시오.`,
              cleanupCli: buildCleanupCli(fw, vendor, rule),
            });
          } else {
            findings.push({
              id: `audit-redundant-${rule.id}`,
              deviceId: fw.id,
              deviceName: fw.name,
              vendor,
              vendorLabelKo,
              ruleId: rule.id,
              ruleName,
              rulePriority: rule.priority,
              kind: 'REDUNDANT',
              kindLabelKo: '중복 정책 (Redundant Rule)',
              severity: 'medium',
              ismsComplianceRef: 'ISMS-P 2.6.3 (중복·불필요 방화벽 규칙 통폐합)',
              maskingRuleId: earlier.id,
              maskingRuleName: earlierName,
              luciMatchSummary,
              detailKo: `우선순위 ${rule.priority}번 [${ruleName}] 정책의 출발지·목적지·포트 범위가 상위 ${earlier.priority}번 [${earlierName}] 정책에 이미 완전히 포함되어 중복됩니다.`,
              recommendationKo: `방화벽 세션 테이블 성능 최적화 및 정책 가독성을 위해 하위 중복 정책(${ruleName})을 삭제하십시오.`,
              cleanupCli: buildCleanupCli(fw, vendor, rule),
            });
          }
          break;
        }
      }

      // 2. 고위험 포트 광역 오픈 검사 (HIGH_RISK_PORT) + cidr-tools excludeCidr4 잔여 대역 분해
      const riskPortDesc = rule.dstPort !== undefined ? HIGH_RISK_PORTS[rule.dstPort] : undefined;
      if (rule.action === 'allow' && rule.dstPort !== undefined && riskPortDesc) {
        const srcRange = parseCidrRange(rule.srcPrefix);
        if (srcRange.prefixLen < 24) {
          // cidr-tools excludeCidr4 알고리즘으로 점프호스트(10.90.10.0/24)를 제외한 과다 노출 잔여 CIDR 블록 산출
          const residualCidrs = excludeCidr4(
            [rule.srcPrefix ?? '0.0.0.0/0'],
            ['10.90.10.0/24'],
          ).slice(0, 6);
          findings.push({
            id: `audit-riskport-${rule.id}`,
            deviceId: fw.id,
            deviceName: fw.name,
            vendor,
            vendorLabelKo,
            ruleId: rule.id,
            ruleName,
            rulePriority: rule.priority,
            kind: 'HIGH_RISK_PORT',
            kindLabelKo: '고위험 포트 광역 허용 (High-Risk Port)',
            severity: 'critical',
            ismsComplianceRef: 'ISMS-P 2.6.2 / 금융보안원 망분리 가이드 (원격관리·평문포트 통제)',
            residualCidrs,
            luciMatchSummary,
            detailKo: `출발지 광역 대역(${rule.srcPrefix ?? '0.0.0.0/0'})에서 고위험 서비스 포트 TCP/${rule.dstPort} [${riskPortDesc}] 접근이 허용되어 있습니다 (비인가 노출 대역 예: ${residualCidrs.slice(0, 3).join(', ')} 외).`,
            recommendationKo: `출발지 IP를 지정된 관리자/점프호스트(/32)로 엄격히 제한하고, Telnet(23)은 SSH(22)로 전환 후 해당 룰을 삭제하십시오.`,
            cleanupCli: buildCleanupCli(fw, vendor, rule),
          });
        }
      }

      // 3. ANY 과다허용 정책 검사 (OVERLY_PERMISSIVE)
      if (rule.action === 'allow') {
        const isAnySrc = !rule.srcPrefix || rule.srcPrefix === '0.0.0.0/0' || rule.srcPrefix === 'any';
        const isAnyDst = !rule.dstPrefix || rule.dstPrefix === '0.0.0.0/0' || rule.dstPrefix === 'any';
        const isAnyService = rule.protocol === 'any' && rule.dstPort === undefined;
        if (isAnySrc || isAnyDst || isAnyService) {
          const reasons: string[] = [];
          if (isAnySrc) reasons.push('출발지 IP ANY(0.0.0.0/0)');
          if (isAnyDst) reasons.push('목적지 IP ANY(0.0.0.0/0)');
          if (isAnyService) reasons.push('서비스 프로토콜/포트 ANY');

          findings.push({
            id: `audit-any-${rule.id}`,
            deviceId: fw.id,
            deviceName: fw.name,
            vendor,
            vendorLabelKo,
            ruleId: rule.id,
            ruleName,
            rulePriority: rule.priority,
            kind: 'OVERLY_PERMISSIVE',
            kindLabelKo: '과다허용 정책 (ANY Open Rule)',
            severity: isAnySrc && isAnyService ? 'critical' : 'high',
            ismsComplianceRef: 'ISMS-P 2.6.2 (최소 권한 원칙 — ANY 정책 사용 금지)',
            luciMatchSummary,
            detailKo: `[${ruleName}] 정책에 [${reasons.join(', ')}] 조건이 설정되어 있어 보안 감사 시 중대 지적 대상입니다.`,
            recommendationKo: `실제 트래픽 로그(Hit 로그)를 기반으로 출발지/목적지/포트를 구체적인 호스트(/32) 및 필수 포트로 축소하십시오.`,
            cleanupCli: buildCleanupCli(fw, vendor, rule),
          });
        }
      }

      // 4. 만료 경과 또는 미사용 정책 검사 (EXPIRED_OR_UNUSED)
      const isExpired = Boolean(rule.expiresAt && rule.expiresAt < referenceDate);
      const isZeroHit = rule.hitCount === 0;
      if ((isExpired || isZeroHit) && !maskedByEarlier) {
        findings.push({
          id: `audit-expired-${rule.id}`,
          deviceId: fw.id,
          deviceName: fw.name,
          vendor,
          vendorLabelKo,
          ruleId: rule.id,
          ruleName,
          rulePriority: rule.priority,
          kind: 'EXPIRED_OR_UNUSED',
          kindLabelKo: isExpired ? `만료일 경과 정책 (${rule.expiresAt})` : '장기 미사용 정책 (Hit 0건)',
          severity: isExpired ? 'high' : 'medium',
          ismsComplianceRef: 'ISMS-P 2.6.3 (만료 및 장기 미사용 정책 반기별 회수 의무)',
          luciMatchSummary,
          detailKo: isExpired
            ? `신청 만료일(${rule.expiresAt})이 경과한 임시 정책(담당자: ${rule.owner ?? '미지정'}, 티켓: ${rule.ticketId ?? '-'})이 회수되지 않고 방화벽에 남아 있습니다.`
            : `누적 매칭 건수(Hit Count)가 0건인 장기 미사용 정책입니다.`,
          recommendationKo: `업무 담당자(${rule.owner ?? '신청부서'}) 확인 후 즉시 정책을 회수(삭제)하십시오.`,
          cleanupCli: buildCleanupCli(fw, vendor, rule),
        });
      }
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const penalty = criticalCount * 14 + highCount * 7 + mediumCount * 3;
  const complianceScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    totalRulesScanned,
    totalFindings: findings.length,
    criticalCount,
    highCount,
    mediumCount,
    complianceScore,
    findings,
  };
}
