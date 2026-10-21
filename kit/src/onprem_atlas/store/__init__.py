"""store: SQLite 자산 저장소. 의존성은 표준 라이브러리 sqlite3뿐.

- 동기화 실행(`sync_runs`)마다 원본 행(`asset_rows`)과 정규화 결과(`run_assets`)를 남긴다 → 실행 간 diff 가능.
- `assets` 뷰 = 최신 실행의 자산. `assets_fts`(FTS5 trigram) = 최신 실행 키워드 검색.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from ..ingest import FIELDS, MappingProfile, ParsedSheet

SCHEMA_VERSION = 3

_TYPES = {"cpu_sockets": "INTEGER", "cpu_cores": "INTEGER", "memory_gb": "REAL"}
_ASSET_COLUMNS = ",\n  ".join(f"{f} {_TYPES.get(f, 'TEXT')}" for f in FIELDS)
_FTS_FIELDS = ("hostname", "ip", "system_name", "owner", "category", "model", "os", "zone", "site", "asset_tag", "management_ip", "service_ip", "description", "business_l3", "organization")

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'legacy',
  mode TEXT NOT NULL DEFAULT 'replace',
  source_sha256 TEXT NOT NULL,
  sheet TEXT NOT NULL,
  header_row INTEGER NOT NULL,
  headers_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  asset_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_rows (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  cells_json TEXT NOT NULL,
  PRIMARY KEY (run_id, row_number)
);
CREATE TABLE IF NOT EXISTS run_assets (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'legacy',
  origin_run_id INTEGER,
  row_number INTEGER NOT NULL,
  {_ASSET_COLUMNS},
  PRIMARY KEY (run_id, key)
);
CREATE INDEX IF NOT EXISTS run_assets_ip ON run_assets (run_id, ip);
CREATE TABLE IF NOT EXISTS asset_issues (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS asset_issues_run ON asset_issues (run_id, severity, code);
CREATE TABLE IF NOT EXISTS classify_runs (
  run_id INTEGER PRIMARY KEY REFERENCES sync_runs(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  classified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_projects (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  project TEXT,
  env TEXT,
  role TEXT,
  site TEXT,
  source TEXT,
  rule_id TEXT,
  shared INTEGER NOT NULL DEFAULT 0,
  naming_ok INTEGER NOT NULL DEFAULT 0,
  conflict TEXT,
  PRIMARY KEY (run_id, key)
);
CREATE INDEX IF NOT EXISTS asset_projects_project ON asset_projects (run_id, project);
CREATE TABLE IF NOT EXISTS project_names (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (run_id, project)
);
CREATE TABLE IF NOT EXISTS pending_imports (
  token TEXT PRIMARY KEY, path TEXT NOT NULL, source_id TEXT NOT NULL, source_name TEXT NOT NULL,
  sha256 TEXT NOT NULL, profile_json TEXT NOT NULL, base_run INTEGER,
  mode TEXT NOT NULL, created_at TEXT NOT NULL, committed_run INTEGER
);
CREATE TABLE IF NOT EXISTS run_components (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id), key TEXT NOT NULL,
  source_id TEXT NOT NULL, origin_run_id INTEGER NOT NULL,
  row_number INTEGER NOT NULL, values_json TEXT NOT NULL,
  PRIMARY KEY (run_id, key)
);
CREATE TABLE IF NOT EXISTS diagram_documents (
  scope TEXT NOT NULL, revision INTEGER NOT NULL, base_run INTEGER NOT NULL REFERENCES sync_runs(id),
  xml TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (scope, revision)
);
CREATE VIEW IF NOT EXISTS assets AS
  SELECT * FROM run_assets WHERE run_id = (SELECT MAX(id) FROM sync_runs);
CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(key UNINDEXED, {", ".join(_FTS_FIELDS)}, tokenize='trigram');
"""


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


