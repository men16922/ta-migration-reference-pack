import React, { useState } from 'react';
import { Column, ContentSwitcher, Grid, Search, Switch, Tag, Tile } from '@carbon/react';
import {
  apiPath,
  ENV_LABELS,
  fmt,
  fmtTime,
  type AssetRow,
  type DiffResult,
  type Page,
  type ProjectRow,
  type ReviewPage,
  type RunInfo,
  useApi,
} from '../api';
import { ApiGate, PageHeader, Pager, SeverityTag, SimpleTable, type Column as TableColumn } from '../common';
import type { ConsolePage } from '../nav';

type Go = (page: ConsolePage) => void;

const ASSET_COLUMNS: TableColumn<AssetRow>[] = [
  { key: 'hostname', header: '호스트명', render: (r) => <strong>{r.hostname}</strong> },
  { key: 'ip', header: 'IP', render: (r) => r.ip ?? '-' },
  {
    key: 'project',
    header: '프로젝트',
    render: (r) =>
      r.project ? (
        <>
          {r.project_name ?? r.project} {r.shared ? <Tag size="sm" type="cool-gray">공통</Tag> : null}
        </>
      ) : (
        <Tag size="sm" type="red">미분류</Tag>
      ),
  },
  { key: 'env', header: '환경', render: (r) => (r.env ? ENV_LABELS[r.env] ?? r.env : '-') },
  { key: 'role', header: '역할', render: (r) => r.role ?? '-' },
  { key: 'zone', header: '망구분', render: (r) => r.zone ?? '-' },
  { key: 'os', header: 'OS', render: (r) => r.os ?? '-' },
  { key: 'cpu', header: '코어', render: (r) => fmt(r.cpu_cores) },
  { key: 'mem', header: '메모리(GB)', render: (r) => fmt(r.memory_gb) },
  { key: 'owner', header: '담당자', render: (r) => r.owner ?? '-' },
];

function usePaging(initial = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initial);
  return { page, pageSize, set: (p: number, s: number) => { setPage(p); setPageSize(s); }, reset: () => setPage(1) };
}

export const ProjectsPage: React.FC<{ go: Go }> = ({ go }) => {
  const [q, setQ] = useState('');
  const paging = usePaging();
  const state = useApi<Page<ProjectRow>>(apiPath('projects', { q, page: paging.page, page_size: paging.pageSize }));
  return (
    <>
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="프로젝트" subtitle="명명 규칙·시스템명으로 분류한 업무 시스템. 공통 인프라(AD·백업·네트워크 등)는 제외." />
      <ApiGate state={state}>
        {(p) => (
          <>
            <SimpleTable
              toolbar={
                <div className="atlas-toolbar">
                  <Search size="lg" labelText="프로젝트 검색" placeholder="프로젝트 코드·이름 검색" value={q} onChange={(e) => { setQ(e.target.value); paging.reset(); }} />
                </div>
              }
              columns={[
                { key: 'name', header: '프로젝트', render: (r) => <strong>{r.name}</strong> },
                { key: 'code', header: '코드', render: (r) => r.code },
                { key: 'assets', header: '자산', render: (r) => fmt(r.assets) },
                { key: 'roles', header: '역할', render: (r) => Object.entries(r.roles).map(([k, v]) => `${k} ${v}`).join(' · ') },
                { key: 'envs', header: '환경', render: (r) => r.envs.join(' · ') },
                { key: 'zones', header: '망구분', render: (r) => r.zones.join(' · ') },
                { key: 'ready', header: '준비도', render: (r) => <Tag size="sm" type={r.readiness === 100 ? 'green' : r.readiness >= 80 ? 'teal' : 'red'}>{r.readiness}%</Tag> },
                { key: 'issues', header: '검토 이슈', render: (r) => fmt(r.issues) },
              ]}
              rows={p.items}
              rowKey={(r) => r.code}
              onRowClick={(r) => go({ id: 'project', code: r.code })}
            />
            <Pager page={paging.page} pageSize={paging.pageSize} total={p.total} onChange={paging.set} />
          </>
        )}
      </ApiGate>
    </>
  );
};

