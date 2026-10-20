import { analyzeIntent } from './analyzer';
import type {
  AnalysisResult,
  CommunicationIntent,
  LocationKind,
  NetworkSnapshot,
} from './types';

export interface WorkloadBindingDiff {
  workloadId: string;
  workloadName: string;
  asIsIp?: string;
  toBeIp?: string;
  asIsLocation?: LocationKind;
  toBeLocation?: LocationKind;
  ipChanged: boolean;
  locationChanged: boolean;
}

export interface MigrationReviewWarning {
  code:
    | 'IP_REBOUND_VERIFY_DNS_AND_CONFIG'
    | 'INCOMPLETE_TARGET_POLICY_EVIDENCE'
    | 'INTENT_REGRESSION'
    | 'HYBRID_TRANSIT_DEPENDENCY'
    | 'NON_1TO1_VLAN_VPC_REMINDER';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface MigrationDiffReport {
  intent: CommunicationIntent;
  asIsResult: AnalysisResult;
  toBeResult: AnalysisResult;
  bindingDiffs: WorkloadBindingDiff[];
  asIsHops: string[];
  toBeHops: string[];
  verdictStatus: 'preserved-pass' | 'regressed-to-fail' | 'degraded-to-unknown' | 'improved-to-pass' | 'unchanged';
  warnings: MigrationReviewWarning[];
  summaryMarkdown: string;
}

function extractHopSequence(result: AnalysisResult): string[] {
  const hops: string[] = [];
  for (const step of result.forwardTrace.steps) {
    const label = `${step.deviceName} (${step.deviceId})`;
    if (hops[hops.length - 1] !== label) {
      hops.push(label);
    }
  }
  return hops;
}

export function compareMigrationSnapshots(
  asIsSnapshot: NetworkSnapshot,
  toBeSnapshot: NetworkSnapshot,
  intent: CommunicationIntent,
): MigrationDiffReport {
  const asIsResult = analyzeIntent(asIsSnapshot, intent);
  const toBeResult = analyzeIntent(toBeSnapshot, intent);

  const workloadIds = Array.from(
    new Set([
      intent.sourceWorkload,
      intent.destinationWorkload,
      ...Object.keys(asIsSnapshot.bindings),
      ...Object.keys(toBeSnapshot.bindings),
    ]),
  );

  const bindingDiffs: WorkloadBindingDiff[] = workloadIds.map((wId) => {
    const wModel =
      toBeSnapshot.workloads.find((w) => w.id === wId) ??
      asIsSnapshot.workloads.find((w) => w.id === wId);
    const bAsIs = asIsSnapshot.bindings[wId];
    const bToBe = toBeSnapshot.bindings[wId];
    return {
      workloadId: wId,
      workloadName: wModel?.name ?? wId,
      asIsIp: bAsIs?.ip,
      toBeIp: bToBe?.ip,
      asIsLocation: bAsIs?.location,
      toBeLocation: bToBe?.location,
      ipChanged: bAsIs?.ip !== bToBe?.ip,
      locationChanged: bAsIs?.location !== bToBe?.location,
    };
  });

  const asIsHops = extractHopSequence(asIsResult);
  const toBeHops = extractHopSequence(toBeResult);

  let verdictStatus: MigrationDiffReport['verdictStatus'] = 'unchanged';
  if (asIsResult.intentVerdict === 'pass' && toBeResult.intentVerdict === 'pass') {
    verdictStatus = 'preserved-pass';
  } else if (asIsResult.intentVerdict === 'pass' && toBeResult.intentVerdict === 'fail') {
    verdictStatus = 'regressed-to-fail';
  } else if (toBeResult.intentVerdict === 'unknown') {
    verdictStatus = 'degraded-to-unknown';
  } else if (asIsResult.intentVerdict !== 'pass' && toBeResult.intentVerdict === 'pass') {
    verdictStatus = 'improved-to-pass';
  }

  const warnings: MigrationReviewWarning[] = [
    {
      code: 'NON_1TO1_VLAN_VPC_REMINDER',
      severity: 'info',
      message:
        '[설계 원칙] 사내 IDC의 VLAN을 AWS VPC로 단순 1:1 치환하지 마십시오. 분리 목적, 가용영역(AZ) 배치, 서브넷 라우팅 테이블, 보안그룹(SG)과 NACL의 상태유지(Stateful) 차이를 별도로 검토해야 합니다.',
    },
  ];

  for (const diff of bindingDiffs) {
    if (diff.ipChanged) {
      warnings.push({
        code: 'IP_REBOUND_VERIFY_DNS_AND_CONFIG',
        severity: 'warning',
        message: `[IP 변경 주의] 워크로드 "${diff.workloadName}"(${diff.workloadId})의 IP 주소가 ${diff.asIsIp ?? '미지정'} → ${diff.toBeIp ?? '미지정'}(으)로 변경되었습니다. 애플리케이션 DB 접속 설정(Connection String), 내부 DNS 레코드, 하드코딩된 방화벽 IP 객체를 함께 수정해야 합니다.`,
      });
    }
    if (diff.locationChanged) {
      warnings.push({
        code: 'HYBRID_TRANSIT_DEPENDENCY',
        severity: 'info',
        message: `[하이브리드 공존 구간] "${diff.workloadName}"이(가) ${diff.asIsLocation?.toUpperCase()}에서 ${diff.toBeLocation?.toUpperCase()}로 이동했습니다. 전환 기간 동안 전용선(DX)/VPN/TGW 구간의 왕복 대칭 라우팅과 지연시간(Latency)을 반드시 확인하세요.`,
      });
    }
  }

  if (toBeResult.intentVerdict === 'unknown') {
    warnings.push({
      code: 'INCOMPLETE_TARGET_POLICY_EVIDENCE',
      severity: 'critical',
      message: `[전환 승인 보류 — 자료 미수집] 이전 후(To-Be) 판정이 UNKNOWN입니다 (${toBeResult.uncollectedItems.concat(toBeResult.limitations).join(' ')}). 누락된 AWS 보안그룹(SG)/NACL/라우팅 자료가 모두 확인되기 전까지 마이그레이션 전환(Cutover)을 승인하지 마십시오.`,
    });
  } else if (verdictStatus === 'regressed-to-fail') {
    warnings.push({
      code: 'INTENT_REGRESSION',
      severity: 'critical',
      message: `[통신 단절 경고] 이전 후(To-Be) 구성에서 "${intent.id}" 통신이 끊어졌습니다: 정방향=${toBeResult.forwardTrace.finalReasonCode}, 역방향=${toBeResult.reverseTrace?.finalReasonCode ?? 'N/A'}.`,
    });
  }

  const summaryMarkdown = [
    `# AWS 클라우드 이전 전·후 통신 의도(Intent) 비교 검토서 — \`${intent.id}\``,
    ``,
    `- **검증 대상 업무 통신**: \`${intent.sourceWorkload}\` → \`${intent.destinationWorkload}\` (${intent.protocol.toUpperCase()}${intent.destinationPort ? `/${intent.destinationPort}` : ''}, 목표 정책: \`${intent.expectedNetworkOutcome}\`, 왕복 응답 필수: \`${intent.requireReturnPath}\`)`,
    `- **이전 전 (As-Is: ${asIsSnapshot.id})**: 실제 통신=\`${asIsResult.networkOutcome}\` | 의도 판정=\`${asIsResult.intentVerdict}\` | 설정 해시=\`${asIsResult.semanticHash}\``,
    `- **이전 후 (To-Be: ${toBeSnapshot.id})**: 실제 통신=\`${toBeResult.networkOutcome}\` | 의도 판정=\`${toBeResult.intentVerdict}\` | 설정 해시=\`${toBeResult.semanticHash}\``,
    `- **최종 비교 결과**: **${verdictStatus.toUpperCase()}**`,
    ``,
    `## 1. 워크로드 위치 및 IP 주소 변경 내역`,
    `| 워크로드 | 이전 전 (사내 IDC) | 이전 후 (AWS 클라우드) | 변경 여부 |`,
    `|---|---|---|---|`,
    ...bindingDiffs.map(
      (d) =>
        `| \`${d.workloadId}\` (${d.workloadName}) | \`${d.asIsIp ?? '-'}\` (${d.asIsLocation ?? '-'}) | \`${d.toBeIp ?? '-'}\` (${d.toBeLocation ?? '-'}) | ${d.ipChanged || d.locationChanged ? '주소/위치 변경됨' : '유지됨'} |`,
    ),
    ``,
    `## 2. 정방향(Forward) 통과 장비 비교`,
    `- **이전 전 (As-Is) 경로**: ${asIsHops.join(' → ') || 'N/A'}`,
    `- **이전 후 (To-Be) 경로**: ${toBeHops.join(' → ') || 'N/A'}`,
    ``,
    `## 3. TA 아키텍처 검토 주의사항 및 체크리스트`,
    ...warnings.map((w) => `- **[${w.severity.toUpperCase()}] ${w.code}**: ${w.message}`),
  ].join('\n');

  return {
    intent,
    asIsResult,
    toBeResult,
    bindingDiffs,
    asIsHops,
    toBeHops,
    verdictStatus,
    warnings,
    summaryMarkdown,
  };
}