class AtlasStore:
    """자산 DB 하나. 경로 대신 ':memory:'도 된다."""

    def __init__(self, path: str | Path, clock: Callable[[], str] = utc_now, *, check_same_thread: bool = True, read_only: bool = False) -> None:
        """`check_same_thread=False`: 연결 하나를 여러 스레드가 차례로 쓰는 경우(FastAPI 의존성은 핸들러와 다른 스레드에서 열린다).
        동시에 쓰지만 않으면 안전하다 — 웹 계층은 요청마다 연결을 새로 연다."""
        self.path = str(path)
        self.clock = clock
        if read_only:
            self.conn = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True, check_same_thread=check_same_thread)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("PRAGMA query_only = ON")
            return
        self.conn = sqlite3.connect(self.path, check_same_thread=check_same_thread)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        if self.path != ":memory:":
            self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.executescript(SCHEMA)
        version = self.conn.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
        if version is None:
            self.conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
            self.conn.commit()
        elif int(version[0]) == 1:
            with self._tx():
                self.conn.execute("BEGIN IMMEDIATE")
                current = int(self.conn.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()[0])
                if current == SCHEMA_VERSION:
                    return  # Another connection completed the migration while this one waited.
                # Additive migration keeps every old run and raw source row intact.
                existing = {r[1] for r in self.conn.execute("PRAGMA table_info(run_assets)")}
                for name in FIELDS:
                    if name not in existing:
                        self.conn.execute(f"ALTER TABLE run_assets ADD COLUMN {name} {_TYPES.get(name, 'TEXT')}")
                self.conn.execute("ALTER TABLE run_assets ADD COLUMN source_id TEXT NOT NULL DEFAULT 'legacy'")
                self.conn.execute("ALTER TABLE run_assets ADD COLUMN origin_run_id INTEGER")
                self.conn.execute("UPDATE run_assets SET origin_run_id = run_id")
                self.conn.execute("ALTER TABLE sync_runs ADD COLUMN source_id TEXT NOT NULL DEFAULT 'legacy'")
                self.conn.execute("ALTER TABLE sync_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'replace'")
                self.conn.execute("DROP TABLE assets_fts")
                self.conn.execute(f"CREATE VIRTUAL TABLE assets_fts USING fts5(key UNINDEXED, {', '.join(_FTS_FIELDS)}, tokenize='trigram')")
                self.conn.execute(f"INSERT INTO assets_fts (key, {', '.join(_FTS_FIELDS)}) SELECT key, {', '.join(_FTS_FIELDS)} FROM assets")
                self.conn.execute("UPDATE meta SET value = ? WHERE key = 'schema_version'", (str(SCHEMA_VERSION),))
        elif int(version[0]) == 2:
            self.conn.execute("UPDATE meta SET value = ? WHERE key = 'schema_version'", (str(SCHEMA_VERSION),))
            self.conn.commit()
        elif int(version[0]) != SCHEMA_VERSION:
            raise ValueError(f"지원하지 않는 DB 스키마 버전입니다: {version[0]} (필요: {SCHEMA_VERSION})")

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> AtlasStore:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @contextmanager
    def _tx(self) -> Generator[sqlite3.Connection]:
        if self.conn.in_transaction:
            # A classification saved during import must not commit the outer import.
            # SQLite resolves repeated savepoint names to the innermost instance.
            self.conn.execute("SAVEPOINT atlas_nested")
            try:
                yield self.conn
                self.conn.execute("RELEASE SAVEPOINT atlas_nested")
            except BaseException:
                self.conn.execute("ROLLBACK TO SAVEPOINT atlas_nested")
                self.conn.execute("RELEASE SAVEPOINT atlas_nested")
                raise
            return
        try:
            yield self.conn
            self.conn.commit()
        except BaseException:
            self.conn.rollback()
            raise

    # ------------------------------------------------------------------ 쓰기

    def import_parsed(
        self, parsed: ParsedSheet, *, source_name: str, source_sha256: str,
        profile: MappingProfile | None = None, source_id: str = "legacy", mode: str = "replace",
        expected_run: int | None = None, check_revision: bool = False, token: str | None = None,
        before_commit: Callable[[int], Any] | None = None,
    ) -> int:
        """한 트랜잭션으로 실행 하나를 기록하고 run id를 돌려준다. 실패하면 아무것도 남지 않는다."""
        if mode not in ("merge", "replace") or not source_id.strip():
            raise ValueError("유효한 원천과 등록 모드가 필요합니다.")
        profile_json = (profile or MappingProfile()).to_json()
        from ..components import COMPONENT_FIELDS, SOURCES

        component_import = source_id in SOURCES
        compared_fields = COMPONENT_FIELDS if component_import else FIELDS
        started = self.clock()
        header_idx = parsed.header.header_row
        data_rows = [(i + 1, r) for i, r in enumerate(parsed.rows) if i + 1 > header_idx and any(c.strip() for c in r)]
        with self._tx() as c:
            c.execute("BEGIN IMMEDIATE")
            if token:
                prior = c.execute("SELECT committed_run FROM pending_imports WHERE token = ?", (token,)).fetchone()
                if prior and prior[0]:
                    return int(prior[0])
            current = self.latest_run_id()
            if check_revision and current != expected_run:
                raise ValueError("등록 이후 자산이 변경되었습니다. 파일을 다시 검토하세요.")
            incoming = {a.key for a in parsed.assets}
            old = self.list_assets(current, limit=1_000_000) if current else []
            old_components = self.list_components(current) if current else []
            updating = old_components if component_import else old
            conflicts = [a["key"] for a in updating if a["key"] in incoming and a["source_id"] != source_id]
            if conflicts:
                raise ValueError(f"다른 원천과 자산 식별자가 중복됩니다 ({len(conflicts)}건). 원천/그룹사/설치지역을 확인하세요.")
            if mode == "merge":
                previous = {a["key"]: a for a in updating}
                missing = {f for a in parsed.assets if a.key in previous for f in compared_fields
                           if f not in parsed.header.mapping and previous[a.key].get(f) is not None and a.values.get(f) is None}
                if missing:
                    raise ValueError(f"기존 값이 있는 열이 파일에 없습니다: {', '.join(sorted(missing))}. 전체 열을 포함한 파일로 다시 검토하세요.")
            retained = old if component_import else [a for a in old if a["source_id"] != source_id or (mode == "merge" and a["key"] not in incoming)]
            retained_components = [a for a in old_components if a["source_id"] != source_id or (mode == "merge" and a["key"] not in incoming)]
            cur = c.execute(
                "INSERT INTO sync_runs (source_name, source_sha256, sheet, header_row, headers_json, mapping_json, profile_json,"
                " started_at, finished_at, row_count, asset_count, error_count, warning_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    source_name,
                    source_sha256,
                    parsed.sheet,
                    header_idx,
                    json.dumps(parsed.header.headers, ensure_ascii=False),
                    json.dumps(parsed.header.mapping, ensure_ascii=False, sort_keys=True),
                    profile_json,
                    started,
                    started,
                    len(data_rows),
                    len(parsed.assets),
                    parsed.error_count,
                    parsed.warning_count,
                ),
            )
            run_id = int(cur.lastrowid or 0)
            c.execute("UPDATE sync_runs SET source_id = ?, mode = ?, asset_count = ? WHERE id = ?", (source_id, mode, len(retained) + (0 if component_import else len(parsed.assets)), run_id))
            c.executemany(
                "INSERT INTO asset_rows (run_id, row_number, cells_json) VALUES (?,?,?)",
                ((run_id, n, json.dumps(r, ensure_ascii=False)) for n, r in data_rows),
            )
            cols = ", ".join(FIELDS)
            marks = ", ".join("?" for _ in FIELDS)
            c.executemany(
                f"INSERT INTO run_assets (run_id, key, source_id, origin_run_id, row_number, {cols}) VALUES (?, ?, ?, ?, ?, {marks})",
                ((run_id, a.key, source_id, run_id, a.row_number, *(a.values.get(f) for f in FIELDS)) for a in parsed.assets if not component_import),
            )
            c.executemany(
                f"INSERT INTO run_assets (run_id, key, source_id, origin_run_id, row_number, {cols}) VALUES (?, ?, ?, ?, ?, {marks})",
                ((run_id, a["key"], a["source_id"], a["origin_run_id"], a["row_number"], *(a.get(f) for f in FIELDS)) for a in retained),
            )
            c.executemany(
                "INSERT INTO run_components VALUES (?,?,?,?,?,?)",
                [(run_id, a["key"], a["source_id"], a["origin_run_id"], a["row_number"],
                  json.dumps({f: a.get(f) for f in (*COMPONENT_FIELDS, 'component_kind')}, ensure_ascii=False)) for a in retained_components]
                + [(run_id, a.key, source_id, run_id, a.row_number, json.dumps(a.values, ensure_ascii=False)) for a in parsed.assets if component_import],
            )
            c.executemany(
                "INSERT INTO asset_issues (run_id, row_number, severity, code, message) VALUES (?,?,?,?,?)",
                ((run_id, i.row_number, i.severity, i.code, i.message) for i in parsed.issues),
            )
            c.execute("DELETE FROM assets_fts")
            fts_cols = ", ".join(_FTS_FIELDS)
            c.execute(f"INSERT INTO assets_fts (key, {fts_cols}) SELECT key, {fts_cols} FROM run_assets WHERE run_id = ?", (run_id,))
            c.execute("UPDATE sync_runs SET finished_at = ? WHERE id = ?", (self.clock(), run_id))
            if before_commit is not None:
                before_commit(run_id)
            if token:
                c.execute("UPDATE pending_imports SET committed_run = ? WHERE token = ?", (run_id, token))
        return run_id

    # ------------------------------------------------------------------ 읽기

    def list_components(self, run_id: int | None = None) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM run_components WHERE run_id = ? ORDER BY key", (run_id or self.latest_run_id(),))
        return [{**json.loads(r['values_json']), **{k: r[k] for k in ('key', 'run_id', 'source_id', 'origin_run_id', 'row_number')}} for r in rows]

    def components(self, run_id: int | None = None) -> list[dict[str, Any]]:
        from ..classify import ClassifyProfile, classify_assets, project_display_names
        from ..components import associate

        assets = self.classified_assets(run_id)
        hosts = {a['key']: a for a in assets}
        items = associate(self.list_components(run_id), assets)
        profile = ClassifyProfile()
        classifications = classify_assets(items, profile)
        names = project_display_names(items, classifications, profile)
        for item, classification in zip(items, classifications, strict=True):
            host = hosts.get(item['asset_key'], {})
            item['project'] = classification.project or host.get('project')
            item['project_name'] = names.get(classification.project) or host.get('project_name')
            item['classify_source'] = classification.source if classification.project else ('host' if host.get('project') else None)
            item['environment'] = item.get('environment') or host.get('env')
            item['site'] = item.get('site') or host.get('site')
            item['organization'] = item.get('organization') or host.get('organization')
            item['citation'] = f"component:{item['key']}@run{item['origin_run_id']}:row{item['row_number']}"
        return items

    def latest_run_id(self) -> int | None:
        row = self.conn.execute("SELECT MAX(id) FROM sync_runs").fetchone()
        return row[0]

    def runs(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT id, source_name, source_id, mode, source_sha256, sheet, header_row, started_at, finished_at, row_count, asset_count, error_count, warning_count FROM sync_runs ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]

    def run(self, run_id: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM sync_runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        out = dict(row)
        for k in ("headers_json", "mapping_json", "profile_json"):
            out[k.removesuffix("_json")] = json.loads(out.pop(k))
        return out

    def _run(self, run_id: int | None) -> int | None:
        return self.latest_run_id() if run_id is None else run_id

    def count_assets(self, run_id: int | None = None) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM run_assets WHERE run_id = ?", (self._run(run_id),)).fetchone()[0]

    def get_asset(self, hostname: str, run_id: int | None = None) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM run_assets WHERE run_id = ? AND key = ?", (self._run(run_id), hostname.strip().lower())).fetchone()
        return dict(row) if row else None

    def find_by_ip(self, ip: str, run_id: int | None = None) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM run_assets WHERE run_id = ? AND (ip = ? OR ip LIKE ?) ORDER BY key", (self._run(run_id), ip, f"{ip}/%")).fetchall()
        return [dict(r) for r in rows]

    def list_assets(self, run_id: int | None = None, *, filters: dict[str, str] | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        where: list[str] = ["run_id = ?"]
        params: list[Any] = [self._run(run_id)]
        for f, v in (filters or {}).items():
            if f not in FIELDS:
                raise ValueError(f"알 수 없는 필드: {f}")
            where.append(f"{f} = ?")
            params.append(v)
        rows = self.conn.execute(f"SELECT * FROM run_assets WHERE {' AND '.join(where)} ORDER BY key LIMIT ? OFFSET ?", (*params, limit, offset)).fetchall()
        return [dict(r) for r in rows]

    def issues(self, run_id: int | None = None, *, severity: str | None = None, code: str | None = None, limit: int = 1000) -> list[dict[str, Any]]:
        where: list[str] = ["run_id = ?"]
        params: list[Any] = [self._run(run_id)]
        if severity:
            where.append("severity = ?")
            params.append(severity)
        if code:
            where.append("code = ?")
            params.append(code)
        rows = self.conn.execute(
            f"SELECT row_number, severity, code, message FROM asset_issues WHERE {' AND '.join(where)} ORDER BY row_number, code LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def issue_counts(self, run_id: int | None = None) -> dict[str, int]:
        rows = self.conn.execute("SELECT code, COUNT(*) FROM asset_issues WHERE run_id = ? GROUP BY code ORDER BY code", (self._run(run_id),)).fetchall()
        return {r[0]: r[1] for r in rows}

    def search(self, query: str, limit: int = 20) -> dict[str, Any]:
        """최신 실행 키워드 검색. 3자 이상은 FTS5 trigram(부분 문자열), 그보다 짧으면 LIKE."""
        q = query.strip()
        if not q:
            return {"total": 0, "items": []}
        if len(q) >= 3:
            match = '"' + q.replace('"', '""') + '"'
            base = "FROM assets_fts f JOIN assets a ON a.key = f.key WHERE assets_fts MATCH ?"
            params: tuple[Any, ...] = (match,)
            order = "ORDER BY f.rank, a.key"
        else:
            like = f"%{q}%"
            base = "FROM assets a WHERE a.hostname LIKE ? OR a.ip LIKE ? OR a.system_name LIKE ?"
            params = (like, like, like)
            order = "ORDER BY a.key"
        total = self.conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
        rows = self.conn.execute(f"SELECT a.* {base} {order} LIMIT ?", (*params, limit)).fetchall()
        return {"total": total, "items": [dict(r) for r in rows]}

    # ------------------------------------------------------------------ 분류 결과 (classify 모듈이 계산, 여기는 저장만)

    def save_classification(self, run_id: int, rows: list[dict[str, Any]], names: dict[str, str], profile_json: str) -> None:
        cols = ("key", "project", "env", "role", "site", "source", "rule_id", "shared", "naming_ok", "conflict")
        with self._tx() as c:
            c.execute("DELETE FROM asset_projects WHERE run_id = ?", (run_id,))
            c.execute("DELETE FROM project_names WHERE run_id = ?", (run_id,))
            c.executemany(
                f"INSERT INTO asset_projects (run_id, {', '.join(cols)}) VALUES (?, {', '.join('?' for _ in cols)})",
                ((run_id, *(r.get(k) for k in cols)) for r in rows),
            )
            c.executemany("INSERT INTO project_names (run_id, project, name) VALUES (?,?,?)", ((run_id, p, n) for p, n in sorted(names.items())))
            c.execute("INSERT OR REPLACE INTO classify_runs (run_id, profile_json, classified_at) VALUES (?,?,?)", (run_id, profile_json, self.clock()))

    def is_classified(self, run_id: int | None = None) -> bool:
        return self.conn.execute("SELECT 1 FROM classify_runs WHERE run_id = ?", (self._run(run_id),)).fetchone() is not None

    def classified_assets(self, run_id: int | None = None, *, project: str | None = None) -> list[dict[str, Any]]:
        """자산 + 분류(프로젝트·env·role·근거) 조인. 분류 전이면 프로젝트 필드는 None."""
        where: list[str] = ["a.run_id = ?"]
        params: list[Any] = [self._run(run_id)]
        if project is not None:
            where.append("p.project = ?")
            params.append(project)
        rows = self.conn.execute(
            "SELECT a.*, p.project, p.env, p.role, p.site AS site_code, p.source AS classify_source, p.rule_id, p.shared, p.naming_ok, p.conflict, n.name AS project_name"
            " FROM run_assets a LEFT JOIN asset_projects p ON p.run_id = a.run_id AND p.key = a.key"
            " LEFT JOIN project_names n ON n.run_id = a.run_id AND n.project = p.project"
            f" WHERE {' AND '.join(where)} ORDER BY a.key",
            params,
        ).fetchall()
        return [dict(r) for r in rows]

    def project_names(self, run_id: int | None = None) -> dict[str, str]:
        rows = self.conn.execute("SELECT project, name FROM project_names WHERE run_id = ?", (self._run(run_id),)).fetchall()
        return {r[0]: r[1] for r in rows}
