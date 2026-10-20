import { longestPrefixMatch, prefixContainsIp, stripCidr } from './ipUtils';
import { computeSemanticHash } from './semanticHash';
import type {
  AnalysisOptions,
  AnalysisResult,
  CommunicationIntent,
  DeviceModel,
  FlowHeader,
  IntentVerdict,
  InterfaceModel,
  LinkModel,
  NetworkOutcome,
  NetworkSnapshot,
  PolicyRuleModel,
  TraceStep,
  UnidirectionalTrace,
} from './types';

const MAX_HOPS = 16;

function findDevice(snapshot: NetworkSnapshot, deviceId: string): DeviceModel | undefined {
  return snapshot.devices.find((d) => d.id === deviceId);
}

function findInterface(snapshot: NetworkSnapshot, interfaceId: string): InterfaceModel | undefined {
  return snapshot.interfaces.find((i) => i.id === interfaceId);
}

function findConnectedLink(
  snapshot: NetworkSnapshot,
  interfaceId: string,
): { link: LinkModel; peerInterface: InterfaceModel; peerDevice: DeviceModel } | undefined {
  for (const link of snapshot.links) {
    if (link.aInterfaceId === interfaceId || link.bInterfaceId === interfaceId) {
      const peerIfId = link.aInterfaceId === interfaceId ? link.bInterfaceId : link.aInterfaceId;
      const peerInterface = findInterface(snapshot, peerIfId);
      if (!peerInterface) continue;
      const peerDevice = findDevice(snapshot, peerInterface.deviceId);
      if (!peerDevice) continue;
      return { link, peerInterface, peerDevice };
    }
  }
  return undefined;
}

function evaluateDevicePolicies(
  snapshot: NetworkSnapshot,
  device: DeviceModel,
  flow: FlowHeader,
  direction: 'forward' | 'reverse',
  reversePairFlow?: FlowHeader,
): {
  status: 'no-policy' | 'incomplete' | 'allowed' | 'denied';
  matchedRule?: PolicyRuleModel;
  reason: string;
} {
  const devicePolicies = snapshot.policies
    .filter((p) => p.deviceId === device.id)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const enforces = Boolean(device.enforcesPolicy || device.role === 'firewall' || devicePolicies.length > 0);
  if (!enforces) {
    return { status: 'no-policy', reason: 'Device does not enforce packet filtering policies.' };
  }

  if (!device.completeness.policyTableComplete) {
    return {
      status: 'incomplete',
      reason: `Policy enforcement is enabled on ${device.name} (${device.id}), but policy table data is incomplete/not collected.`,
    };
  }

  // Evaluate stateless rules (e.g., AWS NACL) and explicit rules matching this direction first
  const matchesRule = (rule: PolicyRuleModel, targetFlow: FlowHeader): boolean => {
    const srcCidr = rule.srcPrefix ?? '0.0.0.0/0';
    const dstCidr = rule.dstPrefix ?? '0.0.0.0/0';
    if (!prefixContainsIp(srcCidr, targetFlow.srcIp)) return false;
    if (!prefixContainsIp(dstCidr, targetFlow.dstIp)) return false;
    if (rule.protocol !== 'any' && rule.protocol !== targetFlow.protocol) return false;
    if (rule.dstPort !== undefined && rule.dstPort !== targetFlow.dstPort) return false;
    return true;
  };

  for (const rule of devicePolicies) {
    if (matchesRule(rule, flow)) {
      if (rule.action === 'deny') {
        return {
          status: 'denied',
          matchedRule: rule,
          reason: `Denied by policy rule ${rule.id}${rule.name ? ` (${rule.name})` : ''} on ${device.name}.`,
        };
      }
      return {
        status: 'allowed',
        matchedRule: rule,
        reason: `Allowed by policy rule ${rule.id}${rule.name ? ` (${rule.name})` : ''} on ${device.name}.`,
      };
    }
  }

  // For reverse flows, check if a stateful policy rule on this device permitted the forward flow
  if (direction === 'reverse' && reversePairFlow) {
    for (const rule of devicePolicies) {
      if (rule.stateful !== false && rule.action === 'allow' && matchesRule(rule, reversePairFlow)) {
        return {
          status: 'allowed',
          matchedRule: rule,
          reason: `Return traffic permitted by stateful session matching rule ${rule.id} on ${device.name}.`,
        };
      }
    }
  }

  if (device.defaultPolicyAction === 'deny') {
    return {
      status: 'denied',
      reason: `Implicit default deny on ${device.name} (${device.id}); no matching allow rule found.`,
    };
  }

  return {
    status: 'allowed',
    reason: `Policy table complete on ${device.name}; traffic permitted.`,
  };
}

