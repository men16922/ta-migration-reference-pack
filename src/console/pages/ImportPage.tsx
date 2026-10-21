import React, { useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tile } from '@carbon/react';
import { PageHeader, SimpleTable } from '../common';
import type { ConsolePage } from '../nav';

interface Preview {
  record_type?: string; host_matches?: Record<string, number>;
  token: string; sheet: string; sheets: string[]; header_row: number; headers: string[];
  mapping: Record<string, string>; fields: string[]; assets: number; errors: number; warnings: number;
  can_commit: boolean; conflicts: string[]; sha256: string;
  missing_update_columns: string[];
  issues: Array<{ row_number: number; severity: string; code: string; message: string }>;
  changes: { added: number; changed: number; removed: number; retained: number };
  preview: Array<Record<string, string | number | null>>;
}

const LABELS: Record<string, string> = {
  product: '제품명', product_version: '제품 버전', version_detail: '버전 상세', port: 'PORT', url: 'URL', sid: 'DB명(SID)', ha_mode: '이중화 방식', rto: 'ITSM RTO', monitoring: '모니터링 여부', agent_status: 'AGENT 상태',
  hostname: '호스트명·장비명', ip: '대표 IP', asset_tag: '자산번호', serial: '시리얼', category: '장비 범주',
  manufacturer: '제조사', model: '모델', os: 'OS 종류', cpu_model: 'CPU 모델', cpu_sockets: 'CPU 소켓',
  cpu_cores: 'CPU 코어', memory_gb: '메모리(GB)', site: '설치지역', rack: '상면번호', zone: '망구분',
  system_name: '시스템명', owner: '담당자', status: '사용 상태', organization: '그룹사(BOX)', os_organization: '그룹사(OS)',
  management_ip: '관리 IP', service_ip: '서비스 IP', category_detail: '장비 세부분류·솔루션 유형', os_family: 'OS 범주', os_version: 'OS 버전',
  environment: '환경·용도', business_l1: 'ITSM 업무 대분류', business_l2: 'ITSM 업무 중분류', business_l3: 'ITSM 업무 소분류',
  description: '설명', rack_unit: '랙 시작 U', ha_peer: '이중화 서버', eos_date: 'EOS 날짜', monitoring_proxy: '모니터링 Proxy',
};

