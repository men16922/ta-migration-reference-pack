import React from 'react';
import { Button, ClickableTile, Column, Grid, ProgressBar, Tag, Tile } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { apiPath, fmt, fmtTime, type Page, type ProjectRow, type Summary, useApi } from '../api';
import { ApiGate, PageHeader, SimpleTable } from '../common';
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
      <ProgressBar key={label} className="atlas-dist" label={label} helperText={`${fmt(n)}대 · ${total ? Math.round((100 * n) / total) : 0}%`} value={n} max={total || 1} size="small" />
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
                최근 Excel 등록 <strong>#{s.run.id}</strong> · {s.run.source_name} / {s.run.sheet} · {fmtTime(s.run.finished_at)}
              </>
            }
            actions={
              <Button kind="primary" size="md" renderIcon={ArrowRight} onClick={() => go({ id: 'diagram' })}>
                IDC 구성도 열기
              </Button>
            }
          />
          <Grid condensed fullWidth className="atlas-grid">
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="자산"
                value={fmt(s.assets.total)}
                detail="최근 등록한 자산 목록 기준"
                onClick={() => go({ id: 'assets' })}
              />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="업무 시스템"
                value={fmt(s.projects)}
                detail={
                  s.assets.unclassified ? <Tag type="red" size="sm">미분류 자산 {fmt(s.assets.unclassified)}</Tag> : <Tag type="green" size="sm">전체 분류됨</Tag>
                }
                onClick={() => go({ id: 'projects' })}
              />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Kpi
                label="WEB · WAS · DB"
                value={fmt(s.components?.total ?? 0)}
                detail={`소프트웨어 인스턴스 · 서버 연결 미확인 ${s.components?.unmatched ?? 0}건`}
                onClick={() => go({ id: 'components' })}
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
                    '비교할 이전 등록 이력이 없습니다.'
                  )
                }
                onClick={() => go({ id: 'sync' })}
              />
            </Column>

            <Column sm={4} md={8} lg={10}>
              <Tile className="atlas-widget atlas-widget--table">
                <ApiGate state={projects}>
                  {(p) => (
                    <SimpleTable
                      title="업무별 자산"
                      description={`전체 ${fmt(p.total)}개 업무 시스템 · 항목을 선택하면 구성도를 엽니다.`}
                      size="sm"
                      columns={[
                        { key: 'name', header: '업무 시스템', render: (r) => <strong>{r.name}</strong> },
                        { key: 'assets', header: '자산', render: (r) => fmt(r.assets) },
                        { key: 'envs', header: '환경', render: (r) => r.envs.join(' · ') },
                      ]}
                      rows={p.items}
                      rowKey={(r) => r.code}
                      onRowClick={(r) => go({ id: 'project', code: r.code })}
                    />
                  )}
                </ApiGate>
              </Tile>
            </Column>
            <Column sm={4} md={8} lg={6}>
              <Distribution title="센터별 자산" items={s.sites} total={s.assets.total} />
            </Column>
          </Grid>
        </>
      )}
    </ApiGate>
  );
};