function checkTrunkVlanLink(
  link: LinkModel,
  egressIf: InterfaceModel,
  ingressIf: InterfaceModel,
  egressDevice: DeviceModel,
  ingressDevice: DeviceModel,
  requiredVlan: number | undefined,
): {
  status: 'ok' | 'blocked' | 'unknown';
  reasonCode: TraceStep['reasonCode'];
  reason: string;
} {
  const isTrunk =
    link.kind === 'trunk' ||
    link.requiredVlan !== undefined ||
    egressIf.trunkVlans !== undefined ||
    ingressIf.trunkVlans !== undefined;

  if (!isTrunk) {
    return {
      status: 'ok',
      reasonCode: 'SAME_SUBNET_L2',
      reason: `Link ${link.id} carries untagged/access Ethernet frame.`,
    };
  }

  if (!egressDevice.completeness.l2ConfigComplete || !ingressDevice.completeness.l2ConfigComplete) {
    return {
      status: 'unknown',
      reasonCode: 'L2_CONFIG_INCOMPLETE',
      reason: `Trunk link ${link.id} requires VLAN verification, but L2 configuration completeness is false.`,
    };
  }

  const vlanToCheck = requiredVlan ?? link.requiredVlan ?? egressIf.vlanId ?? ingressIf.vlanId;
  if (vlanToCheck === undefined) {
    return {
      status: 'ok',
      reasonCode: 'TRUNK_VLAN_ALLOWED',
      reason: `Trunk link ${link.id} traversed.`,
    };
  }

  if (egressIf.trunkVlans !== undefined && !egressIf.trunkVlans.includes(vlanToCheck)) {
    return {
      status: 'blocked',
      reasonCode: 'TRUNK_VLAN_MISSING',
      reason: `VLAN ${vlanToCheck} is not allowed on trunk egress interface ${egressIf.id} (${egressIf.name}) of ${egressDevice.name}. Allowed VLANs: [${egressIf.trunkVlans.join(', ')}].`,
    };
  }

  if (ingressIf.trunkVlans !== undefined && !ingressIf.trunkVlans.includes(vlanToCheck)) {
    return {
      status: 'blocked',
      reasonCode: 'TRUNK_VLAN_MISSING',
      reason: `VLAN ${vlanToCheck} is not allowed on trunk ingress interface ${ingressIf.id} (${ingressIf.name}) of ${ingressDevice.name}. Allowed VLANs: [${ingressIf.trunkVlans.join(', ')}].`,
    };
  }

  return {
    status: 'ok',
    reasonCode: 'TRUNK_VLAN_ALLOWED',
    reason: `VLAN ${vlanToCheck} is permitted across trunk link ${link.id} (${egressIf.name} -> ${ingressIf.name}).`,
  };
}

