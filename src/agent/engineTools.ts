import { analyzeIntent } from '../core/analyzer';
import { auditFirewallPolicies } from '../core/firewallAuditEngine';
import { compareMigrationSnapshots } from '../core/migrationDiff';
import { generateRemediationPlan } from '../core/remediationGenerator';
import type {
  AnalysisResult,
  CommunicationIntent,
  NetworkSnapshot,
  PolicyRuleModel,
  RouteModel,
  TraceStep,
} from '../core/types';

/**
 * LLM 에이전트(Copilot / Open WebUI / LibreChat)가 MCP로 호출하는 결정론 엔진 도구.
 * 판정은 전부 엔진이 계산하고, LLM은 이 결과를 인용·설명만 한다. 모든 도구는 읽기 전용이며
 * simulate_change도 메모리 사본에서만 돈다.
 */

export interface EngineContext {
  snapshot: NetworkSnapshot;
  /** 변경 영향 검증에 쓰는 핵심 서비스 통신 목록 */
  assuranceIntents: CommunicationIntent[];
  /** AWS To-Be 설계 스냅샷 (있을 때만 compare_migration 사용 가능) */
  toBeSnapshot?: NetworkSnapshot;
  /** 근거 문서 링크 prefix (wiki 생성기 경로와 동일) */
  docsBaseUrl?: string;
  referenceDate?: string;
}

export interface EndpointInput {
  /** 워크로드 id, 워크로드 이름, 장비 이름, 또는 IPv4 */
  query: string;
}

export interface ReachabilityInput {
  source: string;
  destination: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  port?: number;
  requireReturnPath?: boolean;
}

export interface ToolError {
  error: string;
  candidates?: string[];
}

function docLink(ctx: EngineContext, path: string): string {
  return `${ctx.docsBaseUrl ?? 'docs://wiki'}/${path}`;
}

export function resolveWorkload(ctx: EngineContext, query: string): { workloadId: string } | ToolError {
  const q = query.trim().toLowerCase();
  const { workloads, bindings, devices } = ctx.snapshot;
  const byId = workloads.find((w) => w.id.toLowerCase() === q);
  if (byId) return { workloadId: byId.id };
  const byIp = Object.values(bindings).find((b) => b.ip === q);
  if (byIp) return { workloadId: byIp.workloadId };
  const byDevice = Object.values(bindings).find(
    (b) => b.deviceId.toLowerCase() === q || devices.find((d) => d.id === b.deviceId)?.name.toLowerCase() === q,
  );
  if (byDevice) return { workloadId: byDevice.workloadId };
  const partial = workloads.filter((w) => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q));
  if (partial.length === 1 && partial[0]) return { workloadId: partial[0].id };
  return {
    error: partial.length > 1 ? `"${query}"에 해당하는 서버가 여러 개입니다.` : `"${query}"에 해당하는 서버를 찾지 못했습니다.`,
    candidates: (partial.length ? partial : workloads).slice(0, 10).map((w) => `${w.id} (${w.name}, ${bindings[w.id]?.ip ?? 'IP 없음'})`),
  };
}

export function listWorkloads(ctx: EngineContext) {
  const { workloads, bindings, devices } = ctx.snapshot;
  return workloads.map((w) => {
    const b = bindings[w.id];
    const device = devices.find((d) => d.id === b?.deviceId);
    return { id: w.id, name: w.name, ip: b?.ip, securityZone: device?.securityZone, tier: w.tier };
  });
}

function firstBlockingStep(result: AnalysisResult): { direction: 'forward' | 'reverse'; step: TraceStep } | undefined {
  for (const trace of [result.forwardTrace, result.reverseTrace]) {
    if (!trace) continue;
    const step = trace.steps.find((s) => (s.outcome === 'blocked' || s.outcome === 'unknown') && !s.hypotheticalContinuation);
    if (step) return { direction: trace.direction, step };
  }
  return undefined;
}

function hopNames(steps: TraceStep[]): string[] {
  const names: string[] = [];
  for (const s of steps) if (names[names.length - 1] !== s.deviceName) names.push(s.deviceName);
  return names;
}

function buildIntent(ctx: EngineContext, input: ReachabilityInput): { intent: CommunicationIntent } | ToolError {
  const src = resolveWorkload(ctx, input.source);
  if ('error' in src) return src;
  const dst = resolveWorkload(ctx, input.destination);
  if ('error' in dst) return dst;
  return {
    intent: {
      id: `agent-${src.workloadId}-${dst.workloadId}-${input.protocol}-${input.port ?? 'any'}`,
      sourceWorkload: src.workloadId,
      destinationWorkload: dst.workloadId,
      protocol: input.protocol,
      destinationPort: input.port,
      expectedNetworkOutcome: 'allow',
      requireReturnPath: input.requireReturnPath ?? true,
    },
  };
}

export function checkReachability(ctx: EngineContext, input: ReachabilityInput) {
  const built = buildIntent(ctx, input);
  if ('error' in built) return built;
  const { intent } = built;
  const result = analyzeIntent(ctx.snapshot, intent);
  const blocking = firstBlockingStep(result);
  const policy = blocking?.step.referencedPolicyId
    ? ctx.snapshot.policies.find((p) => p.id === blocking.step.referencedPolicyId)
    : undefined;

  return {
    outcome: result.networkOutcome,
    summary:
      result.networkOutcome === 'reachable'
        ? `${input.source} → ${input.destination} ${input.protocol}/${input.port ?? 'any'} 통신 가능(왕복 확인).`
        : result.networkOutcome === 'blocked'
          ? `${blocking?.step.deviceName ?? '경로 중간'}에서 차단됩니다.`
          : '수집되지 않은 데이터가 있어 판정할 수 없습니다.',
    blockedAt: blocking && {
      direction: blocking.direction,
      device: blocking.step.deviceName,
      deviceId: blocking.step.deviceId,
      reasonCode: blocking.step.reasonCode,
      reason: blocking.step.reason,
      rule: policy && { id: policy.id, name: policy.name, action: policy.action },
    },
    forwardPath: hopNames(result.forwardTrace.steps),
    returnPath: result.reverseTrace ? hopNames(result.reverseTrace.steps) : undefined,
    uncollectedItems: result.uncollectedItems,
    semanticHash: result.semanticHash,
    evidence: docLink(ctx, `reachability/${intent.id}.md`),
  };
}

