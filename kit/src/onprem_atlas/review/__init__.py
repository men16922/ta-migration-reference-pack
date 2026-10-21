"""review: 온프렘 데이터 품질 · 이관 준비도 검토.

AWS To-Be 아키텍처 검토는 하지 않는다(회사 기존 에이전트 몫). 여기서는 "이 자산을 이관·사이징할 데이터가 갖춰졌나"만 본다.
규칙 id와 심각도는 화면·에이전트가 참조하므로 바꾸지 않는다.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..store import AtlasStore

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

# 이관 시 OS 업그레이드·재플랫폼이 필요한 지원 종료 OS (프로파일로 바꿀 수 있게 상수로 분리)
EOS_OS_PATTERNS = [r"centos", r"rhel\s*[5-7]\b", r"windows server 20(03|08|12)", r"aix\s*[5-6]\.", r"solaris\s*(9|10)\b"]
SECURITY_CATEGORY = re.compile(r"보안\s*장비|방화벽|악성코드|이상징후|바이패스|firewall|security|anti[- ]?(?:ddos|spam)|\b(?:nac|ips|ids|waf|utm|fw)\b", re.IGNORECASE)
NETWORK_CATEGORY = re.compile(r"네트워크|보안\s*장비|방화벽|스위치|라우터|l4|network|firewall|switch", re.IGNORECASE)
DECOM_STATUS = re.compile(r"폐기|불용|decom", re.IGNORECASE)


@dataclass(frozen=True)
class Rule:
    id: str
    severity: str
    title: str
    recommendation: str
    check: Callable[[dict[str, Any]], str | None]  # 문제면 상세 문장, 아니면 None


def is_server(a: dict[str, Any]) -> bool:
    category = " ".join(a.get(k) or "" for k in ("category", "category_detail"))
    return not (NETWORK_CATEGORY.search(category) or SECURITY_CATEGORY.search(category)
                or re.search(r"스토리지|storage|nas|san|백업장비|백업 장비|backup|lto|tape|미분류 장비", category, re.IGNORECASE))


def _eos(a: dict[str, Any]) -> str | None:
    os_name = (a.get("os") or "").lower()
    return f"지원 종료 OS: {a.get('os')}" if any(re.search(p, os_name) for p in EOS_OS_PATTERNS) else None


def _sizing(a: dict[str, Any]) -> str | None:
    if not is_server(a):
        return None
    missing = [label for f, label in (("cpu_model", "CPU 모델"), ("cpu_cores", "코어"), ("memory_gb", "메모리")) if a.get(f) in (None, "")]
    return f"용량산정 입력 누락: {', '.join(missing)}" if missing else None


RULES: list[Rule] = [
    Rule(
        "UNCLASSIFIED",
        "high",
        "프로젝트 미분류",
        "명명 규칙에 맞게 hostname을 정정하거나 시스템명 또는 수동 지정 표에 추가하세요.",
        lambda a: None if a.get("project") else "명명 규칙·시스템명으로 프로젝트를 정하지 못했습니다.",
    ),
    Rule("SIZING_INPUT_MISSING", "high", "용량산정 입력 누락", "ESM에 CPU 모델·코어·메모리를 채우거나 별도 사양 시트를 제공하세요.", _sizing),
    Rule("CLASSIFY_CONFLICT", "medium", "분류 근거 충돌", "hostname과 시스템명 중 맞는 쪽을 확인하고 수동 지정으로 확정하세요.", lambda a: a.get("conflict")),
    Rule("EOS_OS", "medium", "지원 종료 OS", "이관 전 OS 업그레이드 또는 재플랫폼 대상에 포함하세요.", _eos),
    Rule("OWNER_MISSING", "medium", "담당자 누락", "이관 일정 협의를 위해 ESM 담당자를 지정하세요.", lambda a: None if a.get("owner") else "담당자가 비어 있습니다."),
    Rule("ZONE_MISSING", "medium", "망구분 누락", "구성도 배치와 보안 설계를 위해 망구분을 지정하세요.", lambda a: None if a.get("zone") else "망구분이 비어 있습니다."),
    Rule("NAMING_VIOLATION", "low", "명명 규칙 위반", "명명 규칙에 맞는 hostname으로 정정하세요.", lambda a: None if a.get("naming_ok") else f"'{a.get('hostname')}'이(가) 명명 규칙과 맞지 않습니다."),
    Rule(
        "DECOMMISSION_CANDIDATE",
        "info",
        "이관 제외 후보",
        "폐기 예정 자산은 이관 범위에서 제외할지 확인하세요.",
        lambda a: f"운영상태: {a.get('status')}" if DECOM_STATUS.search(a.get("status") or "") else None,
    ),
]
RULES_BY_ID = {r.id: r for r in RULES}


def review_assets(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for a in assets:
        for rule in RULES:
            detail = rule.check(a)
            if detail:
                findings.append({"rule": rule.id, "severity": rule.severity, "key": a["key"], "hostname": a.get("hostname"), "project": a.get("project"), "detail": detail})
    findings.sort(key=lambda f: (SEVERITY_ORDER[f["severity"]], f["rule"], f["key"]))
    return findings


def readiness(assets: list[dict[str, Any]], findings: list[dict[str, Any]]) -> dict[str | None, dict[str, Any]]:
    """프로젝트별 준비도 = 서버 중 high 이슈 없는 비율(%)."""
    blocked = {f["key"] for f in findings if f["severity"] == "high"}
    per: dict[str | None, dict[str, Any]] = defaultdict(lambda: {"servers": 0, "ready": 0})
    for a in assets:
        if not is_server(a):
            continue
        p = per[a.get("project")]
        p["servers"] += 1
        p["ready"] += a["key"] not in blocked
    for p in per.values():
        p["percent"] = round(100 * p["ready"] / p["servers"]) if p["servers"] else 100
    return dict(per)


def review_run(store: AtlasStore, run_id: int | None = None) -> dict[str, Any]:
    assets = store.classified_assets(run_id)
    findings = review_assets(assets)
    by_rule = Counter(f["rule"] for f in findings)
    ready = readiness(assets, findings)
    servers = sum(p["servers"] for p in ready.values())
    ready_servers = sum(p["ready"] for p in ready.values())
    return {
        "run_id": store.latest_run_id() if run_id is None else run_id,
        "assets": len(assets),
        "servers": servers,
        "ready_servers": ready_servers,
        "readiness_percent": round(100 * ready_servers / servers) if servers else 100,
        "by_severity": dict(Counter(f["severity"] for f in findings)),
        "rules": [{"rule": r.id, "severity": r.severity, "title": r.title, "recommendation": r.recommendation, "count": by_rule.get(r.id, 0)} for r in RULES],
        "projects": ready,
        "findings": findings,
    }
