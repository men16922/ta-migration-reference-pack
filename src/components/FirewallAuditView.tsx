import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  CodeSnippet,
  Column,
  Grid,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tile,
} from '@carbon/react';
import {
  Clean,
  Policy,
  TrashCan,
  WarningAltFilled,
} from '@carbon/icons-react';
import {
  auditFirewallPolicies,
  type AuditFindingKind,
} from '../core/firewallAuditEngine';
import { getVendorLabelKo } from '../core/remediationGenerator';
import type { NetworkSnapshot } from '../core/types';

interface FirewallAuditViewProps {
  snapshot: NetworkSnapshot;
  onDeletePolicyRule: (ruleId: string, reasonKo: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const FirewallAuditView: React.FC<FirewallAuditViewProps> = ({
  snapshot,
  onDeletePolicyRule,
  onSelectDevice,
}) => {
  const [selectedFwId, setSelectedFwId] = useState<string>('ALL');
  const [selectedKind, setSelectedKind] = useState<string>('ALL');
  const [ruleSearchQuery, setRuleSearchQuery] = useState<string>('');

  const auditReport = useMemo(() => auditFirewallPolicies(snapshot, '2026-10-21'), [snapshot]);

  const firewalls = useMemo(
    () => snapshot.devices.filter((d) => d.role === 'firewall' || d.enforcesPolicy),
    [snapshot.devices],
  );

  const filteredFindings = useMemo(() => {
    return auditReport.findings.filter((f) => {
      if (selectedFwId !== 'ALL' && f.deviceId !== selectedFwId) return false;
      if (selectedKind !== 'ALL' && f.kind !== (selectedKind as AuditFindingKind)) return false;
      return true;
    });
  }, [auditReport.findings, selectedFwId, selectedKind]);

  const filteredRules = useMemo(() => {
    const q = ruleSearchQuery.trim().toLowerCase();
    return snapshot.policies
      .filter((p) => {
        if (selectedFwId !== 'ALL' && p.deviceId !== selectedFwId) return false;
        if (!q) return true;
        return (
          (p.name ?? p.id).toLowerCase().includes(q) ||
          (p.srcPrefix ?? '').toLowerCase().includes(q) ||
          (p.dstPrefix ?? '').toLowerCase().includes(q) ||
          (p.owner ?? '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId) || a.priority - b.priority);
  }, [snapshot.policies, selectedFwId, ruleSearchQuery]);

  const deviceMap = useMemo(
    () => new Map(snapshot.devices.map((d) => [d.id, d])),
    [snapshot.devices],
  );

  const handleBulkCleanup = () => {
    const uniqueRuleIds = Array.from(new Set(filteredFindings.map((f) => f.ruleId)));
    for (const rId of uniqueRuleIds) {
      onDeletePolicyRule(rId, `보안감사 일괄 정리 (${rId})`);
    }
  };

  return (
    <Stack gap={6}>
      {/* Carbon 16-Column Grid KPI Tiles */}
      <Grid fullWidth>
        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">ISMS-P 방화벽 정책 적합도 점수</p>
              <h2>{auditReport.complianceScore}점 / 100점</h2>
              <div>
                <Tag
                  type={
                    auditReport.complianceScore >= 90
                      ? 'green'
                      : auditReport.complianceScore >= 70
                        ? 'magenta'
                        : 'red'
                  }
                  size="sm"
                >
                  {auditReport.complianceScore >= 90
                    ? '최적화 완료'
                    : `정리 권장 정책 ${auditReport.totalFindings}건`}
                </Tag>
              </div>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">점검 대상 방화벽 / 전체 규칙 수</p>
              <h2>
                {firewalls.length}대 / {auditReport.totalRulesScanned}건
              </h2>
              <div>
                <Tag type="blue" size="sm">
                  Palo Alto · FortiGate · 시큐아이 · 안랩
                </Tag>
              </div>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">안 쓰이는 죽은 정책(Shadowed) &amp; 중복</p>
              <h2>
                {
                  auditReport.findings.filter(
                    (f) => f.kind === 'SHADOWED' || f.kind === 'REDUNDANT',
                  ).length
                }
                건
              </h2>
              <div>
                <Tag type="red" size="sm">
                  삭제해도 통신에 영향 없음
                </Tag>
              </div>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">너무 넓게 열린 위험 정책(ANY / 고위험 포트)</p>
              <h2>
                {
                  auditReport.findings.filter(
                    (f) =>
                      f.kind === 'OVERLY_PERMISSIVE' ||
                      f.kind === 'HIGH_RISK_PORT' ||
                      f.kind === 'EXPIRED_OR_UNUSED',
                  ).length
                }
                건
              </h2>
              <div>
                <Tag type="purple" size="sm">
                  최소 권한 축소 또는 만료 정리 대상
                </Tag>
              </div>
            </Stack>
          </Tile>
        </Column>
      </Grid>

      {/* 원클릭 정리 컨트롤 바 */}
      <Tile>
        <Layer>
          <Grid fullWidth>
            <Column lg={5} md={4} sm={4}>
              <Select
                id="audit-filter-fw"
                labelText="1. 어떤 방화벽을 점검할까요?"
                value={selectedFwId}
                onChange={(e) => setSelectedFwId(e.target.value)}
              >
                <SelectItem value="ALL" text={`전체 방화벽 한꺼번에 보기 (${firewalls.length}대)`} />
                {firewalls.map((fw) => (
                  <SelectItem
                    key={fw.id}
                    value={fw.id}
                    text={`${fw.name} [${getVendorLabelKo(fw.vendor)}]`}
                  />
                ))}
              </Select>
            </Column>

            <Column lg={5} md={4} sm={4}>
              <Select
                id="audit-filter-kind"
                labelText="2. 어떤 문제 유형만 골라 볼까요?"
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
              >
                <SelectItem value="ALL" text="전체 문제 정책 보기" />
                <SelectItem value="SHADOWED" text="가려진 죽은 정책 (Shadowed Rule)" />
                <SelectItem value="REDUNDANT" text="똑같은 중복 정책 (Redundant Rule)" />
                <SelectItem value="OVERLY_PERMISSIVE" text="ANY 과다허용 정책 (Overly Permissive)" />
                <SelectItem value="HIGH_RISK_PORT" text="고위험 포트 오픈 (Telnet 23 / RDP 3389)" />
                <SelectItem value="EXPIRED_OR_UNUSED" text="만료일 경과 및 장기 미사용 (Hit 0건)" />
              </Select>
            </Column>

            <Column lg={6} md={8} sm={4}>
              {filteredFindings.length > 0 && (
                <div style={{ paddingTop: '1.25rem' }}>
                  <Button
                    kind="danger"
                    size="md"
                    renderIcon={Clean}
                    onClick={handleBulkCleanup}
                  >
                    조회된 비정상·위험 정책 일괄 정리 ({filteredFindings.length}건)
                  </Button>
                </div>
              )}
            </Column>
          </Grid>
        </Layer>
      </Tile>

      {/* Carbon Tabs + Table + Accordion */}
      <Tile>
        <Tabs>
          <TabList aria-label="방화벽 감사 및 정책 원장 탭">
            <Tab renderIcon={WarningAltFilled}>
              1. 정리가 필요한 문제 정책 목록 ({filteredFindings.length}건)
            </Tab>
            <Tab renderIcon={Policy}>
              2. 전체 방화벽 규칙 통합 조회 ({filteredRules.length}건)
            </Tab>
          </TabList>

          <TabPanels>
            {/* 탭 1: 보안 감사 지적사항 */}
            <TabPanel>
              {filteredFindings.length === 0 ? (
                <InlineNotification
                  kind="success"
                  title="모든 방화벽 정책이 ISMS-P 및 사내 보안 기준을 충족합니다 (100점)."
                  subtitle="가려진 죽은 정책(Shadowed), 중복 정책(Redundant), ANY 과다허용 및 만료 경과 정책이 모두 정리되었습니다."
                  lowContrast
                  hideCloseButton
                />
              ) : (
                <Stack gap={5}>
                  <TableContainer
                    title="발견된 비정상·위험 방화벽 정책 및 원클릭 해결"
                    description="우측 [즉시 정리(삭제)] 버튼을 누르면 시뮬레이터에서 해당 규칙이 즉시 제거되고 보안 점수가 올라갑니다."
                  >
                    <Table size="lg" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          <TableHeader>위험도</TableHeader>
                          <TableHeader>문제 유형</TableHeader>
                          <TableHeader>방화벽 장비명</TableHeader>
                          <TableHeader>문제 규칙명 (순번)</TableHeader>
                          <TableHeader>왜 문제인가요? (진단 상세 설명)</TableHeader>
                          <TableHeader>원클릭 해결</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredFindings.map((finding) => (
                          <TableRow key={finding.id}>
                            <TableCell>
                              <Tag
                                type={
                                  finding.severity === 'critical'
                                    ? 'red'
                                    : finding.severity === 'high'
                                      ? 'magenta'
                                      : 'warm-gray'
                                }
                                size="sm"
                              >
                                {finding.severity.toUpperCase()}
                              </Tag>
                            </TableCell>
                            <TableCell>
                              <div>
                                <strong>{finding.kindLabelKo}</strong>
                              </div>
                              <span className="cds--helper-text">
                                {finding.ismsComplianceRef}
                              </span>
                            </TableCell>
                            <TableCell
                              onClick={() => onSelectDevice(finding.deviceId)}
                              style={{ cursor: 'pointer' }}
                            >
                              <strong>{finding.deviceName}</strong>
                              <div>
                                <Tag type="blue" size="sm">
                                  {finding.vendorLabelKo}
                                </Tag>
                              </div>
                            </TableCell>
                            <TableCell>
                              <code>
                                #{finding.rulePriority} {finding.ruleName}
                              </code>
                              <div>
                                <span className="cds--helper-text">({finding.ruleId})</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{finding.detailKo}</div>
                              <div className="cds--helper-text" style={{ marginTop: '0.25rem' }}>
                                💡 해결 가이드: {finding.recommendationKo}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                kind="danger--tertiary"
                                size="sm"
                                renderIcon={TrashCan}
                                onClick={() =>
                                  onDeletePolicyRule(
                                    finding.ruleId,
                                    `[${finding.deviceName}] ${finding.ruleName} (${finding.kindLabelKo}) 정리 완료`,
                                  )
                                }
                              >
                                즉시 정리(삭제)
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Accordion>
                    {filteredFindings.map((finding) => (
                      <AccordionItem
                        key={`acc-${finding.id}`}
                        title={`🔍 [상세 CLI 명령어 & REA 역공학 대역 분석 보기] ${finding.deviceName} — ${finding.ruleName}`}
                      >
                        <Stack gap={3}>
                          {finding.luciMatchSummary && (
                            <div>
                              <Tag type="teal" size="sm">
                                OpenWrt LuCI fw4 정규화 규칙 요약
                              </Tag>{' '}
                              <code>{finding.luciMatchSummary}</code>
                            </div>
                          )}
                          {finding.residualCidrs && finding.residualCidrs.length > 0 && (
                            <div>
                              <Tag type="purple" size="sm">
                                cidr-tools excludeCidr4 잔여 노출 서브넷
                              </Tag>{' '}
                              <code>{finding.residualCidrs.join(', ')}</code>
                            </div>
                          )}
                          <CodeSnippet type="multi" feedback="정리 CLI 복사됨">
                            {finding.cleanupCli}
                          </CodeSnippet>
                        </Stack>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </Stack>
              )}
            </TabPanel>

            {/* 탭 2: 전사 방화벽 정책 원장 */}
            <TabPanel>
              <TableContainer
                title="전체 방화벽 규칙 통합 조회"
                description="모든 방화벽의 우선순위, 출발지/목적지 대역, 포트, 누적 사용량(Hit 수), 만료일을 한곳에서 검색하고 관리합니다."
              >
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      placeholder="정책명, IP 대역, 담당자 검색..."
                      onChange={(e) => {
                        if (typeof e !== 'string' && e?.target) {
                          setRuleSearchQuery(e.target.value);
                        }
                      }}
                    />
                  </TableToolbarContent>
                </TableToolbar>

                <Table size="lg" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>방화벽 장비명</TableHeader>
                      <TableHeader>우선순위</TableHeader>
                      <TableHeader>정책명 (Rule ID)</TableHeader>
                      <TableHeader>출발지 Zone / 대역</TableHeader>
                      <TableHeader>목적지 Zone / 대역</TableHeader>
                      <TableHeader>서비스 / 포트</TableHeader>
                      <TableHeader>허용/차단</TableHeader>
                      <TableHeader>누적 사용량(Hit)</TableHeader>
                      <TableHeader>만료일 / 담당자</TableHeader>
                      <TableHeader>삭제</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRules.map((rule) => {
                      const dev = deviceMap.get(rule.deviceId);
                      return (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <strong>{dev?.name ?? rule.deviceId}</strong>
                            <div>
                              <Tag type="cyan" size="sm">
                                {getVendorLabelKo(dev?.vendor)}
                              </Tag>
                            </div>
                          </TableCell>
                          <TableCell>#{rule.priority}</TableCell>
                          <TableCell>
                            <strong>{rule.name ?? rule.id}</strong>
                            <div>
                              <code>{rule.id}</code>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{rule.srcZone ?? 'Any-Zone'}</div>
                            <code>{rule.srcPrefix ?? '0.0.0.0/0'}</code>
                          </TableCell>
                          <TableCell>
                            <div>{rule.dstZone ?? 'Any-Zone'}</div>
                            <code>{rule.dstPrefix ?? '0.0.0.0/0'}</code>
                          </TableCell>
                          <TableCell>
                            <code>
                              {rule.protocol.toUpperCase()}
                              {rule.dstPort ? `/${rule.dstPort}` : '/ANY'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Tag type={rule.action === 'allow' ? 'green' : 'red'} size="sm">
                              {rule.action.toUpperCase()}
                            </Tag>
                          </TableCell>
                          <TableCell>
                            {rule.hitCount !== undefined ? (
                              rule.hitCount === 0 ? (
                                <Tag type="warm-gray" size="sm">
                                  0건 (미사용)
                                </Tag>
                              ) : (
                                `${rule.hitCount.toLocaleString()}건`
                              )
                            ) : (
                              '신규반영'
                            )}
                          </TableCell>
                          <TableCell>
                            <div>{rule.expiresAt ?? '상시운용'}</div>
                            <span className="cds--helper-text">
                              {rule.owner ?? rule.ticketId ?? '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              iconDescription="정책 삭제"
                              hasIconOnly
                              onClick={() =>
                                onDeletePolicyRule(rule.id, `${rule.name ?? rule.id} 수동 삭제`)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Tile>
    </Stack>
  );
};
