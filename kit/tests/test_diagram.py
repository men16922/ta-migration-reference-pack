from __future__ import annotations

import os
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from onprem_atlas.classify import ClassifyProfile, classify_run
from onprem_atlas.cli import main
from onprem_atlas.diagram import render
from onprem_atlas.ingest import parse_rows, parse_xlsx
from onprem_atlas.store import AtlasStore
from onprem_atlas.synth import generate_rows, write_xlsx

SYNTHETIC_PROFILE = ClassifyProfile.load(Path(__file__).parents[1] / "examples" / "classify-synthetic.json")

GOLDEN = Path(__file__).parent / "golden" / "mini-erp.drawio"
HEADER = ["호스트명", "IP", "시스템명", "자산분류", "CPU 코어", "메모리", "센터", "망구분", "OS"]
MINI = [
    HEADER,
    ["a1p-erp-web01", "10.1.0.1", "ERP 시스템", "서버", "16", "64", "제1센터", "DMZ", "RHEL 9.4"],
    ["a1p-erp-was01", "10.1.0.11", "ERP 시스템", "서버", "32", "128", "제1센터", "업무망", "RHEL 9.4"],
    ["a1p-erp-was02", "10.1.0.12", "ERP 시스템", "서버", "32", "128", "제1센터", "업무망", "RHEL 9.4"],
    ["a1p-erp-db01", "10.1.0.41", "ERP 시스템", "DB 서버", "64", "512", "제1센터", "DB망", "AIX 7.2"],
    ["a1d-erp-was01", "10.2.0.11", "ERP 시스템", "서버", "8", "32", "제1센터", "개발망", "RHEL 9.4"],
    ["a1p-ad-svr01", "10.9.1.1", "AD/DNS", "서버", "8", "32", "제1센터", "공통인프라망", "Windows Server 2022"],
    ["a1p-net-fw01", "10.9.254.1", "네트워크 인프라", "보안장비(방화벽)", "", "", "제1센터", "네트워크", ""],
    ["a1p-net-sw01", "10.9.254.2", "네트워크 인프라", "네트워크(L3 스위치)", "", "", "제1센터", "네트워크", ""],
]


@pytest.fixture
def mini(tmp_path):
    s = AtlasStore(tmp_path / "mini.db", clock=lambda: "2026-10-21T00:00:00+00:00")
    s.import_parsed(parse_rows(MINI, sheet="자산목록"), source_name="mini.xlsx", source_sha256="0")
    classify_run(s, SYNTHETIC_PROFILE)
    yield s
    s.close()


@pytest.fixture(scope="module")
def big(tmp_path_factory):
    d = tmp_path_factory.mktemp("diagram")
    s = AtlasStore(d / "atlas.db")
    s.import_parsed(parse_xlsx(write_xlsx(d / "a.xlsx", generate_rows(5000))), source_name="a.xlsx", source_sha256="1")
    classify_run(s, SYNTHETIC_PROFILE)
    yield s
    s.close()


def _inside(child: dict, parent: dict) -> bool:
    return parent["x"] <= child["x"] and parent["y"] <= child["y"] and child["x"] + child["w"] <= parent["x"] + parent["w"] and child["y"] + child["h"] <= parent["y"] + parent["h"]


def _overlap(a: dict, b: dict) -> bool:
    return a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]


def assert_geometry(layout: dict) -> None:
    boxes = {b["id"]: b for b in layout["boxes"]}
    assert len(boxes) == len(layout["boxes"]), "셀 ID 중복"
    siblings: dict[str | None, list[dict]] = {}
    for b in layout["boxes"]:
        if b["parent"]:
            assert _inside(b, boxes[b["parent"]]), f"{b['label']}이(가) 부모 밖"
        siblings.setdefault(b["parent"], []).append(b)
    for group in siblings.values():
        for i, a in enumerate(group):
            assert not any(_overlap(a, b) for b in group[i + 1 :]), f"{a['label']} 겹침"
    for e in layout["edges"]:
        assert e["source"] in boxes and e["target"] in boxes and len(e["points"]) >= 2


def test_project_diagram_mini_golden(mini):
    layout, xml = render(mini, "project", project="erp")
    assert_geometry(layout)
    labels = [b["label"] for b in layout["boxes"]]
    assert {"a1p-erp-web01", "a1p-erp-was02", "a1p-erp-db01", "a1d-erp-was01"} <= set(labels)
    assert "AD/DNS × 1" in labels and "방화벽 × 1" in labels  # 공통 서비스·네트워크는 참조
    assert "a1p-ad-svr01" not in labels
    assert layout["edges"] == []  # Asset membership does not establish a network link.
    ET.fromstring(xml)
    if os.environ.get("UPDATE_GOLDEN"):
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(xml, encoding="utf-8")
    assert xml == GOLDEN.read_text(encoding="utf-8"), "골든 XML과 다름 — 의도한 변경이면 UPDATE_GOLDEN=1 로 갱신"


