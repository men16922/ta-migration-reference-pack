"""diff: 두 동기화 실행 간 자산 추가·삭제·속성 변경."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ..ingest import FIELDS

if TYPE_CHECKING:
    from ..store import AtlasStore

COMPARED = tuple(f for f in FIELDS if f != "hostname")


def diff_assets(before: list[dict[str, Any]], after: list[dict[str, Any]], compared: tuple[str, ...] = COMPARED) -> dict[str, Any]:
    a = {r["key"]: r for r in before}
    b = {r["key"]: r for r in after}
    added = sorted(b.keys() - a.keys())
    removed = sorted(a.keys() - b.keys())
    changed: list[dict[str, Any]] = []
    field_counts: dict[str, int] = {}
    for key in sorted(a.keys() & b.keys()):
        fields = {f: {"before": a[key].get(f), "after": b[key].get(f)} for f in compared if a[key].get(f) != b[key].get(f)}
        if fields:
            changed.append({"key": key, "hostname": b[key].get("hostname"), "fields": fields})
            for f in fields:
                field_counts[f] = field_counts.get(f, 0) + 1
    return {
        "added": [{"key": k, "hostname": b[k].get("hostname"), "system_name": b[k].get("system_name")} for k in added],
        "removed": [{"key": k, "hostname": a[k].get("hostname"), "system_name": a[k].get("system_name")} for k in removed],
        "changed": changed,
        "counts": {"added": len(added), "removed": len(removed), "changed": len(changed), "unchanged": len(a.keys() & b.keys()) - len(changed)},
        "changed_fields": dict(sorted(field_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def diff_runs(store: AtlasStore, before: int | None = None, after: int | None = None) -> dict[str, Any]:
    """기본값: 직전 실행 → 최신 실행. 실행이 하나뿐이면 ValueError."""
    ids = [r["id"] for r in store.runs()]
    if after is None:
        after = ids[-1] if ids else None
    if before is None:
        earlier = [i for i in ids if after is not None and i < after]
        before = earlier[-1] if earlier else None
    if before is None or after is None:
        raise ValueError("비교할 동기화 실행이 두 개 이상 필요합니다.")
    result = diff_assets(store.list_assets(before, limit=1_000_000), store.list_assets(after, limit=1_000_000))
    from ..components import COMPONENT_FIELDS

    components = diff_assets(store.list_components(before), store.list_components(after), COMPONENT_FIELDS)
    return {"before": before, "after": after, **result, "components": components}