export function proposeFirewallRequest(ctx: EngineContext, input: ReachabilityInput) {
  const built = buildIntent(ctx, input);
  if ('error' in built) return built;
  const result = analyzeIntent(ctx.snapshot, built.intent);
  const plan = generateRemediationPlan(ctx.snapshot, built.intent, result);
  return {
    note: '초안입니다. 실제 반영은 방화벽 신청·승인 절차를 거쳐 사람이 수행합니다.',
    overallStatus: plan.overallStatus,
    summary: plan.summaryKo,
    requests: plan.ticketRows
      .filter((r) => r.actionRequired)
      .map((r) => ({
        device: r.targetDeviceName,
        type: r.requestType,
        src: `${r.srcIp} (${r.srcZone})`,
        dst: `${r.dstIp} (${r.dstZone})`,
        service: `${r.protocol}/${r.port}`,
        ruleName: r.recommendedRuleName,
        expires: r.expirationDate,
      })),
    cli: plan.vendorCliSnippets.map((c) => ({ device: c.deviceName, apply: c.applyCli, rollback: c.rollbackCli })),
  };
}

export function listPolicyFindings(ctx: EngineContext, input: { device?: string; severity?: 'critical' | 'high' | 'medium' }) {
  const report = auditFirewallPolicies(ctx.snapshot, ctx.referenceDate);
  const q = input.device?.toLowerCase();
  const findings = report.findings
    .filter((f) => !q || f.deviceId.toLowerCase() === q || f.deviceName.toLowerCase().includes(q))
    .filter((f) => !input.severity || f.severity === input.severity);
  return {
    totalRulesScanned: report.totalRulesScanned,
    complianceScore: report.complianceScore,
    findings: findings.map((f) => ({
      device: f.deviceName,
      rule: f.ruleName,
      kind: f.kindLabelKo,
      severity: f.severity,
      detail: f.detailKo,
      recommendation: f.recommendationKo,
      evidence: docLink(ctx, `policy-findings/${f.id}.md`),
    })),
  };
}

export interface ChangeSetInput {
  addRules?: PolicyRuleModel[];
  removeRuleIds?: string[];
  addRoutes?: RouteModel[];
  removeRouteIds?: string[];
}

export function applyChangeSet(snapshot: NetworkSnapshot, change: ChangeSetInput): NetworkSnapshot {
  const next = structuredClone(snapshot);
  const removeRules = new Set(change.removeRuleIds ?? []);
  const removeRoutes = new Set(change.removeRouteIds ?? []);
  next.policies = [...next.policies.filter((p) => !removeRules.has(p.id)), ...(change.addRules ?? [])];
  next.routes = [...next.routes.filter((r) => !removeRoutes.has(r.id)), ...(change.addRoutes ?? [])];
  return next;
}

export function simulateChange(ctx: EngineContext, change: ChangeSetInput) {
  const unknownRuleIds = (change.removeRuleIds ?? []).filter((id) => !ctx.snapshot.policies.some((p) => p.id === id));
  const unknownRouteIds = (change.removeRouteIds ?? []).filter((id) => !ctx.snapshot.routes.some((r) => r.id === id));
  const after = applyChangeSet(ctx.snapshot, change);
  const rows = ctx.assuranceIntents.map((intent) => {
    const before = analyzeIntent(ctx.snapshot, intent).intentVerdict;
    const afterVerdict = analyzeIntent(after, intent).intentVerdict;
    return { service: intent.name ?? intent.id, criticality: intent.criticality, before, after: afterVerdict };
  });
  const regressions = rows.filter((r) => r.before === 'pass' && r.after !== 'pass');
  const fixed = rows.filter((r) => r.before !== 'pass' && r.after === 'pass');
  return {
    verdict: regressions.length > 0 ? 'reject' : 'approve',
    summary:
      regressions.length > 0
        ? `핵심 서비스 ${regressions.length}건이 끊깁니다 — 작업 반려 권고.`
        : `핵심 서비스 ${rows.length}건 모두 유지됩니다${fixed.length ? ` (개선 ${fixed.length}건)` : ''}.`,
    regressions,
    fixed,
    checked: rows.length,
    unknownIds: [...unknownRuleIds, ...unknownRouteIds],
  };
}

export function compareMigration(ctx: EngineContext, input: ReachabilityInput) {
  if (!ctx.toBeSnapshot) {
    return { error: 'AWS To-Be 설계 스냅샷이 로드되지 않았습니다(ENGINE_TOBE_TOPOLOGY).' } satisfies ToolError;
  }
  const built = buildIntent(ctx, input);
  if ('error' in built) return built;
  const report = compareMigrationSnapshots(ctx.snapshot, ctx.toBeSnapshot, built.intent);
  return {
    verdictStatus: report.verdictStatus,
    asIs: { outcome: report.asIsResult.networkOutcome, path: report.asIsHops },
    toBe: { outcome: report.toBeResult.networkOutcome, path: report.toBeHops },
    rebinding: report.bindingDiffs.filter((d) => d.ipChanged || d.locationChanged),
    warnings: report.warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message })),
    summaryMarkdown: report.summaryMarkdown,
  };
}
