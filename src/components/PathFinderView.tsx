import React, { useMemo, useState } from 'react';
import {
  Button,
  ButtonSet,
  ClickableTile,
  CodeSnippet,
  Column,
  Grid,
  InlineNotification,
  Layer,
  ProgressIndicator,
  ProgressStep,
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
  TextInput,
  Tile,
} from '@carbon/react';
import {
  CheckmarkFilled,
  DocumentDownload,
  ErrorFilled,
  FlashFilled,
  Network_3,
  Terminal,
} from '@carbon/icons-react';
import { analyzeIntent } from '../core/analyzer';
import {
  exportTicketsToCsv,
  exportTicketsToMarkdown,
  generateRemediationPlan,
  getVendorLabelKo,
} from '../core/remediationGenerator';
import type {
  CommunicationIntent,
  NetworkSnapshot,
  NodeAnnotation,
  PolicyRuleModel,
  RouteModel,
} from '../core/types';
import {
  ONPREM_TICKET_PRESETS,
  type OnPremPresetScenario,
} from '../fixtures/onPremEnterpriseTopology';
import { TopologyCanvas } from './TopologyCanvas';

interface PathFinderViewProps {
  snapshot: NetworkSnapshot;
  annotations: Record<string, NodeAnnotation>;
  selectedDeviceId?: string;
  onSelectDevice: (deviceId: string) => void;
  onApplyRemediation: (
    rules: PolicyRuleModel[],
    routes: RouteModel[],
    summaryKo: string,
  ) => void;
}

const KNOWN_SERVICES: Array<{
  label: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  port: string;
}> = [
  { label: '🗄️ Oracle DB (TCP 1521)', protocol: 'tcp', port: '1521' },
  { label: '🌐 HTTPS 웹 서비스 (TCP 443)', protocol: 'tcp', port: '443' },
  { label: '⚙️ WAS 내부 연동 (TCP 8080)', protocol: 'tcp', port: '8080' },
  { label: '🚀 CI/CD 배포 에이전트 (TCP 8443)', protocol: 'tcp', port: '8443' },
  { label: '🔐 Active Directory LDAP (TCP 389)', protocol: 'tcp', port: '389' },
  { label: '📡 DNS 도메인 조회 (UDP 53)', protocol: 'udp', port: '53' },
  { label: '🔑 SSH 서버 관리 (TCP 22)', protocol: 'tcp', port: '22' },
];

