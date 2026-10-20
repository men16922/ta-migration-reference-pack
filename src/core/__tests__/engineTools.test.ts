import { describe, expect, it } from 'vitest';
import {
  checkReachability,
  compareMigration,
  listPolicyFindings,
  listWorkloads,
  proposeFirewallRequest,
  resolveWorkload,
  simulateChange,
  type EngineContext,
} from '../../agent/engineTools';
import type { PolicyRuleModel } from '../types';
import { ONPREM_ASSURANCE_MATRIX_INTENTS, ONPREM_ENTERPRISE_DOCUMENT } from '../../fixtures/onPremEnterpriseTopology';

const ctx: EngineContext = {
  snapshot: ONPREM_ENTERPRISE_DOCUMENT.semantic,
  assuranceIntents: ONPREM_ASSURANCE_MATRIX_INTENTS,
  referenceDate: '2026-10-21',
};

const OPEN_WAS_DB: PolicyRuleModel = {
  id: 'bm-sim-was-db-1521',
  deviceId: 'fw-db-bluemax',
  priority: 5,
  direction: 'forward',
  srcZone: 'Backbone-Untrust',
  dstZone: 'DB-Secure-Zone',
  srcPrefix: '10.10.20.15/32',
  dstPrefix: '10.50.30.100/32',
  protocol: 'tcp',
  dstPort: 1521,
  action: 'allow',
  stateful: true,
};

describe('채팅 에이전트용 결정론 엔진 도구', () => {
  it('워크로드를 id·IP·장비 이름으로 찾고, 모호하면 후보를 준다', () => {
    expect(resolveWorkload(ctx, '10.10.20.15')).toEqual({ workloadId: 'wl-was-prod-01' });
    expect(resolveWorkload(ctx, 'web-dmz-01')).toEqual({ workloadId: 'wl-web-dmz-01' });
    const missing = resolveWorkload(ctx, 'no-such-server');
    expect('error' in missing && missing.candidates?.length).toBeGreaterThan(0);
    expect(listWorkloads(ctx).every((w) => w.ip)).toBe(true);
  });

  it('WAS → Oracle 1521은 BLUEMAX에서 막힌다고 막힌 지점과 경로를 돌려준다', () => {
    const r = checkReachability(ctx, { source: '10.10.20.15', destination: 'wl-db-oracle-01', protocol: 'tcp', port: 1521 });
    expect('outcome' in r && r.outcome).toBe('blocked');
    if (!('outcome' in r)) return;
    expect(r.blockedAt?.deviceId).toBe('fw-db-bluemax');
    expect(r.forwardPath[0]).toContain('was-prod-01');
    expect(r.evidence).toMatch(/^docs:\/\/wiki\/reachability\//);
  });

  it('방화벽 신청 초안은 BLUEMAX 정책 추가를 요구한다', () => {
    const r = proposeFirewallRequest(ctx, { source: 'wl-was-prod-01', destination: 'wl-db-oracle-01', protocol: 'tcp', port: 1521 });
    expect('requests' in r && r.requests.some((q) => q.device.includes('BLUEMAX'))).toBe(true);
  });

  it('정책 점검 결과를 장비로 좁힐 수 있다', () => {
    const all = listPolicyFindings(ctx, {});
    expect(all.findings.length).toBeGreaterThan(0);
    const one = all.findings[0];
    const scoped = listPolicyFindings(ctx, { device: one?.device });
    expect(scoped.findings.every((f) => f.device === one?.device)).toBe(true);
  });

  it('변경 영향: 정책 추가는 승인, 코어 라우트 삭제는 반려', () => {
    const open = simulateChange(ctx, { addRules: [OPEN_WAS_DB] });
    expect(open.verdict).toBe('approve');
    const broken = simulateChange(ctx, { removeRouteIds: ['rt-arista-to-work'] });
    expect(broken.verdict).toBe('reject');
    expect(broken.regressions.length).toBeGreaterThan(0);
    expect(simulateChange(ctx, { removeRuleIds: ['no-such-rule'] }).unknownIds).toEqual(['no-such-rule']);
  });

  it('To-Be 스냅샷이 없으면 이관 비교는 오류를 돌려준다', () => {
    expect(compareMigration(ctx, { source: 'wl-was-prod-01', destination: 'wl-db-oracle-01', protocol: 'tcp', port: 1521 })).toHaveProperty('error');
  });
});
