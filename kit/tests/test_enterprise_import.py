from __future__ import annotations

import io
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from onprem_atlas.diagram import device_kind, render
from onprem_atlas.ingest import parse_rows
from onprem_atlas.store import AtlasStore
from onprem_atlas.web import create_app

HEADERS = ["그룹사명(BOX)", "설치지역", "호스트명", "대표IP", "관리IP", "OS종류", "OS 버전", "CPU Core(ea)", "Memory(GB)", "ITSM 업무(대)", "ITSM 업무(중)", "ITSM 업무(소)", "용도", "이중화서버"]
SERVER = ["합성조직", "시험센터", "test-app-01", "192.0.2.11", "198.51.100.11", "LINUX", "9", "16", "31.97", "지원", "업무", "합성 ERP", "운영", "test-app-02"]
DEVICE_HEADERS = ["그룹사명", "설치지역", "장비명", "장비범주", "세부분류", "관리IP", "서비스IP", "상면번호", "랙시작위치"]
DEVICE = ["합성조직", "시험센터", "test-nas-01", "스토리지", "NAS", "198.51.100.30,198.51.100.31", "192.0.2.30", "R-01", "12"]
WRITE_HEADERS = {"X-Atlas-Request": "1", "Content-Type": "application/octet-stream"}


def xlsx(rows):
    book = Workbook()
    for row in rows:
        book.active.append(row)
    out = io.BytesIO()
    book.save(out)
    book.close()
    return out.getvalue()


def client_at(tmp_path):
    return TestClient(create_app(tmp_path / "inventory.db"), client=("127.0.0.1", 50001))


def preview(client, rows, source="servers", mode="merge", **params):
    res = client.post("/api/imports/preview", params={"filename": "synthetic.xlsx", "source_id": source, "mode": mode, **params}, content=xlsx(rows), headers=WRITE_HEADERS)
    assert res.status_code == 200, res.text
    return res.json()


def commit(client, p, **extra):
    return client.post("/api/imports/commit", json={"token": p["token"], **extra}, headers={"X-Atlas-Request": "1"})


def test_company_headers_are_distinct_and_preserved():
    parsed = parse_rows([HEADERS, SERVER])
    a = parsed.assets[0].values
    assert (a["os"], a["os_version"], a["environment"], a["system_name"]) == ("LINUX", "9", "운영", None)
    assert (a["ip"], a["management_ip"], a["memory_gb"], a["cpu_cores"]) == ("192.0.2.11", "198.51.100.11", 31.97, 16)
    d = parse_rows([DEVICE_HEADERS, DEVICE]).assets[0].values
    assert d["management_ip"] == "198.51.100.30, 198.51.100.31" and d["service_ip"] == "192.0.2.30"
    assert d["rack"] == "R-01" and d["rack_unit"] == "12" and device_kind(d) == "storage"
    assert device_kind({"category": "네트워크 장비", "category_detail": "SAN SWITCH"}) == "san"
    assert device_kind({"category": "백업장비", "category_detail": "LTO(PTL)"}) == "backup"


def test_default_registration_does_not_infer_from_demo_hostnames(tmp_path):
    client = client_at(tmp_path)
    rows = [["호스트명", "IP", "시스템명"],
            ["a1p-erp-was01", "192.0.2.1", ""],
            ["a1p-hr-db01", "192.0.2.2", "확인된 업무"]]
    assert commit(client, preview(client, rows)).status_code == 200
    assets = {a["hostname"]: a for a in client.get("/api/assets").json()["items"]}
    assert assets["a1p-erp-was01"]["project"] is None
    declared = assets["a1p-hr-db01"]
    assert declared["project_name"] == "확인된 업무" and declared["classify_source"] == "column"
    for a in assets.values():
        assert a["role"] is None and a["env"] is None and a["site_code"] is None


def test_web_registration_uses_configured_classification_profile(tmp_path):
    from onprem_atlas.classify import ClassifyProfile

    path = tmp_path / "company-profile.json"
    path.write_text(json.dumps({"manual": {"approved-host": "approved"}, "project_names": {"approved": "승인 업무"}}))
    client = TestClient(create_app(tmp_path / "inventory.db", ClassifyProfile.load(path)), client=("127.0.0.1", 50001))
    assert commit(client, preview(client, [["호스트명", "IP"], ["approved-host", "192.0.2.1"]])).status_code == 200
    asset = client.get("/api/assets").json()["items"][0]
    assert asset["project"] == "approved" and asset["classify_source"] == "manual"
    assert asset["project_name"] == "승인 업무"


