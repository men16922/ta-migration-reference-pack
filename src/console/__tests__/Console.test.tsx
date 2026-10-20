import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../App';
import type { Page, ProjectRow, Summary } from '../api';

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
  items: [{ code: 'erp', name: 'ERP 시스템', assets: 48, envs: ['운영'], zones: ['업무망'], roles: { was: 20 }, readiness: 100, issues: 3 }],
};

describe('onprem-atlas 콘솔 셸', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.startsWith('/api/summary') ? SUMMARY : url.startsWith('/api/projects') ? PROJECTS : { total: 0, page: 1, page_size: 20, items: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('대시보드 위젯에 키트 API 요약을 보여주고 프로젝트로 이동한다', async () => {
    render(<App />);
    expect(await screen.findByText('4,954')).toBeInTheDocument();
    expect(screen.getByText('154')).toBeInTheDocument();
    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.getByText('추가 40')).toBeInTheDocument();
    expect(screen.getByText('지원 종료 OS')).toBeInTheDocument();
    expect(await screen.findByText('ERP 시스템')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: '콘솔 메뉴' });
    fireEvent.click(within(nav).getByRole('button', { name: '프로젝트' }));
    expect(await screen.findByRole('heading', { name: '프로젝트' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '프로젝트' })).toHaveAttribute('aria-current', 'page');
  });

  it('API가 꺼져 있으면 실행 방법을 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: '동기화 실행이 없습니다.' }), { status: 404 })));
    render(<App />);
    expect(await screen.findByText(/onprem-atlas serve/)).toBeInTheDocument();
  });
});