export const ImportPage: React.FC<{ go: (page: ConsolePage) => void; onImported: () => void }> = ({ go, onImported }) => {
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState('servers');
  const [mode, setMode] = useState('merge');
  const [sheet, setSheet] = useState('');
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<number>();

  async function result<T>(response: Response): Promise<T> {
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : '등록 요청을 처리하지 못했습니다.');
    return body as T;
  }
  const inspect = async () => {
    if (!file || busy) return;
    setBusy(true); setError(''); setDone(undefined); setConfirmed(false);
    try {
      const params = new URLSearchParams({ filename: file.name, source_id: source, mode, profile: JSON.stringify({ columns }) });
      if (sheet) params.set('sheet', sheet);
      const body = await result<Preview>(await fetch(`/api/imports/preview?${params}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Atlas-Request': '1' }, body: file,
      }));
      setPreview(body); setSheet(body.sheet); setStale(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPreview(undefined); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview || stale || busy) return;
    setBusy(true); setError('');
    try {
      const body = await result<{ run_id: number }>(await fetch('/api/imports/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': '1' },
        body: JSON.stringify({ token: preview.token, confirm_replace: confirmed }),
      }));
      setDone(body.run_id); setPreview(undefined); onImported();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader title="Excel 등록" subtitle="ESM에서 내려받은 파일을 확인한 뒤 등록합니다. 서버·일반 장비·보안장비·WEB·WAS·DB 목록은 각각 관리됩니다." />
    <Tile className="atlas-widget">
      <div className="atlas-import-form">
        <label>자산 Excel (.xlsx, 최대 20MB)
          <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => {
            setFile(e.target.files?.[0]); setPreview(undefined); setColumns({}); setSheet(''); setDone(undefined); setError('');
          }} />
        </label>
        <Select id="import-source" labelText="자산 목록 종류" value={source} disabled={busy} onChange={(e) => { setSource(e.target.value); setStale(true); }}>
          {['web', 'was', 'db'].map(k => <SelectItem key={k} value={k} text={`${k.toUpperCase()} 인스턴스 목록`} />)}
          <SelectItem value="servers" text="서버 목록" /><SelectItem value="equipment" text="네트워크·스토리지·백업 장비 목록" />
          <SelectItem value="security" text="보안장비 목록" />
        </Select>
        <Select id="import-mode" labelText="등록 방식" value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value); setStale(true); setConfirmed(false); }}>
          <SelectItem value="merge" text="추가·갱신 — 파일에 없는 기존 자산 유지" />
          <SelectItem value="replace" text="이 목록 전체 교체 — 파일에 없는 같은 종류 자산 제외" />
        </Select>
        <p className="atlas-muted">조회 조건으로 일부만 내려받았다면 추가·갱신을 사용하세요. 전체 교체도 다른 종류의 목록은 유지합니다.</p>
        <Button disabled={!file || busy || (file?.size ?? 0) > 20 * 1024 * 1024} onClick={inspect}>파일 검토</Button>
        {file && file.size > 20 * 1024 * 1024 && <p role="alert">20MB 이하 파일을 선택하세요.</p>}
      </div>
    </Tile>
    {busy && <InlineLoading description="파일을 처리하는 중…" />}
    {error && <InlineNotification kind="error" title="등록을 완료하지 못했습니다" subtitle={error} hideCloseButton />}
    {done && <Tile className="atlas-widget">
      <h2 className="atlas-widget__title">등록 #{done} 완료</h2>
      <Button onClick={() => go({ id: ['web', 'was', 'db'].includes(source) ? 'components' : 'assets' })}>자산 확인</Button>{' '}
      <Button kind="tertiary" onClick={() => go({ id: 'diagram' })}>IDC 구성도 열기</Button>
    </Tile>}
    {preview && <Tile className="atlas-widget">
      <h2 className="atlas-widget__title">등록 전 확인</h2>
      <p>{preview.record_type === 'component' ? '인스턴스' : '자산'} {preview.assets}건 · 추가 {preview.changes.added} · 변경 {preview.changes.changed} · 제외 {preview.changes.removed} · 기존 유지 {preview.changes.retained}</p>
      {preview.record_type === 'component' && <p>서버 연결 {preview.host_matches?.matched ?? 0}건 · 동명 서버 확인 {preview.host_matches?.ambiguous ?? 0}건 · 서버 목록 미확인 {preview.host_matches?.unmatched ?? 0}건. 미연결 인스턴스도 보존하며 서버 등록 후 다시 연결합니다.</p>}
      <p>오류 {preview.errors}건 · 경고 {preview.warnings}건 · 다른 목록과 식별자 충돌 {preview.conflicts.length}건</p>
      {preview.missing_update_columns.length > 0 && <InlineNotification kind="error" hideCloseButton title="기존 정보가 사라질 수 있어 등록을 중단했습니다"
        subtitle={`다음 열을 포함한 Excel로 다시 검토하세요: ${preview.missing_update_columns.map((f) => LABELS[f] ?? f).join(', ')}`} />}
      <details className="atlas-import-mapping">
        <summary>시트·열 매핑 확인 및 수정 (헤더 {preview.header_row}행)</summary>
        <Select id="import-sheet" labelText="시트" value={sheet} disabled={busy} onChange={(e) => { setSheet(e.target.value); setColumns({}); setStale(true); }}>
          {preview.sheets.map((s) => <SelectItem key={s} value={s} text={s} />)}
        </Select>
        <div className="atlas-import-fields">
          {preview.fields.map((field) => <Select key={field} id={`mapping-${field}`} labelText={LABELS[field] ?? field} disabled={busy}
            value={columns[field] ?? ''} onChange={(e) => { setColumns((c) => { const next = { ...c }; if (e.target.value) next[field] = e.target.value; else delete next[field]; return next; }); setStale(true); }}>
            <SelectItem value="" text={`자동: ${preview.mapping[field] ?? '매핑 없음'}`} />
            {preview.headers.filter(Boolean).map((h, i) => <SelectItem key={`${h}-${i}`} value={h} text={h} />)}
          </Select>)}
        </div>
      </details>
      {preview.preview.length > 0 && <SimpleTable title="미리보기 (최대 5건)" size="sm"
        columns={(preview.record_type === 'component' ? ['hostname', 'product', 'product_version', 'port', 'url', 'sid', 'business_l3'] : ['hostname', 'organization', 'site', 'ip', 'management_ip', 'service_ip', 'business_l3']).map((key) => ({ key, header: LABELS[key] ?? key, render: (r: Record<string, string | number | null>) => r[key] ?? '-' }))}
        rows={preview.preview} rowKey={(r) => `${r.organization}/${r.site}/${r.hostname}/${r.product}/${r.port}/${r.url}/${r.sid}/${r.business_l3}`} />}
      {preview.issues.length > 0 && <SimpleTable title="확인할 항목 (최대 100건)" size="sm"
        columns={[{ key: 'row', header: '행', render: (r) => r.row_number }, { key: 'severity', header: '구분', render: (r) => r.severity === 'error' ? '오류' : '경고' }, { key: 'message', header: '내용', render: (r) => r.message }]}
        rows={preview.issues} rowKey={(r) => `${r.row_number}/${r.code}/${r.message}`} />}
      {stale && <p role="status">선택이 변경되었습니다. 파일 검토를 다시 실행하세요.</p>}
      {mode === 'replace' && <Checkbox id="confirm-replace" checked={confirmed} disabled={busy} onChange={(_, { checked }) => setConfirmed(checked)} labelText="이 종류의 전체 자산 목록임을 확인했으며, 파일에 없는 자산을 현재 목록에서 제외합니다. 과거 이력은 보존됩니다." />}
      <Button className="atlas-diff-summary" disabled={busy || stale || !preview.can_commit || (mode === 'replace' && !confirmed)} onClick={commit}>검토한 내용으로 등록</Button>
    </Tile>}
  </>;
};
