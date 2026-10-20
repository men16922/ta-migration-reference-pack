"""ESM 엑셀 헤더 → 표준 자산 필드 매핑.

ESM 실제 헤더는 회사마다·내보내기 설정마다 다르므로, 동의어 사전으로 자동 매핑하고
매핑 프로파일(JSON)로 덮어쓴다. 프로파일은 코드가 아니라 설정이라 이식 시 파일만 바꾼다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

# 표준 필드 순서 = SQLite 컬럼 순서
FIELDS: tuple[str, ...] = (
    "hostname",
    "ip",
    "asset_tag",
    "serial",
    "category",
    "manufacturer",
    "model",
    "os",
    "cpu_model",
    "cpu_sockets",
    "cpu_cores",
    "memory_gb",
    "site",
    "rack",
    "zone",
    "system_name",
    "owner",
    "status",
)

SYNONYMS: dict[str, tuple[str, ...]] = {
    "hostname": ("호스트명", "호스트", "hostname", "host name", "host", "장비명", "서버명", "자산명"),
    "ip": ("ip", "ip주소", "ip 주소", "대표ip", "서비스ip", "ip address"),
    "asset_tag": ("자산번호", "자산코드", "관리번호", "asset tag", "asset no"),
    "serial": ("시리얼", "시리얼번호", "s/n", "serial", "serial number"),
    "category": ("자산분류", "분류", "자산유형", "장비유형", "구분", "category", "type"),
    "manufacturer": ("제조사", "벤더", "manufacturer", "vendor", "maker"),
    "model": ("모델", "모델명", "model"),
    "os": ("os", "운영체제", "os버전", "os 버전", "platform"),
    "cpu_model": ("cpu", "cpu모델", "cpu 모델", "cpu 모델명", "프로세서", "칩셋", "cpu model"),
    "cpu_sockets": ("cpu소켓", "cpu 소켓", "소켓수", "소켓", "sockets"),
    "cpu_cores": ("cpu코어", "cpu 코어", "코어수", "총코어", "core", "cores", "vcpu"),
    "memory_gb": ("메모리", "메모리(gb)", "메모리 용량", "memory", "mem", "ram"),
    "site": ("센터", "설치위치", "위치", "사이트", "idc", "site", "location"),
    "rack": ("랙", "랙번호", "rack"),
    "zone": ("망구분", "보안존", "보안영역", "네트워크존", "zone", "security zone"),
    "system_name": ("시스템명", "업무명", "서비스명", "용도", "system", "service"),
    "owner": ("담당자", "관리자", "운영담당", "운영자", "owner"),
    "status": ("상태", "운영상태", "사용여부", "status"),
}


def normalize_header(text: str) -> str:
    return " ".join(str(text).split()).lower()


@dataclass
class MappingProfile:
    """매핑 프로파일. 모든 항목은 선택이며 없으면 자동 감지."""

    sheet: str | None = None
    header_row: int | None = None  # 1-based
    columns: dict[str, str] = field(default_factory=dict)  # 필드 → 시트 헤더 이름
    synonyms: dict[str, list[str]] = field(default_factory=dict)  # 필드 → 추가 동의어
    memory_unit: str = "auto"  # auto | GB | MB

    @classmethod
    def load(cls, path: str | Path | None) -> MappingProfile:
        if path is None:
            return cls()
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        unknown = set(data.get("columns", {})) - set(FIELDS)
        if unknown:
            raise ValueError(f"알 수 없는 필드: {sorted(unknown)} (가능한 필드: {', '.join(FIELDS)})")
        return cls(
            sheet=data.get("sheet"),
            header_row=data.get("header_row"),
            columns=dict(data.get("columns", {})),
            synonyms={k: list(v) for k, v in data.get("synonyms", {}).items()},
            memory_unit=data.get("memory_unit", "auto"),
        )

    def to_json(self) -> str:
        return json.dumps(
            {"sheet": self.sheet, "header_row": self.header_row, "columns": self.columns, "synonyms": self.synonyms, "memory_unit": self.memory_unit},
            ensure_ascii=False,
            sort_keys=True,
        )

    def synonym_table(self) -> dict[str, set[str]]:
        table = {f: {normalize_header(s) for s in SYNONYMS.get(f, ())} for f in FIELDS}
        for f, extra in self.synonyms.items():
            table.setdefault(f, set()).update(normalize_header(s) for s in extra)
        return table


@dataclass
class HeaderMatch:
    header_row: int  # 1-based
    headers: list[str]
    mapping: dict[str, int]  # 필드 → 0-based 컬럼
    unmapped: list[str]
    missing_overrides: list[str]


def match_headers(headers: list[str], profile: MappingProfile) -> tuple[dict[str, int], list[str], list[str]]:
    table = profile.synonym_table()
    mapping: dict[str, int] = {}
    unmapped: list[str] = []
    for idx, raw in enumerate(headers):
        h = normalize_header(raw)
        if not h:
            continue
        hit = next((f for f in FIELDS if f not in mapping and h in table[f]), None)
        if hit:
            mapping[hit] = idx
        else:
            unmapped.append(str(raw).strip())
    missing: list[str] = []
    normalized = [normalize_header(h) for h in headers]
    for f, name in profile.columns.items():
        try:
            mapping[f] = normalized.index(normalize_header(name))
        except ValueError:
            missing.append(f"{f}={name}")
    return mapping, unmapped, missing


def detect_header(rows: list[list[str]], profile: MappingProfile, scan: int = 15) -> HeaderMatch:
    """ESM 내보내기는 위에 제목·조회조건 행이 붙곤 한다 → 앞 `scan`행 중 매핑이 가장 많이 맞는 행."""
    if profile.header_row:
        candidates = [profile.header_row - 1]
    else:
        candidates = list(range(min(scan, len(rows))))
    best_idx, best_hits = 0, -1
    for idx in candidates:
        hits = len(match_headers(rows[idx] if idx < len(rows) else [], profile)[0])
        if hits > best_hits:
            best_idx, best_hits = idx, hits
    headers = rows[best_idx] if best_idx < len(rows) else []
    mapping, unmapped, missing = match_headers(headers, profile)
    return HeaderMatch(best_idx + 1, headers, mapping, unmapped, missing)
