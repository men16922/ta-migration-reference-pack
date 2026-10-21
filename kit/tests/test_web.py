from __future__ import annotations

from pathlib import Path

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from onprem_atlas.classify import ClassifyProfile  # noqa: E402
from onprem_atlas.ingest import parse_xlsx  # noqa: E402
from onprem_atlas.store import AtlasStore  # noqa: E402
from onprem_atlas.synth import drift_rows, generate_rows, write_xlsx  # noqa: E402
from onprem_atlas.web import create_app  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("web")
    rows = generate_rows(2000, seed=11)
    with AtlasStore(d / "atlas.db") as s:
        s.import_parsed(parse_xlsx(write_xlsx(d / "a.xlsx", rows)), source_name="a.xlsx", source_sha256="1")
        s.import_parsed(parse_xlsx(write_xlsx(d / "b.xlsx", drift_rows(rows, seed=12))), source_name="b.xlsx", source_sha256="2")
    return TestClient(create_app(d / "atlas.db", ClassifyProfile.load(Path(__file__).parents[1] / "examples" / "classify-synthetic.json")))


def test_summary(client):
    s = client.get("/api/summary").json()
    assert s["run"]["id"] == 2 and s["assets"]["total"] > 1900
    assert s["projects"] > 100 and 0 <= s["readiness"]["percent"] <= 100
    assert s["last_diff"]["added"] == 40
    order = ["high", "medium", "low", "info"]
    assert [order.index(r["severity"]) for r in s["top_rules"]] == sorted(order.index(r["severity"]) for r in s["top_rules"])
    assert sum(n for _, n in s["zones"]) == s["assets"]["total"]


def test_projects_assets_review_runs_diff(client):
    p = client.get("/api/projects", params={"page_size": 5}).json()
    assert p["total"] > 100 and len(p["items"]) == 5 and p["items"][0]["assets"] >= p["items"][1]["assets"]
    code = p["items"][0]["code"]
    a = client.get("/api/assets", params={"project": code, "page_size": 200}).json()
    assert a["total"] == p["items"][0]["assets"] and all(x["project"] == code for x in a["items"])
    found = client.get("/api/assets", params={"q": f"-{code}-"}).json()
    assert found["total"] >= 1
    r = client.get("/api/review", params={"rule": "EOS_OS", "page_size": 3}).json()
    assert len(r["items"]) == 3 and all(f["rule"] == "EOS_OS" for f in r["items"])
    assert [x["id"] for x in client.get("/api/runs").json()] == [2, 1]
    d = client.get("/api/diff", params={"limit": 2}).json()
    assert d["counts"]["added"] == 40 and len(d["added"]) == 2


def test_empty_db_returns_404(tmp_path):
    AtlasStore(tmp_path / "empty.db").close()
    assert TestClient(create_app(tmp_path / "empty.db")).get("/api/summary").status_code == 404


def test_real_uvicorn_server_serves_all_endpoints(tmp_path):
    """실제 uvicorn에서는 동기 의존성(연결 열기)과 핸들러가 다른 스레드에서 돈다 — TestClient로는 재현되지 않던 500 회귀."""
    import socket
    import threading
    import time
    import urllib.error
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor

    import uvicorn

    rows = generate_rows(300, seed=5)
    with AtlasStore(tmp_path / "atlas.db") as s:
        s.import_parsed(parse_xlsx(write_xlsx(tmp_path / "a.xlsx", rows)), source_name="a.xlsx", source_sha256="1")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(tmp_path / "atlas.db"), host="127.0.0.1", port=port, log_level="error", ws="none"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)

        def status(path: str) -> int:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=10) as res:  # noqa: S310
                    return res.status
            except urllib.error.HTTPError as e:
                return e.code

        # 대시보드처럼 여러 요청을 동시에 — 스레드풀 워커가 갈리는 상황을 만든다
        paths = ["/api/summary", "/api/projects", "/api/assets?q=was", "/api/review", "/api/runs"] * 8
        with ThreadPoolExecutor(max_workers=10) as pool:
            assert list(pool.map(status, paths)) == [200] * len(paths)
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_diagram_endpoints(client):
    idc = client.get("/api/diagram/idc").json()
    assert idc["stats"]["view"] == "idc" and idc["boxes"] and idc["width"] > 0
    code = client.get("/api/projects", params={"page_size": 1}).json()["items"][0]["code"]
    p = client.get(f"/api/diagram/project/{code}").json()
    assert p["stats"]["project"] == code and p["stats"]["shown"] == p["stats"]["servers"]
    r = client.get(f"/api/diagram/project/{code}", params={"format": "drawio"})
    assert r.status_code == 200 and r.text.startswith("<mxfile") and f'{code}-run2.drawio' in r.headers["content-disposition"]
    assert client.get("/api/diagram/project/zzz-none").status_code == 404
    assert client.get("/api/diagram/idc", params={"format": "svg"}).status_code == 422
