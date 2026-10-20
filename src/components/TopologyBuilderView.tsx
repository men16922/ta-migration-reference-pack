import React, { useMemo, useState } from 'react';
import {
  Button,
  Column,
  ContentSwitcher,
  Form,
  Grid,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Stack,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Switch,
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
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { Add, Code, DataBase, Upload } from '@carbon/icons-react';
import {
  detectVendorFromConfigText,
  mergeParsedConfigIntoTopology,
  parseVendorConfigText,
  VENDOR_SAMPLE_CONFIGS,
} from '../adapters/vendorConfigParser';
import { getVendorLabelKo } from '../core/remediationGenerator';
import type {
  OnPremVendor,
  PolicyRuleModel,
  ProtocolKind,
  RouteModel,
  TopologyDocument,
} from '../core/types';

interface TopologyBuilderViewProps {
  document: TopologyDocument;
  onUpdateDocument: (nextDoc: TopologyDocument, messageKo: string) => void;
  onAddPolicyRule: (rule: PolicyRuleModel, messageKo: string) => void;
  onAddRoute: (route: RouteModel, messageKo: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

const VENDOR_KEYS: OnPremVendor[] = [
  'paloalto',
  'fortinet',
  'secui',
  'ahnlab',
  'cisco',
  'juniper',
  'arista',
  'f5',
  'linux',
];

export const TopologyBuilderView: React.FC<TopologyBuilderViewProps> = ({
  document,
  onUpdateDocument,
  onAddPolicyRule,
  onAddRoute,
  onSelectDevice,
}) => {
  const [selectedSampleVendor, setSelectedSampleVendor] = useState<OnPremVendor>('paloalto');
  const [configText, setConfigText] = useState<string>(VENDOR_SAMPLE_CONFIGS.paloalto.sampleText);
  const [inventorySearch, setInventorySearch] = useState<string>('');

  const firewalls = useMemo(
    () => document.semantic.devices.filter((d) => d.role === 'firewall' || d.enforcesPolicy),
    [document.semantic.devices],
  );
  const [ruleDeviceId, setRuleDeviceId] = useState<string>(firewalls[0]?.id ?? 'fw-db-bluemax');
  const [ruleName, setRuleName] = useState<string>('ALLOW_WAS_TO_ORACLE_1521');
  const [rulePriority, setRulePriority] = useState<string>('15');
  const [ruleSrcPrefix, setRuleSrcPrefix] = useState<string>('10.10.20.15/32');
  const [ruleDstPrefix, setRuleDstPrefix] = useState<string>('10.50.30.100/32');
  const [ruleProtocol, setRuleProtocol] = useState<ProtocolKind>('tcp');
  const [rulePort, setRulePort] = useState<string>('1521');
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny'>('allow');
  const [ruleExpiresAt, setRuleExpiresAt] = useState<string>('2027-10-21');

  const [routeDeviceId, setRouteDeviceId] = useState<string>('core-sw-arista');
  const [routeDstPrefix, setRouteDstPrefix] = useState<string>('10.80.20.0/24');
  const [routeNextHop, setRouteNextHop] = useState<string>('10.254.3.2');

  const detectedVendor = useMemo(() => detectVendorFromConfigText(configText), [configText]);
  const parsedPreview = useMemo(
    () => parseVendorConfigText(configText, detectedVendor),
    [configText, detectedVendor],
  );

  const handleLoadVendorSample = (vendor: OnPremVendor) => {
    setSelectedSampleVendor(vendor);
    setConfigText(VENDOR_SAMPLE_CONFIGS[vendor].sampleText);
  };

  const handleMergeParsedDevice = () => {
    const nextDoc = mergeParsedConfigIntoTopology(document, parsedPreview);
    onUpdateDocument(
      nextDoc,
      `[${getVendorLabelKo(parsedPreview.vendor)}] ${parsedPreview.device.name} 장비(인터페이스 ${parsedPreview.interfaces.length}개, 라우팅 ${parsedPreview.routes.length}건, 정책 ${parsedPreview.policies.length}건)가 디지털 트윈 토폴로지에 병합되었습니다.`,
    );
  };

  const handleSubmitGuiRule = (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = Number(rulePort);
    const newRule: PolicyRuleModel = {
      id: `gui-rule-${Date.now().toString(36).slice(-5)}`,
      deviceId: ruleDeviceId,
      name: ruleName.trim() || 'CUSTOM_GUI_RULE',
      priority: Number(rulePriority) || 10,
      direction: 'forward',
      srcPrefix: ruleSrcPrefix.trim() || '0.0.0.0/0',
      dstPrefix: ruleDstPrefix.trim() || '0.0.0.0/0',
      protocol: ruleProtocol,
      dstPort:
        ruleProtocol === 'icmp' || ruleProtocol === 'any' || Number.isNaN(portNum)
          ? undefined
          : portNum,
      action: ruleAction,
      stateful: true,
      expiresAt: ruleExpiresAt,
      description: 'GUI 정책 빌더에서 수동 추가된 방화벽 규칙',
    };
    onAddPolicyRule(
      newRule,
      `[${ruleDeviceId}] 방화벽에 ${newRule.name} (${newRule.srcPrefix} ➔ ${newRule.dstPrefix} ${newRule.protocol.toUpperCase()}/${newRule.dstPort ?? 'ANY'} ${newRule.action.toUpperCase()}) 정책을 등록했습니다.`,
    );
  };

  const handleSubmitGuiRoute = (e: React.FormEvent) => {
    e.preventDefault();
    const devIfs = document.semantic.interfaces.filter((i) => i.deviceId === routeDeviceId);
    const egressIfId = devIfs[0]?.id ?? 'eth0';
    const newRoute: RouteModel = {
      id: `gui-rt-${Date.now().toString(36).slice(-5)}`,
      deviceId: routeDeviceId,
      destinationPrefix: routeDstPrefix.trim(),
      nextHopIp: routeNextHop.trim(),
      egressInterfaceId: egressIfId,
      protocol: 'static',
    };
    onAddRoute(
      newRoute,
      `[${routeDeviceId}] 장비에 정적 라우팅(${newRoute.destinationPrefix} via ${newRoute.nextHopIp})을 등록했습니다.`,
    );
  };

  const filteredDevices = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return document.semantic.devices;
    return document.semantic.devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.vendor ?? '').toLowerCase().includes(q) ||
        (d.securityZone ?? '').toLowerCase().includes(q) ||
        (d.mgmtIp ?? '').toLowerCase().includes(q),
    );
  }, [document.semantic.devices, inventorySearch]);

  return (
    <Stack gap={6}>
      <Tile>
        <Tabs>
          <TabList aria-label="멀티벤더 Config 파서 및 인벤토리 빌더 탭">
            <Tab renderIcon={Code}>
              1. 9대 온프레미스 벤더 Running-Config 파서 (Batfish / Forward 방식)
            </Tab>
            <Tab renderIcon={Add}>
              2. GUI 방화벽 정책 &amp; 정적 라우팅 직접 추가 빌더
            </Tab>
            <Tab renderIcon={DataBase}>
              3. 온프레미스 디지털 트윈 장비 인벤토리 ({document.semantic.devices.length}대)
            </Tab>
          </TabList>

          <TabPanels>
            {/* 탭 1: 멀티벤더 Config 파서 */}
            <TabPanel>
              <Stack gap={5}>
                <div>
                  <p className="cds--label">
                    온프레미스 9대 벤더 실제 Config 샘플 전환 (Carbon ContentSwitcher)
                  </p>
                  <ContentSwitcher
                    size="md"
                    selectedIndex={VENDOR_KEYS.indexOf(selectedSampleVendor)}
                    onChange={(data) => {
                      const vKey = VENDOR_KEYS[data.index ?? 0];
                      if (vKey) handleLoadVendorSample(vKey);
                    }}
                  >
                    {VENDOR_KEYS.map((vKey) => (
                      <Switch
                        key={vKey}
                        name={vKey}
                        text={VENDOR_SAMPLE_CONFIGS[vKey].titleKo}
                      />
                    ))}
                  </ContentSwitcher>
                </div>

                <Grid fullWidth>
                  <Column lg={8} md={8} sm={4}>
                    <Stack gap={4}>
                      <Layer>
                        <TextArea
                          id="vendor-config-textarea"
                          labelText={`장비 설정 텍스트 입력 (자동 감지된 벤더: ${getVendorLabelKo(detectedVendor)})`}
                          helperText="Palo Alto PAN-OS, Fortinet FortiOS, 시큐아이 BLUEMAX, 안랩 TrusGuard, Cisco IOS/NX-OS, Juniper Junos, Arista EOS, F5 BIG-IP, Linux 구문을 자동 인식합니다."
                          rows={16}
                          value={configText}
                          onChange={(e) => setConfigText(e.target.value)}
                        />
                      </Layer>
                      <Button
                        kind="primary"
                        renderIcon={Upload}
                        onClick={handleMergeParsedDevice}
                      >
                        파싱된 장비({parsedPreview.device.id})를 디지털 트윈 토폴로지에 즉시 병합
                      </Button>
                    </Stack>
                  </Column>

                  <Column lg={8} md={8} sm={4}>
                    <Layer>
                      <Tile>
                        <Stack gap={4}>
                          <div>
                            <p className="cds--label">Carbon StructuredList AST Inspector</p>
                            <h4>실시간 정규화 AST 파싱 결과 미리보기</h4>
                          </div>
                          <div>
                            <Tag type="blue">벤더: {getVendorLabelKo(parsedPreview.vendor)}</Tag>
                            <Tag type="purple">장비 ID: {parsedPreview.device.id}</Tag>
                            <Tag type="teal">역할: {parsedPreview.device.role.toUpperCase()}</Tag>
                          </div>

                          <StructuredListWrapper isCondensed>
                            <StructuredListHead>
                              <StructuredListRow head>
                                <StructuredListCell head>추출 항목</StructuredListCell>
                                <StructuredListCell head>정규화 AST 상세 명세</StructuredListCell>
                              </StructuredListRow>
                            </StructuredListHead>
                            <StructuredListBody>
                              <StructuredListRow>
                                <StructuredListCell>
                                  <strong>인터페이스 &amp; Zone ({parsedPreview.interfaces.length}개)</strong>
                                </StructuredListCell>
                                <StructuredListCell>
                                  {parsedPreview.interfaces.map((iface) => (
                                    <div key={iface.id}>
                                      <code>{iface.name}</code> — IP: <code>{iface.ip ?? 'L2'}</code> / Zone:{' '}
                                      <strong>{iface.zone ?? 'default'}</strong>
                                    </div>
                                  ))}
                                </StructuredListCell>
                              </StructuredListRow>

                              <StructuredListRow>
                                <StructuredListCell>
                                  <strong>L3 라우팅 테이블 ({parsedPreview.routes.length}건)</strong>
                                </StructuredListCell>
                                <StructuredListCell>
                                  {parsedPreview.routes.map((rt) => (
                                    <div key={rt.id}>
                                      <code>{rt.destinationPrefix}</code> ➔{' '}
                                      {rt.nextHopIp ? `Next-Hop ${rt.nextHopIp}` : 'Connected'} ({rt.protocol})
                                    </div>
                                  ))}
                                </StructuredListCell>
                              </StructuredListRow>

                              {parsedPreview.vipMappings.length > 0 && (
                                <StructuredListRow>
                                  <StructuredListCell>
                                    <strong>F5 L4 VIP 매핑 ({parsedPreview.vipMappings.length}건)</strong>
                                  </StructuredListCell>
                                  <StructuredListCell>
                                    {parsedPreview.vipMappings.map((vip) => (
                                      <div key={vip.id}>
                                        <code>
                                          {vip.vipName} ({vip.vipIp}:{vip.vipPort})
                                        </code>{' '}
                                        ➔ Pool <strong>{vip.poolName}</strong> (
                                        {vip.poolMembers.map((m) => `${m.ip}:${m.port}`).join(', ')})
                                      </div>
                                    ))}
                                  </StructuredListCell>
                                </StructuredListRow>
                              )}

                              <StructuredListRow>
                                <StructuredListCell>
                                  <strong>방화벽 보안 정책 ({parsedPreview.policies.length}건)</strong>
                                </StructuredListCell>
                                <StructuredListCell>
                                  {parsedPreview.policies.length === 0 ? (
                                    <span>방화벽/ACL 룰 없음 (L3 라우팅/L4 전용)</span>
                                  ) : (
                                    parsedPreview.policies.map((pol) => (
                                      <div key={pol.id}>
                                        <code>{pol.name}</code>: {pol.srcPrefix} ➔ {pol.dstPrefix} (
                                        {pol.protocol.toUpperCase()}/{pol.dstPort ?? 'ANY'}){' '}
                                        <Tag type={pol.action === 'allow' ? 'green' : 'red'} size="sm">
                                          {pol.action.toUpperCase()}
                                        </Tag>
                                      </div>
                                    ))
                                  )}
                                </StructuredListCell>
                              </StructuredListRow>
                            </StructuredListBody>
                          </StructuredListWrapper>
                        </Stack>
                      </Tile>
                    </Layer>
                  </Column>
                </Grid>
              </Stack>
            </TabPanel>

            {/* 탭 2: GUI 방화벽 정책 & 라우팅 빌더 */}
            <TabPanel>
              <Grid fullWidth>
                <Column lg={8} md={8} sm={4}>
                  <Layer>
                    <Tile>
                      <Form onSubmit={handleSubmitGuiRule}>
                        <Stack gap={5}>
                          <div>
                            <p className="cds--label">Firewall Rule Builder</p>
                            <h4>온프레미스 방화벽 정책(Rule) 직접 추가</h4>
                          </div>

                          <Select
                            id="gui-rule-device"
                            labelText="대상 방화벽 선택"
                            value={ruleDeviceId}
                            onChange={(e) => setRuleDeviceId(e.target.value)}
                          >
                            {firewalls.map((fw) => (
                              <SelectItem
                                key={fw.id}
                                value={fw.id}
                                text={`${fw.name} [${getVendorLabelKo(fw.vendor)}]`}
                              />
                            ))}
                          </Select>

                          <Grid fullWidth>
                            <Column lg={8} md={4} sm={4}>
                              <TextInput
                                id="gui-rule-name"
                                labelText="정책명 (Rule Name)"
                                value={ruleName}
                                onChange={(e) => setRuleName(e.target.value)}
                              />
                            </Column>
                            <Column lg={8} md={4} sm={4}>
                              <TextInput
                                id="gui-rule-priority"
                                labelText="우선순위 (낮을수록 먼저 평가)"
                                value={rulePriority}
                                onChange={(e) => setRulePriority(e.target.value)}
                              />
                            </Column>
                          </Grid>

                          <Grid fullWidth>
                            <Column lg={8} md={4} sm={4}>
                              <TextInput
                                id="gui-rule-src"
                                labelText="출발지 IP / CIDR"
                                value={ruleSrcPrefix}
                                onChange={(e) => setRuleSrcPrefix(e.target.value)}
                              />
                            </Column>
                            <Column lg={8} md={4} sm={4}>
                              <TextInput
                                id="gui-rule-dst"
                                labelText="목적지 IP / CIDR"
                                value={ruleDstPrefix}
                                onChange={(e) => setRuleDstPrefix(e.target.value)}
                              />
                            </Column>
                          </Grid>

                          <Grid fullWidth>
                            <Column lg={4} md={2} sm={4}>
                              <Select
                                id="gui-rule-proto"
                                labelText="프로토콜"
                                value={ruleProtocol}
                                onChange={(e) => setRuleProtocol(e.target.value as ProtocolKind)}
                              >
                                <SelectItem value="tcp" text="TCP" />
                                <SelectItem value="udp" text="UDP" />
                                <SelectItem value="icmp" text="ICMP" />
                                <SelectItem value="any" text="ANY (전체)" />
                              </Select>
                            </Column>
                            <Column lg={4} md={2} sm={4}>
                              <TextInput
                                id="gui-rule-port"
                                labelText="포트 번호"
                                value={rulePort}
                                onChange={(e) => setRulePort(e.target.value)}
                              />
                            </Column>
                            <Column lg={4} md={2} sm={4}>
                              <Select
                                id="gui-rule-action"
                                labelText="Action"
                                value={ruleAction}
                                onChange={(e) => setRuleAction(e.target.value as 'allow' | 'deny')}
                              >
                                <SelectItem value="allow" text="ALLOW (허용)" />
                                <SelectItem value="deny" text="DENY (차단)" />
                              </Select>
                            </Column>
                            <Column lg={4} md={2} sm={4}>
                              <TextInput
                                id="gui-rule-expire"
                                labelText="만료 예정일"
                                value={ruleExpiresAt}
                                onChange={(e) => setRuleExpiresAt(e.target.value)}
                              />
                            </Column>
                          </Grid>

                          <Button type="submit" kind="primary" size="md" renderIcon={Add}>
                            방화벽 정책 등록 및 즉시 적용
                          </Button>
                        </Stack>
                      </Form>
                    </Tile>
                  </Layer>
                </Column>

                <Column lg={8} md={8} sm={4}>
                  <Layer>
                    <Tile>
                      <Stack gap={5}>
                        <Form onSubmit={handleSubmitGuiRoute}>
                          <Stack gap={5}>
                            <div>
                              <p className="cds--label">Static Route Builder</p>
                              <h4>L3 스위치 / 라우터 / 방화벽 정적 라우팅 직접 추가</h4>
                            </div>

                            <Select
                              id="gui-route-device"
                              labelText="대상 장비 선택"
                              value={routeDeviceId}
                              onChange={(e) => setRouteDeviceId(e.target.value)}
                            >
                              {document.semantic.devices.map((d) => (
                                <SelectItem
                                  key={d.id}
                                  value={d.id}
                                  text={`${d.name} (${getVendorLabelKo(d.vendor)})`}
                                />
                              ))}
                            </Select>

                            <TextInput
                              id="gui-route-prefix"
                              labelText="목적지 서브넷 Prefix (CIDR)"
                              value={routeDstPrefix}
                              onChange={(e) => setRouteDstPrefix(e.target.value)}
                              placeholder="예: 10.80.20.0/24"
                            />

                            <TextInput
                              id="gui-route-nexthop"
                              labelText="Next-Hop 게이트웨이 IP"
                              value={routeNextHop}
                              onChange={(e) => setRouteNextHop(e.target.value)}
                              placeholder="예: 10.254.3.2"
                            />

                            <Button type="submit" kind="secondary" size="md" renderIcon={Add}>
                              정적 라우팅 테이블에 추가
                            </Button>
                          </Stack>
                        </Form>

                        <InlineNotification
                          kind="info"
                          title="실시간 디지털 트윈 동기화"
                          subtitle="이 화면에서 추가한 장비, 방화벽 정책, 라우팅은 [경로 자동 탐색(AFP)], [정책 감사], [야간 작업 시뮬레이터]에 즉시 반영됩니다."
                          lowContrast
                          hideCloseButton
                        />
                      </Stack>
                    </Tile>
                  </Layer>
                </Column>
              </Grid>
            </TabPanel>

            {/* 탭 3: 전체 장비 인벤토리 */}
            <TabPanel>
              <TableContainer
                title="온프레미스 디지털 트윈 장비 인벤토리 원장"
                description="현재 메모리에 로드된 모든 방화벽, L3 백본/분배 스위치, L4 로드밸런서(F5), 서버 목록입니다."
              >
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      placeholder="장비명, 벤더, 보안 구간, 관리 IP 검색..."
                      onChange={(e) => {
                        if (typeof e !== 'string' && e?.target) {
                          setInventorySearch(e.target.value);
                        }
                      }}
                    />
                  </TableToolbarContent>
                </TableToolbar>
                <Table size="md" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>장비 ID / 호스트명</TableHeader>
                      <TableHeader>벤더 / 모델명</TableHeader>
                      <TableHeader>OS 버전</TableHeader>
                      <TableHeader>망분리 보안 구간 (Zone)</TableHeader>
                      <TableHeader>관리 IP</TableHeader>
                      <TableHeader>인터페이스</TableHeader>
                      <TableHeader>라우팅 수</TableHeader>
                      <TableHeader>방화벽 룰 수</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredDevices.map((dev) => {
                      const ifCount = document.semantic.interfaces.filter(
                        (i) => i.deviceId === dev.id,
                      ).length;
                      const rtCount = document.semantic.routes.filter(
                        (r) => r.deviceId === dev.id,
                      ).length;
                      const polCount = document.semantic.policies.filter(
                        (p) => p.deviceId === dev.id,
                      ).length;
                      return (
                        <TableRow key={dev.id} onClick={() => onSelectDevice(dev.id)}>
                          <TableCell>
                            <strong>{dev.name}</strong>
                          </TableCell>
                          <TableCell>
                            <Tag type="blue" size="sm">
                              {getVendorLabelKo(dev.vendor)}
                            </Tag>{' '}
                            <span>{dev.modelName ?? ''}</span>
                          </TableCell>
                          <TableCell>
                            <code>{dev.osVersion ?? '-'}</code>
                          </TableCell>
                          <TableCell>{dev.securityZone ?? '-'}</TableCell>
                          <TableCell>
                            <code>{dev.mgmtIp ?? '-'}</code>
                          </TableCell>
                          <TableCell>{ifCount}개</TableCell>
                          <TableCell>{rtCount}건</TableCell>
                          <TableCell>
                            {polCount > 0 ? (
                              <Tag type="purple" size="sm">
                                {polCount}건
                              </Tag>
                            ) : (
                              '-'
                            )}
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
