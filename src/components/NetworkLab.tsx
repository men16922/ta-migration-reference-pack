import React, { useMemo, useState } from 'react';
import {
  Button,
  Column,
  ContentSwitcher,
  Grid,
  InlineNotification,
  Stack,
  Switch,
  Tag,
  Tile,
} from '@carbon/react';
import { Reset } from '@carbon/icons-react';
import { auditFirewallPolicies } from '../core/firewallAuditEngine';
import type {
  PolicyRuleModel,
  RouteModel,
  TopologyDocument,
} from '../core/types';
import { ONPREM_ENTERPRISE_DOCUMENT } from '../fixtures/onPremEnterpriseTopology';
import { PathFinderView } from './PathFinderView';
import { FirewallAuditView } from './FirewallAuditView';
import { TopologyBuilderView } from './TopologyBuilderView';
import { PreChangeSimulatorView } from './PreChangeSimulatorView';
import { DeviceInspectorDrawer } from './DeviceInspectorDrawer';

type ConsoleWorkspaceTab =
  | 'afp-pathfinder'
  | 'firewall-audit'
  | 'config-builder'
  | 'prechange-mop';

const TAB_KEYS: ConsoleWorkspaceTab[] = [
  'afp-pathfinder',
  'firewall-audit',
  'config-builder',
  'prechange-mop',
];

/**
 * 네트워크 분석(실험): 결정론 도달성·방화벽 정책 점검·변경 영향 시뮬레이터. 콘솔 셸 안의 한 페이지로 렌더된다.
 */
