import { describe, expect, it } from 'vitest';
import {
  exportToContainerlabArtifacts,
  findNodeLineRangeInYaml,
} from '../../adapters/clabAdapter';
import {
  buildT02RoutedForwardReturn,
  buildT03MissingReturnRoute,
  buildT05PolicyDenyExpected,
  buildT06PolicyMissing,
  buildT07UnsupportedNat,
  buildT10TrunkVlanMissing,
  buildT11MigrationEndpointRebinding,
  buildT12MigrationPolicyNotCollected,
  DEFAULT_APP_TO_DB_INTENT,
  ENTERPRISE_MULTI_INTENTS,
} from '../../fixtures/scenarios';
import { analyzeIntent } from '../analyzer';
import { computeSemanticHash } from '../semanticHash';
import {
  applyScenarioQuickFix,
  getScenarioQuickFixInfo,
  removeRouteById,
} from '../whatIfMutator';

describe('v2.0 Platform Extensions: REA YAML Line Locator, What-If Mutator, IP Fabric Continue Mode & Multi-Intent Matrix', () => {
  it('REA Reverse-Engineered Feature: locates exact YAML line ranges for nodes in topology.clab.yml', () => {
    const t02 = buildT02RoutedForwardReturn();
    const { yaml } = exportToContainerlabArtifacts(t02);

    const r1Range = findNodeLineRangeInYaml(yaml, 'r1');
    expect(r1Range).not.toBeNull();
    expect(r1Range!.startLine).toBeGreaterThan(2);
    expect(r1Range!.endLine).toBeGreaterThanOrEqual(r1Range!.startLine);

    const lines = yaml.split(/\r?\n/).slice(r1Range!.startLine - 1, r1Range!.endLine);
    expect(lines[0]).toContain('r1:');
    expect(lines.join('\n')).toContain('idc-core-r1');
  });

  it('Forward Predict Benchmark: What-If Quick-Fix remediations deterministically resolve T03, T06, T07, T10, T12 and test T05', () => {
    // T03: Missing return route (BLOCKED/FAIL -> REACHABLE/PASS)
    const t03 = buildT03MissingReturnRoute().semantic;
    const t03Before = analyzeIntent(t03, DEFAULT_APP_TO_DB_INTENT);
    expect(t03Before.networkOutcome).toBe('blocked');
    expect(t03Before.intentVerdict).toBe('fail');

    const t03Fixed = applyScenarioQuickFix(t03, 'T03');
    expect(computeSemanticHash(t03Fixed)).not.toBe(computeSemanticHash(t03));
    const t03After = analyzeIntent(t03Fixed, DEFAULT_APP_TO_DB_INTENT);
    expect(t03After.networkOutcome).toBe('reachable');
    expect(t03After.intentVerdict).toBe('pass');

    // T05: Toggling security deny rule to allow triggers a security violation (FAIL)
    const t05 = buildT05PolicyDenyExpected();
    const t05Mutated = applyScenarioQuickFix(t05.document.semantic, 'T05');
    const t05After = analyzeIntent(t05Mutated, t05.intent);
    expect(t05After.networkOutcome).toBe('reachable');
    expect(t05After.intentVerdict).toBe('fail');

    // T06: Uncollected firewall policy (UNKNOWN -> REACHABLE/PASS)
    const t06 = buildT06PolicyMissing().semantic;
    const t06Fixed = applyScenarioQuickFix(t06, 'T06');
    const t06After = analyzeIntent(t06Fixed, DEFAULT_APP_TO_DB_INTENT);
    expect(t06After.networkOutcome).toBe('reachable');
    expect(t06After.intentVerdict).toBe('pass');

    // T07: Unsupported NAT feature cleared (UNKNOWN -> REACHABLE/PASS)
    const t07 = buildT07UnsupportedNat().semantic;
    const t07Fixed = applyScenarioQuickFix(t07, 'T07');
    const t07After = analyzeIntent(t07Fixed, DEFAULT_APP_TO_DB_INTENT);
    expect(t07After.networkOutcome).toBe('reachable');
    expect(t07After.intentVerdict).toBe('pass');

    // T10: Trunk VLAN 20 restored on sw1-trunk1 (BLOCKED/FAIL -> REACHABLE/PASS)
    const t10 = buildT10TrunkVlanMissing().semantic;
    const t10Fixed = applyScenarioQuickFix(t10, 'T10');
    const t10After = analyzeIntent(t10Fixed, DEFAULT_APP_TO_DB_INTENT);
    expect(t10After.networkOutcome).toBe('reachable');
    expect(t10After.intentVerdict).toBe('pass');

    // T12: AWS RDS SG collected (UNKNOWN -> REACHABLE/PASS)
    const t12 = buildT12MigrationPolicyNotCollected().semantic;
    const t12Fixed = applyScenarioQuickFix(t12, 'T12');
    const t12After = analyzeIntent(t12Fixed, DEFAULT_APP_TO_DB_INTENT);
    expect(t12After.networkOutcome).toBe('reachable');
    expect(t12After.intentVerdict).toBe('pass');

    expect(getScenarioQuickFixInfo('T03').available).toBe(true);
    expect(getScenarioQuickFixInfo('T02').available).toBe(false);

    // Removing a static route from T02 breaks connectivity
    const t02WithoutForward = removeRouteById(
      buildT02RoutedForwardReturn().semantic,
      'rt-app-to-db',
    );
    const t02BrokenRes = analyzeIntent(t02WithoutForward, DEFAULT_APP_TO_DB_INTENT);
    expect(t02BrokenRes.networkOutcome).toBe('blocked');
  });

  it('IP Fabric Benchmark: diagnosticContinueMode traces hypothetical downstream hops past a drop while keeping networkOutcome=blocked', () => {
    const t05 = buildT05PolicyDenyExpected();
    const normalRes = analyzeIntent(t05.document.semantic, t05.intent);
    expect(normalRes.networkOutcome).toBe('blocked');
    expect(normalRes.forwardTrace.steps.some((s) => s.stage === 'DESTINATION_DELIVERED')).toBe(
      false,
    );

    const diagRes = analyzeIntent(t05.document.semantic, t05.intent, {
      diagnosticContinueMode: true,
    });
    // CRITICAL INVARIANT: Diagnostic continue mode NEVER turns a blocked flow into reachable!
    expect(diagRes.networkOutcome).toBe('blocked');
    expect(diagRes.forwardTrace.outcome).toBe('blocked');
    expect(diagRes.forwardTrace.finalReasonCode).toBe('POLICY_DENIED');

    // Yet it reveals downstream hypothetical delivery steps for engineering diagnosis
    const hypoDelivered = diagRes.forwardTrace.steps.find(
      (s) => s.stage === 'DESTINATION_DELIVERED',
    );
    expect(hypoDelivered).toBeDefined();
    expect(hypoDelivered?.hypotheticalContinuation).toBe(true);
    expect(diagRes.reverseTrace).toBeDefined();
    expect(diagRes.reverseTrace?.steps.every((s) => s.hypotheticalContinuation)).toBe(true);
  });

  it('AlgoSec AppViz Benchmark: evaluates ENTERPRISE_MULTI_INTENTS across IDC (T02) and AWS (T11)', () => {
    expect(ENTERPRISE_MULTI_INTENTS).toHaveLength(5);
    const idc = buildT02RoutedForwardReturn().semantic;
    const aws = buildT11MigrationEndpointRebinding().semantic;

    const sshGuard = ENTERPRISE_MULTI_INTENTS.find((f) => f.id === 'sec-guard-app-to-db-ssh-22')!;
    const replica5433 = ENTERPRISE_MULTI_INTENTS.find((f) => f.id === 'app-to-db-replica-5433')!;

    // In IDC (T02, no internal firewall), SSH 22 is reachable -> security guardrail FAIL
    const idcSsh = analyzeIntent(idc, sshGuard);
    expect(idcSsh.networkOutcome).toBe('reachable');
    expect(idcSsh.intentVerdict).toBe('fail');

    // In AWS (T11, SG only allows 5432), SSH 22 is blocked -> security guardrail PASS!
    const awsSsh = analyzeIntent(aws, sshGuard);
    expect(awsSsh.networkOutcome).toBe('blocked');
    expect(awsSsh.intentVerdict).toBe('pass');

    // In AWS (T11), Read-Replica 5433 was not added to NACL/SG -> caught as blocked / FAIL!
    const awsReplica = analyzeIntent(aws, replica5433);
    expect(awsReplica.networkOutcome).toBe('blocked');
    expect(awsReplica.intentVerdict).toBe('fail');
  });
});
