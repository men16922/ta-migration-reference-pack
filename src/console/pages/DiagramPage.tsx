import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ComboBox, ContentSwitcher, IconButton, InlineNotification, Switch, Tag } from '@carbon/react';
import { Download, FitToScreen, ZoomIn, ZoomOut } from '@carbon/icons-react';
import { apiPath, fmt, type DiagramBox, type DiagramLayout, type Page, type ProjectRow, useApi } from '../api';
import { ApiGate, PageHeader } from '../common';
import type { ConsolePage } from '../nav';

type Go = (page: ConsolePage) => void;

const CONTAINERS = new Set(['site', 'env', 'zone', 'subnet', 'band']);

/** 대략적인 글자 폭(12px 기준)으로 상자 안에 들어가게 자른다. 전체 값은 <title>과 상세 패널에 있다. */
function clip(text: string, px: number, size = 12): string {
  let w = 0;
  for (let i = 0; i < text.length; i += 1) {
    w += (text.charCodeAt(i) > 0x2e80 ? 1.0 : 0.58) * size;
    if (w > px) return `${text.slice(0, Math.max(i - 1, 1))}…`;
  }
  return text;
}

const DiagramSvg: React.FC<{ layout: DiagramLayout; zoom: number; selected?: string; onSelect: (b: DiagramBox) => void }> = ({ layout, zoom, selected, onSelect }) => (
  <svg
    className="atlas-dg"
    width={layout.width * zoom}
    height={layout.height * zoom}
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    role="img"
    aria-label={layout.boxes.find((b) => b.kind === 'title')?.label ?? '구성도'}
  >
    <defs>
      <marker id="atlas-dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="atlas-dg-arrowhead" />
      </marker>
    </defs>
    {layout.boxes.map((b) => {
      if (b.kind === 'title') {
        return (
          <g key={b.id}>
            <text x={b.x} y={b.y + 22} className="atlas-dg-title">{b.label}</text>
            {b.sublabel && <text x={b.x} y={b.y + 42} className="atlas-dg-sub">{b.sublabel}</text>}
          </g>
        );
      }
      if (CONTAINERS.has(b.kind)) {
        return (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} className={`atlas-dg-box atlas-dg-${b.kind}`} style={b.kind === 'zone' && b.color ? { stroke: b.color } : undefined} />
            {b.kind === 'zone' && b.color && <rect x={b.x} y={b.y} width={b.w} height={3} fill={b.color} />}
            <text x={b.x + 10} y={b.y + 19} className={`atlas-dg-label atlas-dg-label--${b.kind}`}>{clip(b.label, b.w - 20, 13)}</text>
            {b.sublabel && <text x={b.x + 10} y={b.y + 35} className="atlas-dg-sub">{clip(b.sublabel, b.w - 20, 11)}</text>}
          </g>
        );
      }
      const isSel = selected === b.id;
      return (
        <g
          key={b.id}
          className={`atlas-dg-node${isSel ? ' atlas-dg-node--selected' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${b.label}${b.sublabel ? `, ${b.sublabel}` : ''}`}
          onClick={() => onSelect(b)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(b))}
        >
          <title>{b.sublabel ? `${b.label}\n${b.sublabel}` : b.label}</title>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} className="atlas-dg-card" />
          <rect x={b.x} y={b.y} width={4} height={b.h} fill={b.color ?? 'currentColor'} />
          <text x={b.x + 12} y={b.y + (b.sublabel ? 20 : b.h / 2 + 4)} className="atlas-dg-node-label">{clip(b.label, b.w - 20)}</text>
          {b.sublabel && <text x={b.x + 12} y={b.y + 36} className="atlas-dg-sub">{clip(b.sublabel, b.w - 20, 11)}</text>}
        </g>
      );
    })}
    {layout.edges.map((e) => {
      const [p0, p1] = e.points;
      return (
        <g key={e.id}>
          <polyline points={e.points.map((p) => p.join(',')).join(' ')} className={`atlas-dg-edge atlas-dg-edge--${e.kind}`} markerEnd="url(#atlas-dg-arrow)" />
          {e.label && p0 && p1 && (
            <text x={(p0[0] + p1[0]) / 2} y={(p0[1] + p1[1]) / 2 - 5} textAnchor="middle" className="atlas-dg-sub">{e.label}</text>
          )}
        </g>
      );
    })}
  </svg>
);