function traceUnidirectional(
  snapshot: NetworkSnapshot,
  direction: 'forward' | 'reverse',
  startDevice: DeviceModel,
  startInterface: InterfaceModel,
  targetDevice: DeviceModel,
  flow: FlowHeader,
  limitations: string[],
  uncollectedItems: string[],
  reversePairFlow?: FlowHeader,
  options?: AnalysisOptions,
): UnidirectionalTrace {
  const steps: TraceStep[] = [];
  let currentDevice = startDevice;
  let currentIngressIf: InterfaceModel | undefined = undefined;
  let currentFlow: FlowHeader = {
    ...flow,
    vlanId: flow.vlanId ?? startInterface.vlanId,
  };
  let inHypotheticalMode = false;
  let lockedDropOutcome: {
    outcome: 'blocked';
    reasonCode: TraceStep['reasonCode'];
    reason: string;
  } | null = null;

  const withHypo = (step: TraceStep): TraceStep => {
    if (!inHypotheticalMode) return step;
    return { ...step, hypotheticalContinuation: true };
  };

  steps.push({
    stepIndex: 0,
    stage: 'ENDPOINT_INIT',
    deviceId: startDevice.id,
    deviceName: startDevice.name,
    egressInterfaceId: startInterface.id,
    beforeHeader: { ...currentFlow },
    afterHeader: { ...currentFlow },
    outcome: 'continue',
    reasonCode: 'ORIGINATED',
    reason: `Originated ${direction} ${currentFlow.protocol.toUpperCase()} flow ${currentFlow.srcIp} -> ${currentFlow.dstIp}${currentFlow.dstPort ? `:${currentFlow.dstPort}` : ''} on ${startDevice.name} (${startInterface.name}, VRF ${currentFlow.vrf}).`,
    evidenceId: startDevice.evidenceId,
  });

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    // 1. Check unsupported features on current hop (e.g., NAT, PBR)
    if (currentDevice.unsupportedFeaturesOnPath && currentDevice.unsupportedFeaturesOnPath.length > 0) {
      const featList = currentDevice.unsupportedFeaturesOnPath.join(', ');
      const msg = `Hop ${currentDevice.name} (${currentDevice.id}) uses unsupported feature(s): ${featList}. Closed-world engine refuses to guess outcome.`;
      limitations.push(msg);
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'UNSUPPORTED_FEATURE_GUARD',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'unknown',
          reasonCode: 'UNSUPPORTED_FEATURE',
          reason: msg,
          evidenceId: currentDevice.evidenceId,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: lockedDropOutcome ? 'blocked' : 'unknown',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'UNSUPPORTED_FEATURE',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
      };
    }

    // 2. Evaluate packet filtering / SG / NACL policies on current device
    const policyEval = evaluateDevicePolicies(snapshot, currentDevice, currentFlow, direction, reversePairFlow);
    if (policyEval.status === 'incomplete') {
      uncollectedItems.push(policyEval.reason);
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'COMPLETENESS_GUARD',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'unknown',
          reasonCode: 'POLICY_DATA_MISSING',
          reason: policyEval.reason,
          evidenceId: currentDevice.evidenceId,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: lockedDropOutcome ? 'blocked' : 'unknown',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'POLICY_DATA_MISSING',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : policyEval.reason,
      };
    }

    if (policyEval.status === 'denied') {
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'POLICY_EVAL',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'blocked',
          reasonCode: 'POLICY_DENIED',
          reason: policyEval.reason,
          referencedPolicyId: policyEval.matchedRule?.id,
          evidenceId: policyEval.matchedRule?.evidenceId ?? currentDevice.evidenceId,
        }),
      );
      if (!options?.diagnosticContinueMode) {
        return {
          direction,
          flow: currentFlow,
          outcome: 'blocked',
          steps,
          finalReasonCode: 'POLICY_DENIED',
          finalReason: policyEval.reason,
        };
      }
      if (!lockedDropOutcome) {
        lockedDropOutcome = {
          outcome: 'blocked',
          reasonCode: 'POLICY_DENIED',
          reason: policyEval.reason,
        };
      }
      inHypotheticalMode = true;
    }

    if (policyEval.status === 'allowed') {
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'POLICY_EVAL',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'continue',
          reasonCode: 'POLICY_ALLOWED',
          reason: policyEval.reason,
          referencedPolicyId: policyEval.matchedRule?.id,
          evidenceId: policyEval.matchedRule?.evidenceId ?? currentDevice.evidenceId,
        }),
      );
    }

    // 3. Check if destination IP belongs to an interface on currentDevice
    const localTargetIf = snapshot.interfaces.find(
      (iface) => iface.deviceId === currentDevice.id && iface.ip && stripCidr(iface.ip) === currentFlow.dstIp,
    );

    if (localTargetIf) {
      const targetVrf = localTargetIf.vrf ?? 'default';
      if (targetVrf !== currentFlow.vrf) {
        const msg = `Destination IP ${currentFlow.dstIp} on ${currentDevice.name} belongs to VRF "${targetVrf}", but packet arrived in VRF "${currentFlow.vrf}". VRFs are never flattened.`;
        limitations.push(msg);
        steps.push(
          withHypo({
            stepIndex: steps.length,
            stage: 'L3_ROUTING',
            deviceId: currentDevice.id,
            deviceName: currentDevice.name,
            ingressInterfaceId: currentIngressIf?.id,
            egressInterfaceId: localTargetIf.id,
            beforeHeader: { ...currentFlow },
            afterHeader: { ...currentFlow },
            outcome: 'unknown',
            reasonCode: 'VRF_MISMATCH',
            reason: msg,
          }),
        );
        return {
          direction,
          flow: currentFlow,
          outcome: lockedDropOutcome ? 'blocked' : 'unknown',
          steps,
          finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'VRF_MISMATCH',
          finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
        };
      }

      const deliveredReason = `Flow delivered to target interface ${localTargetIf.name} (${currentFlow.dstIp}) on ${ targetDevice.id === currentDevice.id ? targetDevice.name : currentDevice.name }.`;
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'DESTINATION_DELIVERED',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id ?? localTargetIf.id,
          egressInterfaceId: localTargetIf.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'delivered',
          reasonCode: 'DELIVERED_TO_TARGET',
          reason: deliveredReason,
          evidenceId: currentDevice.evidenceId,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: lockedDropOutcome ? 'blocked' : 'reachable',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'DELIVERED_TO_TARGET',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : deliveredReason,
      };
    }

    // 4. L2 Switch forwarding vs L3 Routing lookup
    let egressInterface: InterfaceModel | undefined;
    let matchedRoute = longestPrefixMatch(snapshot.routes, currentDevice.id, currentFlow.vrf, currentFlow.dstIp);

    if (currentDevice.role === 'switch' && !matchedRoute) {
      if (!currentDevice.completeness.l2ConfigComplete) {
        const msg = `Switch ${currentDevice.name} (${currentDevice.id}) L2 forwarding table/VLAN config is incomplete.`;
        uncollectedItems.push(msg);
        steps.push(
          withHypo({
            stepIndex: steps.length,
            stage: 'COMPLETENESS_GUARD',
            deviceId: currentDevice.id,
            deviceName: currentDevice.name,
            ingressInterfaceId: currentIngressIf?.id,
            beforeHeader: { ...currentFlow },
            afterHeader: { ...currentFlow },
            outcome: 'unknown',
            reasonCode: 'L2_CONFIG_INCOMPLETE',
            reason: msg,
          }),
        );
        return {
          direction,
          flow: currentFlow,
          outcome: lockedDropOutcome ? 'blocked' : 'unknown',
          steps,
          finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'L2_CONFIG_INCOMPLETE',
          finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
        };
      }

      // Find switch egress port other than ingress that leads toward target or shares L2 domain / trunk
      const candidateSwitchIfs = snapshot.interfaces.filter(
        (i) => i.deviceId === currentDevice.id && i.id !== currentIngressIf?.id,
      );
      egressInterface = candidateSwitchIfs[0];
    } else {
      if (!matchedRoute) {
        if (!currentDevice.completeness.routingTableComplete) {
          const msg = `No matching route for ${currentFlow.dstIp} on ${currentDevice.name} (VRF ${currentFlow.vrf}), and routingTableComplete is false (uncollected routes).`;
          uncollectedItems.push(msg);
          steps.push(
            withHypo({
              stepIndex: steps.length,
              stage: 'COMPLETENESS_GUARD',
              deviceId: currentDevice.id,
              deviceName: currentDevice.name,
              ingressInterfaceId: currentIngressIf?.id,
              beforeHeader: { ...currentFlow },
              afterHeader: { ...currentFlow },
              outcome: 'unknown',
              reasonCode: 'ROUTING_TABLE_INCOMPLETE',
              reason: msg,
              evidenceId: currentDevice.evidenceId,
            }),
          );
          return {
            direction,
            flow: currentFlow,
            outcome: lockedDropOutcome ? 'blocked' : 'unknown',
            steps,
            finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'ROUTING_TABLE_INCOMPLETE',
            finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
          };
        }

        const msg = `No matching route to ${currentFlow.dstIp} in complete routing table of ${currentDevice.name} (VRF ${currentFlow.vrf}). Confirmed NO_ROUTE.`;
        steps.push(
          withHypo({
            stepIndex: steps.length,
            stage: 'L3_ROUTING',
            deviceId: currentDevice.id,
            deviceName: currentDevice.name,
            ingressInterfaceId: currentIngressIf?.id,
            beforeHeader: { ...currentFlow },
            afterHeader: { ...currentFlow },
            outcome: 'blocked',
            reasonCode: 'NO_ROUTE',
            reason: msg,
            evidenceId: currentDevice.evidenceId,
          }),
        );
        return {
          direction,
          flow: currentFlow,
          outcome: 'blocked',
          steps,
          finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'NO_ROUTE',
          finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
        };
      }

      egressInterface = findInterface(snapshot, matchedRoute.egressInterfaceId);
      const routeReasonCode =
        matchedRoute.protocol === 'connected'
          ? 'ROUTE_MATCHED_CONNECTED'
          : matchedRoute.protocol === 'aws-route-table'
            ? 'ROUTE_MATCHED_AWS'
            : 'ROUTE_MATCHED_STATIC';

      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: matchedRoute.protocol === 'connected' ? 'L2_SWITCHING' : 'L3_ROUTING',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          egressInterfaceId: matchedRoute.egressInterfaceId,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'continue',
          reasonCode: routeReasonCode,
          reason: `Matched ${matchedRoute.protocol} route ${matchedRoute.destinationPrefix}${matchedRoute.nextHopIp ? ` via ${matchedRoute.nextHopIp}` : ' (directly connected)'} out ${egressInterface?.name ?? matchedRoute.egressInterfaceId}.`,
          referencedRouteId: matchedRoute.id,
          evidenceId: matchedRoute.evidenceId ?? currentDevice.evidenceId,
        }),
      );
    }

    if (!egressInterface) {
      const msg = `Egress interface not found on ${currentDevice.name}.`;
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'LINK_TRANSIT',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'blocked',
          reasonCode: 'LINK_DOWN_OR_UNCONNECTED',
          reason: msg,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: 'blocked',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'LINK_DOWN_OR_UNCONNECTED',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
      };
    }

    // Update active VLAN tag if egress interface specifies one
    if (egressInterface.vlanId !== undefined) {
      currentFlow = { ...currentFlow, vlanId: egressInterface.vlanId };
    }

    const connected = findConnectedLink(snapshot, egressInterface.id);
    if (!connected) {
      const msg = `Egress interface ${egressInterface.name} (${egressInterface.id}) on ${currentDevice.name} has no connected link.`;
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'LINK_TRANSIT',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          egressInterfaceId: egressInterface.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'blocked',
          reasonCode: 'LINK_DOWN_OR_UNCONNECTED',
          reason: msg,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: 'blocked',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'LINK_DOWN_OR_UNCONNECTED',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : msg,
      };
    }

    // 5. Check L2 Trunk VLAN constraints on the physical/logical link
    const trunkCheck = checkTrunkVlanLink(
      connected.link,
      egressInterface,
      connected.peerInterface,
      currentDevice,
      connected.peerDevice,
      currentFlow.vlanId,
    );

    if (trunkCheck.status === 'unknown') {
      uncollectedItems.push(trunkCheck.reason);
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'TRUNK_VLAN_CHECK',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          egressInterfaceId: egressInterface.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'unknown',
          reasonCode: trunkCheck.reasonCode,
          reason: trunkCheck.reason,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: lockedDropOutcome ? 'blocked' : 'unknown',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : trunkCheck.reasonCode,
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : trunkCheck.reason,
      };
    }

    if (trunkCheck.status === 'blocked') {
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'TRUNK_VLAN_CHECK',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          egressInterfaceId: egressInterface.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'blocked',
          reasonCode: trunkCheck.reasonCode,
          reason: trunkCheck.reason,
        }),
      );
      if (!options?.diagnosticContinueMode) {
        return {
          direction,
          flow: currentFlow,
          outcome: 'blocked',
          steps,
          finalReasonCode: trunkCheck.reasonCode,
          finalReason: trunkCheck.reason,
        };
      }
      if (!lockedDropOutcome) {
        lockedDropOutcome = {
          outcome: 'blocked',
          reasonCode: trunkCheck.reasonCode,
          reason: trunkCheck.reason,
        };
      }
      inHypotheticalMode = true;
    }

    if (trunkCheck.reasonCode === 'TRUNK_VLAN_ALLOWED') {
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'TRUNK_VLAN_CHECK',
          deviceId: currentDevice.id,
          deviceName: currentDevice.name,
          ingressInterfaceId: currentIngressIf?.id,
          egressInterfaceId: egressInterface.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'continue',
          reasonCode: 'TRUNK_VLAN_ALLOWED',
          reason: trunkCheck.reason,
        }),
      );
    }

    // Advance across the link to the peer device/interface (enforce VRF isolation across links)
    const egressVrf = egressInterface.vrf ?? 'default';
    const peerVrf = connected.peerInterface.vrf ?? 'default';
    if (egressVrf !== currentFlow.vrf || peerVrf !== egressVrf) {
      const vrfMsg = `VRF isolation boundary encountered between ${currentDevice.name}:${egressInterface.name} (VRF "${egressVrf}") and ${connected.peerDevice.name}:${connected.peerInterface.name} (VRF "${peerVrf}"). Explicit VRF route-leaking is not modeled; refusing to flatten VRFs.`;
      limitations.push(vrfMsg);
      steps.push(
        withHypo({
          stepIndex: steps.length,
          stage: 'L3_ROUTING',
          deviceId: connected.peerDevice.id,
          deviceName: connected.peerDevice.name,
          ingressInterfaceId: connected.peerInterface.id,
          beforeHeader: { ...currentFlow },
          afterHeader: { ...currentFlow },
          outcome: 'unknown',
          reasonCode: 'VRF_MISMATCH',
          reason: vrfMsg,
        }),
      );
      return {
        direction,
        flow: currentFlow,
        outcome: lockedDropOutcome ? 'blocked' : 'unknown',
        steps,
        finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'VRF_MISMATCH',
        finalReason: lockedDropOutcome ? lockedDropOutcome.reason : vrfMsg,
      };
    }

    currentFlow = {
      ...currentFlow,
      vrf: peerVrf,
      vlanId: connected.peerInterface.vlanId ?? currentFlow.vlanId,
    };
    currentIngressIf = connected.peerInterface;
    currentDevice = connected.peerDevice;
  }

  const loopMsg = `Exceeded maximum hop count (${MAX_HOPS}); potential routing loop.`;
  steps.push(
    withHypo({
      stepIndex: steps.length,
      stage: 'L3_ROUTING',
      deviceId: currentDevice.id,
      deviceName: currentDevice.name,
      ingressInterfaceId: currentIngressIf?.id,
      beforeHeader: { ...currentFlow },
      afterHeader: { ...currentFlow },
      outcome: 'blocked',
      reasonCode: 'HOP_LIMIT_EXCEEDED',
      reason: loopMsg,
    }),
  );

  return {
    direction,
    flow: currentFlow,
    outcome: 'blocked',
    steps,
    finalReasonCode: lockedDropOutcome ? lockedDropOutcome.reasonCode : 'HOP_LIMIT_EXCEEDED',
    finalReason: lockedDropOutcome ? lockedDropOutcome.reason : loopMsg,
  };
}

