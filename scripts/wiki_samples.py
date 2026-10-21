"""Regenerate docs/wiki/fixtures/api/*.json from synthetic data (porting reference shapes).

Usage: kit/.venv/bin/python scripts/wiki_samples.py
Synthetic rows only. Timestamps are pinned so the output is stable.
"""
from __future__ import annotations

import io
import json
import re
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "kit/src"))

from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import Workbook  # noqa: E402

from onprem_atlas.store import AtlasStore  # noqa: E402
from onprem_atlas.web import create_app  # noqa: E402

AtlasStore.__init__.__defaults__ = (lambda: "2026-10-22T00:00:00+00:00",)
OUT = root / "docs/wiki/fixtures/api"
WRITE = {"X-Atlas-Request": "1", "Content-Type": "application/octet-stream"}

SERVERS = [
    ["그룹사명(BOX)", "설치지역", "호스트명", "대표IP", "OS종류", "CPU Core(ea)", "Memory(GB)", "ITSM 업무(대)", "ITSM 업무(중)", "ITSM 업무(소)", "용도", "이중화서버"],
    ["합성조직", "시험센터", "erp-web-01", "192.0.2.11", "LINUX", "8", "32", "지원", "업무", "합성 ERP", "운영", "erp-web-02"],
    ["합성조직", "시험센터", "erp-web-02", "192.0.2.12", "LINUX", "8", "32", "지원", "업무", "합성 ERP", "운영", "erp-web-01"],
    ["합성조직", "시험센터", "erp-db-01", "192.0.2.21", "AIX", "32", "256", "지원", "업무", "합성 ERP", "운영", ""],
]
EQUIPMENT = [
    ["그룹사명", "설치지역", "장비명", "장비범주", "세부분류", "관리IP"],
    ["합성조직", "시험센터", "core-sw-01", "네트워크", "L3 스위치", "198.51.100.1"],
    ["합성조직", "시험센터", "nas-01", "스토리지", "NAS", "198.51.100.2"],
]
SECURITY = [
    ["그룹사명", "설치지역", "장비명", "솔루션 유형", "관리IP"],
    ["합성조직", "시험센터", "fw-01", "방화벽", "198.51.100.9"],
    ["합성조직", "시험센터", "nac-01", "NAC", "198.51.100.10"],
]
WEB = [
    ["그룹사명", "설치지역", "호스트명", "WEB제품", "WEB제품버전", "PORT", "URL", "ITSM 업무(대)", "ITSM 업무(중)", "ITSM 업무(소)"],
    ["합성조직", "시험센터", "erp-web-01", "Apache", "2.4", "443", "https://erp.example.test", "지원", "업무", "합성 ERP"],
    ["합성조직", "시험센터", "erp-web-02", "Apache", "2.4", "443", "https://erp.example.test", "지원", "업무", "합성 ERP"],
]
DB = [
    ["그룹사명", "설치지역", "호스트명", "DB제품", "DB제품버전", "PORT", "DB명(SID)", "이중화방식", "ITSM 업무(대)", "ITSM 업무(중)", "ITSM 업무(소)"],
    ["합성조직", "시험센터", "erp-db-01", "Oracle", "19c", "1521", "ERPDB", "RAC", "지원", "업무", "합성 ERP"],
]


def xlsx(rows: list[list[str]]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def save(name: str, data: object) -> None:
    text = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    # xlsx zip entries carry save times, so file hashes differ per run; mask them.
    text = re.sub(r"\b[0-9a-f]{64}\b", "<sha256>", text)
    (OUT / name).write_text(text, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        client = TestClient(create_app(Path(tmp) / "inventory.db"), client=("127.0.0.1", 50001))

        def register(rows: list[list[str]], source: str, keep: str | None = None) -> None:
            res = client.post("/api/imports/preview", params={"filename": f"{source}.xlsx", "source_id": source, "mode": "merge"}, content=xlsx(rows), headers=WRITE)
            res.raise_for_status()
            preview = res.json()
            if keep:
                save(keep, {k: v for k, v in preview.items() if k not in ("token", "sha256")})
            client.post("/api/imports/commit", json={"token": preview["token"]}, headers={"X-Atlas-Request": "1"}).raise_for_status()

        register(SERVERS, "servers", "imports-preview.servers.json")
        register(EQUIPMENT, "equipment")
        register(SECURITY, "security")
        register(WEB, "web", "imports-preview.web.json")
        register(DB, "db")
        changed = [row[:] for row in SERVERS]
        changed[3][6] = "512"
        register(changed, "servers")

        code = client.get("/api/projects").json()["items"][0]["code"]
        for name, path in [
            ("summary.json", "/api/summary"),
            ("projects.json", "/api/projects"),
            ("assets.json", "/api/assets?page_size=3"),
            ("asset-detail.json", "/api/asset?key=" + "합성조직|시험센터|erp-db-01"),
            ("components.json", "/api/components"),
            ("runs.json", "/api/runs"),
            ("diff.json", "/api/diff"),
            ("diagram-idc.json", "/api/diagram/idc"),
            ("diagram-project.json", f"/api/diagram/project/{code}"),
        ]:
            res = client.get(path)
            res.raise_for_status()
            save(name, res.json())
        save("diagram-project.drawio", client.get(f"/api/diagram/project/{code}?format=drawio").text)
    print(f"wrote {OUT.relative_to(root)}")


if __name__ == "__main__":
    main()
