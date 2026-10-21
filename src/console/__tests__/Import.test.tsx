import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImportPage } from '../pages/ImportPage';

const PREVIEW = {
  token: 'reviewed-token', sheet: 'Sheet', sheets: ['Sheet'], header_row: 1, headers: ['호스트명'],
  mapping: { hostname: '호스트명' }, fields: [], assets: 1, errors: 0, warnings: 0,
  can_commit: true, conflicts: [], missing_update_columns: [], issues: [], preview: [], sha256: 'hash',
  changes: { added: 1, changed: 0, removed: 0, retained: 0 },
};

function setup() {
  const imported = vi.fn();
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/commit') ? { run_id: 1 } : PREVIEW), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  render(<ImportPage go={vi.fn()} onImported={imported} />);
  fireEvent.change(screen.getByLabelText(/자산 Excel/), { target: { files: [new File(['fixture'], 'inventory.xlsx')] } });
  return { imported, fetcher };
}

afterEach(() => vi.unstubAllGlobals());

describe('Excel 검토와 확정', () => {
  it('원천이 바뀌면 이전 검토로 확정할 수 없고 새 검토가 필요하다', async () => {
    const { imported, fetcher } = setup();
    fireEvent.click(screen.getByRole('button', { name: '파일 검토' }));
    const commit = await screen.findByRole('button', { name: '검토한 내용으로 등록' });
    expect(commit).toBeEnabled();
    fireEvent.change(screen.getByLabelText('자산 목록 종류'), { target: { value: 'equipment' } });
    expect(commit).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '파일 검토' }));
    await screen.findByRole('heading', { name: '등록 전 확인' });
    await vi.waitFor(() => expect(commit).toBeEnabled());
    fireEvent.click(commit);
    await screen.findByRole('heading', { name: '등록 #1 완료' });
    expect(imported).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[1]?.[0]).toContain('source_id=equipment');
  });

  it('전체 교체는 검토 이후에도 별도의 범위 확인이 필요하다', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('등록 방식'), { target: { value: 'replace' } });
    fireEvent.click(screen.getByRole('button', { name: '파일 검토' }));
    const commit = await screen.findByRole('button', { name: '검토한 내용으로 등록' });
    expect(commit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(commit).toBeEnabled();
  });
});