const Detail: React.FC<{ box: DiagramBox; go: Go }> = ({ box, go }) => {
  const m = box.meta;
  const rows: Array<[string, React.ReactNode]> =
    m.count != null
      ? [
          ['자산 수', `${fmt(m.count)}대`],
          ['코어 합계', fmt(m.cpu_cores ?? null)],
          ['메모리 합계', m.memory_gb ? `${fmt(m.memory_gb)}GB` : '-'],
        ]
      : [
          ['IP', m.ip ?? '-'],
          ['OS', m.os ?? '-'],
          ['CPU', m.cpu_model ? `${m.cpu_model} · ${fmt(m.cpu_cores ?? null)}코어` : fmt(m.cpu_cores ?? null)],
          ['메모리', m.memory_gb ? `${fmt(m.memory_gb)}GB` : '-'],
          ['망구분', m.zone ?? '-'],
          ['운영상태', m.status ?? '-'],
        ];
  return (
    <aside className="atlas-dg-detail" aria-label="선택한 항목">
      <h3 className="atlas-widget__title">{box.label}</h3>
      {box.sublabel && <p className="atlas-muted">{box.sublabel}</p>}
      <dl className="atlas-dg-detail__list">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      {m.hosts && m.hosts.length > 0 && (
        <>
          <p className="atlas-muted">호스트 (최대 20)</p>
          <ul className="atlas-dg-detail__hosts">
            {m.hosts.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </>
      )}
      {m.hostname && (
        <Button kind="ghost" size="sm" onClick={() => go({ id: 'assets', q: m.hostname ?? '' })}>
          자산 목록에서 보기
        </Button>
      )}
    </aside>
  );
};

/** 키트 `diagram` 레이아웃 JSON을 SVG로 그린다. 좌표·셀 ID는 내려받는 .drawio와 같다. */
export const DiagramView: React.FC<{ path: string; drawioPath: string; go: Go }> = ({ path, drawioPath, go }) => {
  const state = useApi<DiagramLayout>(path);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<DiagramBox | undefined>();
  const frame = useRef<HTMLDivElement>(null);
  const layout = state.data;

  const fitZoom = () => {
    const width = frame.current?.clientWidth ?? 0;
    return layout && width > 0 ? Math.min(1, Math.max(0.2, (width - 16) / layout.width)) : undefined;
  };
  const fit = () => {
    const z = fitZoom();
    if (z) setZoom(z);
  };
  // 처음에는 글자가 읽히는 배율(60% 이상)로 연다. 전체 보기는 "화면에 맞춤".
  useEffect(() => {
    const z = fitZoom();
    if (z) setZoom(Math.max(0.6, z));
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSelected(undefined), [path]);

  return (
    <ApiGate state={state}>
      {(d) => (
        <section className="atlas-dg-panel">
          <div className="atlas-dg-toolbar">
            <div className="atlas-tags">
              {d.legend.map((l) => (
                <span key={l.style} className="atlas-dg-legend">
                  <span className="atlas-dg-legend__swatch" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
              {d.stats.aggregated && d.stats.view === 'project' && <Tag size="sm" type="warm-gray">서버 {fmt(d.stats.servers)}대 — 역할별 집계</Tag>}
            </div>
            <div className="atlas-dg-toolbar__actions">
              <IconButton kind="ghost" size="sm" label="축소" onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))}>
                <ZoomOut />
              </IconButton>
              <span className="atlas-muted atlas-dg-zoom">{Math.round(zoom * 100)}%</span>
              <IconButton kind="ghost" size="sm" label="확대" onClick={() => setZoom((z) => Math.min(2, z * 1.25))}>
                <ZoomIn />
              </IconButton>
              <IconButton kind="ghost" size="sm" label="화면에 맞춤" onClick={fit}>
                <FitToScreen />
              </IconButton>
              <Button kind="tertiary" size="sm" renderIcon={Download} href={drawioPath}>
                draw.io 내려받기
              </Button>
            </div>
          </div>
          <div className={`atlas-dg-body${selected ? ' atlas-dg-body--detail' : ''}`}>
            <div className="atlas-dg-frame" ref={frame}>
              <DiagramSvg layout={d} zoom={zoom} selected={selected?.id} onSelect={setSelected} />
            </div>
            {selected && <Detail box={selected} go={go} />}
          </div>
          <ul className="atlas-dg-notes">
            {d.notes.map((n) => <li key={n} className="atlas-muted">{n}</li>)}
          </ul>
        </section>
      )}
    </ApiGate>
  );
};

export const DiagramPage: React.FC<{ go: Go; project?: string }> = ({ go, project: initial }) => {
  const [project, setProject] = useState<string | undefined>(initial);
  const projects = useApi<Page<ProjectRow>>(apiPath('projects', { page_size: 200 }));
  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);
  const mode = project ? 1 : 0;
  const chosen = items.find((p) => p.code === project);

  const base = project ? `diagram/project/${encodeURIComponent(project)}` : 'diagram/idc';
  return (
    <>
      <PageHeader
        crumbs={[{ label: '대시보드', onClick: () => go({ id: 'dashboard' }) }]}
        title="구성도"
        subtitle="ESM 자산으로 그린 온프렘 현행 구성도. IDC 전체는 역할별 집계, 프로젝트는 서버 단위로 그립니다."
      />
      <div className="atlas-dg-picker">
        <ContentSwitcher
          size="md"
          selectedIndex={mode}
          onChange={({ index }: { index?: number }) => setProject(index === 1 ? (project ?? items[0]?.code) : undefined)}
        >
          <Switch name="idc" text="IDC 전체" />
          <Switch name="project" text="프로젝트" disabled={items.length === 0} />
        </ContentSwitcher>
        {mode === 1 && (
          <ComboBox
            id="atlas-dg-project"
            titleText=""
            aria-label="프로젝트 선택"
            placeholder="프로젝트 코드·이름"
            items={items}
            selectedItem={chosen ?? null}
            itemToString={(p: ProjectRow | null) => (p ? `${p.name} (${p.code}) · ${p.assets}대` : '')}
            onChange={({ selectedItem }: { selectedItem?: ProjectRow | null }) => selectedItem && setProject(selectedItem.code)}
          />
        )}
      </div>
      {projects.error && <InlineNotification kind="error" lowContrast hideCloseButton title="프로젝트 목록을 불러오지 못했습니다" subtitle={projects.error} />}
      <DiagramView key={base} path={apiPath(base)} drawioPath={apiPath(base, { format: 'drawio' })} go={go} />
    </>
  );
};