def test_drawio_cells_relative_to_parent(mini):
    _, xml = render(mini, "project", project="erp")
    cells = {c.get("id"): c for c in ET.fromstring(xml).iter("mxCell")}
    vertices = [c for c in cells.values() if c.get("vertex") == "1"]
    assert all(c.get("parent") in cells for c in vertices)
    for c in vertices:
        g = c.find("mxGeometry")
        assert g is not None and float(g.get("x", "0")) >= 0 and float(g.get("y", "0")) >= 0  # 자식 좌표는 부모 기준
    edges = [c for c in cells.values() if c.get("edge") == "1"]
    assert edges == []


def test_drawio_icons_on_every_leaf_node(mini):
    layout, xml = render(mini, "project", project="erp")
    cells = {c.get("id"): c for c in ET.fromstring(xml).iter("mxCell")}
    leaves = [b for b in layout["boxes"] if b["kind"] in ("node", "agg")]
    assert leaves and all(b["icon"] and f"{b['id']}i" in cells for b in leaves)
    for b in leaves:
        icon = cells[f"{b['id']}i"]
        assert icon.get("parent") == b["id"] and f"shape={b['icon']}" in icon.get("style")
    by_label = {b["label"]: b["icon"] for b in leaves}
    assert by_label["a1p-erp-db01"] == "cylinder3"
    assert by_label["a1p-erp-web01"] == "mxgraph.cisco.computers_and_peripherals.web_browser"
    assert by_label["방화벽 × 1"] == "mxgraph.networks.firewall"
    assert by_label["L3/L2 스위치 × 1"] == "mxgraph.cisco.switches.layer_3_switch"


def test_unknown_project_and_view(mini):
    with pytest.raises(ValueError, match="자산이 없습니다"):
        render(mini, "project", project="nope")
    with pytest.raises(ValueError, match="알 수 없는 보기"):
        render(mini, "focus")


def test_project_diagram_deterministic_fast_and_complete(big):
    from collections import Counter

    projects = Counter(a["project"] for a in big.classified_assets() if a.get("project") and not a.get("shared"))
    code, n = projects.most_common(1)[0]
    t = time.perf_counter()
    layout, xml = render(big, "project", project=code)
    assert time.perf_counter() - t < 1.0
    assert render(big, "project", project=code)[1] == xml
    assert_geometry(layout)
    st = layout["stats"]
    assert st["assets"] == n and st["shown"] == st["servers"] == n and not st["aggregated"]
    assert sum(1 for b in layout["boxes"] if b["kind"] == "node") == n


def test_project_aggregates_over_max_nodes(big):
    layout, _ = render(big, "project", project="erp", max_nodes=5)
    assert layout["stats"]["aggregated"]
    assert not any(b["kind"] == "node" for b in layout["boxes"])
    role_aggs = [b for b in layout["boxes"] if b["kind"] == "agg" and b["style"].startswith("role:") and b["style"] != "role:svc"]
    assert sum(b["meta"]["count"] for b in role_aggs) == layout["stats"]["servers"]
    assert_geometry(layout)


def test_idc_diagram_counts_every_server_once(big):
    layout, xml = render(big, "idc")
    assert_geometry(layout)
    ET.fromstring(xml)
    aggs = [b for b in layout["boxes"] if b["kind"] == "agg"]
    servers = sum(b["meta"]["count"] for b in aggs if not b["style"].startswith("net:"))
    network = sum(b["meta"]["count"] for b in aggs if b["style"].startswith("net:"))
    assert servers == layout["stats"]["servers"] and servers + network == layout["stats"]["assets"]
    assert len(layout["boxes"]) < 120  # 5,000건이어도 집계 상자 수십 개
    assert {b["label"] for b in layout["boxes"] if b["kind"] == "site"} == {"제1센터", "제2센터"}


def test_cli_diagram(mini, tmp_path, capsys):
    out = tmp_path / "erp.drawio"
    db = mini.path
    assert main(["diagram", "--db", str(db), "--project", "erp", "--out", str(out), "--layout", str(tmp_path / "erp.json")]) == 0
    assert out.read_text(encoding="utf-8").startswith("<mxfile") and (tmp_path / "erp.json").exists()
    assert "표시 5/5대" in capsys.readouterr().out
    assert main(["diagram", "--db", str(db), "--view", "idc", "--out", str(tmp_path / "idc.drawio")]) == 0
