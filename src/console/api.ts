import { useEffect, useState } from 'react';

/** onprem-atlas 읽기 전용 API(`onprem-atlas serve`, kit/src/onprem_atlas/web) 응답 타입. */

export interface RunInfo {
  id: number;
  source_name: string;
  sheet: string;
  finished_at: string;
  row_count: number;
  asset_count: number;
  error_count: number;
  warning_count: number;
}

export interface RuleSummary {
  rule: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  recommendation: string;
  count: number;
}

export interface DiffCounts {
  before: number;
  after: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  changed_fields: Record<string, number>;
}

export interface Summary {
  run: RunInfo;
  assets: { total: number; servers: number; network: number; shared: number; unclassified: number };
  projects: number;
  components?: {total:number; unmatched:number};
  readiness: { percent: number; ready: number; servers: number };
  by_severity: Partial<Record<RuleSummary['severity'], number>>;
  top_rules: RuleSummary[];
  zones: Array<[string, number]>;
  envs: Array<[string, number]>;
  sites: Array<[string, number]>;
  last_diff: DiffCounts | null;
  runs: RunInfo[];
}

export interface Page<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface ProjectRow {
  code: string;
  name: string;
  assets: number;
  components: number;
  envs: string[];
  zones: string[];
  roles: Record<string, number>;
  readiness: number;
  issues: number;
}

export interface AssetRow {
  organization?: string | null;
  category_detail?: string | null;
  os_version?: string | null;
  key: string;
  hostname: string;
  ip: string | null;
  category: string | null;
  os: string | null;
  cpu_model: string | null;
  cpu_cores: number | null;
  memory_gb: number | null;
  site: string | null;
  zone: string | null;
  system_name: string | null;
  owner: string | null;
  status: string | null;
  project: string | null;
  project_name: string | null;
  env: string | null;
  role: string | null;
  shared: number | null;
  classify_source: string | null;
}

export interface DiffResult {
  components?: Omit<DiffResult, 'before' | 'after' | 'components'>;
  before: number;
  after: number;
  changed_fields: Record<string, number>;
  counts: Omit<DiffCounts, 'before' | 'after' | 'changed_fields'>;
  added: Array<{ key: string; hostname: string; system_name: string | null }>;
  removed: Array<{ key: string; hostname: string; system_name: string | null }>;
  changed: Array<{ key: string; hostname: string; fields: Record<string, { before: unknown; after: unknown }> }>;
}

export interface DiagramBox {
  id: string;
  parent: string | null;
  kind: 'title' | 'site' | 'env' | 'zone' | 'subnet' | 'band' | 'tier' | 'node' | 'agg';
  label: string;
  sublabel: string;
  style: string;
  color: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  meta: {
    record_type?: string; product?: string; product_version?: string; port?: string; url?: string; sid?: string; match_status?: string; citation?: string;
    hostname?: string;
    ip?: string | null;
    os?: string | null;
    cpu_model?: string | null;
    cpu_cores?: number | null;
    memory_gb?: number | null;
    zone?: string | null;
    status?: string | null;
    count?: number;
    hosts?: string[];
  };
}

/** `GET /api/diagram/idc`, `/api/diagram/project/{code}` — 좌표는 내려받는 .drawio와 같다. */
export interface DiagramLayout {
  width: number;
  height: number;
  stats: { view: 'idc' | 'project'; assets: number; servers: number; shown?: number; aggregated: boolean; sites: string[]; project?: string; name?: string };
  boxes: DiagramBox[];
  edges: Array<{ id: string; source: string; target: string; label: string; kind: 'inferred' | 'link' | 'declared'; points: Array<[number, number]> }>;
  legend: Array<{ style: string; label: string; color: string }>;
  notes: string[];
}

export const ENV_LABELS: Record<string, string> = { p: '운영', d: '개발', s: '스테이징' };

export function apiPath(path: string, params: Record<string, string | number | undefined> = {}): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `/api/${path}${qs ? `?${qs}` : ''}`;
}

export interface ApiState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

export function useApi<T>(url: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ loading: true });
  useEffect(() => {
    if (!url) { setState({ loading: false }); return; }
    let alive = true;
    setState((prev) => ({ ...prev, loading: true }));
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as T;
      })
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e: unknown) => alive && setState({ error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

export const fmt = (n: number | null | undefined): string => (n == null ? '-' : n.toLocaleString('ko-KR'));

/** ISO 시각(UTC) → 보는 사람 현지 시각. */
export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