export const NetworkLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConsoleWorkspaceTab>('afp-pathfinder');

  const baselineDoc = useMemo(() => structuredClone(ONPREM_ENTERPRISE_DOCUMENT), []);
  const [currentDoc, setCurrentDoc] = useState<TopologyDocument>(() =>
    structuredClone(ONPREM_ENTERPRISE_DOCUMENT),
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [changeHistory, setChangeHistory] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const auditSummary = useMemo(
    () => auditFirewallPolicies(currentDoc.semantic, '2026-10-21'),
    [currentDoc.semantic],
  );

  const firewallCount = useMemo(
    () =>
      currentDoc.semantic.devices.filter((d) => d.role === 'firewall' || d.enforcesPolicy).length,
    [currentDoc.semantic.devices],
  );

  const switchAndL4Count = useMemo(
    () =>
      currentDoc.semantic.devices.filter((d) => d.role !== 'firewall' && !d.enforcesPolicy).length,
    [currentDoc.semantic.devices],
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const handleApplyRemediation = (
    rules: PolicyRuleModel[],
    routes: RouteModel[],
    summaryKo: string,
  ) => {
    setCurrentDoc((prev) => {
      const next = structuredClone(prev);
      next.semantic.policies.push(...rules);
      next.semantic.routes.push(...routes);
      return next;
    });
    setChangeHistory((prev) => [...prev, summaryKo]);
    showToast(summaryKo);
  };

  const handleDeletePolicyRule = (ruleId: string, reasonKo: string) => {
    setCurrentDoc((prev) => {
      const next = structuredClone(prev);
      next.semantic.policies = next.semantic.policies.filter((p) => p.id !== ruleId);
      return next;
    });
    setChangeHistory((prev) => [...prev, `방화벽 정책 삭제: ${reasonKo}`]);
    showToast(reasonKo);
  };

  const handleUpdateDocument = (nextDoc: TopologyDocument, messageKo: string) => {
    setCurrentDoc(nextDoc);
    setChangeHistory((prev) => [...prev, messageKo]);
    showToast(messageKo);
  };

  const handleAddPolicyRule = (rule: PolicyRuleModel, messageKo: string) => {
    setCurrentDoc((prev) => {
      const next = structuredClone(prev);
      next.semantic.policies.push(rule);
      return next;
    });
    setChangeHistory((prev) => [...prev, messageKo]);
    showToast(messageKo);
  };

  const handleAddRoute = (route: RouteModel, messageKo: string) => {
    setCurrentDoc((prev) => {
      const next = structuredClone(prev);
      next.semantic.routes.push(route);
      return next;
    });
    setChangeHistory((prev) => [...prev, messageKo]);
    showToast(messageKo);
  };

  const handleResetBaseline = () => {
    setCurrentDoc(structuredClone(ONPREM_ENTERPRISE_DOCUMENT));
    setChangeHistory([]);
    showToast('온프레미스 디지털 트윈 상태를 초기 운영 기준점(Baseline)으로 원복했습니다.');
  };

  const handleSimulatePresetChange = (
    presetKind: 'OPEN_WAS_DB' | 'BREAK_CORE_ROUTE' | 'RESET_BASELINE',
  ) => {
    if (presetKind === 'RESET_BASELINE') {
      handleResetBaseline();
      return;
    }
    if (presetKind === 'OPEN_WAS_DB') {
      const base = structuredClone(ONPREM_ENTERPRISE_DOCUMENT);
      base.semantic.policies.push({
        id: 'bm-sim-was-db-1521',
        deviceId: 'fw-db-bluemax',
        name: 'ALLOW_WAS_TO_ORACLE_1521',
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
        expiresAt: '2027-10-21',
        ticketId: 'SR-2026-0412',
      });
      setCurrentDoc(base);
      const msg =
        '[SR-2026-0412 시뮬레이션] 시큐아이 BLUEMAX NGF-2000에 내부 WAS(10.10.20.15) ➔ DB보안망 Oracle(10.50.30.100:1521) 허용 정책을 반영했습니다.';
      setChangeHistory([msg]);
      showToast(msg);
    } else if (presetKind === 'BREAK_CORE_ROUTE') {
      const base = structuredClone(ONPREM_ENTERPRISE_DOCUMENT);
      base.semantic.routes = base.semantic.routes.filter(
        (r) => r.id !== 'rt-arista-to-work',
      );
      setCurrentDoc(base);
      const msg =
        '[장애 유발 시뮬레이션] Arista 7050X3 코어 스위치에서 내부 업무망(10.10.20.0/24) 정적 라우팅이 오삭제되었습니다 — 기존 핵심 서비스 단절(Regression)이 즉시 탐지됩니다!';
      setChangeHistory([msg]);
      showToast(msg);
    }
  };

  return (
        <Grid fullWidth>
          <Column lg={16} md={8} sm={4}>
            <Stack gap={5}>
              {/* AWS VPC / GCP Network Intelligence 스타일 상단 리소스 현황 바 */}
              <Grid condensed fullWidth>
                <Column lg={4} md={4} sm={4}>
                  <Tile>
                    <p className="cds--label">🖥️ 서버 워크로드 (Instances)</p>
                    <h3>{currentDoc.semantic.workloads.length}대 운영 중</h3>
                    <Tag type="blue" size="sm">
                      DMZ웹 · 내부WAS · 개발CI/CD · DB · AD
                    </Tag>
                  </Tile>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <Tile>
                    <p className="cds--label">🛡️ 방화벽 &amp; 보안 그룹 (Firewalls)</p>
                    <h3>
                      {firewallCount}대 / 규칙 {currentDoc.semantic.policies.length}개
                    </h3>
                    <Tag type="purple" size="sm">
                      Palo Alto · FortiGate · 시큐아이 · 안랩
                    </Tag>
                  </Tile>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <Tile>
                    <p className="cds--label">🔀 라우터 · 스위치 · L4 (Route Tables)</p>
                    <h3>
                      {switchAndL4Count}대 / 라우팅 {currentDoc.semantic.routes.length}개
                    </h3>
                    <Tag type="teal" size="sm">
                      Arista · Cisco · Juniper · F5 BIG-IP
                    </Tag>
                  </Tile>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <Tile>
                    <p className="cds--label">🔍 방화벽 보안 점수 (Policy Advisor)</p>
                    <h3>{auditSummary.complianceScore}점 / 100점</h3>
                    <div>
                      <Tag type={auditSummary.totalFindings === 0 ? 'green' : 'red'} size="sm">
                        {auditSummary.totalFindings === 0
                          ? '최적화 완료'
                          : `정리 필요 규칙 ${auditSummary.totalFindings}건`}
                      </Tag>
                      {changeHistory.length > 0 && (
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Reset}
                          onClick={handleResetBaseline}
                        >
                          원복 ({changeHistory.length}건)
                        </Button>
                      )}
                    </div>
                  </Tile>
                </Column>
              </Grid>

              {/* 화면 크기에 상관없이 항상 보이는 클라우드 콘솔 메인 모듈 스위처 */}
              <ContentSwitcher
                size="lg"
                selectedIndex={TAB_KEYS.indexOf(activeTab)}
                onChange={(data) => {
                  const nextKey = TAB_KEYS[data.index ?? 0];
                  if (nextKey) setActiveTab(nextKey);
                }}
              >
                <Switch
                  name="afp-pathfinder"
                  text="1. 통신 경로 분석기 & 토폴로지 맵 (Reachability Analyzer)"
                />
                <Switch
                  name="firewall-audit"
                  text={`2. 방화벽 정책 감사 & 자동 정리 (${auditSummary.totalFindings}건)`}
                />
                <Switch
                  name="config-builder"
                  text={`3. 방화벽 규칙·라우팅 추가 & 장비 등록 (${currentDoc.semantic.devices.length}대)`}
                />
                <Switch
                  name="prechange-mop"
                  text="4. 작업 전 변경 영향도 테스트 (What-If Simulator)"
                />
              </ContentSwitcher>

              {toastMessage && (
                <InlineNotification
                  kind="info"
                  title="네트워크 상태가 즉시 업데이트되었습니다"
                  subtitle={toastMessage}
                  lowContrast
                  onCloseButtonClick={() => setToastMessage(null)}
                />
              )}

              {activeTab === 'afp-pathfinder' && (
                <PathFinderView
                  snapshot={currentDoc.semantic}
                  annotations={currentDoc.annotations.nodes}
                  selectedDeviceId={selectedDeviceId}
                  onSelectDevice={(devId) => setSelectedDeviceId(devId)}
                  onApplyRemediation={handleApplyRemediation}
                />
              )}

              {activeTab === 'firewall-audit' && (
                <FirewallAuditView
                  snapshot={currentDoc.semantic}
                  onDeletePolicyRule={handleDeletePolicyRule}
                  onSelectDevice={(devId) => setSelectedDeviceId(devId)}
                />
              )}

              {activeTab === 'config-builder' && (
                <TopologyBuilderView
                  document={currentDoc}
                  onUpdateDocument={handleUpdateDocument}
                  onAddPolicyRule={handleAddPolicyRule}
                  onAddRoute={handleAddRoute}
                  onSelectDevice={(devId) => setSelectedDeviceId(devId)}
                />
              )}

              {activeTab === 'prechange-mop' && (
                <PreChangeSimulatorView
                  baselineSnapshot={baselineDoc.semantic}
                  currentSnapshot={currentDoc.semantic}
                  changeHistory={changeHistory}
                  onSimulatePresetChange={handleSimulatePresetChange}
                />
              )}

              {/* 장비를 클릭했을 때 열리는 리소스 상세 인스펙터 */}
              <DeviceInspectorDrawer
                snapshot={currentDoc.semantic}
                deviceId={selectedDeviceId}
                onClose={() => setSelectedDeviceId(undefined)}
              />
            </Stack>
          </Column>
        </Grid>
  );
};
