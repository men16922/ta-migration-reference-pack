import React, { useState } from 'react';
import { Button, InlineNotification, Select, SelectItem } from '@carbon/react';
import { apiPath } from './api';
import { useDrawioDocument } from './useDrawioDocument';

export const DrawioEditor: React.FC<{project?: string; close: () => void; onDirty?: (dirty: boolean) => void}> = ({project, close, onDirty}) => {
  const {frame, doc, dirty, message, error, available, initialized, pending, loading, load, requestSave} = useDrawioDocument(project, onDirty);
  const [history, setHistory] = useState('');
  return <section className="atlas-editor">
    <div className="atlas-editor-toolbar">
      <Button size="sm" onClick={requestSave} disabled={!initialized || !doc || pending || loading}>{pending ? '저장 중…' : '편집본 저장'}</Button>
      <Button size="sm" kind="tertiary" href={apiPath('documents/download',{project})}>저장본 내려받기</Button>
      <Button size="sm" kind="ghost" disabled={pending || loading} onClick={()=>load(true)}>최신 자산으로 새 도면</Button>
      <Button size="sm" kind="ghost" disabled={pending || loading} onClick={()=>{if(!dirty || window.confirm('저장하지 않은 편집을 버리고 닫을까요?')) close();}}>편집 닫기</Button>
      <span>{dirty ? '저장하지 않은 변경' : message || `자산 기준 #${doc?.base_run ?? '-'} · 편집본 ${doc?.loaded_revision ?? '새 도면'}`}</span>
    </div>
    <p className="atlas-muted">왼쪽 도형에서 방화벽·스위치·망 구획을 추가하고 연결선을 그리세요. 편집 내용은 원본 자산 정보와 분리해 저장합니다.</p>
    {doc?.stale && <InlineNotification kind="warning" hideCloseButton title="새 자산 등록이 있습니다" subtitle={`이 도면은 자산 #${doc.base_run} 기준입니다. 최신 자산은 #${doc.current_run}입니다. 기존 편집본은 유지됩니다.`} />}
    {!!doc?.history.length && <div className="atlas-editor-toolbar"><Select id="diagram-history" labelText="이전 편집본" value={history} onChange={e=>setHistory(e.target.value)}><SelectItem value="" text="선택" />{doc.history.map(h=><SelectItem key={h.revision} value={String(h.revision)} text={`편집본 ${h.revision} · 자산 #${h.base_run}`} />)}</Select><Button kind="ghost" disabled={!history || pending || loading} onClick={()=>load(false,Number(history))}>이력 불러오기</Button></div>}
    {error && <InlineNotification kind="error" hideCloseButton title="편집본 처리 실패" subtitle={error} />}
    {available ? <iframe ref={frame} title="로컬 draw.io 편집기" src="/editor/index.html?embed=1&proto=json&configure=1&spin=1&ui=kennedy&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&offline=1&local=1&stealth=1&lang=ko" /> : <p>{available === undefined ? '편집기 확인 중…' : '로컬 draw.io 편집기가 없습니다. ONPREM_ATLAS_EDITOR_DIR에 설치 경로를 지정해 서버를 다시 실행하세요.'}</p>}
  </section>;
};
