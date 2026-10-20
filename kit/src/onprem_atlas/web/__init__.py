"""web: 읽기 전용 HTTP API (FastAPI, 선택 의존성 `onprem-atlas[web]`).

회사 FastAPI 앱에는 `create_router(db_path)`만 `include_router` 하면 된다. 단독 실행은 `onprem-atlas serve`.
요청마다 SQLite 연결을 새로 연다(sqlite3 연결은 스레드 간 공유 불가, FastAPI 동기 핸들러는 스레드풀에서 돈다).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Generator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query

from ..classify import ClassifyProfile, classify_run
from ..diff import diff_runs
from ..review import SEVERITY_ORDER, is_server, review_run
from ..store import AtlasStore


def _page(items: list[Any], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "page": page, "page_size": page_size, "items": items[start : start + page_size]}


def create_router(db_path: str | Path, classify_profile: ClassifyProfile | None = None) -> APIRouter:
    router = APIRouter(prefix="/api")
    profile = classify_profile or ClassifyProfile()

    def get_store() -> Generator[AtlasStore]:
        store = AtlasStore(db_path, check_same_thread=False)
        try:
            if store.latest_run_id() is None:
                raise HTTPException(404, "동기화 실행이 없습니다. 먼저 `onprem-atlas import`로 ESM 엑셀을 가져오세요.")
            if not store.is_classified():
                classify_run(store, profile)
            yield store
        finally:
            store.close()

    @router.get("/summary")
    def summary(store: AtlasStore = Depends(get_store)) -> dict[str, Any]:  # noqa: B008
        run = store.run(store.latest_run_id() or 0) or {}
        assets = store.classified_assets()
        review = review_run(store)
        servers = [a for a in assets if is_server(a)]
        projects = {a["project"] for a in assets if a.get("project") and not a.get("shared")}
        try:
            d = diff_runs(store)
            last_diff = {"before": d["before"], "after": d["after"], **d["counts"], "changed_fields": d["changed_fields"]}
        except ValueError:
            last_diff = None
        return {
            "run": {k: run.get(k) for k in ("id", "source_name", "sheet", "finished_at", "row_count", "asset_count", "error_count", "warning_count")},
            "assets": {
                "total": len(assets),
                "servers": len(servers),
                "network": len(assets) - len(servers),
                "shared": sum(1 for a in assets if a.get("shared")),
                "unclassified": sum(1 for a in assets if not a.get("project")),
            },
            "projects": len(projects),
            "readiness": {"percent": review["readiness_percent"], "ready": review["ready_servers"], "servers": review["servers"]},
            "by_severity": review["by_severity"],
            "top_rules": sorted([r for r in review["rules"] if r["count"]], key=lambda r: (SEVERITY_ORDER[r["severity"]], -r["count"]))[:6],
            "zones": Counter(a.get("zone") or "(미지정)" for a in assets).most_common(),
            "envs": Counter(profile.env_names.get(a.get("env") or "", "(명명 규칙 외)") for a in assets).most_common(),
            "sites": Counter(a.get("site") or "(미지정)" for a in assets).most_common(),
            "last_diff": last_diff,
            "runs": store.runs()[-5:][::-1],
        }

    @router.get("/projects")
    def projects(
        q: str = "",
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=200),
        store: AtlasStore = Depends(get_store),  # noqa: B008
    ) -> dict[str, Any]:
        assets = store.classified_assets()
        review = review_run(store)
        issues = Counter(f["project"] for f in review["findings"] if f["severity"] in ("high", "medium"))
        groups: dict[str, list[dict[str, Any]]] = {}
        for a in assets:
            if a.get("project") and not a.get("shared"):
                groups.setdefault(a["project"], []).append(a)
        rows = []
        for code, members in groups.items():
            name = members[0].get("project_name") or code.upper()
            if q and q.lower() not in code.lower() and q.lower() not in name.lower():
                continue
            ready = review["projects"].get(code, {"percent": 100})
            rows.append(
                {
                    "code": code,
                    "name": name,
                    "assets": len(members),
                    "envs": sorted({profile.env_names.get(m["env"], m["env"]) for m in members if m.get("env")}),
                    "zones": sorted({m.get("zone") or "-" for m in members}),
                    "roles": dict(Counter(m.get("role") or "-" for m in members).most_common()),
                    "readiness": ready["percent"],
                    "issues": issues.get(code, 0),
                }
            )
        rows.sort(key=lambda r: (-r["assets"], r["code"]))
        return _page(rows, page, page_size)

    @router.get("/assets")
    def assets(
        q: str = "",
        project: str | None = None,
        zone: str | None = None,
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=200),
        store: AtlasStore = Depends(get_store),  # noqa: B008
    ) -> dict[str, Any]:
        rows = store.classified_assets(project=project)
        if q:
            keys = {r["key"] for r in store.search(q, limit=100_000)["items"]}
            rows = [r for r in rows if r["key"] in keys]
        if zone:
            rows = [r for r in rows if r.get("zone") == zone]
        return _page(rows, page, page_size)

    @router.get("/review")
    def review(
        rule: str | None = None,
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=200),
        store: AtlasStore = Depends(get_store),  # noqa: B008
    ) -> dict[str, Any]:
        result = review_run(store)
        findings = [f for f in result["findings"] if not rule or f["rule"] == rule]
        return {"rules": result["rules"], "by_severity": result["by_severity"], **_page(findings, page, page_size)}

    @router.get("/runs")
    def runs(store: AtlasStore = Depends(get_store)) -> list[dict[str, Any]]:  # noqa: B008
        return store.runs()[::-1]

    @router.get("/diff")
    def diff(before: int | None = None, after: int | None = None, limit: int = Query(50, ge=1, le=1000), store: AtlasStore = Depends(get_store)) -> dict[str, Any]:  # noqa: B008
        try:
            d = diff_runs(store, before, after)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return {**d, "added": d["added"][:limit], "removed": d["removed"][:limit], "changed": d["changed"][:limit]}

    return router


def create_app(db_path: str | Path, classify_profile: ClassifyProfile | None = None) -> FastAPI:
    app = FastAPI(title="onprem-atlas", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.include_router(create_router(db_path, classify_profile))
    return app
