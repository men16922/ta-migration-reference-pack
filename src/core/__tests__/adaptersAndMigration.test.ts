import fs from 'node:fs';
import path from 'node:path';
import * as clabViewerPkg from '@containerlab/clab-viewer';
import { describe, expect, it } from 'vitest';
import {
  evaluateBatfishBidirectionalFixture,
  type BatfishBidirectionalTraceFixture,
} from '../../adapters/batfishAdapter';
import {
  exportToContainerlabArtifacts,
  importFromContainerlabArtifacts,
} from '../../adapters/clabAdapter';
import {
  buildT02RoutedForwardReturn,
  buildT03MissingReturnRoute,
  buildT11MigrationEndpointRebinding,
  buildT12MigrationPolicyNotCollected,
  DEFAULT_APP_TO_DB_INTENT,
} from '../../fixtures/scenarios';
import { analyzeIntent } from '../analyzer';
import { compareMigrationSnapshots } from '../migrationDiff';

describe('P0 Containerlab Adapter, P2 Batfish Fixture Adapter, P3 Migration Diff & GCP Zero-VM Configs', () => {
  it('verifies @containerlab/clab-viewer@0.1.0 package contract and YAML/Annotation separation', () => {
    expect(typeof clabViewerPkg.mountViewer).toBe('function');

    const t02 = buildT02RoutedForwardReturn();
    const { yaml, annotations } = exportToContainerlabArtifacts(t02);
    expect(yaml).toContain('idc-core-r1');
    expect(yaml).toContain('app-srv:eth0');
    expect(annotations).toContain('"nodeAnnotations"');

    // Bare YAML without explicit routingComplete label must default to routingTableComplete=false (UNKNOWN, never false REACHABLE)
    const bareYaml = `
name: bare-cable-only
topology:
  nodes:
    app-srv:
      kind: linux
    db-srv:
      kind: linux
  links:
    - endpoints: ["app-srv:eth0", "db-srv:eth0"]
`;
    const importedBare = importFromContainerlabArtifacts(bareYaml);
    expect(importedBare.semantic.devices[0]?.completeness.routingTableComplete).toBe(false);
    importedBare.semantic.interfaces[0]!.ip = '172.28.10.10/24';
    importedBare.semantic.interfaces[1]!.ip = '172.28.10.20/24';
    importedBare.semantic.bindings = {
      app: {
        workloadId: 'app',
        deviceId: 'app-srv',
        interfaceId: 'app-srv-eth0',
        ip: '172.28.10.10',
        location: 'idc',
      },
      db: {
        workloadId: 'db',
        deviceId: 'db-srv',
        interfaceId: 'db-srv-eth0',
        ip: '172.28.10.20',
        location: 'idc',
      },
    };
    const bareRes = analyzeIntent(importedBare.semantic, DEFAULT_APP_TO_DB_INTENT);
    expect(bareRes.networkOutcome).toBe('unknown');
    expect(bareRes.intentVerdict).toBe('unknown');
  });

  it('evaluates Batfish BidirectionalTrace fixtures without assuming forward-only success suffices', () => {
    const forwardOnlyFixture: BatfishBidirectionalTraceFixture = {
      forwardFlow: { srcIp: '172.28.10.10', dstIp: '172.28.20.20', ipProtocol: 'TCP', dstPort: 5432 },
      forwardTrace: {
        disposition: 'ACCEPTED',
        hops: [{ node: 'app-srv', stepDetails: ['originated'] }],
      },
    };
    const resMissingReverse = evaluateBatfishBidirectionalFixture(
      forwardOnlyFixture,
      DEFAULT_APP_TO_DB_INTENT,
    );
    expect(resMissingReverse.networkOutcome).toBe('unknown');
    expect(resMissingReverse.intentVerdict).toBe('unknown');

    const fullBidiFixture: BatfishBidirectionalTraceFixture = {
      ...forwardOnlyFixture,
      newSessions: ['fw-session-1'],
      reverseFlow: { srcIp: '172.28.20.20', dstIp: '172.28.10.10', ipProtocol: 'TCP', dstPort: 5432 },
      reverseTrace: {
        disposition: 'ACCEPTED',
        hops: [{ node: 'db-srv', stepDetails: ['returned'] }],
      },
    };
    const resFull = evaluateBatfishBidirectionalFixture(fullBidiFixture, DEFAULT_APP_TO_DB_INTENT);
    expect(resFull.networkOutcome).toBe('reachable');
    expect(resFull.intentVerdict).toBe('pass');

    const unsupportedFixture: BatfishBidirectionalTraceFixture = {
      ...fullBidiFixture,
      unsupportedFeatures: ['cisco-asa-nat-hairpin'],
    };
    const resUnsupported = evaluateBatfishBidirectionalFixture(
      unsupportedFixture,
      DEFAULT_APP_TO_DB_INTENT,
    );
    expect(resUnsupported.networkOutcome).toBe('unknown');
    expect(resUnsupported.intentVerdict).toBe('unknown');
  });

  it('compares As-Is IDC (T02) vs To-Be AWS (T11, T12) snapshots by logical workload IDs', () => {
    const asIs = buildT02RoutedForwardReturn().semantic;
    const toBeComplete = buildT11MigrationEndpointRebinding().semantic;
    const toBeIncomplete = buildT12MigrationPolicyNotCollected().semantic;

    const diffPass = compareMigrationSnapshots(asIs, toBeComplete, DEFAULT_APP_TO_DB_INTENT);
    expect(diffPass.verdictStatus).toBe('preserved-pass');
    const dbDiff = diffPass.bindingDiffs.find((b) => b.workloadId === 'db');
    expect(dbDiff?.asIsIp).toBe('172.28.20.20');
    expect(dbDiff?.toBeIp).toBe('10.60.20.30');
    expect(dbDiff?.ipChanged).toBe(true);
    expect(dbDiff?.locationChanged).toBe(true);

    const diffUnknown = compareMigrationSnapshots(asIs, toBeIncomplete, DEFAULT_APP_TO_DB_INTENT);
    expect(diffUnknown.verdictStatus).toBe('degraded-to-unknown');
    expect(
      diffUnknown.warnings.some((w) => w.code === 'INCOMPLETE_TARGET_POLICY_EVIDENCE'),
    ).toBe(true);

    const diffFail = compareMigrationSnapshots(
      asIs,
      buildT03MissingReturnRoute().semantic,
      DEFAULT_APP_TO_DB_INTENT,
    );
    expect(diffFail.verdictStatus).toBe('regressed-to-fail');
  });

  it('verifies Google Cloud Zero-VM / scale-to-zero cost-minimal deployment configs', () => {
    const cloudRunYaml = fs.readFileSync(
      path.resolve(process.cwd(), 'deploy/gcp/cloudrun-service.yaml'),
      'utf-8',
    );
    expect(cloudRunYaml).toContain('autoscaling.knative.dev/minScale: "0"');
    expect(cloudRunYaml).toContain('run.googleapis.com/cpu-throttling: "true"');

    const firebaseCfg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf-8'),
    ) as { hosting: { public: string } };
    expect(firebaseCfg.hosting.public).toBe('dist');
  });
});