def test_multiple_sources_partial_update_replace_and_provenance(tmp_path):
    client = client_at(tmp_path)
    assert client.get("/api/workspace").json() == {"has_assets": False}
    second = SERVER.copy()
    second[2], second[3], second[4], second[-1] = "test-app-02", "192.0.2.12", "198.51.100.12", "test-app-01"
    first = commit(client, preview(client, [HEADERS, SERVER, second]))
    assert first.status_code == 200
    r1 = first.json()["run_id"]
    assert commit(client, preview(client, [DEVICE_HEADERS, DEVICE], "equipment")).status_code == 200
    assert client.get("/api/assets").json()["total"] == 3
    changed = SERVER.copy()
    changed[8] = "64"
    partial = preview(client, [HEADERS, changed])
    assert partial["changes"] == {"added": 0, "changed": 1, "removed": 0, "retained": 1}
    assert commit(client, partial).status_code == 200
    with AtlasStore(tmp_path / "inventory.db") as store:
        kept = next(a for a in store.list_assets() if a["hostname"] == "test-app-02")
        assert kept["origin_run_id"] == r1 and kept["row_number"] == 3
    replacement = preview(client, [HEADERS, changed], mode="replace")
    assert replacement["changes"]["removed"] == 1
    assert commit(client, replacement).status_code == 422
    assert commit(client, replacement, confirm_replace=True).status_code == 200
    assets = client.get("/api/assets").json()
    assert assets["total"] == 2 and {a["source_id"] for a in assets["items"]} == {"servers", "equipment"}
    assert client.get("/api/assets", params={"q": "198.51.100.31"}).json()["total"] == 1


def test_revision_conflict_and_idempotent_retry(tmp_path):
    client = client_at(tmp_path)
    a = preview(client, [HEADERS, SERVER])
    b = preview(client, [DEVICE_HEADERS, DEVICE], "equipment")
    assert commit(client, a).status_code == 200
    assert commit(client, a).json()["already_committed"]
    assert commit(client, b).status_code == 409
    assert client.get("/api/assets").json()["total"] == 1


def test_concurrent_confirm_only_creates_one_run(tmp_path):
    client = client_at(tmp_path)
    p = preview(client, [HEADERS, SERVER])
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: commit(client, p), range(2)))
    assert all(r.status_code == 200 for r in responses)
    assert len(client.get("/api/runs").json()) == 1


@pytest.mark.parametrize("after_classification", [False, True])
def test_classification_failure_rolls_back_registration_and_allows_retry(tmp_path, monkeypatch, after_classification):
    import onprem_atlas.web.imports as imports

    client = client_at(tmp_path)
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    pending = preview(client, [DEVICE_HEADERS, DEVICE], "equipment")
    classify = imports.classify_run

    def fail(store, **kwargs):
        if after_classification:
            classify(store, **kwargs)
        raise RuntimeError("injected classification failure")

    monkeypatch.setattr(imports, "classify_run", fail)
    with pytest.raises(RuntimeError, match="injected classification failure"):
        commit(client, pending)
    with AtlasStore(tmp_path / "inventory.db") as store:
        assert store.latest_run_id() == pending["base_run"]
        assert store.count_assets() == 1
        assert store.search("test-nas")["total"] == 0
        assert store.conn.execute("SELECT committed_run FROM pending_imports WHERE token = ?", (pending["token"],)).fetchone()[0] is None
        assert store.conn.execute("SELECT COUNT(*) FROM classify_runs").fetchone()[0] == 1
    monkeypatch.setattr(imports, "classify_run", classify)
    response = commit(client, pending)
    assert response.status_code == 200
    with AtlasStore(tmp_path / "inventory.db") as store:
        assert store.count_assets() == 2 and store.is_classified(response.json()["run_id"])


def test_readers_do_not_see_snapshot_until_classification_completes(tmp_path, monkeypatch):
    import onprem_atlas.web.imports as imports

    client = client_at(tmp_path)
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    pending = preview(client, [DEVICE_HEADERS, DEVICE], "equipment")
    classify = imports.classify_run
    observed = []

    def observe(store, **kwargs):
        result = classify(store, **kwargs)
        with AtlasStore(tmp_path / "inventory.db", read_only=True) as reader:
            observed.append((reader.latest_run_id(), reader.count_assets(), reader.is_classified()))
        return result

    monkeypatch.setattr(imports, "classify_run", observe)
    assert commit(client, pending).status_code == 200
    assert observed == [(pending["base_run"], 1, True)]
    with AtlasStore(tmp_path / "inventory.db", read_only=True) as reader:
        assert reader.count_assets() == 2 and reader.is_classified()