export const ProjectDetailPage: React.FC<{ go: Go; code: string }> = ({ go, code }) => {
  const paging = usePaging(50);
  const state = useApi<Page<AssetRow>>(apiPath('assets', { project: code, page: paging.page, page_size: paging.pageSize }));
  const name = state.data?.items[0]?.project_name ?? code.toUpperCase();
  return (
    <>
      <PageHeader
        crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }, { label: '프로젝트', onClick: () => go({ id: 'projects' }) }]}
        title={name}
        subtitle={`프로젝트 코드 ${code}${state.data ? ` · 자산 ${fmt(state.data.total)}대` : ''}`}
      />
      <ApiGate state={state}>
        {(p) => (
          <>
            <SimpleTable title="자산" columns={ASSET_COLUMNS.filter((c) => c.key !== 'project')} rows={p.items} rowKey={(r) => r.key} />
            <Pager page={paging.page} pageSize={paging.pageSize} total={p.total} onChange={paging.set} />
          </>
        )}
      </ApiGate>
    </>
  );
};

export const AssetsPage: React.FC<{ go: Go; initialQuery?: string }> = ({ go, initialQuery = '' }) => {
  const [q, setQ] = useState(initialQuery);
  const paging = usePaging();
  const state = useApi<Page<AssetRow>>(apiPath('assets', { q, page: paging.page, page_size: paging.pageSize }));
  return (
    <>
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="자산 목록" subtitle="최신 동기화 기준 ESM 자산 (호스트명·IP·시스템명·담당자 키워드 검색)" />
      <ApiGate state={state}>
        {(p) => (
          <>
            <SimpleTable
              toolbar={
                <div className="atlas-toolbar">
                  <Search size="lg" labelText="자산 검색" placeholder="호스트명, IP, 시스템명, 담당자" value={q} onChange={(e) => { setQ(e.target.value); paging.reset(); }} />
                </div>
              }
              columns={ASSET_COLUMNS}
              rows={p.items}
              rowKey={(r) => r.key}
              onRowClick={(r) => r.project && !r.shared && go({ id: 'project', code: r.project })}
            />
            <Pager page={paging.page} pageSize={paging.pageSize} total={p.total} onChange={paging.set} />
          </>
        )}
      </ApiGate>
    </>
  );
};

export const ReviewPageView: React.FC<{ go: Go; rule?: string }> = ({ go, rule: initialRule }) => {
  const [rule, setRule] = useState<string | undefined>(initialRule);
  const paging = usePaging();
  const state = useApi<ReviewPage>(apiPath('review', { rule, page: paging.page, page_size: paging.pageSize }));
  return (
    <>
      <PageHeader
        crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]}
        title="준비도 검토"
        subtitle="이관·용량산정 전에 정리할 데이터 품질 항목. 항목을 누르면 해당 자산만 봅니다."
      />
      <ApiGate state={state}>
        {(r) => (
          <Grid condensed fullWidth className="atlas-grid">
            <Column sm={4} md={8} lg={6}>
              <SimpleTable
                title="검토 항목"
                size="sm"
                columns={[
                  { key: 'sev', header: '심각도', render: (x) => <SeverityTag severity={x.severity} /> },
                  { key: 'title', header: '항목', render: (x) => (x.rule === rule ? <strong>{x.title}</strong> : x.title) },
                  { key: 'count', header: '자산', render: (x) => fmt(x.count) },
                ]}
                rows={r.rules}
                rowKey={(x) => x.rule}
                onRowClick={(x) => { setRule(x.rule === rule ? undefined : x.rule); paging.reset(); }}
              />
            </Column>
            <Column sm={4} md={8} lg={10}>
              <SimpleTable
                title={rule ? r.rules.find((x) => x.rule === rule)?.title ?? rule : '전체 검토 결과'}
                description={rule ? r.rules.find((x) => x.rule === rule)?.recommendation : `총 ${fmt(r.total)}건`}
                size="sm"
                columns={[
                  { key: 'sev', header: '심각도', render: (f) => <SeverityTag severity={f.severity} /> },
                  { key: 'host', header: '호스트명', render: (f) => <strong>{f.hostname}</strong> },
                  { key: 'project', header: '프로젝트', render: (f) => f.project ?? '-' },
                  { key: 'detail', header: '내용', render: (f) => f.detail },
                ]}
                rows={r.items}
                rowKey={(f) => `${f.rule}-${f.key}`}
              />
              <Pager page={paging.page} pageSize={paging.pageSize} total={r.total} onChange={paging.set} />
            </Column>
          </Grid>
        )}
      </ApiGate>
    </>
  );
};

