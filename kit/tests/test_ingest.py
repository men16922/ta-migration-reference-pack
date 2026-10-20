from __future__ import annotations

import datetime as dt
import json

import pytest

from onprem_atlas.ingest import MappingProfile, parse_rows, parse_xlsx
from onprem_atlas.ingest.validate import parse_int, parse_ip, parse_memory_gb
from onprem_atlas.ingest.xlsx import cell_text, read_sheet
from onprem_atlas.synth import generate_rows

ROWS = [
    ["ESM 자산 목록"],
    ["조회일 2026-10-21"],
    ["자산번호", "호스트명", "IP 주소", "CPU 코어", "메모리", "시스템명", "비고"],
    ["A-1", "a1p-erp-was01", "10.1.0.11", "2x16", "64GB", "ERP 시스템", ""],
    ["A-2", "A1P-ERP-WAS01", "10.1.0.12", "32", "64", "ERP 시스템", "대소문자 중복"],
    ["A-3", "", "10.1.0.13", "32", "64", "ERP 시스템", "호스트명 누락"],
    ["A-4", "a1p-erp-db01", "10.1.0.21/24, 10.1.0.22", "", "131072", "ERP 시스템", ""],
    ["A-5", "legacy_box", "미할당", "many", "lots", "", ""],
    ["", "", "", "", "", "", ""],
]


def test_header_detection_skips_title_rows_and_reports_unmapped():
    parsed = parse_rows(ROWS)
    assert parsed.header.header_row == 3
    assert parsed.header.mapping["hostname"] == 1
    assert parsed.header.unmapped == ["비고"]
    assert [a.key for a in parsed.assets] == ["a1p-erp-was01", "a1p-erp-db01", "legacy_box"]


def test_validation_issue_codes_and_rows():
    parsed = parse_rows(ROWS)
    codes = [(i.row_number, i.code) for i in parsed.issues]
    assert (5, "DUPLICATE_HOSTNAME") in codes
    assert (6, "MISSING_HOSTNAME") in codes
    assert (7, "MULTIPLE_IP") in codes
    assert (7, "MEMORY_UNIT_ASSUMED_MB") in codes
    assert (8, "INVALID_IP") in codes
    assert (8, "INVALID_NUMBER") in codes
    assert (8, "INVALID_MEMORY") in codes
    assert parsed.error_count == 2
    was, db, legacy = parsed.assets
    assert was.values["cpu_cores"] == 32 and was.values["memory_gb"] == 64.0
    assert db.values["ip"] == "10.1.0.21/24" and db.values["memory_gb"] == 128.0
    assert legacy.values["ip"] is None and legacy.values["cpu_cores"] is None


def test_profile_overrides_synonyms_and_errors(tmp_path):
    profile = MappingProfile(columns={"system_name": "비고"}, synonyms={"owner": ["운영부서"]})
    parsed = parse_rows([["호스트명", "운영부서", "비고"], ["h1", "인프라팀", "결제"]], profile)
    assert parsed.assets[0].values["system_name"] == "결제"
    assert parsed.assets[0].values["owner"] == "인프라팀"

    missing = parse_rows(ROWS, MappingProfile(columns={"owner": "운영부서"}))
    assert any(i.code == "PROFILE_COLUMN_NOT_FOUND" for i in missing.issues)

    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"columns": {"nope": "x"}}), encoding="utf-8")
    with pytest.raises(ValueError, match="알 수 없는 필드"):
        MappingProfile.load(bad)

    no_host = parse_rows([["자산번호", "IP"], ["A-1", "10.0.0.1"]])
    assert no_host.assets == [] and no_host.issues[0].code == "HOSTNAME_COLUMN_NOT_FOUND"


@pytest.mark.parametrize(
    ("text", "unit", "expected"),
    [("64", "auto", 64.0), ("64GB", "auto", 64.0), ("65536MB", "auto", 64.0), ("1TB", "auto", 1024.0), ("65536", "auto", 64.0), ("8192", "MB", 8.0), ("1,024", "GB", 1024.0)],
)
def test_parse_memory(text, unit, expected):
    assert parse_memory_gb(text, unit)[0] == expected


def test_parse_numbers_and_ips():
    assert parse_int("2x16") == 32 and parse_int("16 core") == 16 and parse_int("없음") is None
    assert parse_ip("10.0.0.1") == ("10.0.0.1", [])
    assert parse_ip("10.0.0.1/24; 10.0.0.2") == ("10.0.0.1/24", ["10.0.0.2"])
    assert parse_ip("10.0.300.1") == (None, [])


def test_cell_text():
    assert cell_text(16.0) == "16"
    assert cell_text(dt.datetime(2026, 10, 21)) == "2026-10-21"
    assert cell_text("  a \n b ") == "a b"
    assert cell_text(None) == ""


def test_synth_is_deterministic():
    assert generate_rows(300, seed=7) == generate_rows(300, seed=7)
    assert generate_rows(300, seed=7) != generate_rows(300, seed=8)
    assert len(generate_rows(300)) == 300


def test_parse_synthetic_xlsx(esm5000):
    parsed = parse_xlsx(esm5000)
    assert parsed.sheet == "자산목록" and parsed.header.header_row == 4
    assert set(parsed.header.unmapped) == {"도입일", "비고"}
    assert 4900 < len(parsed.assets) < 5000
    with pytest.raises(ValueError, match="시트"):
        read_sheet(esm5000, "없는시트")
