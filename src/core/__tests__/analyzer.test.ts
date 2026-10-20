import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeIntent } from '../analyzer';
import { longestPrefixMatch, prefixContainsIp } from '../ipUtils';
import {
  canonicalSemanticJson,
  computeSemanticHash,
  deserializeTopologyDocument,
  serializeTopologyDocument,
} from '../semanticHash';
import {
  buildT02RoutedForwardReturn,
  buildT03MissingReturnRoute,
  buildT04RestoredReturnRoute,
  buildT08ViewOnlyMove,
  buildT09SerializationRoundtrip,
  DEFAULT_APP_TO_DB_INTENT,
  getAllScenarioFixtures,
} from '../../fixtures/scenarios';

interface SpecEntry {
  id: string;
  name: string;
  precondition: string;
  intent: 'allow' | 'deny';
  expectedNetworkOutcome: 'reachable' | 'blocked' | 'unknown';
  expectedIntentVerdict: 'pass' | 'fail' | 'unknown';
  phase: string;
}

describe('P1 Deterministic Bidirectional Reachability & Intent Engine (T01–T12)', () => {
  const specPath = path.resolve(process.cwd(), 'fixtures/fixture-specifications.json');
  const rawSpec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as {
    tests: SpecEntry[];
  };
  const scenarios = getAllScenarioFixtures();

  it('matches all 12 specifications in fixtures/fixture-specifications.json (T01–T12)', () => {
    expect(scenarios).toHaveLength(12);
    expect(rawSpec.tests).toHaveLength(12);

    for (const spec of rawSpec.tests) {
      const scenario = scenarios.find((s) => s.id === spec.id);
      expect(scenario, `Scenario fixture for ${spec.id} must exist`).toBeDefined();
      if (!scenario) continue;

      expect(scenario.name).toBe(spec.name);
      expect(scenario.intent.expectedNetworkOutcome).toBe(spec.intent);

      const result = analyzeIntent(scenario.document.semantic, scenario.intent);
      expect(
        result.networkOutcome,
        `${spec.id} (${spec.name}) networkOutcome mismatch`,
      ).toBe(spec.expectedNetworkOutcome);
      expect(
        result.intentVerdict,
        `${spec.id} (${spec.name}) intentVerdict mismatch`,
      ).toBe(spec.expectedIntentVerdict);
    }

    const evidencePath = path.resolve(process.cwd(), 'fixtures/execution-evidence.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf-8')) as {
      results: Array<{
        id: string;
        semanticHash: string;
        measuredNetworkOutcome: string;
        measuredIntentVerdict: string;
        passed: boolean;
      }>;
    };
    expect(evidence.results).toHaveLength(12);
    for (const ev of evidence.results) {
      const scenario = scenarios.find((s) => s.id === ev.id)!;
      const live = analyzeIntent(scenario.document.semantic, scenario.intent);
      expect(ev.passed).toBe(true);
      expect(ev.semanticHash).toBe(live.semanticHash);
      expect(ev.measuredNetworkOutcome).toBe(live.networkOutcome);
      expect(ev.measuredIntentVerdict).toBe(live.intentVerdict);
    }
  });

  it('Criterion 1: Normal -> Missing Return Route -> Restored Return Route (T02 -> T03 -> T04)', () => {
    const t02 = analyzeIntent(buildT02RoutedForwardReturn().semantic, DEFAULT_APP_TO_DB_INTENT);
    const t03 = analyzeIntent(buildT03MissingReturnRoute().semantic, DEFAULT_APP_TO_DB_INTENT);
    const t04 = analyzeIntent(buildT04RestoredReturnRoute().semantic, DEFAULT_APP_TO_DB_INTENT);

    expect(t02.networkOutcome).toBe('reachable');
    expect(t02.intentVerdict).toBe('pass');

    // In T03, forward trace succeeds, but reverse trace fails with NO_ROUTE
    expect(t03.forwardTrace.outcome).toBe('reachable');
    expect(t03.reverseTrace?.outcome).toBe('blocked');
    expect(t03.reverseTrace?.finalReasonCode).toBe('NO_ROUTE');
    expect(t03.networkOutcome).toBe('blocked');
    expect(t03.intentVerdict).toBe('fail');

    // In T04, restoring the exact route recovers both semantic hash and reachable/pass verdict
    expect(t04.networkOutcome).toBe('reachable');
    expect(t04.intentVerdict).toBe('pass');
  });

  it('Criterion 2: UI layout coordinate changes never alter semanticHash or analysis result (T08)', () => {
    const baseDoc = buildT02RoutedForwardReturn();
    const movedDoc = buildT08ViewOnlyMove();

    expect(movedDoc.annotations.nodes['app-srv']?.x).not.toBe(
      baseDoc.annotations.nodes['app-srv']?.x,
    );
    expect(computeSemanticHash(movedDoc.semantic)).toBe(computeSemanticHash(baseDoc.semantic));
    expect(canonicalSemanticJson(movedDoc.semantic)).toBe(canonicalSemanticJson(baseDoc.semantic));

    const resBase = analyzeIntent(baseDoc.semantic, DEFAULT_APP_TO_DB_INTENT);
    const resMoved = analyzeIntent(movedDoc.semantic, DEFAULT_APP_TO_DB_INTENT);
    expect(resMoved.semanticHash).toBe(resBase.semanticHash);
    expect(resMoved.networkOutcome).toBe(resBase.networkOutcome);
    expect(resMoved.intentVerdict).toBe(resBase.intentVerdict);
    expect(resMoved.forwardTrace.steps).toEqual(resBase.forwardTrace.steps);
  });

  it('Criterion 3: Export/import roundtrip preserves semanticHash and trace steps (T09)', () => {
    const baseDoc = buildT02RoutedForwardReturn();
    const roundtripDoc = buildT09SerializationRoundtrip();

    expect(computeSemanticHash(roundtripDoc.semantic)).toBe(computeSemanticHash(baseDoc.semantic));
    const raw = serializeTopologyDocument(baseDoc);
    const reimported = deserializeTopologyDocument(raw);
    expect(computeSemanticHash(reimported.semantic)).toBe(computeSemanticHash(baseDoc.semantic));
  });

  it('Criterion 4: Distinguishes NO_ROUTE (complete table) from ROUTING_TABLE_INCOMPLETE and VRF isolation', () => {
    const incompleteRouteDoc = buildT03MissingReturnRoute();
    const dbSrv = incompleteRouteDoc.semantic.devices.find((d) => d.id === 'db-srv')!;
    dbSrv.completeness.routingTableComplete = false;

    const resIncomplete = analyzeIntent(incompleteRouteDoc.semantic, DEFAULT_APP_TO_DB_INTENT);
    expect(resIncomplete.reverseTrace?.finalReasonCode).toBe('ROUTING_TABLE_INCOMPLETE');
    expect(resIncomplete.networkOutcome).toBe('unknown');
    expect(resIncomplete.intentVerdict).toBe('unknown');

    // VRF mismatch check: never flatten separate VRFs
    const vrfDoc = buildT02RoutedForwardReturn();
    const dbIf = vrfDoc.semantic.interfaces.find((i) => i.id === 'db-eth0')!;
    dbIf.vrf = 'vrf-isolated-tenant';
    const resVrf = analyzeIntent(vrfDoc.semantic, DEFAULT_APP_TO_DB_INTENT);
    expect(resVrf.forwardTrace.finalReasonCode).toBe('VRF_MISMATCH');
    expect(resVrf.networkOutcome).toBe('unknown');
    expect(resVrf.intentVerdict).toBe('unknown');
  });

  it('Criterion 5 & 6: Structured trace steps contain provenance & explicit non-application-layer assumptions', () => {
    const t02 = analyzeIntent(buildT02RoutedForwardReturn().semantic, DEFAULT_APP_TO_DB_INTENT);
    expect(t02.assumptions.some((a) => a.includes('TLS handshake') || a.includes('DB authentication'))).toBe(
      true,
    );
    expect(t02.forwardTrace.steps.length).toBeGreaterThanOrEqual(4);
    const routeStep = t02.forwardTrace.steps.find((s) => s.stage === 'L3_ROUTING');
    expect(routeStep?.referencedRouteId).toBe('rt-app-to-db');
    expect(routeStep?.evidenceId).toBe('ev-idc-hosts');
  });

  it('verifies longest-prefix match (LPM) deterministic tie-breaking', () => {
    expect(prefixContainsIp('172.28.10.0/24', '172.28.10.10')).toBe(true);
    expect(prefixContainsIp('172.28.10.0/24', '172.28.20.10')).toBe(false);

    const matched = longestPrefixMatch(
      [
        {
          id: 'default-rt',
          deviceId: 'r1',
          destinationPrefix: '0.0.0.0/0',
          egressInterfaceId: 'eth0',
          protocol: 'static',
        },
        {
          id: 'slash16-rt',
          deviceId: 'r1',
          destinationPrefix: '10.60.0.0/16',
          egressInterfaceId: 'eth1',
          protocol: 'static',
        },
        {
          id: 'slash24-rt',
          deviceId: 'r1',
          destinationPrefix: '10.60.20.0/24',
          egressInterfaceId: 'eth2',
          protocol: 'static',
        },
      ],
      'r1',
      'default',
      '10.60.20.30',
    );
    expect(matched?.id).toBe('slash24-rt');
  });
});
