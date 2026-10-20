"""classify: 자산 → 프로젝트(업무 시스템) 분류.

근거 우선순위: 수동 지정(`manual`) > 명명 규칙(`naming`) > ESM 시스템명 컬럼(`column`).
컬럼 분류는 별칭표 없이 데이터에서 배운다: 명명 규칙으로 분류된 자산들의 시스템명 → 프로젝트 코드 다수결.
규칙·공통 인프라 판정은 프로파일(JSON)이라 회사 명명 규칙이 바뀌어도 코드는 그대로다.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..store import AtlasStore

# 합성 데이터(`synth.py`)와 같은 기본 규칙: <센터2><환경1>-<업무코드>-<역할><순번2>
DEFAULT_RULES = [{"id": "std", "pattern": r"^(?P<site>[a-z]\d)(?P<env>[pds])-(?P<project>[a-z0-9]+)-(?P<role>[a-z]+?)(?P<seq>\d{2})$"}]
DEFAULT_SHARED = ["ad", "bkp", "mon", "ntp", "sec", "net"]
DEFAULT_ENVS = {"p": "운영", "d": "개발", "s": "스테이징"}


@dataclass
class NamingRule:
    id: str
    pattern: re.Pattern[str]


@dataclass
class ClassifyProfile:
    rules: list[NamingRule] = field(default_factory=lambda: [NamingRule(r["id"], re.compile(r["pattern"])) for r in DEFAULT_RULES])
    shared_codes: set[str] = field(default_factory=lambda: set(DEFAULT_SHARED))
    env_names: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_ENVS))
    project_names: dict[str, str] = field(default_factory=dict)  # 코드 → 표시 이름(없으면 시스템명 다수결)
    manual: dict[str, str] = field(default_factory=dict)  # hostname(소문자) → 프로젝트 코드
    column: str = "system_name"

    @classmethod
    def load(cls, path: str | Path | None) -> ClassifyProfile:
        if path is None:
            return cls()
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        rules = data.get("rules", DEFAULT_RULES)
        for r in rules:
            if "project" not in re.compile(r["pattern"]).groupindex:
                raise ValueError(f"규칙 '{r['id']}'에 (?P<project>...) 이름 그룹이 없습니다.")
        return cls(
            rules=[NamingRule(r["id"], re.compile(r["pattern"], re.IGNORECASE)) for r in rules],
            shared_codes={c.lower() for c in data.get("shared_codes", DEFAULT_SHARED)},
            env_names=dict(data.get("env_names", DEFAULT_ENVS)),
            project_names={k.lower(): v for k, v in data.get("project_names", {}).items()},
            manual={k.strip().lower(): v.lower() for k, v in data.get("manual", {}).items()},
            column=data.get("column", "system_name"),
        )

    def to_json(self) -> str:
        return json.dumps(
            {
                "rules": [{"id": r.id, "pattern": r.pattern.pattern} for r in self.rules],
                "shared_codes": sorted(self.shared_codes),
                "env_names": self.env_names,
                "project_names": self.project_names,
                "manual": self.manual,
                "column": self.column,
            },
            ensure_ascii=False,
            sort_keys=True,
        )


@dataclass
class Classification:
    key: str
    project: str | None = None
    env: str | None = None
    role: str | None = None
    site: str | None = None
    source: str | None = None  # manual | naming | column | None(미분류)
    rule_id: str | None = None
    shared: bool = False
    naming_ok: bool = False
    conflict: str | None = None


def match_naming(hostname: str, profile: ClassifyProfile) -> tuple[str, dict[str, str]] | None:
    short = hostname.strip().lower().split(".")[0]
    for rule in profile.rules:
        m = rule.pattern.match(short)
        if m:
            return rule.id, {k: v.lower() for k, v in m.groupdict().items() if v}
    return None


def classify_assets(assets: list[dict[str, Any]], profile: ClassifyProfile) -> list[Classification]:
    results: list[Classification] = []
    by_system: dict[str, Counter[str]] = defaultdict(Counter)
    for a in assets:
        c = Classification(a["key"])
        hit = match_naming(a.get("hostname") or a["key"], profile)
        if hit:
            rule_id, g = hit
            c.naming_ok = True
            c.project, c.env, c.role, c.site, c.rule_id, c.source = g["project"], g.get("env"), g.get("role"), g.get("site"), rule_id, "naming"
            system = a.get(profile.column)
            if system:
                by_system[system][c.project] += 1
        results.append(c)

    # 컬럼 학습: 시스템명 → 다수결 프로젝트 코드 (동률이면 사전순 — 결정적)
    system_to_code = {s: sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for s, cnt in by_system.items()}
    for a, c in zip(assets, results, strict=True):
        system = a.get(profile.column)
        learned = system_to_code.get(system) if system else None
        if c.source == "naming" and learned and learned != c.project:
            c.conflict = f"이름은 '{c.project}', 시스템명 '{system}'은(는) 보통 '{learned}'"
        elif c.source is None and learned:
            c.project, c.source = learned, "column"
        manual = profile.manual.get(c.key)
        if manual:
            c.project, c.source, c.conflict = manual, "manual", None
        c.shared = bool(c.project and c.project in profile.shared_codes)
    return results


def project_display_names(assets: list[dict[str, Any]], results: list[Classification], profile: ClassifyProfile) -> dict[str, str]:
    votes: dict[str, Counter[str]] = defaultdict(Counter)
    for a, c in zip(assets, results, strict=True):
        if c.project and a.get(profile.column):
            votes[c.project][a[profile.column]] += 1
    names = {p: sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for p, cnt in votes.items()}
    names.update(profile.project_names)
    return names


def classify_run(store: AtlasStore, profile: ClassifyProfile | None = None, run_id: int | None = None) -> dict[str, Any]:
    """실행 하나를 분류해 저장하고 요약을 돌려준다."""
    profile = profile or ClassifyProfile()
    rid = store.latest_run_id() if run_id is None else run_id
    if rid is None:
        raise ValueError("동기화 실행이 없습니다. 먼저 import 하세요.")
    assets = store.list_assets(rid, limit=1_000_000)
    results = classify_assets(assets, profile)
    names = project_display_names(assets, results, profile)
    store.save_classification(rid, [vars(c) for c in results], names, profile.to_json())
    sources = Counter(c.source or "unclassified" for c in results)
    return {
        "run_id": rid,
        "assets": len(results),
        "projects": len({c.project for c in results if c.project and not c.shared}),
        "shared_assets": sum(1 for c in results if c.shared),
        "by_source": dict(sorted(sources.items())),
        "naming_violations": sum(1 for c in results if not c.naming_ok),
        "conflicts": sum(1 for c in results if c.conflict),
    }