const FIELD_LABELS: Record<string, string> = {
  os: 'OS', memory_gb: '메모리', owner: '담당자', status: '운영상태', ip: 'IP', zone: '망구분', cpu_cores: '코어', cpu_model: 'CPU 모델',
  system_name: '시스템명', category: '자산분류', site: '센터', rack: '랙', model: '모델', manufacturer: '제조사', asset_tag: '자산번호', serial: '시리얼',
};

export const SyncPage: React.FC<{ go: Go }> = ({ go }) => {
  const runs = useApi<RunInfo[]>(apiPath('runs'));
  const diff = useApi<DiffResult>(apiPath('diff', { limit: 20 }));
  const [view, setView] = useState<'changed' | 'added' | 'removed'>('changed');
  return (
    <>
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="동기화 이력" subtitle="ESM 엑셀을 가져올 때마다 실행 하나가 쌓이고, 직전 실행과 비교합니다." />
      <Grid condensed fullWidth className="atlas-grid">
        <Column sm={4} md={8} lg={16}>
          <ApiGate state={runs}>
            {(rs) => (
              <SimpleTable
                title="실행"
                size="sm"
                columns={[
                  { key: 'id', header: '실행', render: (r) => `#${r.id}` },
                  { key: 'at', header: '완료 시각', render: (r) => fmtTime(r.finished_at) },
                  { key: 'src', header: '파일 / 시트', render: (r) => `${r.source_name} / ${r.sheet}` },
                  { key: 'rows', header: '행', render: (r) => fmt(r.row_count) },
                  { key: 'assets', header: '자산', render: (r) => fmt(r.asset_count) },
                  { key: 'err', header: '오류', render: (r) => (r.error_count ? <Tag size="sm" type="red">{fmt(r.error_count)}</Tag> : '0') },
                  { key: 'warn', header: '경고', render: (r) => fmt(r.warning_count) },
                ]}
                rows={rs}
                rowKey={(r) => String(r.id)}
              />
            )}
          </ApiGate>
        </Column>
        <Column sm={4} md={8} lg={16}>
          <ApiGate state={diff}>
            {(d) => (
              <Tile className="atlas-widget atlas-widget--table">
                <h2 className="atlas-widget__title">
                  실행 #{d.before} → #{d.after} 변경
                </h2>
                <p className="atlas-muted atlas-diff-summary">
                  추가 {fmt(d.counts.added)} · 삭제 {fmt(d.counts.removed)} · 변경 {fmt(d.counts.changed)} · 동일 {fmt(d.counts.unchanged)} — 변경 필드:{' '}
                  {Object.entries(d.changed_fields).slice(0, 6).map(([f, n]) => `${FIELD_LABELS[f] ?? f} ${n}`).join(', ')}
                </p>
                <ContentSwitcher size="sm" selectedIndex={['changed', 'added', 'removed'].indexOf(view)} onChange={(e) => setView((e.name as typeof view) ?? 'changed')}>
                  <Switch name="changed" text={`변경 ${fmt(d.counts.changed)}`} />
                  <Switch name="added" text={`추가 ${fmt(d.counts.added)}`} />
                  <Switch name="removed" text={`삭제 ${fmt(d.counts.removed)}`} />
                </ContentSwitcher>
                {view === 'changed' ? (
                  <SimpleTable
                    size="sm"
                    columns={[
                      { key: 'host', header: '호스트명', render: (c) => <strong>{c.hostname}</strong> },
                      {
                        key: 'fields',
                        header: '변경 내용',
                        render: (c) => Object.entries(c.fields).slice(0, 3).map(([f, v]) => `${FIELD_LABELS[f] ?? f}: ${v.before ?? '-'} → ${v.after ?? '-'}`).join(' / '),
                      },
                    ]}
                    rows={d.changed}
                    rowKey={(c) => c.key}
                  />
                ) : (
                  <SimpleTable
                    size="sm"
                    columns={[
                      { key: 'host', header: '호스트명', render: (c) => <strong>{c.hostname}</strong> },
                      { key: 'sys', header: '시스템명', render: (c) => c.system_name ?? '-' },
                    ]}
                    rows={view === 'added' ? d.added : d.removed}
                    rowKey={(c) => c.key}
                  />
                )}
              </Tile>
            )}
          </ApiGate>
        </Column>
      </Grid>
    </>
  );
};
