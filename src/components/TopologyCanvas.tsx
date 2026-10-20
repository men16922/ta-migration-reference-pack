import React from 'react';
import {
  ClickableTile,
  Column,
  Grid,
  Layer,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from '@carbon/react';
import {
  CheckmarkFilled,
  ErrorFilled,
  Firewall,
  Router,
  ServerProxy,
  VirtualMachine,
} from '@carbon/icons-react';
import type {
  AnalysisResult,
  DeviceModel,
  NetworkSnapshot,
  NodeAnnotation,
} from '../core/types';
import { getVendorLabelKo } from '../core/remediationGenerator';

interface TopologyCanvasProps {
  snapshot: NetworkSnapshot;
  annotations: Record<string, NodeAnnotation>;
  analysisResult?: AnalysisResult;
  selectedDeviceId?: string;
  onSelectDevice: (deviceId: string) => void;
}

const ZONE_BUCKETS: Array<{ id: string; titleKo: string; matchFn: (d: DeviceModel) => boolean }> = [
  {
    id: 'zone-wan-dmz',
    titleKo: '1. 대외경계 & DMZ 공개서비스망',
    matchFn: (d) =>
      d.id.includes('wan') ||
      d.id.includes('edge') ||
      d.id.includes('f5') ||
      d.id.includes('dmz'),
  },
  {
    id: 'zone-core',
    titleKo: '2. 데이터센터 코어 백본 & 분배망',
    matchFn: (d) => d.id.includes('core') || d.id.includes('dist') || d.id.includes('spine'),
  },
  {
    id: 'zone-work-dev',
    titleKo: '3. 내부 망분리 (업무망 WAS & 개발망)',
    matchFn: (d) =>
      d.id.includes('internal') ||
      d.id.includes('was') ||
      d.id.includes('dev') ||
      d.id.includes('branch'),
  },
  {
    id: 'zone-db-infra',
    titleKo: '4. DB보안망 & 공통인프라 보안관문',
    matchFn: (d) =>
      d.id.includes('db') ||
      d.id.includes('bluemax') ||
      d.id.includes('infra') ||
      d.id.includes('trusguard') ||
      d.id.includes('ad'),
  },
];

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  snapshot,
  analysisResult,
  selectedDeviceId,
  onSelectDevice,
}) => {
  const forwardSteps = analysisResult?.forwardTrace.steps ?? [];
  const traversedIds = new Set(forwardSteps.map((s) => s.deviceId));

  // 장비별 AFP 판정 상태 추출
  const deviceStatusMap = new Map<
    string,
    { label: string; tagType: 'green' | 'red' | 'purple' | 'blue' }
  >();

  for (const step of forwardSteps) {
    if (step.stage === 'POLICY_EVAL') {
      if (step.outcome === 'continue') {
        deviceStatusMap.set(step.deviceId, {
          label: '정책 기허용 (ALLOW)',
          tagType: 'green',
        });
      } else if (step.outcome === 'blocked') {
        deviceStatusMap.set(step.deviceId, {
          label: '방화벽 차단 (신규신청 필요)',
          tagType: 'red',
        });
      } else {
        deviceStatusMap.set(step.deviceId, {
          label: '정책 미수집 (UNKNOWN)',
          tagType: 'purple',
        });
      }
    } else if (step.reasonCode === 'NO_ROUTE' || step.reasonCode === 'ROUTING_TABLE_INCOMPLETE') {
      deviceStatusMap.set(step.deviceId, {
        label: '라우팅 누락 (NO_ROUTE)',
        tagType: 'red',
      });
    }
  }

  const assignedIds = new Set<string>();
  const bucketedDevices = ZONE_BUCKETS.map((bucket) => {
    const matched = snapshot.devices.filter((d) => {
      if (assignedIds.has(d.id)) return false;
      if (bucket.matchFn(d)) {
        assignedIds.add(d.id);
        return true;
      }
      return false;
    });
    return { ...bucket, devices: matched };
  });

  const remainingDevices = snapshot.devices.filter((d) => !assignedIds.has(d.id));
  if (remainingDevices.length > 0 && bucketedDevices[2]) {
    bucketedDevices[2].devices.push(...remainingDevices);
  }

  const renderRoleIcon = (role: DeviceModel['role']) => {
    if (role === 'firewall') return <Firewall size={16} />;
    if (role === 'router') return <Router size={16} />;
    if (role === 'switch') return <ServerProxy size={16} />;
    return <VirtualMachine size={16} />;
  };

  return (
    <div role="region" aria-label="온프레미스 망분리 보안 Zone 토폴로지">
      <Grid condensed fullWidth>
        {bucketedDevices.map((bucket) => (
          <Column key={bucket.id} lg={4} md={4} sm={4}>
            <Tile>
              <p className="cds--type-productive-heading-02" style={{ marginBottom: '0.75rem' }}>
                {bucket.titleKo}
              </p>
              <Layer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {bucket.devices.map((dev) => {
                    const afp = deviceStatusMap.get(dev.id);
                    const isTraversed = traversedIds.has(dev.id);
                    const isSelected = selectedDeviceId === dev.id;
                    const primaryIp =
                      dev.mgmtIp ??
                      snapshot.interfaces.find((i) => i.deviceId === dev.id && i.ip)?.ip ??
                      '-';

                    return (
                      <ClickableTile
                        key={dev.id}
                        onClick={() => onSelectDevice(dev.id)}
                        style={{
                          borderLeft: afp
                            ? afp.tagType === 'red'
                              ? '4px solid var(--cds-support-error)'
                              : '4px solid var(--cds-support-success)'
                            : isTraversed
                              ? '4px solid var(--cds-interactive)'
                              : isSelected
                                ? '4px solid var(--cds-border-interactive)'
                                : undefined,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span
                            className="cds--type-heading-compact-01"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            {renderRoleIcon(dev.role)} {dev.id}
                          </span>
                          <Tag type="cyan" size="sm">
                            {getVendorLabelKo(dev.vendor)}
                          </Tag>
                        </div>

                        <div className="cds--type-body-compact-01">{dev.modelName ?? dev.name}</div>
                        <div className="cds--type-code-01" style={{ marginTop: '0.2rem' }}>
                          IP: {primaryIp} {dev.osVersion ? `| ${dev.osVersion}` : ''}
                        </div>

                        {afp && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <Tag
                              type={afp.tagType}
                              size="sm"
                              renderIcon={
                                afp.tagType === 'red' ? ErrorFilled : CheckmarkFilled
                              }
                            >
                              {afp.label}
                            </Tag>
                          </div>
                        )}
                        {!afp && isTraversed && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <Tag type="blue" size="sm">
                              L2/L3 경유 구간 (Transit OK)
                            </Tag>
                          </div>
                        )}
                      </ClickableTile>
                    );
                  })}
                </div>
              </Layer>
            </Tile>
          </Column>
        ))}
      </Grid>

      {/* Carbon StructuredList 기반 실시간 경유 Hop 파이프라인 요약 */}
      {forwardSteps.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <StructuredListWrapper isCondensed selection>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Hop</StructuredListCell>
                <StructuredListCell head>경유 장비명</StructuredListCell>
                <StructuredListCell head>트래픽 처리 단계</StructuredListCell>
                <StructuredListCell head>출발지 ➔ 목적지 헤더</StructuredListCell>
                <StructuredListCell head>AFP 판정 결과</StructuredListCell>
                <StructuredListCell head>진단 근거</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {forwardSteps.map((step) => (
                <StructuredListRow
                  key={`sl-hop-${step.stepIndex}`}
                  onClick={() => onSelectDevice(step.deviceId)}
                >
                  <StructuredListCell>#{step.stepIndex}</StructuredListCell>
                  <StructuredListCell>
                    <strong>{step.deviceName}</strong>
                  </StructuredListCell>
                  <StructuredListCell>
                    <code>{step.stage}</code>
                  </StructuredListCell>
                  <StructuredListCell>
                    <code>
                      {step.beforeHeader.srcIp} ➔ {step.beforeHeader.dstIp} (
                      {step.beforeHeader.protocol.toUpperCase()}
                      {step.beforeHeader.dstPort ? `/${step.beforeHeader.dstPort}` : ''})
                    </code>
                  </StructuredListCell>
                  <StructuredListCell>
                    <Tag
                      type={
                        step.outcome === 'blocked'
                          ? 'red'
                          : step.outcome === 'delivered'
                            ? 'green'
                            : step.hypotheticalContinuation
                              ? 'purple'
                              : 'blue'
                      }
                      size="sm"
                    >
                      {step.hypotheticalContinuation
                        ? `${step.outcome.toUpperCase()} (연속진단)`
                        : step.outcome.toUpperCase()}
                    </Tag>
                  </StructuredListCell>
                  <StructuredListCell>{step.reason}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </div>
      )}
    </div>
  );
};