export const PathFinderView: React.FC<PathFinderViewProps> = ({
  snapshot,
  annotations,
  selectedDeviceId,
  onSelectDevice,
  onApplyRemediation,
}) => {
  const defaultScenario = ONPREM_TICKET_PRESETS[0]!;
  const [activePresetId, setActivePresetId] = useState<string>(defaultScenario.id);
  const [ticketNo, setTicketNo] = useState<string>(defaultScenario.ticketNo);
  const [titleKo, setTitleKo] = useState<string>(defaultScenario.titleKo);
  const [sourceWorkloadId, setSourceWorkloadId] = useState<string>(
    defaultScenario.sourceWorkloadId,
  );
  const [destinationWorkloadId, setDestinationWorkloadId] = useState<string>(
    defaultScenario.destinationWorkloadId,
  );
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'icmp'>(defaultScenario.protocol);
  const [portText, setPortText] = useState<string>(
    defaultScenario.destinationPort ? String(defaultScenario.destinationPort) : '',
  );
  const expirationDate = '2027-10-21';
  const [hopSearchQuery, setHopSearchQuery] = useState<string>('');

  const workloadMap = useMemo(
    () => new Map(snapshot.workloads.map((w) => [w.id, w])),
    [snapshot.workloads],
  );

  // AWS Reachability Analyzer 스타일: 모든 저장된 연결 테스트의 현재 상태를 실시간 평가
  const presetEvaluations = useMemo(() => {
    return ONPREM_TICKET_PRESETS.map((preset) => {
      const intent: CommunicationIntent = {
        id: preset.id,
        name: preset.titleKo,
        sourceWorkload: preset.sourceWorkloadId,
        destinationWorkload: preset.destinationWorkloadId,
        protocol: preset.protocol,
        destinationPort: preset.destinationPort,
        expectedNetworkOutcome: preset.expectedPolicyIntent,
        requireReturnPath: true,
      };
      const res = analyzeIntent(snapshot, intent, { diagnosticContinueMode: true });
      const plan = generateRemediationPlan(snapshot, intent, res, {
        ticketNo: preset.ticketNo,
        titleKo: preset.titleKo,
        expirationDate: '2027-10-21',
      });
      const blockedDevices = plan.hopDiagnostics
        .filter(
          (h) => h.status === 'ACTION_REQUIRED_POLICY' || h.status === 'ACTION_REQUIRED_ROUTE',
        )
        .map((h) => h.deviceName);
      return {
        preset,
        res,
        plan,
        blockedDevices,
      };
    });
  }, [snapshot]);

  const handleSelectScenario = (scenario: OnPremPresetScenario) => {
    setActivePresetId(scenario.id);
    setTicketNo(scenario.ticketNo);
    setTitleKo(scenario.titleKo);
    setSourceWorkloadId(scenario.sourceWorkloadId);
    setDestinationWorkloadId(scenario.destinationWorkloadId);
    setProtocol(scenario.protocol);
    setPortText(scenario.destinationPort ? String(scenario.destinationPort) : '');
  };

  const currentIntent: CommunicationIntent = useMemo(() => {
    const parsedPort = Number(portText);
    return {
      id: `afp-${ticketNo}`,
      name: titleKo,
      sourceWorkload: sourceWorkloadId,
      destinationWorkload: destinationWorkloadId,
      protocol,
      destinationPort:
        protocol === 'icmp' || !portText.trim() || Number.isNaN(parsedPort)
          ? undefined
          : parsedPort,
      expectedNetworkOutcome: 'allow',
      requireReturnPath: true,
    };
  }, [ticketNo, titleKo, sourceWorkloadId, destinationWorkloadId, protocol, portText]);

  const analysisResult = useMemo(
    () => analyzeIntent(snapshot, currentIntent, { diagnosticContinueMode: true }),
    [snapshot, currentIntent],
  );

  const remediationPlan = useMemo(
    () =>
      generateRemediationPlan(snapshot, currentIntent, analysisResult, {
        ticketNo,
        titleKo,
        expirationDate,
      }),
    [snapshot, currentIntent, analysisResult, ticketNo, titleKo, expirationDate],
  );

  const filteredTicketRows = useMemo(() => {
    const q = hopSearchQuery.trim().toLowerCase();
    if (!q) return remediationPlan.ticketRows;
    return remediationPlan.ticketRows.filter(
      (r) =>
        r.targetDeviceName.toLowerCase().includes(q) ||
        r.vendorLabelKo.toLowerCase().includes(q) ||
        r.srcZone.toLowerCase().includes(q) ||
        r.dstZone.toLowerCase().includes(q) ||
        r.justificationKo.toLowerCase().includes(q),
    );
  }, [remediationPlan.ticketRows, hopSearchQuery]);

  const blockedHops = useMemo(
    () =>
      remediationPlan.hopDiagnostics.filter(
        (h) => h.status === 'ACTION_REQUIRED_POLICY' || h.status === 'ACTION_REQUIRED_ROUTE',
      ),
    [remediationPlan.hopDiagnostics],
  );

  const handleDownloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAutoApplyRemediation = () => {
    if (
      remediationPlan.suggestedPolicyRules.length === 0 &&
      remediationPlan.suggestedRoutes.length === 0
    ) {
      return;
    }
    onApplyRemediation(
      remediationPlan.suggestedPolicyRules,
      remediationPlan.suggestedRoutes,
      `[${ticketNo}] 방화벽 정책 ${remediationPlan.suggestedPolicyRules.length}건 및 라우팅 ${remediationPlan.suggestedRoutes.length}건을 디지털 트윈에 즉시 반영했습니다.`,
    );
  };

  const srcWl = workloadMap.get(sourceWorkloadId);
  const dstWl = workloadMap.get(destinationWorkloadId);

  return (
    <Stack gap={6}>
      {/* 1. AWS Reachability Analyzer / GCP Connectivity Tests 스타일: 전체 연결 상태 목록 & 직접 경로 지정 */}
      <Tile>
        <Stack gap={5}>
          <TableContainer
            title="AWS Reachability Analyzer 스타일 — 주요 서버 간 통신 연결 테스트 목록 (Connectivity Tests)"
            description="행을 클릭하면 아래 [홉별 패킷 이동 경로 다이어그램]에 어디서 통과하고 어디서 막혔는지 즉시 표시됩니다. 막힌 구간은 우측 [즉시 방화벽 허용] 버튼 한 번으로 바로 뚫을 수 있습니다."
          >
            <Table size="md" useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>출발지 서버 (Source)</TableHeader>
                  <TableHeader>목적지 서버 (Destination)</TableHeader>
                  <TableHeader>서비스 포트</TableHeader>
                  <TableHeader>실시간 연결 상태</TableHeader>
                  <TableHeader>막힌 장비 (원인)</TableHeader>
                  <TableHeader>원클릭 동작</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {presetEvaluations.map(({ preset, plan, blockedDevices }) => {
                  const isSelected = activePresetId === preset.id;
                  const sWl = workloadMap.get(preset.sourceWorkloadId);
                  const dWl = workloadMap.get(preset.destinationWorkloadId);
                  return (
                    <TableRow
                      key={preset.id}
                      isSelected={isSelected}
                      onClick={() => handleSelectScenario(preset)}
                      style={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Tag type={isSelected ? 'blue' : 'cool-gray'} size="sm">
                          {preset.ticketNo}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        <strong>{sWl?.name ?? preset.sourceWorkloadId}</strong>
                      </TableCell>
                      <TableCell>
                        <strong>{dWl?.name ?? preset.destinationWorkloadId}</strong>
                      </TableCell>
                      <TableCell>
                        <code>
                          {preset.protocol.toUpperCase()}/{preset.destinationPort ?? 'ANY'}
                        </code>
                      </TableCell>
                      <TableCell>
                        {plan.overallStatus === 'ALL_OPEN' ? (
                          <Tag type="green" renderIcon={CheckmarkFilled}>
                            연결됨 (REACHABLE)
                          </Tag>
                        ) : (
                          <Tag type="red" renderIcon={ErrorFilled}>
                            차단됨 (BLOCKED)
                          </Tag>
                        )}
                      </TableCell>
                      <TableCell>
                        {blockedDevices.length === 0 ? (
                          <span>모든 경유 스위치·방화벽 통과</span>
                        ) : (
                          <strong>{blockedDevices.join(', ')}에서 차단됨</strong>
                        )}
                      </TableCell>
                      <TableCell>
                        {plan.overallStatus !== 'ALL_OPEN' &&
                        preset.expectedPolicyIntent === 'allow' ? (
                          <Button
                            kind="primary"
                            size="sm"
                            renderIcon={FlashFilled}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectScenario(preset);
                              onApplyRemediation(
                                plan.suggestedPolicyRules,
                                plan.suggestedRoutes,
                                `[${preset.ticketNo}] ${blockedDevices.join(', ')}에 허용 규칙을 자동 추가하여 통신을 개통했습니다.`,
                              );
                            }}
                          >
                            ⚡ 즉시 방화벽 허용
                          </Button>
                        ) : (
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectScenario(preset);
                            }}
                          >
                            경로 상세 보기
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* 직접 출발지·목적지·포트를 바꿔서 테스트할 수 있는 커스텀 분석 바 */}
          <Layer>
            <Tile>
              <Stack gap={4}>
                <p className="cds--label">
                  직접 경로 테스트 (Create &amp; Run Custom Path Analysis — 출발지·목적지·포트를 자유롭게 변경해 보세요)
                </p>
                <Grid fullWidth>
                  <Column lg={4} md={4} sm={4}>
                    <Select
                      id="afp-source-workload"
                      labelText="출발지 서버 (Source)"
                      value={sourceWorkloadId}
                      onChange={(e) => {
                        setSourceWorkloadId(e.target.value);
                        setActivePresetId('custom');
                      }}
                    >
                      {snapshot.workloads.map((w) => (
                        <SelectItem
                          key={w.id}
                          value={w.id}
                          text={`${w.name} (${w.description ?? w.tier})`}
                        />
                      ))}
                    </Select>
                  </Column>

                  <Column lg={4} md={4} sm={4}>
                    <Select
                      id="afp-dest-workload"
                      labelText="목적지 서버 (Destination)"
                      value={destinationWorkloadId}
                      onChange={(e) => {
                        setDestinationWorkloadId(e.target.value);
                        setActivePresetId('custom');
                      }}
                    >
                      {snapshot.workloads.map((w) => (
                        <SelectItem
                          key={w.id}
                          value={w.id}
                          text={`${w.name} (${w.description ?? w.tier})`}
                        />
                      ))}
                    </Select>
                  </Column>

                  <Column lg={4} md={4} sm={4}>
                    <Select
                      id="quick-service-select"
                      labelText="서비스 포트 빠른 선택"
                      value={
                        KNOWN_SERVICES.find(
                          (s) => s.protocol === protocol && s.port === portText,
                        )?.label ?? 'custom'
                      }
                      onChange={(e) => {
                        const found = KNOWN_SERVICES.find((s) => s.label === e.target.value);
                        if (found) {
                          setProtocol(found.protocol);
                          setPortText(found.port);
                          setActivePresetId('custom');
                        }
                      }}
                    >
                      {KNOWN_SERVICES.map((svc) => (
                        <SelectItem key={svc.label} value={svc.label} text={svc.label} />
                      ))}
                      <SelectItem value="custom" text="✏️ 포트 번호 직접 입력" />
                    </Select>
                  </Column>

                  <Column lg={2} md={2} sm={2}>
                    <Select
                      id="afp-protocol"
                      labelText="프로토콜"
                      value={protocol}
                      onChange={(e) => {
                        setProtocol(e.target.value as 'tcp' | 'udp' | 'icmp');
                        setActivePresetId('custom');
                      }}
                    >
                      <SelectItem value="tcp" text="TCP" />
                      <SelectItem value="udp" text="UDP" />
                      <SelectItem value="icmp" text="ICMP" />
                    </Select>
                  </Column>

                  <Column lg={2} md={2} sm={2}>
                    <TextInput
                      id="afp-port"
                      labelText="포트 번호"
                      value={portText}
                      disabled={protocol === 'icmp'}
                      onChange={(e) => {
                        setPortText(e.target.value);
                        setActivePresetId('custom');
                      }}
                    />
                  </Column>
                </Grid>
              </Stack>
            </Tile>
          </Layer>
        </Stack>
      </Tile>

      {/* 2. AWS Reachability Analyzer 스타일: 홉별 패킷 이동 경로 다이어그램 (Hop-by-Hop Path Trace) */}
      <Tile>
        <Stack gap={5}>
          <Grid fullWidth>
            <Column lg={10} md={5} sm={4}>
              <Stack gap={2}>
                <div>
                  <Tag
                    type={remediationPlan.overallStatus === 'ALL_OPEN' ? 'green' : 'red'}
                    size="sm"
                  >
                    실시간 패킷 경로 추적 결과 (Path Trace)
                  </Tag>
                </div>
                <h3>
                  {srcWl?.name ?? sourceWorkloadId} ➔ {dstWl?.name ?? destinationWorkloadId} (
                  {protocol.toUpperCase()}/{portText || 'ANY'})
                </h3>
                <p className="cds--helper-text">
                  {remediationPlan.overallStatus === 'ALL_OPEN'
                    ? '✅ 출발지 서버에서 목적지 서버까지 경유하는 모든 스위치와 방화벽이 정상 허용(ALLOW)되어 있습니다.'
                    : `🚨 총 ${remediationPlan.hopDiagnostics.length}대의 경유 장비 중 [${blockedHops.map((b) => b.deviceName).join(', ')}]에서 정책이 없어 차단되었습니다. 우측 파란색 버튼을 누르면 차단된 방화벽에 허용 규칙이 즉시 추가됩니다!`}
                </p>
              </Stack>
            </Column>

            <Column lg={6} md={3} sm={4}>
              <Stack gap={3}>
                {(remediationPlan.suggestedPolicyRules.length > 0 ||
                  remediationPlan.suggestedRoutes.length > 0) && (
                  <Button
                    kind="primary"
                    size="lg"
                    renderIcon={FlashFilled}
                    onClick={handleAutoApplyRemediation}
                  >
                    권고 정책을 디지털 트윈에 즉시 반영하여 개통 확인 (
                    {remediationPlan.suggestedPolicyRules.length +
                      remediationPlan.suggestedRoutes.length}
                    건)
                  </Button>
                )}
                <ButtonSet>
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={DocumentDownload}
                    onClick={() =>
                      handleDownloadFile(
                        `${ticketNo}_방화벽신청서.csv`,
                        exportTicketsToCsv(remediationPlan),
                        'text/csv;charset=utf-8;',
                      )
                    }
                  >
                    방화벽 신청서(CSV)
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    renderIcon={DocumentDownload}
                    onClick={() =>
                      handleDownloadFile(
                        `${ticketNo}_야간작업계획서_MOP.md`,
                        exportTicketsToMarkdown(remediationPlan),
                        'text/markdown;charset=utf-8;',
                      )
                    }
                  >
                    작업계획서(MOP.md)
                  </Button>
                </ButtonSet>
              </Stack>
            </Column>
          </Grid>

          <InlineNotification
            kind={remediationPlan.overallStatus === 'ALL_OPEN' ? 'success' : 'error'}
            title={
              remediationPlan.overallStatus === 'ALL_OPEN'
                ? '양방향 통신 개통 완료 (REACHABLE)'
                : '경유 구간 차단 탐지 — 신규 방화벽 정책 또는 라우팅 작업 필요'
            }
            subtitle={remediationPlan.summaryKo}
            lowContrast
            hideCloseButton
          />

          {/* 홉별 진행 표시줄 (ProgressIndicator) */}
          <ProgressIndicator spaceEqually>
            {remediationPlan.hopDiagnostics.map((hop) => (
              <ProgressStep
                key={`${hop.hopIndex}-${hop.deviceId}`}
                label={`${hop.hopIndex}단계: ${hop.deviceName}`}
                secondaryLabel={
                  hop.status === 'ALREADY_ALLOWED'
                    ? '✅ 방화벽 통과'
                    : hop.status === 'TRANSIT_OK'
                      ? '✅ 정상 라우팅'
                      : '❌ 여기서 차단됨!'
                }
                complete={hop.status === 'ALREADY_ALLOWED' || hop.status === 'TRANSIT_OK'}
                invalid={
                  hop.status === 'ACTION_REQUIRED_POLICY' ||
                  hop.status === 'ACTION_REQUIRED_ROUTE'
                }
              />
            ))}
          </ProgressIndicator>

          {/* 홉별 시각적 카드 (클릭 시 해당 장비의 방화벽 규칙/라우팅 인스펙터 열림) */}
          <Layer>
            <Grid condensed fullWidth>
              {remediationPlan.hopDiagnostics.map((hop) => {
                const isBlocked =
                  hop.status === 'ACTION_REQUIRED_POLICY' ||
                  hop.status === 'ACTION_REQUIRED_ROUTE';
                return (
                  <Column key={`card-${hop.hopIndex}-${hop.deviceId}`} lg={4} md={4} sm={4}>
                    <ClickableTile
                      id={`hop-card-${hop.hopIndex}`}
                      onClick={() => onSelectDevice(hop.deviceId)}
                    >
                      <Stack gap={2}>
                        <div>
                          <Tag type={isBlocked ? 'red' : 'green'} size="sm">
                            {isBlocked
                              ? `❌ 홉 #${hop.hopIndex} 차단됨 (조치 필요)`
                              : `✅ 홉 #${hop.hopIndex} 통과`}
                          </Tag>{' '}
                          <Tag type="cool-gray" size="sm">
                            {getVendorLabelKo(hop.vendor)}
                          </Tag>
                        </div>
                        <strong>{hop.deviceName}</strong>
                        <p className="cds--helper-text">
                          구간: <code>{hop.ingressZone}</code> ➔ <code>{hop.egressZone}</code>
                        </p>
                        <p className="cds--helper-text">{hop.reasonKo}</p>
                        <Tag type="blue" size="sm">
                          클릭하여 장비 규칙/라우팅 상세 보기
                        </Tag>
                      </Stack>
                    </ClickableTile>
                  </Column>
                );
              })}
            </Grid>
          </Layer>
        </Stack>
      </Tile>

      {/* 3. AWS VPC Resource Map 스타일 전체 토폴로지 & 방화벽 신청서 / CLI 탭 */}
      <Tile>
        <Tabs>
          <TabList aria-label="토폴로지 맵 및 신청서 상세 탭">
            <Tab renderIcon={Network_3}>
              1. 전체 네트워크 아키텍처 맵 (VPC Security Zones &amp; 장비 클릭 조회)
            </Tab>
            <Tab renderIcon={FlashFilled}>
              2. 방화벽 정책 신청서 자동 설계 표 ({remediationPlan.ticketRows.length}대 경유 장비)
            </Tab>
            <Tab renderIcon={Terminal}>
              3. 장비 투입용 CLI 명령어 스크립트 ({remediationPlan.vendorCliSnippets.length}건)
            </Tab>
          </TabList>

          <TabPanels>
            {/* 탭 1: 전체 네트워크 토폴로지 맵 (기본 표시!) */}
            <TabPanel>
              <TopologyCanvas
                snapshot={snapshot}
                annotations={annotations}
                analysisResult={analysisResult}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={onSelectDevice}
              />
            </TabPanel>

            {/* 탭 2: 방화벽 정책 신청서 자동 설계 표 */}
            <TabPanel>
              <TableContainer
                title="방화벽 정책 신청서 자동 설계 표 (이미 열린 장비 vs 새로 열어야 할 장비 구분)"
                description="빨간색 [작업필수]로 표시된 방화벽에만 정책을 추가하면 됩니다."
              >
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      placeholder="장비명, 벤더, 보안 구간 검색..."
                      onChange={(e) => {
                        if (typeof e !== 'string' && e?.target) {
                          setHopSearchQuery(e.target.value);
                        }
                      }}
                    />
                  </TableToolbarContent>
                </TableToolbar>
                <Table size="lg" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>순번</TableHeader>
                      <TableHeader>작업 필요 여부</TableHeader>
                      <TableHeader>대상 장비명 (벤더)</TableHeader>
                      <TableHeader>출발지 Zone / IP</TableHeader>
                      <TableHeader>목적지 Zone / IP</TableHeader>
                      <TableHeader>NAT 변환 (F5 VIP)</TableHeader>
                      <TableHeader>서비스 포트</TableHeader>
                      <TableHeader>자동 설계된 규칙명 / 기존 허용 규칙</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTicketRows.map((row) => (
                      <TableRow
                        key={`${row.ticketSeq}-${row.targetDeviceId}`}
                        onClick={() => onSelectDevice(row.targetDeviceId)}
                        style={{ cursor: 'pointer' }}
                      >
                        <TableCell>#{row.ticketSeq}</TableCell>
                        <TableCell>
                          {row.actionRequired ? (
                            <Tag type="red" size="sm" renderIcon={ErrorFilled}>
                              {row.requestType} (작업필수)
                            </Tag>
                          ) : (
                            <Tag type="green" size="sm" renderIcon={CheckmarkFilled}>
                              {row.requestType} (이미열림)
                            </Tag>
                          )}
                        </TableCell>
                        <TableCell>
                          <strong>{row.targetDeviceName}</strong>
                          <div>
                            <Tag type="blue" size="sm">
                              {row.vendorLabelKo}
                            </Tag>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <strong>{row.srcZone}</strong>
                          </div>
                          <code>{row.srcIp}</code>
                        </TableCell>
                        <TableCell>
                          <div>
                            <strong>{row.dstZone}</strong>
                          </div>
                          <code>{row.dstIp}</code>
                        </TableCell>
                        <TableCell>
                          <code>{row.natTranslation}</code>
                        </TableCell>
                        <TableCell>
                          <code>
                            {row.protocol}/{row.port}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div>
                            <code>{row.recommendedRuleName}</code>
                          </div>
                          <span className="cds--helper-text">{row.existingRuleRef}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>

            {/* 탭 3: 벤더별 CLI 스크립트 */}
            <TabPanel>
              {remediationPlan.vendorCliSnippets.length === 0 ? (
                <InlineNotification
                  kind="success"
                  title="추가할 CLI 스크립트가 없습니다"
                  subtitle="모든 경유 장비에서 이미 정상 허용되어 있으므로 별도의 CLI 명령어 투입이 필요하지 않습니다."
                  lowContrast
                  hideCloseButton
                />
              ) : (
                <Tabs>
                  <TabList aria-label="벤더별 CLI 스크립트 탭">
                    {remediationPlan.vendorCliSnippets.map((snippet) => (
                      <Tab key={snippet.deviceId}>
                        {snippet.deviceName} ({snippet.vendorLabelKo})
                      </Tab>
                    ))}
                  </TabList>
                  <TabPanels>
                    {remediationPlan.vendorCliSnippets.map((snippet) => (
                      <TabPanel key={snippet.deviceId}>
                        <Grid fullWidth>
                          <Column lg={8} md={4} sm={4}>
                            <p className="cds--label">
                              1. 정책 개통 반영 스크립트 (Apply CLI — 복사하여 장비에 붙여넣기)
                            </p>
                            <CodeSnippet type="multi" feedback="클립보드에 복사되었습니다">
                              {snippet.applyCli}
                            </CodeSnippet>
                          </Column>
                          <Column lg={8} md={4} sm={4}>
                            <p className="cds--label">
                              2. 비상 원복 스크립트 (Rollback CLI — 장애 시 즉시 복구용)
                            </p>
                            <CodeSnippet type="multi" feedback="클립보드에 복사되었습니다">
                              {snippet.rollbackCli}
                            </CodeSnippet>
                          </Column>
                        </Grid>
                      </TabPanel>
                    ))}
                  </TabPanels>
                </Tabs>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Tile>
    </Stack>
  );
};
