from __future__ import annotations

import sqlite3
import time

import pytest

from onprem_atlas.ingest import parse_rows, parse_xlsx
from onprem_atlas.ingest.validate import Asset
from onprem_atlas.store import AtlasStore

ROWS = [
    ["호스트명", "IP", "시스템명", "담당자", "망구분"],
    ["a1p-erp-was01", "10.1.0.11", "ERP 시스템", "김운영", "업무망"],
    ["a1p-erp-db01", "10.1.0.21/24", "ERP 시스템", "정DBA", "DB망"],
    ["a1p-hr-web01", "10.1.1.11", "HR 시스템", "김운영", "DMZ"],
]


def ticking_clock():
    t = iter(range(1000))
    return lambda: f"2026-10-21T00:00:{next(t):02d}+00:00"


def test_import_and_query():
    with AtlasStore(":memory:", clock=ticking_clock()) as store:
        run_id = store.import_parsed(parse_rows(ROWS, sheet="s"), source_name="a.xlsx", source_sha256="x")
        assert run_id == 1 and store.count_assets() == 3
        run = store.run(run_id)
        assert run["mapping"]["hostname"] == 0 and run["started_at"] < run["finished_at"]
        assert store.get_asset(" A1P-ERP-WAS01 ")["ip"] == "10.1.0.11"
        assert [a["key"] for a in store.find_by_ip("10.1.0.21")] == ["a1p-erp-db01"]
        assert [a["key"] for a in store.list_assets(filters={"zone": "DMZ"})] == ["a1p-hr-web01"]
        with pytest.raises(ValueError):
            store.list_assets(filters={"drop table": "x"})


def test_search_trigram_and_short_queries():
    with AtlasStore(":memory:") as store:
        store.import_parsed(parse_rows(ROWS), source_name="a.xlsx", source_sha256="x")
        assert store.search("erp-was")["total"] == 1
        assert store.search("ERP 시스템")["total"] == 2
        assert store.search("김운영")["total"] == 2
        assert store.search("hr")["total"] == 1
        assert store.search('"; DROP')["total"] == 0
        assert store.search("  ")["total"] == 0


def test_history_keeps_runs_and_assets_view_is_latest():
    with AtlasStore(":memory:") as store:
        store.import_parsed(parse_rows(ROWS), source_name="a.xlsx", source_sha256="1")
        store.import_parsed(parse_rows(ROWS[:2]), source_name="b.xlsx", source_sha256="2")
        assert [r["asset_count"] for r in store.runs()] == [3, 1]
        assert store.count_assets() == 1 and store.count_assets(1) == 3
        assert store.search("hr-web")["total"] == 0
        assert store.get_asset("a1p-hr-web01", run_id=1) is not None


def test_failed_import_leaves_nothing():
    parsed = parse_rows(ROWS)
    parsed.assets.append(Asset("a1p-erp-was01", 99, {"hostname": "dup"}))
    with AtlasStore(":memory:") as store:
        with pytest.raises(sqlite3.IntegrityError):
            store.import_parsed(parsed, source_name="a.xlsx", source_sha256="x")
        assert store.runs() == [] and store.latest_run_id() is None


def test_schema_version_guard(tmp_path):
    db = tmp_path / "a.db"
    AtlasStore(db).close()
    conn = sqlite3.connect(db)
    conn.execute("UPDATE meta SET value = '99' WHERE key = 'schema_version'")
    conn.commit()
    conn.close()
    with pytest.raises(ValueError, match="스키마 버전"):
        AtlasStore(db)


def test_5000_assets_import_under_5_seconds(esm5000, tmp_path):
    start = time.perf_counter()
    parsed = parse_xlsx(esm5000)
    with AtlasStore(tmp_path / "atlas.db") as store:
        store.import_parsed(parsed, source_name=esm5000.name, source_sha256="x")
        assert store.count_assets() == len(parsed.assets)
        assert len(store.issues(limit=10_000)) == len(parsed.issues)
        assert sum(store.issue_counts().values()) == len(parsed.issues)
    assert time.perf_counter() - start < 5
