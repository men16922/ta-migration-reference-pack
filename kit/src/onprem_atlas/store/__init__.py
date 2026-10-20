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

SCHEMA_VERSION = 1

_TYPES = {"cpu_sockets": "INTEGER", "cpu_cores": "INTEGER", "memory_gb": "REAL"}
_ASSET_COLUMNS = ",\n  ".join(f"{f} {_TYPES.get(f, 'TEXT')}" for f in FIELDS)
_FTS_FIELDS = ("hostname", "ip", "system_name", "owner", "category", "model", "os", "zone", "site", "asset_tag")

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
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
CREATE VIEW IF NOT EXISTS assets AS
  SELECT * FROM run_assets WHERE run_id = (SELECT MAX(id) FROM sync_runs);
CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(key UNINDEXED, {", ".join(_FTS_FIELDS)}, tokenize='trigram');
"""


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


class AtlasStore:
    """자산 DB 하나. 경로 대신 ':memory:'도 된다."""

    def __init__(self, path: str | Path, clock: Callable[[], str] = utc_now, *, check_same_thread: bool = True) -> None:
        """`check_same_thread=False`: 연결 하나를 여러 스레드가 차례로 쓰는 경우(FastAPI 의존성은 핸들러와 다른 스레드에서 열린다).
        동시에 쓰지만 않으면 안전하다 — 웹 계층은 요청마다 연결을 새로 연다."""
        self.path = str(path)
        self.clock = clock
        self.conn = sqlite3.connect(self.path, check_same_thread=check_same_thread)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        if self.path != ":memory:":
            self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.executescript(SCHEMA)
        version = self.conn.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
        if version is None:
            self.conn.execute("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
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
        try:
            yield self.conn
            self.conn.commit()
        except BaseException:
            self.conn.rollback()
            raise

    # ------------------------------------------------------------------ 쓰기

    def import_parsed(self, parsed: ParsedSheet, *, source_name: str, source_sha256: str, profile: MappingProfile | None = None) -> int:
        """한 트랜잭션으로 실행 하나를 기록하고 run id를 돌려준다. 실패하면 아무것도 남지 않는다."""
        profile_json = (profile or MappingProfile()).to_json()
        started = self.clock()
        header_idx = parsed.header.header_row
        data_rows = [(i + 1, r) for i, r in enumerate(parsed.rows) if i + 1 > header_idx and any(c.strip() for c in r)]
        with self._tx() as c:
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
            c.executemany(
                "INSERT INTO asset_rows (run_id, row_number, cells_json) VALUES (?,?,?)",
                ((run_id, n, json.dumps(r, ensure_ascii=False)) for n, r in data_rows),
            )
            cols = ", ".join(FIELDS)
            marks = ", ".join("?" for _ in FIELDS)
            c.executemany(
                f"INSERT INTO run_assets (run_id, key, row_number, {cols}) VALUES (?, ?, ?, {marks})",
                ((run_id, a.key, a.row_number, *(a.values.get(f) for f in FIELDS)) for a in parsed.assets),
            )
            c.executemany(
                "INSERT INTO asset_issues (run_id, row_number, severity, code, message) VALUES (?,?,?,?,?)",
                ((run_id, i.row_number, i.severity, i.code, i.message) for i in parsed.issues),
            )
            c.execute("DELETE FROM assets_fts")
            fts_cols = ", ".join(_FTS_FIELDS)
            c.execute(f"INSERT INTO assets_fts (key, {fts_cols}) SELECT key, {fts_cols} FROM run_assets WHERE run_id = ?", (run_id,))
            c.execute("UPDATE sync_runs SET finished_at = ? WHERE id = ?", (self.clock(), run_id))
        return run_id

    # ------------------------------------------------------------------ 읽기

    def latest_run_id(self) -> int | None:
        row = self.conn.execute("SELECT MAX(id) FROM sync_runs").fetchone()
        return row[0]

    def runs(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT id, source_name, source_sha256, sheet, header_row, started_at, finished_at, row_count, asset_count, error_count, warning_count FROM sync_runs ORDER BY id"
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