def test_duplicate_conflict_empty_and_malformed_are_not_committable(tmp_path):
    client = client_at(tmp_path)
    for rows in ([HEADERS], [HEADERS, SERVER, SERVER], [["잘못된 컬럼"], ["값"]]):
        p = preview(client, rows)
        assert not p["can_commit"] and commit(client, p).status_code == 422
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    p = preview(client, [HEADERS, SERVER], "equipment")
    assert p["conflicts"] and not p["can_commit"] and commit(client, p).status_code == 409
    bad = client.post("/api/imports/preview?filename=bad.xlsx&source_id=servers", content=b"invalid", headers=WRITE_HEADERS)
    assert bad.status_code == 422
    assert client.get("/api/assets").json()["total"] == 1


def test_cross_site_and_remote_writes_rejected(tmp_path):
    client = client_at(tmp_path)
    path = "/api/imports/preview?filename=t.xlsx&source_id=servers"
    assert client.post(path, content=xlsx([HEADERS, SERVER])).status_code == 403
    assert client.post(path, content=b"", headers={**WRITE_HEADERS, "Origin": "https://untrusted.invalid"}).status_code == 403
    remote = TestClient(create_app(tmp_path / "inventory.db"), client=("192.0.2.100", 50001))
    assert remote.post(path, content=b"", headers=WRITE_HEADERS).status_code == 403


def test_explicit_business_ha_and_no_invented_network(tmp_path):
    client = client_at(tmp_path)
    second = SERVER.copy()
    second[2], second[3], second[-1] = "test-app-02", "192.0.2.12", "test-app-01"
    assert commit(client, preview(client, [HEADERS, SERVER, second])).status_code == 200
    projects = client.get("/api/projects").json()["items"]
    assert len(projects) == 1 and projects[0]["name"] == "합성 ERP"
    with AtlasStore(tmp_path / "inventory.db") as store:
        layout, xml = render(store, "project", project=projects[0]["code"])
    assert len(layout["edges"]) == 1 and layout["edges"][0]["kind"] == "declared"
    assert "192.0.2.0/24" not in json.dumps(layout) and "/24" not in xml


def test_scoped_duplicate_hostname_and_mapping_override(tmp_path):
    client = client_at(tmp_path)
    other = SERVER.copy()
    other[0] = "다른 합성조직"
    p = preview(client, [HEADERS, SERVER, other])
    assert p["can_commit"] and p["assets"] == 2
    p = preview(client, [["내 장비명", "IP"], ["mapped", "192.0.2.1"]], profile=json.dumps({"columns": {"hostname": "내 장비명"}}))
    assert p["can_commit"] and p["mapping"]["hostname"] == "내 장비명"


def test_merge_with_missing_columns_cannot_erase_existing_metadata(tmp_path):
    client = client_at(tmp_path)
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    p = preview(client, [HEADERS[:3], SERVER[:3]])
    assert not p["can_commit"] and "memory_gb" in p["missing_update_columns"]
    assert commit(client, p).status_code == 409
    asset = client.get("/api/assets").json()["items"][0]
    assert asset["memory_gb"] == 31.97
    detail = client.get("/api/asset", params={"key": asset["key"]}).json()
    assert detail["row_number"] == 2 and detail["source"]["source_name"] == "synthetic.xlsx"


def test_loopback_proxy_and_static_console(tmp_path):
    ui = tmp_path / "ui"
    ui.mkdir()
    (ui / "index.html").write_text("<h1>IDC Console</h1>")
    client = TestClient(create_app(tmp_path / "inventory.db", ui_dir=ui), base_url="http://127.0.0.1:8770", client=("127.0.0.1", 50001))
    assert "IDC Console" in client.get("/").text
    assert client.get("/api/workspace").status_code == 200
    res = client.post("/api/imports/preview?filename=test.xlsx&source_id=servers", content=xlsx([HEADERS, SERVER]),
                      headers={**WRITE_HEADERS, "Origin": "http://127.0.0.1:5174"})
    assert res.status_code == 200 and res.json()["can_commit"]


def test_backup_is_portable_and_detects_tampering(tmp_path):
    from onprem_atlas.backup import create_backup, verify_backup

    client = client_at(tmp_path)
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    out = tmp_path / "backup"
    assert create_backup(tmp_path / "inventory.db", out)["verified"]
    moved = tmp_path / "restored"
    out.rename(moved)
    assert verify_backup(moved)["verified"]
    restored = TestClient(create_app(moved / "atlas.db"), client=("127.0.0.1", 50001))
    assert restored.get("/api/assets").json()["total"] == 1
    assert commit(restored, preview(restored, [DEVICE_HEADERS, DEVICE], "equipment")).status_code == 200
    assert restored.get("/api/assets").json()["total"] == 2
    # A used backup has changed; the original manifest must no longer validate.
    import pytest

    with pytest.raises(ValueError, match="検証|검증"):
        verify_backup(moved)
