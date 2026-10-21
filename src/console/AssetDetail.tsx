import React from 'react';
import { Button, ComposedModal, ModalBody, ModalHeader, Tag } from '@carbon/react';
import { apiPath, useApi } from './api';
import { ApiGate, SimpleTable } from './common';
import type { ConsolePage } from './nav';

export const AssetDetail: React.FC<{ assetKey: string; endpoint?: 'asset' | 'component'; close: () => void; go: (page: ConsolePage) => void }> = ({ assetKey, endpoint = 'asset', close, go }) => {
  const state = useApi<{
    asset: Record<string, string | number | null>;
    source: { id: number; source_name: string; sheet: string; source_sha256: string };
    row_number: number; raw: Array<{ column: string; value: string }>;
  }>(apiPath(endpoint, { key: assetKey }));
  return <ComposedModal open onClose={close} size="lg">
    <ModalHeader title={String(state.data?.asset.hostname ?? '자산 상세')} />
    <ModalBody>
      <ApiGate state={state}>{(d) => <>
        <p>원본: {d.source.source_name} / {d.source.sheet} / {d.row_number}행 · 등록 #{d.source.id}</p>
        <div className="atlas-diff-summary">업무 분류: {d.asset.project_name ?? '미분류'} <Tag size="sm">{d.asset.classify_source === 'column' ? 'ESM 컬럼' : d.asset.classify_source === 'host' ? '연결된 서버' : d.asset.classify_source === 'manual' ? '수동 지정' : d.asset.classify_source === 'naming' ? '이름 규칙' : '미확인'}</Tag></div>
        {d.asset.project && !d.asset.shared && <Button kind="tertiary" size="sm" onClick={() => { close(); go({ id: 'project', code: String(d.asset.project) }); }}>업무 구성도 열기</Button>}
        <SimpleTable title="원본 자산 정보" size="sm" columns={[{ key: 'column', header: '항목', render: (r) => r.column }, { key: 'value', header: '값', render: (r) => r.value || '-' }]}
          rows={d.raw.map((r, i) => ({ ...r, id: String(i) }))} rowKey={(r) => r.id} />
        <details><summary>파일 검증 정보</summary><p className="atlas-source-hash">SHA-256: {d.source.source_sha256}</p></details>
      </>}</ApiGate>
    </ModalBody>
  </ComposedModal>;
};
