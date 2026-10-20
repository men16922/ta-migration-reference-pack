import React from 'react';
import {
  Button,
  Column,
  ComposedModal,
  Grid,
  Layer,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react';
import { getVendorLabelKo } from '../core/remediationGenerator';
import type { NetworkSnapshot } from '../core/types';

interface DeviceInspectorDrawerProps {
  snapshot: NetworkSnapshot;
  deviceId?: string;
  onClose: () => void;
}

export const DeviceInspectorDrawer: React.FC<DeviceInspectorDrawerProps> = ({
  snapshot,
  deviceId,
  onClose,
}) => {
  if (!deviceId) return null;
  const device = snapshot.devices.find((d) => d.id === deviceId);
  if (!device) return null;

  const interfaces = snapshot.interfaces.filter((i) => i.deviceId === device.id);
  const routes = snapshot.routes.filter((r) => r.deviceId === device.id);
  const policies = snapshot.policies
    .filter((p) => p.deviceId === device.id)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  return (
    <ComposedModal open={Boolean(device)} onClose={onClose} size="lg">
      <ModalHeader
        label={`장비 리소스 상세 정보 (${getVendorLabelKo(device.vendor)})`}
        title={`${device.name} (${device.id})`}
        closeModal={onClose}
      />
      <ModalBody hasScrollingContent>
        <Stack gap={5}>
          <div>
            <Tag type="blue">{getVendorLabelKo(device.vendor)}</Tag>
            {device.osVersion && <Tag type="purple">OS: {device.osVersion}</Tag>}
            {device.securityZone && <Tag type="teal">보안 영역: {device.securityZone}</Tag>}
            <Tag type="cool-gray">역할: {device.role.toUpperCase()}</Tag>
            {device.mgmtIp && <Tag type="gray">관리 IP: {device.mgmtIp}</Tag>}
          </div>

          <Grid fullWidth>
            {/* 1. 인터페이스 및 보안 Zone */}
            <Column lg={8} md={8} sm={4}>
              <Layer>
                <Stack gap={4}>
                  <TableContainer
                    title={`네트워크 인터페이스 & 보안 Zone (${interfaces.length}개)`}
                    description="포트별 할당된 IP 대역 및 연결된 망분리 Zone"
                  >
                    <Table size="sm" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          <TableHeader>포트명</TableHeader>
                          <TableHeader>IP / CIDR</TableHeader>
                          <TableHeader>보안 Zone</TableHeader>
                          <TableHeader>역할 설명</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {interfaces.map((iface) => (
                          <TableRow key={iface.id}>
                            <TableCell>
                              <code>{iface.name}</code>
                            </TableCell>
                            <TableCell>
                              <code>{iface.ip ?? 'L2'}</code>
                            </TableCell>
                            <TableCell>
                              <strong>{iface.zone ?? 'default'}</strong>
                            </TableCell>
                            <TableCell>{iface.description ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {device.vipMappings && device.vipMappings.length > 0 && (
                    <TableContainer
                      title={`L4 로드밸런서 VIP ➔ Real 서버 매핑 (${device.vipMappings.length}건)`}
                      description="외부 인입 VIP 주소를 실제 백엔드 서버 IP로 변환(DNAT)"
                    >
                      <Table size="sm" useZebraStyles>
                        <TableHead>
                          <TableRow>
                            <TableHeader>Virtual Server</TableHeader>
                            <TableHeader>VIP:Port</TableHeader>
                            <TableHeader>백엔드 Pool 서버</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {device.vipMappings.map((vip) => (
                            <TableRow key={vip.id}>
                              <TableCell>
                                <strong>{vip.vipName}</strong>
                              </TableCell>
                              <TableCell>
                                <code>
                                  {vip.vipIp}:{vip.vipPort}
                                </code>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <strong>{vip.poolName}</strong>
                                </div>
                                <code>
                                  {vip.poolMembers.map((m) => `${m.ip}:${m.port}`).join(', ')}
                                </code>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Stack>
              </Layer>
            </Column>

            {/* 2. 라우팅 테이블 */}
            <Column lg={8} md={8} sm={4}>
              <Layer>
                <TableContainer
                  title={`라우팅 테이블 (Route Table — ${routes.length}건)`}
                  description="목적지 IP 대역별로 패킷을 전달할 다음 장비(Next-Hop) 경로"
                >
                  <Table size="sm" useZebraStyles>
                    <TableHead>
                      <TableRow>
                        <TableHeader>목적지 대역 (Destination)</TableHeader>
                        <TableHeader>다음 홉 (Next-Hop)</TableHeader>
                        <TableHeader>출구 포트</TableHeader>
                        <TableHeader>유형</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {routes.map((rt) => (
                        <TableRow key={rt.id}>
                          <TableCell>
                            <code>{rt.destinationPrefix}</code>
                          </TableCell>
                          <TableCell>
                            <code>{rt.nextHopIp ?? '직접 연결됨 (Connected)'}</code>
                          </TableCell>
                          <TableCell>
                            <code>
                              {interfaces.find((i) => i.id === rt.egressInterfaceId)?.name ??
                                rt.egressInterfaceId}
                            </code>
                          </TableCell>
                          <TableCell>{rt.protocol}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Layer>
            </Column>
          </Grid>

          {/* 3. 방화벽 정책 / Security Rules */}
          {policies.length > 0 && (
            <Layer>
              <TableContainer
                title={`방화벽 보안 규칙 (Security Group Rules — ${policies.length}건)`}
                description="위에서 아래(우선순위 번호순)로 평가되는 허용(ALLOW) 및 차단(DENY) 규칙"
              >
                <Table size="sm" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>우선순위</TableHeader>
                      <TableHeader>규칙 이름</TableHeader>
                      <TableHeader>출발지 (Source)</TableHeader>
                      <TableHeader>목적지 (Destination)</TableHeader>
                      <TableHeader>포트</TableHeader>
                      <TableHeader>동작</TableHeader>
                      <TableHeader>설명</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {policies.map((pol) => (
                      <TableRow key={pol.id}>
                        <TableCell>#{pol.priority}</TableCell>
                        <TableCell>
                          <strong>{pol.name ?? pol.id}</strong>
                        </TableCell>
                        <TableCell>
                          {pol.srcZone ?? 'Any'} (<code>{pol.srcPrefix ?? '0.0.0.0/0'}</code>)
                        </TableCell>
                        <TableCell>
                          {pol.dstZone ?? 'Any'} (<code>{pol.dstPrefix ?? '0.0.0.0/0'}</code>)
                        </TableCell>
                        <TableCell>
                          <code>
                            {pol.protocol.toUpperCase()}/{pol.dstPort ?? 'ANY'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Tag type={pol.action === 'allow' ? 'green' : 'red'} size="sm">
                            {pol.action.toUpperCase()}
                          </Tag>
                        </TableCell>
                        <TableCell>{pol.description ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Layer>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          인스펙터 닫기
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
};
