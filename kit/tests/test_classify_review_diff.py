from __future__ import annotations

import json

import pytest

from onprem_atlas.classify import ClassifyProfile, classify_assets, classify_run, match_naming
from onprem_atlas.diff import diff_assets, diff_runs
from onprem_atlas.ingest import parse_rows, parse_xlsx
from onprem_atlas.review import review_assets, review_run
from onprem_atlas.store import AtlasStore
from onprem_atlas.synth import drift_rows, generate_rows, write_xlsx

HEADER = ["호스트명", "IP", "시스템명", "자산분류", "CPU 모델", "CPU 코어", "메모리", "담당자", "망구분", "OS", "운영상태"]
SPEC = ["Intel Xeon Gold 6338", "64", "128"]
ROWS = [
    HEADER,
    ["a1p-erp-was01", "10.1.0.11", "ERP 시스템", "서버", *SPEC, "김운영", "업무망", "RHEL 9.4", "운영"],
    ["a1p-erp-db01", "10.1.0.21", "ERP 시스템", "DB 서버", *SPEC, "정DBA", "DB망", "CentOS 7.9", "운영"],
    ["erp_legacy_batch", "10.1.0.31", "ERP 시스템", "서버", "", "", "", "", "", "Windows Server 2012 R2", "폐기예정"],
    ["mystery-box", "10.1.0.41", "", "서버", *SPEC, "김운영", "업무망", "RHEL 9.4", "운영"],
    ["a1p-hr-was01", "10.1.1.11", "ERP 시스템", "서버", *SPEC, "김운영", "업무망", "RHEL 9.4", "운영"],
    ["b2p-hr-was01", "10.1.1.12", "HR 시스템", "서버", *SPEC, "김운영", "업무망", "RHEL 9.4", "운영"],
    ["a1p-ad-svr01", "10.9.1.1", "AD/DNS", "서버", *SPEC, "이인프라", "공통인프라망", "Windows Server 2022", "운영"],
    ["a1p-net-fw01", "10.9.254.1", "네트워크 인프라", "보안장비(방화벽)", "", "", "", "한네트워크", "네트워크", "", "운영"],
]


@pytest.fixture
def store():
    s = AtlasStore(":memory:")
    s.import_parsed(parse_rows(ROWS), source_name="t.xlsx", source_sha256="x")
    yield s
    s.close()


def test_naming_rule_groups():
    assert match_naming("a1p-erp-was01", ClassifyProfile()) == ("std", {"site": "a1", "env": "p", "project": "erp", "role": "was", "seq": "01"})
    assert match_naming("A1P-ERP-WAS01.corp.local", ClassifyProfile())[1]["project"] == "erp"
    assert match_naming("erp_legacy_batch", ClassifyProfile()) is None


def test_classify_sources_shared_and_conflict(store):
    summary = classify_run(store)
    assert summary["by_source"] == {"column": 1, "naming": 6, "unclassified": 1}
    by_key = {a["key"]: a for a in store.classified_assets()}
    assert by_key["erp_legacy_batch"]["project"] == "erp" and by_key["erp_legacy_batch"]["classify_source"] == "column"
    assert by_key["mystery-box"]["project"] is None
    assert by_key["a1p-ad-svr01"]["shared"] == 1 and by_key["a1p-net-fw01"]["shared"] == 1
    assert "보통 'erp'" in by_key["a1p-hr-was01"]["conflict"]
    assert by_key["a1p-erp-was01"]["project_name"] == "ERP 시스템"
    assert summary["projects"] == 2  # erp, hr (공통 제외)


def test_manual_override_and_profile_validation(store, tmp_path):
    profile_path = tmp_path / "p.json"
    profile_path.write_text(json.dumps({"manual": {"Mystery-Box": "hr"}, "project_names": {"hr": "인사"}}), encoding="utf-8")
    classify_run(store, ClassifyProfile.load(profile_path))
    by_key = {a["key"]: a for a in store.classified_assets()}
    assert by_key["mystery-box"]["project"] == "hr" and by_key["mystery-box"]["classify_source"] == "manual"
    assert by_key["b2p-hr-was01"]["project_name"] == "인사"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"rules": [{"id": "x", "pattern": "^(?P<name>.+)$"}]}), encoding="utf-8")
    with pytest.raises(ValueError, match="project"):
        ClassifyProfile.load(bad)


def test_review_rules_and_readiness(store):
    classify_run(store)
    result = review_run(store)
    counts = {r["rule"]: r["count"] for r in result["rules"]}
    assert counts == {
        "UNCLASSIFIED": 1,
        "SIZING_INPUT_MISSING": 1,
        "CLASSIFY_CONFLICT": 1,
        "EOS_OS": 2,
        "OWNER_MISSING": 1,
        "ZONE_MISSING": 1,
        "NAMING_VIOLATION": 2,
        "DECOMMISSION_CANDIDATE": 1,
    }
    # 방화벽은 서버가 아니라 사이징 대상 아님 → 서버 7대 중 high 이슈(미분류 1, 사이징 누락 1) 2대 제외
    assert (result["servers"], result["ready_servers"]) == (7, 5)
    assert result["projects"]["erp"]["percent"] == 67
    assert [f["severity"] for f in result["findings"]] == sorted([f["severity"] for f in result["findings"]], key=["high", "medium", "low", "info"].index)


def test_review_without_classification_marks_all_unclassified():
    findings = review_assets([{"key": "x", "hostname": "x", "category": "서버", "owner": "a", "zone": "z", "cpu_model": "c", "cpu_cores": 1, "memory_gb": 1}])
    assert [f["rule"] for f in findings] == ["UNCLASSIFIED", "NAMING_VIOLATION"]


def test_diff_assets_counts_fields():
    before = [{"key": "a", "hostname": "a", "os": "RHEL 8"}, {"key": "b", "hostname": "b", "os": "x"}]
    after = [{"key": "a", "hostname": "a", "os": "RHEL 9"}, {"key": "c", "hostname": "c", "os": "x"}]
    d = diff_assets(before, after)
    assert d["counts"] == {"added": 1, "removed": 1, "changed": 1, "unchanged": 0}
    assert d["changed"][0]["fields"] == {"os": {"before": "RHEL 8", "after": "RHEL 9"}}


def test_diff_runs_on_synthetic_drift(tmp_path):
    rows = generate_rows(1000, seed=3)
    with AtlasStore(":memory:") as s:
        s.import_parsed(parse_xlsx(write_xlsx(tmp_path / "a.xlsx", rows)), source_name="a", source_sha256="1")
        with pytest.raises(ValueError):
            diff_runs(s)
        s.import_parsed(parse_xlsx(write_xlsx(tmp_path / "b.xlsx", drift_rows(rows, seed=4))), source_name="b", source_sha256="2")
        d = diff_runs(s)
        assert (d["before"], d["after"]) == (1, 2)
        assert d["counts"]["added"] == 40 and 5 <= d["counts"]["removed"] <= 12 and d["counts"]["changed"] > 0


def test_classify_5000_is_deterministic(esm5000):
    with AtlasStore(":memory:") as s:
        s.import_parsed(parse_xlsx(esm5000), source_name="a", source_sha256="1")
        first = classify_run(s)
        again = classify_run(s)
        assert first == again
        assert first["by_source"].get("unclassified", 0) < 20 and first["projects"] == 150
    assets = [{"key": "a1p-x-was01", "hostname": "a1p-x-was01"}]
    assert classify_assets(assets, ClassifyProfile())[0].project == "x"
