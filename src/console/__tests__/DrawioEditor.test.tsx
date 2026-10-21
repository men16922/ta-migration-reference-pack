import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawioEditor } from '../DrawioEditor';

const document = { xml: '<initial/>', revision: 3, loaded_revision: 3, base_run: 5, current_run: 5, stale: false, history: [{revision: 3, base_run: 5, created_at: ''}] };
let finishSave: (value: Response) => void;
const response = (data: unknown) => new Response(JSON.stringify(data), {status: 200});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'PUT') return new Promise<Response>(resolve => { finishSave = resolve; });
    return response(url.includes('/editor') ? {available: true} : document);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function editor() {
  const frame = await screen.findByTitle('로컬 draw.io 편집기') as HTMLIFrameElement;
  const send = (event: string, xml?: string, origin = location.origin) => act(() => {
    window.dispatchEvent(new MessageEvent('message', {origin, source: frame.contentWindow, data: JSON.stringify({event, xml})}));
  });
  send('init');
  await waitFor(() => expect(screen.getByRole('button', {name: '편집본 저장'})).toBeEnabled());
  return send;
}

it('저장 요청 이후 추가한 편집은 미저장 상태로 남고 다음 저장에 반영된다', async () => {
  const onDirty = vi.fn();
  render(<DrawioEditor close={vi.fn()} onDirty={onDirty} />);
  const send = await editor();
  send('autosave', '<first/>');
  fireEvent.click(screen.getByRole('button', {name: '편집본 저장'}));
  send('atlasDocument', '<first/>');
  send('autosave', '<second/>');
  await act(async () => finishSave(response({revision: 4})));
  expect(screen.getByText('저장하지 않은 변경')).toBeInTheDocument();
  expect(onDirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', {name: '편집본 저장'}));
  send('atlasDocument', '<second/>');
  const writes = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PUT');
  expect(JSON.parse(writes[1]?.[1]?.body as string)).toEqual({xml: '<second/>', revision: 4, base_run: 5});
  await act(async () => finishSave(response({revision: 5})));
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it('외부 origin 메시지를 무시하고 미저장 상태에서 닫기를 확인한다', async () => {
  const close = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<DrawioEditor close={close} />);
  const send = await editor();
  send('atlasDocument', '<untrusted/>', 'https://example.invalid');
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
  send('autosave', '<edited/>');
  fireEvent.click(screen.getByRole('button', {name: '편집 닫기'}));
  expect(confirm).toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  confirm.mockRestore();
});
