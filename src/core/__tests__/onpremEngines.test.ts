import { describe, expect, it } from 'vitest';
import { analyzeIntent } from '../analyzer';
import {
  exportTicketsToCsv,
  exportTicketsToMarkdown,
  generateRemediationPlan,
} from '../remediationGenerator';
import {
  auditFirewallPolicies,
  containsCoalescedCidr4,
  excludeCidr4,
  isPrefixSubset,
  subparts4,
  synthesizeLuciRuleSummary,
} from '../firewallAuditEngine';
import {
  detectVendorFromConfigText,
  mergeParsedConfigIntoTopology,
  parseVendorConfigText,
  VENDOR_SAMPLE_CONFIGS,
} from '../../adapters/vendorConfigParser';
import {
  ONPREM_ASSURANCE_MATRIX_INTENTS,
  ONPREM_ENTERPRISE_DOCUMENT,
} from '../../fixtures/onPremEnterpriseTopology';

describe('On-Premise Integrated FPMS & Network Digital Twin Core Engines', () => {
  it('AFP Path Finder accurately distinguishes allowed vs blocked firewalls on multi-firewall path (WAS -> DB 1521)', () => {
    const snapshot = ONPREM_ENTERPRISE_DOCUMENT.semantic;
    const wasToDbIntent = ONPREM_ASSURANCE_MATRIX_INTENTS.find(
      (i) => i.id === 'assurance-was-to-db-1521',
    )!;
    const result = analyzeIntent(snapshot, wasToDbIntent, { diagnosticContinueMode: true });
    expect(result.networkOutcome).toBe('blocked');

    const plan = generateRemediationPlan(snapshot, wasToDbIntent, result, {
      ticketNo: 'SR-2026-0412',
    });

    expect(plan.overallStatus).toBe('REQUIRES_CHANGE');
    const fgHop = plan.hopDiagnostics.find((h) => h.deviceId === 'fw-internal-fg1000f');
    const bmHop = plan.hopDiagnostics.find((h) => h.deviceId === 'fw-db-bluemax');
    expect(fgHop?.status).toBe('ALREADY_ALLOWED');
    expect(bmHop?.status).toBe('ACTION_REQUIRED_POLICY');

    expect(plan.vendorCliSnippets.length).toBeGreaterThanOrEqual(1);
    const bmCli = plan.vendorCliSnippets.find((s) => s.vendor === 'secui');
    expect(bmCli).toBeDefined();
    expect(bmCli?.applyCli).toContain('firewall policy add rule-name');

    const csv = exportTicketsToCsv(plan);
    const md = exportTicketsToMarkdown(plan);
    expect(csv).toContain('SR-2026-0412');
    expect(md).toContain('시큐아이 (BLUEMAX NGF)');
  });

  it('Applying suggested remediation policy rule makes WAS -> DB 1521 reachable end-to-end', () => {
    const snapshot = structuredClone(ONPREM_ENTERPRISE_DOCUMENT.semantic);
    const wasToDbIntent = ONPREM_ASSURANCE_MATRIX_INTENTS.find(
      (i) => i.id === 'assurance-was-to-db-1521',
    )!;
    const before = analyzeIntent(snapshot, wasToDbIntent);
    expect(before.networkOutcome).toBe('blocked');

    const plan = generateRemediationPlan(snapshot, wasToDbIntent, before);
    snapshot.policies.push(...plan.suggestedPolicyRules);

    const after = analyzeIntent(snapshot, wasToDbIntent);
    expect(after.networkOutcome).toBe('reachable');
    expect(after.intentVerdict).toBe('pass');
  });

  it('REA-reconstructed cidr-tools (excludeCidr4 / subparts4 / containsCoalescedCidr4) and luci-app-firewall algorithms work accurately', () => {
    // 10.10.20.0/24 minus 10.10.20.0/25 leaves 10.10.20.128/25
    const diff = excludeCidr4(['10.10.20.0/24'], ['10.10.20.0/25']);
    expect(diff).toEqual(['10.10.20.128/25']);

    // Two adjacent /25 blocks coalesce to cover the entire /24 block
    expect(
      containsCoalescedCidr4(['10.10.20.0/25', '10.10.20.128/25'], '10.10.20.0/24'),
    ).toBe(true);

    // subparts4 decomposes an exact range [192.168.1.0, 192.168.1.255] into a single /24 block
    const parts = subparts4(0xc0a80100, 0xc0a801ff);
    expect(parts).toEqual(['192.168.1.0/24']);

    // synthesizeLuciRuleSummary formats firewall rule summary in OpenWrt LuCI fw4 format
    const summary = synthesizeLuciRuleSummary({
      id: 'test-rule',
      deviceId: 'fw-edge-pa5220',
      priority: 10,
      direction: 'forward',
      srcZone: 'Untrust',
      dstZone: 'DMZ',
      srcPrefix: '0.0.0.0/0',
      dstPrefix: '203.0.113.10/32',
      protocol: 'tcp',
      dstPort: 443,
      action: 'allow',
    });
    expect(summary).toContain('Forwarded IPv4, protocol TCP');
    expect(summary).toContain('From Zone [Untrust] IP 0.0.0.0/0');
    expect(summary).toContain('[ACCEPT]');
  });

  it('Firewall Audit Engine detects SHADOWED, REDUNDANT, OVERLY_PERMISSIVE, HIGH_RISK_PORT, and EXPIRED rules with REA metadata', () => {
    expect(isPrefixSubset('203.0.113.50/32', '203.0.113.0/24')).toBe(true);
    expect(isPrefixSubset('10.10.20.0/24', '172.16.0.0/16')).toBe(false);

    const report = auditFirewallPolicies(ONPREM_ENTERPRISE_DOCUMENT.semantic, '2026-10-21');
    expect(report.totalRulesScanned).toBeGreaterThanOrEqual(10);
    expect(report.findings.some((f) => f.kind === 'SHADOWED')).toBe(true);
    expect(report.findings.some((f) => f.kind === 'REDUNDANT')).toBe(true);
    expect(report.findings.some((f) => f.kind === 'OVERLY_PERMISSIVE')).toBe(true);
    expect(report.findings.some((f) => f.kind === 'HIGH_RISK_PORT')).toBe(true);
    expect(report.findings.some((f) => f.kind === 'EXPIRED_OR_UNUSED')).toBe(true);
    expect(report.findings.every((f) => Boolean(f.luciMatchSummary))).toBe(true);
  });

  it('Multi-Vendor Config Parser parses all 9 On-Premise vendor syntaxes and merges into Digital Twin', () => {
    const vendors = [
      'paloalto',
      'fortinet',
      'secui',
      'ahnlab',
      'cisco',
      'juniper',
      'arista',
      'f5',
      'linux',
    ] as const;

    let currentDoc = structuredClone(ONPREM_ENTERPRISE_DOCUMENT);

    for (const v of vendors) {
      const sample = VENDOR_SAMPLE_CONFIGS[v].sampleText;
      const detected = detectVendorFromConfigText(sample);
      expect(detected).toBe(v);

      const parsed = parseVendorConfigText(sample, v);
      expect(parsed.vendor).toBe(v);
      expect(parsed.interfaces.length).toBeGreaterThanOrEqual(1);

      currentDoc = mergeParsedConfigIntoTopology(currentDoc, parsed);
      expect(currentDoc.semantic.devices.some((d) => d.id === parsed.device.id)).toBe(true);
    }
  });
});
