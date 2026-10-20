from __future__ import annotations

import json

from onprem_atlas.cli import main
from onprem_atlas.ingest import parse_xlsx


def test_inspect_reports_mapping_without_asset_values(esm5000, capsys):
    assert main(["inspect", str(esm5000), "--json"]) == 0
    out = capsys.readouterr().out
    report = json.loads(out)
    assert report["mapping"]["hostname"] == "호스트명" and report["header_row"] == 4
    hostnames = [a.values["hostname"] for a in parse_xlsx(esm5000).assets]
    assert not any(h in out for h in hostnames[:200])


def test_import_runs_search_issues(esm5000, tmp_path, capsys):
    db = str(tmp_path / "atlas.db")
    assert main(["import", str(esm5000), "--db", db, "--json"]) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["id"] == 1 and summary["row_count"] == 5000
    assert main(["runs", "--db", db]) == 0
    assert "#1" in capsys.readouterr().out
    assert main(["search", "erp-was", "--db", db, "--json", "--limit", "2"]) == 0
    found = json.loads(capsys.readouterr().out)
    assert found["total"] > 0 and len(found["items"]) == 2
    assert main(["issues", "--db", db, "--severity", "error", "--json"]) == 0
    assert all(r["severity"] == "error" for r in json.loads(capsys.readouterr().out))


def test_errors_exit_nonzero(tmp_path, capsys):
    assert main(["inspect", str(tmp_path / "missing.xlsx")]) == 2
    assert "오류" in capsys.readouterr().err
