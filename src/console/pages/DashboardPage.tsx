import React from 'react';
import { Button, ClickableTile, Column, Grid, ProgressBar, Tag, Tile } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { apiPath, fmt, fmtTime, type Page, type ProjectRow, type Summary, useApi } from '../api';
import { ApiGate, PageHeader, SeverityTag, SimpleTable } from '../common';
import type { ConsolePage } from '../nav';

const Kpi: React.FC<{ label: string; value: string; detail?: React.ReactNode; onClick?: () => void }> = ({ label, value, detail, onClick }) => {
  const body = (
    <>
      <p className="atlas-kpi__label">{label}</p>
      <p className="atlas-kpi__value">{value}</p>
      {detail && <div className="atlas-kpi__detail">{detail}</div>}
    </>
  );
  return onClick ? (
    <ClickableTile className="atlas-kpi" onClick={onClick}>
      {body}
    </ClickableTile>
  ) : (
    <Tile className="atlas-kpi">{body}</Tile>
  );
};

const Distribution: React.FC<{ title: string; items: Array<[string, number]>; total: number; limit?: number }> = ({ title, items, total, limit = 6 }) => (
  <Tile className="atlas-widget">
    <h2 className="atlas-widget__title">{title}</h2>
    {items.slice(0, limit).map(([label, n]) => (
      <ProgressBar key={label} className="atlas-dist" label={label} helperText={`${fmt(n)}대 · ${Math.round((100 * n) / total)}%`} value={n} max={total} size="small" />
    ))}
  </Tile>
);

export const DashboardPage: React.FC<{ go: (page: ConsolePage) => void }> = ({ go }) => {
  const summary = useApi<Summary>(apiPath('summary'));
  const projects = useApi<Page<ProjectRow>>(apiPath('projects', { page_size: 6 }));

  return (
    <ApiGate state={summary}>
      {(s) => (
        <>
          <PageHeader
            title="대시보드"
            subtitle={
              <>
                최근 동기화 <strong>#{s.run.id}</strong> · {s.run.source_name} / {s.run.sheet} · {fmtTime(s.run.finished_at)}
              </>
            }
            actions={
              <Button kind="tertiary" size="md" renderIcon={ArrowRight} onClick={() => go({ id: 'sync' })}>
                동기화 이력
              </Button>
            }
          />
          <Grid condensed fullWidth className="atlas-grid">
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="자산"
                value={fmt(s.assets.total)}
                detail={`서버 ${fmt(s.assets.servers)} · 네트워크 ${fmt(s.assets.network)} · 공통 인프라 ${fmt(s.assets.shared)}`}
                onClick={() => go({ id: 'assets' })}
              />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="프로젝트"
                value={fmt(s.projects)}
                detail={
                  s.assets.unclassified ? <Tag type="red" size="sm">미분류 자산 {fmt(s.assets.unclassified)}</Tag> : <Tag type="green" size="sm">전체 분류됨</Tag>
                }
                onClick={() => go({ id: 'projects' })}
              />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="이관 준비도"
                value={`${s.readiness.percent}%`}
                detail={<ProgressBar label="준비된 서버" hideLabel value={s.readiness.ready} max={s.readiness.servers} size="small" helperText={`서버 ${fmt(s.readiness.ready)} / ${fmt(s.readiness.servers)} (높음 이슈 없음)`} />}
                onClick={() => go({ id: 'review' })}
              />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="최근 변경"
                value={s.last_diff ? fmt(s.last_diff.added + s.last_diff.removed + s.last_diff.changed) : '-'}
                detail={
                  s.last_diff ? (
                    <span className="atlas-tags">
                      <Tag type="green" size="sm">추가 {fmt(s.last_diff.added)}</Tag>
                      <Tag type="red" size="sm">삭제 {fmt(s.last_diff.removed)}</Tag>
                      <Tag type="blue" size="sm">변경 {fmt(s.last_diff.changed)}</Tag>
                    </span>
                  ) : (
                    '비교할 이전 동기화가 없습니다.'
                  )
                }
                onClick={() => go({ id: 'sync' })}
              />
            </Column>

            <Column sm={4} md={8} lg={10}>
              <Tile className="atlas-widget atlas-widget--table">
                <SimpleTable
                  title="주요 검토 항목"
                  description="이관·용량산정 전에 정리할 데이터 품질 이슈"
                  size="sm"
                  columns={[
                    { key: 'sev', header: '심각도', render: (r) => <SeverityTag severity={r.severity} /> },
                    { key: 'title', header: '항목', render: (r) => r.title },
                    { key: 'count', header: '자산', render: (r) => fmt(r.count) },
                    { key: 'rec', header: '조치', render: (r) => <span className="atlas-muted">{r.recommendation}</span> },
                  ]}
                  rows={s.top_rules}
                  rowKey={(r) => r.rule}
                  onRowClick={(r) => go({ id: 'review', rule: r.rule })}
                />
              </Tile>
            </Column>
            <Column sm={4} md={8} lg={6}>
              <Distribution title="망구분" items={s.zones} total={s.assets.total} />
            </Column>

            <Column sm={4} md={8} lg={10}>
              <Tile className="atlas-widget atlas-widget--table">
                <ApiGate state={projects}>
                  {(p) => (
                    <SimpleTable
                      title="자산이 많은 프로젝트"
                      description={`전체 ${fmt(p.total)}개 프로젝트 중 상위`}
                      size="sm"
                      columns={[
                        { key: 'name', header: '프로젝트', render: (r) => <><strong>{r.name}</strong> <span className="atlas-muted">({r.code})</span></> },
                        { key: 'assets', header: '자산', render: (r) => fmt(r.assets) },
                        { key: 'envs', header: '환경', render: (r) => r.envs.join(' · ') },
                        { key: 'ready', header: '준비도', render: (r) => `${r.readiness}%` },
                      ]}
                      rows={p.items}
                      rowKey={(r) => r.code}
                      onRowClick={(r) => go({ id: 'project', code: r.code })}
                    />
                  )}
                </ApiGate>
              </Tile>
            </Column>
            <Column sm={4} md={4} lg={3}>
              <Distribution title="환경" items={s.envs} total={s.assets.total} />
            </Column>
            <Column sm={4} md={4} lg={3}>
              <Distribution title="센터" items={s.sites} total={s.assets.total} />
            </Column>
          </Grid>
        </>
      )}
    </ApiGate>
  );
};
