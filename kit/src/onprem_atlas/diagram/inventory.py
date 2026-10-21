"""Explicit equipment classification and inventory cards; no topology inference."""
import re
from collections import Counter, defaultdict
from typing import Any

from ..review import NETWORK_CATEGORY, SECURITY_CATEGORY
from .model import Box

NET_LABELS = {"fw": "방화벽", "security": "보안장비", "l4": "L4 스위치", "sw": "L3/L2 스위치", "san": "SAN 스위치", "storage": "스토리지", "backup": "백업 장비", "other": "기타 장비"}


def device_kind(a: dict[str, Any]) -> str | None:
    """명시적 장비 분류만 사용한다. 보안장비 전체를 방화벽으로 추정하지 않는다."""
    cat = " ".join(a.get(k) or "" for k in ("category", "category_detail"))
    low = cat.lower()
    if SECURITY_CATEGORY.search(cat):
        return "fw" if "방화벽" in cat or "firewall" in low or re.search(r"\bfw\b", low) else "security"
    if "미분류 장비" in cat:
        return "other"
    if "san switch" in low or "san 스위치" in low:
        return "san"
    if any(x in low for x in ("백업장비", "백업 장비", "tape", "backup", "lto")):
        return "backup"
    if any(x in low for x in ("스토리지", "storage", "nas")) or low.strip() == "san":
        return "storage"
    if not NETWORK_CATEGORY.search(cat):
        return None
    low = cat.lower()
    if "l4" in low or "로드밸런서" in cat or "load" in low or "adc" in low:
        return "l4"
    return "sw"


def _ordered(values: set[str], order: list[str]) -> list[str]:
    return sorted(values, key=lambda v: (order.index(v) if v in order else len(order), v))


def _num(n: float | None) -> str:
    return f"{int(n):,}" if n is not None else "-"


def _server_node(path: str, a: dict[str, Any]) -> Box:
    sub = " · ".join(x for x in (a.get("ip"), a.get("os")) if x)
    meta = {k: a.get(k) for k in ("key", "hostname", "ip", "os", "cpu_model", "cpu_cores", "memory_gb", "zone", "env", "role", "site", "status", "project")}
    return Box(f"{path}/n:{a['key']}", "node", a.get("hostname") or a["key"], sub, f"net:{device_kind(a)}" if device_kind(a) else f"role:{a.get('role') or ''}", meta=meta)


def _agg_node(path: str, key: str, label: str, members: list[dict[str, Any]], style: str, sub: str | None = None) -> Box:
    cores = sum(m.get("cpu_cores") or 0 for m in members)
    mem = sum(m.get("memory_gb") or 0 for m in members)
    meta = {"count": len(members), "cpu_cores": cores, "memory_gb": mem, "hosts": sorted(m.get("hostname") or m["key"] for m in members)[:20]}
    if sub is None:
        sub = f"코어 {_num(cores)} · 메모리 {_num(mem)}GB" if cores or mem else ""
    return Box(f"{path}/g:{key}", "agg", f"{label} × {len(members):,}", sub, style, meta=meta)


def _net_band(path: str, site_assets: list[dict[str, Any]]) -> Box | None:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for a in site_assets:
        k = device_kind(a)
        if k:
            group = f"security:{a.get('category_detail') or '유형 미지정'}" if k == 'security' else k
            groups[group].append(a)
    if not groups:
        return None
    band = Box(f"{path}/net", "band", "IDC 공통 장비", "", direction="row", wrap=3)
    for k in _ordered(set(groups), ["fw", "l4", "sw"]):
        kind = 'security' if k.startswith('security:') else k
        label = k.split(':', 1)[1] if kind == 'security' else NET_LABELS[k]
        models = Counter(m.get("model") or "-" for m in groups[k]).most_common(1)[0][0]
        band.children.append(_agg_node(band.path, k, label, groups[k], f"net:{kind}", sub=models))
    return band


def _shared_band(path: str, shared: list[dict[str, Any]]) -> Box | None:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for a in shared:
        if device_kind(a) is None:
            groups[a.get("project") or "-"].append(a)
    if not groups:
        return None
    band = Box(f"{path}/shared", "band", "공통 서비스 (참조)", "", direction="row", wrap=4)
    for code in sorted(groups):
        members = groups[code]
        name = members[0].get("project_name") or members[0].get("system_name") or code.upper()
        band.children.append(_agg_node(band.path, code, name, members, "role:svc", sub=code))
    return band


