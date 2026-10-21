import React, { useState } from 'react';
import { Button, Column, ContentSwitcher, Grid, Search, Switch, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, Tile } from '@carbon/react';
import {
  apiPath,
  ENV_LABELS,
  fmt,
  fmtTime,
  type AssetRow,
  type DiffResult,
  type Page,
  type ProjectRow,
  type RunInfo,
  useApi,
} from '../api';
import { ApiGate, PageHeader, Pager, SimpleTable, type Column as TableColumn } from '../common';
import type { ConsolePage } from '../nav';
import { DiagramView } from './DiagramPage';
import { AssetDetail } from '../AssetDetail';

type Go = (page: ConsolePage) => void;

const ASSET_COLUMNS: TableColumn<AssetRow>[] = [
  { key: 'hostname', header: '호스트명', render: (r) => <strong>{r.hostname}</strong> },
  { key: 'ip', header: 'IP', render: (r) => r.ip ?? '-' },
  {
    key: 'project',
    header: '업무 시스템',
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
  { key: 'site', header: '설치지역', render: (r) => r.site ?? '-' },
  { key: 'category', header: '장비 종류', render: (r) => r.category_detail ?? r.category ?? '미분류' },
  { key: 'os', header: 'OS', render: (r) => [r.os, r.os_version].filter(Boolean).join(' ') || '-' },
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
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="업무 시스템" subtitle="자산의 업무 분류를 기준으로 구성도와 소속 자산을 확인합니다." />
      <ApiGate state={state}>
        {(p) => (
          <>
            <SimpleTable
              toolbar={
                <div className="atlas-toolbar">
                  <Search size="lg" labelText="업무 시스템 검색" placeholder="업무 시스템 코드·이름 검색" value={q} onChange={(e) => { setQ(e.target.value); paging.reset(); }} />
                </div>
              }
              columns={[
                { key: 'name', header: '업무 시스템', render: (r) => <strong>{r.name}</strong> },
                { key: 'assets', header: '자산', render: (r) => fmt(r.assets) },
                { key: 'components', header: '인스턴스', render: (r) => fmt(r.components ?? 0) },
                { key: 'roles', header: '역할', render: (r) => Object.entries(r.roles).map(([k, v]) => `${k} ${v}`).join(' · ') },
                { key: 'envs', header: '환경', render: (r) => r.envs.join(' · ') },
                { key: 'zones', header: '망구분', render: (r) => r.zones.join(' · ') },
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
  const catalog = useApi<Page<ProjectRow>>(apiPath('projects', {q: code}));
  const name = catalog.data?.items.find(p => p.code === code)?.name ?? code;
  return (
    <>
      <PageHeader
        crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }, { label: '업무 시스템', onClick: () => go({ id: 'projects' }) }]}
        title={name}
        actions={<Button size="sm" onClick={() => go({id: 'diagram', project: code})}>업무 구성도 편집</Button>}
        subtitle={state.data ? `자산 ${fmt(state.data.total)}대` : '자산 조회 중'}
      />
      <Tabs>
        <TabList aria-label="업무 시스템 보기">
          <Tab>구성도</Tab>
          <Tab>자산</Tab>
        </TabList>
        <TabPanels>
          <TabPanel className="atlas-tab-panel">
            <DiagramView
              path={apiPath(`diagram/project/${encodeURIComponent(code)}`)}
              drawioPath={apiPath(`diagram/project/${encodeURIComponent(code)}`, { format: 'drawio' })}
              go={go}
            />
          </TabPanel>
          <TabPanel className="atlas-tab-panel">
            <ApiGate state={state}>
              {(p) => (
                <>
                  <SimpleTable title="자산" columns={ASSET_COLUMNS.filter((c) => c.key !== 'project')} rows={p.items} rowKey={(r) => r.key} />
                  <Pager page={paging.page} pageSize={paging.pageSize} total={p.total} onChange={paging.set} />
                </>
              )}
            </ApiGate>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </>
  );
};

export const AssetsPage: React.FC<{ go: Go; initialQuery?: string }> = ({ go, initialQuery = '' }) => {
  const [q, setQ] = useState(initialQuery);
  const [selected, setSelected] = useState<string>();
  const paging = usePaging();
  const state = useApi<Page<AssetRow>>(apiPath('assets', { q, page: paging.page, page_size: paging.pageSize }));
  return (
    <>
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="자산 목록" subtitle="최근 등록 기준 ESM 자산 (호스트명·IP·시스템명·담당자 키워드 검색)" />
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
              onRowClick={(r) => setSelected(r.key)}
            />
            <Pager page={paging.page} pageSize={paging.pageSize} total={p.total} onChange={paging.set} />
          </>
        )}
      </ApiGate>
      {selected && <AssetDetail assetKey={selected} close={() => setSelected(undefined)} go={go} />}
    </>
  );
};

const FIELD_LABELS: Record<string, string> = {
  product:'제품', product_version:'제품 버전', version_detail:'세부 버전', port:'PORT', url:'URL', sid:'SID', ha_mode:'이중화 방식',
  os: 'OS', memory_gb: '메모리', owner: '담당자', status: '운영상태', ip: 'IP', zone: '망구분', cpu_cores: '코어', cpu_model: 'CPU 모델',
  system_name: '시스템명', category: '자산분류', site: '센터', rack: '랙', model: '모델', manufacturer: '제조사', asset_tag: '자산번호', serial: '시리얼',
};

export const SyncPage: React.FC<{ go: Go }> = ({ go }) => {
  const runs = useApi<RunInfo[]>(apiPath('runs'));
  const diff = useApi<DiffResult>(runs.data && runs.data.length > 1 ? apiPath('diff', { limit: 20 }) : null);
  const [view, setView] = useState<'changed' | 'added' | 'removed'>('changed');
  const [recordType, setRecordType] = useState('assets');
  return (
    <>
      <PageHeader crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]} title="등록·변경 이력" subtitle="ESM 엑셀을 가져올 때마다 실행 하나가 쌓이고, 직전 실행과 비교합니다." />
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
          {runs.data?.length === 1 ? <Tile>첫 등록입니다. 다음 Excel 등록부터 변경 내용을 비교할 수 있습니다.</Tile> : <ApiGate state={diff}>
            {(result) => {
              const d = recordType === 'components' && result.components ? {...result,...result.components} : result;
              return (
              <Tile className="atlas-widget atlas-widget--table">
                <h2 className="atlas-widget__title">
                  실행 #{d.before} → #{d.after} 변경
                </h2>
                <ContentSwitcher size="sm" selectedIndex={recordType === 'assets' ? 0 : 1} onChange={e=>setRecordType(e.name as string)}>
                  <Switch name="assets" text="서버 · 장비" /><Switch name="components" text="WEB · WAS · DB" />
                </ContentSwitcher>
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
            );}}
          </ApiGate>}
        </Column>
      </Grid>
    </>
  );
};