export function computeIntentVerdict(
  networkOutcome: NetworkOutcome,
  expectedOutcome: CommunicationIntent['expectedNetworkOutcome'],
): IntentVerdict {
  if (networkOutcome === 'unknown') {
    return 'unknown';
  }
  if (expectedOutcome === 'allow') {
    return networkOutcome === 'reachable' ? 'pass' : 'fail';
  }
  // expectedOutcome === 'deny': blocking a forbidden flow is a PASS!
  return networkOutcome === 'blocked' ? 'pass' : 'fail';
}

export function analyzeIntent(
  snapshot: NetworkSnapshot,
  intent: CommunicationIntent,
  options?: AnalysisOptions,
): AnalysisResult {
  const semanticHash = computeSemanticHash(snapshot);
  const limitations: string[] = [];
  const uncollectedItems: string[] = [];
  const assumptions: string[] = [
    'Closed-world deterministic IPv4 reachability model (L2 broadcast/trunk VLAN + L3 longest-prefix match + explicit policy evaluation).',
    'Network reachability does not prove live application daemon health, TLS handshake, or DB authentication.',
  ];

  const srcBinding = snapshot.bindings[intent.sourceWorkload];
  const dstBinding = snapshot.bindings[intent.destinationWorkload];

  if (!srcBinding || !dstBinding) {
    const missingMsg = `Missing endpoint binding for workload "${!srcBinding ? intent.sourceWorkload : intent.destinationWorkload}" in snapshot "${snapshot.id}".`;
    uncollectedItems.push(missingMsg);
    const placeholderFlow: FlowHeader = {
      srcIp: srcBinding?.ip ?? '0.0.0.0',
      dstIp: dstBinding?.ip ?? '0.0.0.0',
      protocol: intent.protocol,
      dstPort: intent.destinationPort,
      vrf: 'default',
    };
    return {
      snapshotId: snapshot.id,
      semanticHash,
      intentId: intent.id,
      sourceBinding: srcBinding,
      destinationBinding: dstBinding,
      networkOutcome: 'unknown',
      intentVerdict: 'unknown',
      forwardTrace: {
        direction: 'forward',
        flow: placeholderFlow,
        outcome: 'unknown',
        steps: [],
        finalReasonCode: 'BINDING_MISSING',
        finalReason: missingMsg,
      },
      assumptions,
      limitations,
      uncollectedItems,
    };
  }

  const srcDevice = findDevice(snapshot, srcBinding.deviceId);
  const srcInterface = findInterface(snapshot, srcBinding.interfaceId);
  const dstDevice = findDevice(snapshot, dstBinding.deviceId);
  const dstInterface = findInterface(snapshot, dstBinding.interfaceId);

  if (!srcDevice || !srcInterface || !dstDevice || !dstInterface) {
    const missingEntityMsg = 'Bound device or interface does not exist in snapshot.';
    uncollectedItems.push(missingEntityMsg);
    const placeholderFlow: FlowHeader = {
      srcIp: srcBinding.ip,
      dstIp: dstBinding.ip,
      protocol: intent.protocol,
      dstPort: intent.destinationPort,
      vrf: 'default',
    };
    return {
      snapshotId: snapshot.id,
      semanticHash,
      intentId: intent.id,
      sourceBinding: srcBinding,
      destinationBinding: dstBinding,
      networkOutcome: 'unknown',
      intentVerdict: 'unknown',
      forwardTrace: {
        direction: 'forward',
        flow: placeholderFlow,
        outcome: 'unknown',
        steps: [],
        finalReasonCode: 'BINDING_MISSING',
        finalReason: missingEntityMsg,
      },
      assumptions,
      limitations,
      uncollectedItems,
    };
  }

  const forwardFlow: FlowHeader = {
    srcIp: stripCidr(srcBinding.ip),
    dstIp: stripCidr(dstBinding.ip),
    protocol: intent.protocol,
    dstPort: intent.destinationPort,
    vrf: srcInterface.vrf ?? 'default',
    vlanId: srcInterface.vlanId,
  };

  const forwardTrace = traceUnidirectional(
    snapshot,
    'forward',
    srcDevice,
    srcInterface,
    dstDevice,
    forwardFlow,
    limitations,
    uncollectedItems,
    undefined,
    options,
  );

  let reverseTrace: UnidirectionalTrace | undefined;
  let combinedNetworkOutcome: NetworkOutcome = forwardTrace.outcome;

  const forwardHypotheticallyDelivered =
    Boolean(options?.diagnosticContinueMode) &&
    forwardTrace.steps.some((s) => s.stage === 'DESTINATION_DELIVERED');

  if (intent.requireReturnPath && (forwardTrace.outcome === 'reachable' || forwardHypotheticallyDelivered)) {
    const reverseFlow: FlowHeader = {
      srcIp: stripCidr(dstBinding.ip),
      dstIp: stripCidr(srcBinding.ip),
      protocol: intent.protocol,
      dstPort: intent.destinationPort,
      vrf: dstInterface.vrf ?? 'default',
      vlanId: dstInterface.vlanId,
    };

    const rawReverseTrace = traceUnidirectional(
      snapshot,
      'reverse',
      dstDevice,
      dstInterface,
      srcDevice,
      reverseFlow,
      limitations,
      uncollectedItems,
      forwardFlow,
      options,
    );

    if (forwardTrace.outcome !== 'reachable') {
      reverseTrace = {
        ...rawReverseTrace,
        steps: rawReverseTrace.steps.map((s) => ({ ...s, hypotheticalContinuation: true })),
      };
    } else {
      reverseTrace = rawReverseTrace;
      if (reverseTrace.outcome === 'reachable') {
        combinedNetworkOutcome = 'reachable';
      } else if (reverseTrace.outcome === 'unknown') {
        combinedNetworkOutcome = 'unknown';
      } else {
        combinedNetworkOutcome = 'blocked';
      }
    }
  }

  const intentVerdict = computeIntentVerdict(combinedNetworkOutcome, intent.expectedNetworkOutcome);

  return {
    snapshotId: snapshot.id,
    semanticHash,
    intentId: intent.id,
    sourceBinding: srcBinding,
    destinationBinding: dstBinding,
    networkOutcome: combinedNetworkOutcome,
    intentVerdict,
    forwardTrace,
    reverseTrace,
    assumptions,
    limitations,
    uncollectedItems,
  };
}
