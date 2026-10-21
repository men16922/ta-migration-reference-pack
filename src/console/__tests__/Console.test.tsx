import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../App';
import type { DiagramLayout, Page, ProjectRow, Summary } from '../api';

const SUMMARY: Summary = {
  run: { id: 2, source_name: 'esm-2026-10-21.xlsx', sheet: '자산목록', finished_at: '2026-10-21T07:30:00+00:00', row_count: 4990, asset_count: 4954, error_count: 36, warning_count: 16 },
  assets: { total: 4954, servers: 4931, network: 23, shared: 42, unclassified: 0 },
  projects: 154,
  readiness: { percent: 99, ready: 4882, servers: 4931 },
  by_severity: { high: 49, medium: 1004 },
  top_rules: [{ rule: 'EOS_OS', severity: 'medium', title: '지원 종료 OS', recommendation: '업그레이드 대상', count: 1003 }],
  zones: [['업무망', 2700], ['DMZ', 1000]],
  envs: [['운영', 3000]],
  sites: [['제1센터', 2500]],
  last_diff: { before: 1, after: 2, added: 40, removed: 49, changed: 84, unchanged: 4830, changed_fields: { os: 30 } },
  runs: [],
};
const PROJECTS: Page<ProjectRow> = {
  total: 154, page: 1, page_size: 6,
  items: [{ code: 'erp', name: 'ERP 시스템', assets: 48, components: 9, envs: ['운영'], zones: ['업무망'], roles: { was: 20 }, readiness: 100, issues: 3 }],
};

const DIAGRAM: DiagramLayout = {
  width: 400, height: 200,
  stats: { view: 'idc', assets: 3, servers: 2, aggregated: true, sites: ['제1센터'] },
  boxes: [
    { id: 't', parent: null, kind: 'title', label: 'IDC 현행 인프라 구성도 — 실행 #2', sublabel: '', style: '', color: null, x: 0, y: 0, w: 300, h: 40, meta: {} },
    { id: 's', parent: null, kind: 'site', label: '제1센터', sublabel: '자산 3대', style: '', color: null, x: 0, y: 60, w: 400, h: 140, meta: {} },
    { id: 'z', parent: 's', kind: 'zone', label: '업무망', sublabel: '서버 2대', style: 'zone:업무망', color: '#262626', x: 14, y: 100, w: 200, h: 90, meta: {} },
    { id: 'n', parent: 'z', kind: 'agg', label: 'WAS × 2', sublabel: '운영 2', style: 'role:was', color: '#262626', x: 28, y: 130, w: 176, h: 52, meta: { count: 2, cpu_cores: 64, memory_gb: 256, hosts: ['a1p-erp-was01', 'a1p-erp-was02'] } },
  ],
  edges: [],
  legend: [{ style: 'role:was', label: 'WAS', color: '#262626' }],
  notes: ['망 구획·통신선은 직접 편집하며 실제 연결을 추정하지 않습니다.'],
};

describe('onprem-atlas 콘솔 셸', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.startsWith('/api/workspace')
        ? { has_assets: true }
        : url.startsWith('/api/summary')
        ? SUMMARY
        : url.startsWith('/api/projects')
          ? PROJECTS
          : url.startsWith('/api/diagram')
            ? DIAGRAM
            : { total: 0, page: 1, page_size: 20, items: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('대시보드 위젯에 키트 API 요약을 보여주고 프로젝트로 이동한다', async () => {
    render(<App />);
    expect(await screen.findByText('4,954')).toBeInTheDocument();
    expect(screen.getByText('154')).toBeInTheDocument();
    expect(screen.queryByText('이관 준비도')).not.toBeInTheDocument();
    expect(screen.getByText('추가 40')).toBeInTheDocument();
    expect(screen.queryByText('지원 종료 OS')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '네트워크 분석(실험)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'API 문서' })).not.toBeInTheDocument();
    expect(await screen.findByText('ERP 시스템')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: '콘솔 메뉴' });
    fireEvent.click(within(nav).getByRole('button', { name: '업무 시스템' }));
    expect(await screen.findByRole('heading', { name: '업무 시스템' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '업무 시스템' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByText('ERP 시스템'));
    expect(await screen.findByRole('heading', {name: 'ERP 시스템'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '업무 구성도 편집'}));
    expect(await screen.findByRole('button', {name: 'draw.io에서 직접 편집'})).toBeInTheDocument();

  });

  it('구성도 메뉴는 IDC 집계 구성도를 그리고, 상자를 누르면 상세와 draw.io 내려받기를 준다', async () => {
    render(<App />);
    await screen.findByText('4,954');
    const nav = screen.getByRole('navigation', { name: '콘솔 메뉴' });
    fireEvent.click(within(nav).getByRole('button', { name: 'IDC 구성도' }));
    expect(await screen.findByRole('img', { name: /IDC 현행 인프라 구성도/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /draw.io 내려받기/ })).toHaveAttribute('href', '/api/diagram/idc?format=drawio');
    fireEvent.click(screen.getByRole('button', { name: /WAS × 2/ }));
    const detail = screen.getByRole('complementary', { name: '선택한 항목' });
    expect(within(detail).getByText('2대')).toBeInTheDocument();
    expect(within(detail).getByText('a1p-erp-was02')).toBeInTheDocument();
  });

  it('빈 운영 저장소에서는 합성 자산 대신 등록 안내를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ has_assets: false }), { status: 200 })));
    render(<App />);
    expect(await screen.findByRole('heading', { name: '등록된 자산이 없습니다' })).toBeInTheDocument();
    expect(screen.queryByText('4,954')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('API가 꺼져 있으면 실행 방법을 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: '동기화 실행이 없습니다.' }), { status: 404 })));
    render(<App />);
    expect(await screen.findByText(/운영 담당자에게 확인/)).toBeInTheDocument();
  });
});
