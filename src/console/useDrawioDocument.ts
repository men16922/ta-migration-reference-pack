import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPath } from './api';

type DrawingDocument = {
  xml: string;
  revision: number;
  loaded_revision: number | null;
  base_run: number;
  current_run: number;
  stale: boolean;
  history: Array<{revision: number; base_run: number; created_at: string}>;
};

/** Owns the embed protocol and revision lifecycle; drawing markup stays in draw.io. */
export function useDrawioDocument(project?: string, onDirty?: (dirty: boolean) => void) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef<DrawingDocument>();
  const xml = useRef('');
  const ready = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<DrawingDocument>();
  const [available, setAvailable] = useState<boolean>();
  const [initialized, setInitialized] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const post = useCallback((value: object) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(value), location.origin);
  }, []);
  const postLoad = useCallback((value: string) => {
    post({action: 'load', xml: value, autosave: 1, fit: 1, maxFitScale: 1, border: 24});
  }, [post]);

  const load = async (generated = false, revision?: number) => {
    if (pending || loading) return;
    if (dirty && !window.confirm('저장하지 않은 편집을 버리고 불러올까요?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiPath('documents', {project, generated: generated ? 'true' : undefined, revision}));
      const next = await res.json();
      if (!res.ok) throw new Error(next.detail);
      current.current = next;
      xml.current = next.xml;
      setDoc(next);
      setDirty(false);
      setMessage('');
      if (ready.current) postLoad(next.xml);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const finish = () => {
      saving.current = false;
      clearTimeout(timer.current);
      if (active) setPending(false);
    };
    const save = async (value: string) => {
      const base = current.current;
      if (!base || saving.current) return;
      saving.current = true;
      clearTimeout(timer.current);
      setPending(true);
      // Keep the document dirty until the server confirms this exact XML.
      setDirty(true);
      try {
        const res = await fetch(apiPath('documents', {project}), {
          method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Atlas-Request': '1'},
          body: JSON.stringify({xml: value, revision: base.revision, base_run: base.base_run}),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.detail);
        if (!active) return;
        current.current = {
          ...base, xml: value, revision: result.revision, loaded_revision: result.revision,
          history: [{revision: result.revision, base_run: base.base_run, created_at: new Date().toISOString()}, ...base.history],
        };
        setDoc(current.current);
        // An autosave event may have delivered newer edits while PUT was pending.
        setDirty(xml.current !== value);
        setMessage(`편집본 ${result.revision} 저장 완료`);
        setError('');
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        finish();
      }
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      switch (m.event) {
        case 'configure':
          post({action: 'configure', config: {defaultLibraries: 'general;network;cisco', defaultCompressed: false}});
          break;
        case 'init':
          ready.current = true;
          setInitialized(true);
          if (xml.current) postLoad(xml.current);
          break;
        case 'load': post({action: 'atlasFit'}); break;
        case 'autosave':
          if (typeof m.xml === 'string' && m.xml) { xml.current = m.xml; setDirty(true); }
          break;
        case 'save': case 'export': case 'atlasDocument':
          if (typeof m.xml === 'string' && m.xml) { xml.current = m.xml; void save(m.xml); }
          break;
        case 'atlasError': setError(String(m.error)); finish(); break;
      }
    };
    fetch('/api/documents/editor').then(r => r.json())
      .then(d => { if (active) setAvailable(d.available); })
      .catch(e => { if (active) setError(String(e)); });
    window.addEventListener('message', receive);
    return () => { active = false; window.removeEventListener('message', receive); clearTimeout(timer.current); };
  }, [project, post, postLoad]);

  // The editor is keyed by business scope by its caller; load once on mount.
  useEffect(() => { void load(); }, []);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  const requestSave = () => {
    if (pending || loading || !initialized || !doc) return;
    setPending(true);
    timer.current = setTimeout(() => {
      setPending(false);
      setError('편집기 응답이 없습니다. 편집 내용을 유지한 채 다시 저장하세요.');
    }, 15000);
    post({action: 'atlasDocument'});
  };
  return {frame, doc, dirty, message, error, available, initialized, pending, loading, load, requestSave};
}
