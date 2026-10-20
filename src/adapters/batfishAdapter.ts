import { computeIntentVerdict } from '../core/analyzer';
import type {
  CommunicationIntent,
  IntentVerdict,
  NetworkOutcome,
} from '../core/types';

/**
 * Mirrors `org.batfish.datamodel.flow.BidirectionalTrace` inspected in `source-inspection.md`.
 * Supports offline/VM-free ingestion of Batfish JSON fixtures while preserving parse warnings
 * and unsupported feature notices.
 */
export type BatfishFlowDisposition =
  | 'ACCEPTED'
  | 'DELIVERED_TO_SUBNET'
  | 'EXITS_NETWORK'
  | 'DENIED_IN'
  | 'DENIED_OUT'
  | 'NO_ROUTE'
  | 'NULL_ROUTED'
  | 'NEIGHBOR_UNREACHABLE'
  | 'LOOP'
  | 'INSUFFICIENT_INFO';

export interface BatfishHopFixture {
  node: string;
  ingressInterface?: string;
  egressInterface?: string;
  stepDetails: string[];
}

export interface BatfishTraceFixture {
  disposition: BatfishFlowDisposition;
  hops: BatfishHopFixture[];
}

export interface BatfishBidirectionalTraceFixture {
  forwardFlow: {
    srcIp: string;
    dstIp: string;
    ipProtocol: 'TCP' | 'UDP' | 'ICMP';
    dstPort?: number;
  };
  forwardTrace: BatfishTraceFixture;
  newSessions?: string[];
  reverseFlow?: {
    srcIp: string;
    dstIp: string;
    ipProtocol: 'TCP' | 'UDP' | 'ICMP';
    dstPort?: number;
  };
  reverseTrace?: BatfishTraceFixture;
  parseWarnings?: string[];
  unsupportedFeatures?: string[];
}

export interface BatfishEvaluationSummary {
  networkOutcome: NetworkOutcome;
  intentVerdict: IntentVerdict;
  forwardDisposition: BatfishFlowDisposition;
  reverseDisposition?: BatfishFlowDisposition;
  parseWarnings: string[];
  unsupportedFeatures: string[];
  explanation: string;
}

function dispositionToOutcome(disp: BatfishFlowDisposition): NetworkOutcome {
  switch (disp) {
    case 'ACCEPTED':
    case 'DELIVERED_TO_SUBNET':
      return 'reachable';
    case 'INSUFFICIENT_INFO':
    case 'EXITS_NETWORK':
      return 'unknown';
    case 'DENIED_IN':
    case 'DENIED_OUT':
    case 'NO_ROUTE':
    case 'NULL_ROUTED':
    case 'NEIGHBOR_UNREACHABLE':
    case 'LOOP':
      return 'blocked';
  }
}

/**
 * Evaluates a Batfish BidirectionalTrace fixture against a CommunicationIntent
 * without assuming forward-only success implies bidirectional reachability.
 */
export function evaluateBatfishBidirectionalFixture(
  fixture: BatfishBidirectionalTraceFixture,
  intent: CommunicationIntent,
): BatfishEvaluationSummary {
  const parseWarnings = fixture.parseWarnings ?? [];
  const unsupportedFeatures = fixture.unsupportedFeatures ?? [];

  // If unsupported features affect the snapshot, preserve UNKNOWN
  if (unsupportedFeatures.length > 0) {
    return {
      networkOutcome: 'unknown',
      intentVerdict: 'unknown',
      forwardDisposition: fixture.forwardTrace.disposition,
      reverseDisposition: fixture.reverseTrace?.disposition,
      parseWarnings,
      unsupportedFeatures,
      explanation: `Batfish fixture reports unsupported features (${unsupportedFeatures.join(', ')}); outcome preserved as UNKNOWN.`,
    };
  }

  const fwdOutcome = dispositionToOutcome(fixture.forwardTrace.disposition);
  if (fwdOutcome === 'unknown') {
    return {
      networkOutcome: 'unknown',
      intentVerdict: 'unknown',
      forwardDisposition: fixture.forwardTrace.disposition,
      reverseDisposition: fixture.reverseTrace?.disposition,
      parseWarnings,
      unsupportedFeatures,
      explanation: `Forward trace disposition is ${fixture.forwardTrace.disposition} (UNKNOWN).`,
    };
  }

  if (fwdOutcome === 'blocked') {
    const verdict = computeIntentVerdict('blocked', intent.expectedNetworkOutcome);
    return {
      networkOutcome: 'blocked',
      intentVerdict: verdict,
      forwardDisposition: fixture.forwardTrace.disposition,
      reverseDisposition: fixture.reverseTrace?.disposition,
      parseWarnings,
      unsupportedFeatures,
      explanation: `Forward flow blocked with disposition ${fixture.forwardTrace.disposition}.`,
    };
  }

  // Forward succeeded (`ACCEPTED`); if return path is required, reverseTrace MUST exist and succeed
  if (intent.requireReturnPath) {
    if (!fixture.reverseTrace) {
      return {
        networkOutcome: 'unknown',
        intentVerdict: 'unknown',
        forwardDisposition: fixture.forwardTrace.disposition,
        parseWarnings,
        unsupportedFeatures,
        explanation:
          'Forward flow was ACCEPTED, but reverseTrace is absent while intent requires a return path. Forward-only success never proves bidirectional reachability.',
      };
    }

    const revOutcome = dispositionToOutcome(fixture.reverseTrace.disposition);
    const verdict = computeIntentVerdict(revOutcome, intent.expectedNetworkOutcome);
    return {
      networkOutcome: revOutcome,
      intentVerdict: verdict,
      forwardDisposition: fixture.forwardTrace.disposition,
      reverseDisposition: fixture.reverseTrace.disposition,
      parseWarnings,
      unsupportedFeatures,
      explanation: `Bidirectional trace evaluated: forward=${fixture.forwardTrace.disposition}, reverse=${fixture.reverseTrace.disposition}.`,
    };
  }

  const verdict = computeIntentVerdict('reachable', intent.expectedNetworkOutcome);
  return {
    networkOutcome: 'reachable',
    intentVerdict: verdict,
    forwardDisposition: fixture.forwardTrace.disposition,
    reverseDisposition: fixture.reverseTrace?.disposition,
    parseWarnings,
    unsupportedFeatures,
    explanation: `Unidirectional forward trace ACCEPTED (return path not required by intent).`,
  };
}
