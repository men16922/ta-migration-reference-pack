from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from onprem_atlas.agent_tools import AssetKnowledgeTools
from onprem_atlas.classify import classify_run
from onprem_atlas.ingest import parse_rows
from onprem_atlas.knowledge import KnowledgeStore
from onprem_atlas.store import AtlasStore


def test_knowledge_versions_access_and_revocation(tmp_path):
    k = KnowledgeStore(tmp_path / "knowledge.db")
    original = k.ingest(source_uri="wiki:erp", title="ERP 운영", content="합성 ERP 백업 절차 v1", groups=frozenset({"ops"}))
    same = k.ingest(source_uri="wiki:erp", title="ERP 운영", content="합성 ERP 백업 절차 v1", groups=frozenset({"ops"}))
    assert same["id"] == original["id"]
    newer = k.ingest(source_uri="wiki:erp", title="ERP 운영", content="합성 ERP 백업 절차 v2", groups=frozenset({"ops"}))
    assert newer["version"] == 2
    assert k.search("백업", groups=frozenset({"ops"}))["items"][0]["id"] == newer["id"]
    assert k.read(original["id"], groups=frozenset({"ops"}))["content"].endswith("v1")
    assert k.read(original["id"], groups=frozenset({"other"})) is None
    assert k.search("ERP", groups=frozenset())["total"] == 0
    k.ingest(source_uri="wiki:erp", title="ERP 운영", content="합성 ERP 백업 절차 v2", groups=frozenset({"restricted"}))
    assert k.read(original["id"], groups=frozenset({"ops"})) is None
    assert k.search("ERP", groups=frozenset({"ops"}))["total"] == 0
    k.close()


def test_agent_tools_are_read_only_and_cite_separate_sources(tmp_path):
    assets, knowledge = tmp_path / "assets.db", tmp_path / "knowledge.db"
    with AtlasStore(assets) as store:
        store.import_parsed(parse_rows([["호스트명", "IP", "시스템명"], ["synthetic-erp", "192.0.2.1", "ERP"]]), source_name="synthetic.xlsx", source_sha256="fixture")
        classify_run(store)
    k = KnowledgeStore(knowledge)
    doc = k.ingest(source_uri="wiki:erp", title="ERP", content="합성 검증용 운영 절차", groups=frozenset({"ops"}))
    k.close()
    tools = AssetKnowledgeTools(assets, knowledge, knowledge_groups=frozenset({"ops"}))
    found = tools.search_assets("erp")
    assert found["total"] == 1 and found["items"][0]["citation"].endswith("@run1:row2")
    assert tools.get_asset("synthetic-erp")["source"]["source_name"] == "synthetic.xlsx"
    assert tools.search_knowledge("ERP")["items"][0]["citation"] == doc["citation"]
    assert tools.read_knowledge(doc["id"])["content"] == "합성 검증용 운영 절차"
    assert tools.diagram_summary()["action"] == {"type": "open_diagram", "project": None}
    with AtlasStore(assets, read_only=True) as store:
        assert len(store.runs()) == 1
        with pytest.raises(sqlite3.OperationalError):
            store.conn.execute("DELETE FROM sync_runs")
    denied = AssetKnowledgeTools(assets, knowledge, knowledge_groups=frozenset())
    assert denied.search_knowledge("ERP")["total"] == 0
    assert denied.read_knowledge(doc["id"]) == {"found": False}


def test_v1_database_migration_preserves_source_and_search(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript((Path(__file__).parent / "fixtures/schema-v1.sql").read_text())
    conn.execute("INSERT INTO meta VALUES ('schema_version', '1')")
    conn.execute("""INSERT INTO sync_runs VALUES (1, 'old.xlsx', 'hash', 'Sheet', 1,
        '["호스트명"]', '{"hostname":0}', '{}', '2026-10-21', '2026-10-21', 1, 1, 0, 0)""")
    conn.execute("INSERT INTO run_assets (run_id, key, row_number, hostname) VALUES (1, 'preserved-host', 2, 'preserved-host')")
    conn.execute("INSERT INTO asset_rows VALUES (1, 2, '[" + '"preserved-host"' + "]')")
    conn.commit()
    conn.close()
    with AtlasStore(path) as store:
        assert store.get_asset("preserved-host")["origin_run_id"] == 1
        assert store.get_asset("preserved-host")["source_id"] == "legacy"
        assert store.search("preserved")["total"] == 1
        assert store.run(1)["source_name"] == "old.xlsx"
    with AtlasStore(path) as store:
        assert store.count_assets() == 1


def test_optional_strands_registration_does_not_expose_host_identity(tmp_path):
    pytest.importorskip("strands")
    assets = tmp_path / "assets.db"
    with AtlasStore(assets) as store:
        store.import_parsed(parse_rows([["호스트명"], ["synthetic-host"]]), source_name="test.xlsx", source_sha256="x")
    tools = AssetKnowledgeTools(assets, tmp_path / "knowledge.db", knowledge_groups=frozenset({"ops"})).strands_tools()
    assert {t.tool_name for t in tools} == {"search_assets", "get_asset", "search_components", "search_knowledge", "read_knowledge", "diagram_summary"}
    for tool in tools:
        properties = tool.tool_spec["inputSchema"]["json"]["properties"]
        assert not {"self", "knowledge_groups", "asset_db", "knowledge_db"} & properties.keys()
    assert tools[0](query="synthetic")["total"] == 1
