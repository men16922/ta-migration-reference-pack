"""행 → 정규화 자산 레코드 + 검증 이슈. 원본 행은 그대로 보존하고(store.asset_rows), 여기서는 해석만 한다."""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field

from .mapping import FIELDS, HeaderMatch, MappingProfile

# 이슈 코드는 review 모듈·화면 라벨이 참조하므로 바꾸지 않는다.
ERROR, WARNING = "error", "warning"


@dataclass
class Issue:
    row_number: int
    severity: str
    code: str
    message: str


@dataclass
class Asset:
    key: str  # hostname 정규화(소문자)
    row_number: int
    values: dict[str, str | int | float | None] = field(default_factory=dict)


def hostname_key(hostname: str) -> str:
    return hostname.strip().lower()


_INT_PAIR = re.compile(r"^\s*(\d+)\s*[xX*×]\s*(\d+)")
_FIRST_INT = re.compile(r"(\d+)")
_MEMORY = re.compile(r"^\s*([\d.,]+)\s*([kmgt]i?b?|기가|메가|테라)?\s*$", re.IGNORECASE)


def parse_int(text: str) -> int | None:
    m = _INT_PAIR.match(text)
    if m:
        return int(m.group(1)) * int(m.group(2))
    m = _FIRST_INT.search(text)
    return int(m.group(1)) if m else None


def parse_memory_gb(text: str, unit: str) -> tuple[float | None, str | None]:
    """반환: (GB, 경고 코드). 단위 없는 숫자는 프로파일 단위, auto면 16384 초과 시 MB로 본다."""
    m = _MEMORY.match(text.replace(" ", ""))
    if not m:
        return None, "INVALID_MEMORY"
    value = float(m.group(1).replace(",", ""))
    suffix = (m.group(2) or "").lower()
    if suffix.startswith(("t", "테라")):
        return value * 1024, None
    if suffix.startswith(("g", "기가")):
        return value, None
    if suffix.startswith(("m", "메가")):
        return round(value / 1024, 3), None
    if suffix.startswith("k"):
        return round(value / 1024 / 1024, 3), None
    if unit.upper() == "MB":
        return round(value / 1024, 3), None
    if unit.upper() == "GB":
        return value, None
    if value > 16384:
        return round(value / 1024, 3), "MEMORY_UNIT_ASSUMED_MB"
    return value, None


def parse_ip(text: str) -> tuple[str | None, list[str]]:
    parts = [p for p in re.split(r"[,;|\s]+", text) if p]
    valid: list[str] = []
    for p in parts:
        try:
            iface = ipaddress.ip_interface(p)
        except ValueError:
            continue
        if iface.version == 4:
            valid.append(str(iface) if "/" in p else str(iface.ip))
    return (valid[0] if valid else None), valid[1:]


def normalize_rows(rows: list[list[str]], header: HeaderMatch, profile: MappingProfile) -> tuple[list[Asset], list[Issue]]:
    issues: list[Issue] = [Issue(header.header_row, ERROR, "PROFILE_COLUMN_NOT_FOUND", f"매핑 지정 헤더가 시트에 없습니다: {m}") for m in header.missing_overrides]
    if "hostname" not in header.mapping:
        issues.append(Issue(header.header_row, ERROR, "HOSTNAME_COLUMN_NOT_FOUND", "호스트명 컬럼을 찾지 못했습니다 — 매핑 프로파일 columns.hostname을 지정하세요."))
        return [], issues

    assets: list[Asset] = []
    seen_host: dict[str, int] = {}
    seen_ip: dict[str, int] = {}

    for offset, row in enumerate(rows[header.header_row :]):
        row_number = header.header_row + 1 + offset
        if not any(c.strip() for c in row):
            continue
        raw = {f: (row[i].strip() if i < len(row) else "") for f, i in header.mapping.items()}
        hostname = raw.get("hostname", "")
        if not hostname:
            issues.append(Issue(row_number, ERROR, "MISSING_HOSTNAME", "호스트명이 비어 있어 제외했습니다."))
            continue
        key = hostname_key(hostname)
        if key in seen_host:
            issues.append(Issue(row_number, ERROR, "DUPLICATE_HOSTNAME", f"호스트명 '{hostname}'이(가) {seen_host[key]}행과 중복되어 제외했습니다."))
            continue
        seen_host[key] = row_number

        values: dict[str, str | int | float | None] = {f: (raw.get(f) or None) for f in FIELDS}
        values["hostname"] = hostname

        if raw.get("ip"):
            ip, extra = parse_ip(raw["ip"])
            if ip is None:
                issues.append(Issue(row_number, WARNING, "INVALID_IP", f"IP '{raw['ip']}' 형식이 올바르지 않아 비웠습니다."))
            elif extra:
                issues.append(Issue(row_number, WARNING, "MULTIPLE_IP", f"IP가 여러 개입니다 — 첫 번째({ip})를 대표 IP로 씁니다: {', '.join(extra)}"))
            values["ip"] = ip
        if values["ip"]:
            bare = str(values["ip"]).split("/")[0]
            if bare in seen_ip:
                issues.append(Issue(row_number, WARNING, "DUPLICATE_IP", f"IP {bare}가 {seen_ip[bare]}행과 중복됩니다(VIP·클러스터 여부 확인)."))
            else:
                seen_ip[bare] = row_number
        elif not raw.get("ip"):
            issues.append(Issue(row_number, WARNING, "MISSING_IP", "IP가 없습니다."))

        for f in ("cpu_sockets", "cpu_cores"):
            if raw.get(f):
                n = parse_int(raw[f])
                if n is None:
                    issues.append(Issue(row_number, WARNING, "INVALID_NUMBER", f"{f} 값 '{raw[f]}'을(를) 숫자로 읽지 못했습니다."))
                values[f] = n
        if raw.get("memory_gb"):
            gb, code = parse_memory_gb(raw["memory_gb"], profile.memory_unit)
            if code:
                msg = "메모리 값을 읽지 못했습니다" if gb is None else "단위 없는 큰 값이라 MB로 보고 GB로 환산했습니다"
                issues.append(Issue(row_number, WARNING, code, f"{msg}: '{raw['memory_gb']}'"))
            values["memory_gb"] = gb

        assets.append(Asset(key, row_number, values))
    return assets, issues
