import React, { useState } from 'react';
import { Search, Select, SelectItem, Pagination } from '@carbon/react';
import { apiPath, useApi, type Page } from '../api';
import { ApiGate, PageHeader, SimpleTable } from '../common';
import { AssetDetail } from '../AssetDetail';
import type { ConsolePage } from '../nav';

export const ComponentsPage: React.FC<{ go: (page: ConsolePage) => void }> = ({ go }) => {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const state = useApi<Page<Record<string, string | null>>>(apiPath('components', { q, kind, page, page_size: 50 }));
  const labels: Record<string, string> = { matched: '서버 연결됨', ambiguous: '동명 서버 확인 필요', unmatched: '서버 목록 미확인' };
  return <>
    <PageHeader title="WEB · WAS · DB" subtitle="제품·URL·포트·SID별 등록 정보입니다. 하나의 서버에 여러 인스턴스가 있을 수 있습니다." />
    <div className="atlas-import-form">
      <Search labelText="인스턴스 검색" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <Select id="component-kind" labelText="종류" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
        <SelectItem value="" text="전체" />{['web', 'was', 'db'].map(k => <SelectItem key={k} value={k} text={k.toUpperCase()} />)}
      </Select>
    </div>
    <ApiGate state={state}>{d => <>
      <SimpleTable title="소프트웨어 인스턴스" rows={d.items} rowKey={r => r.key ?? ''} onRowClick={r => setSelected(r.key ?? '')}
        columns={[
          {key:'kind',header:'계층',render:r=>r.component_kind?.toUpperCase()},
          {key:'host',header:'호스트',render:r=>r.hostname},
          {key:'product',header:'제품 · 버전',render:r=>[r.product,r.product_version,r.version_detail].filter(Boolean).join(' ')},
          {key:'endpoint',header:'URL / SID · PORT',render:r=>[r.url || r.sid,r.port].filter(Boolean).join(' · ') || '-'},
          {key:'project',header:'업무',render:r=>r.project_name || '미분류'},
          {key:'match',header:'서버 연결',render:r=>labels[r.match_status ?? '']},
        ]} />
      <Pagination page={page} pageSize={50} pageSizes={[50]} totalItems={d.total} onChange={({page:p})=>setPage(p)} />
    </>}</ApiGate>
    {selected && <AssetDetail assetKey={selected} endpoint="component" close={()=>setSelected(undefined)} go={go} />}
  </>;
};
