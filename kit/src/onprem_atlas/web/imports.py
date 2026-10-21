"""Local Excel registration: bounded upload, review, atomic revision-checked commit."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import uuid
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..classify import ClassifyProfile, classify_run
from ..ingest import FIELDS, MappingProfile, parse_xlsx, sheet_names
from ..store import AtlasStore, utc_now
from ..components import COMPONENT_FIELDS, SOURCES, associate, parse_components
from ..ingest.mapping import IMPORT_FIELDS

MAX_FILE = 20 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024


def source_defaults(parsed, source_id: str) -> None:
    for asset in parsed.assets:
        if not asset.values.get("category"):
            asset.values["category"] = {"servers": "서버", "equipment": "미분류 장비", "security": "보안장비"}.get(source_id)


def parse_source(path, mapping, source_id):
    if source_id in SOURCES:
        return parse_components(path, mapping, source_id)
    parsed = parse_xlsx(path, mapping)
    source_defaults(parsed, source_id)
    return parsed


def local_write(request: Request) -> None:
    if not request.client or request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "파일 등록은 로컬 실행에서만 허용됩니다.")
    if request.headers.get("x-atlas-request") != "1":
        raise HTTPException(403, "등록 요청 헤더가 필요합니다.")
    origin = request.headers.get("origin")
    if origin:
        incoming = urlsplit(origin)
        host = request.headers.get("host", "")
        # Vite's loopback proxy uses a different port. No CORS is enabled, and
        # the custom header prevents cross-site simple requests from writing.
        loopbacks = {"127.0.0.1", "localhost", "::1"}
        local_proxy = incoming.hostname in loopbacks and urlsplit(f"http://{host}").hostname in loopbacks
        if incoming.scheme not in ("http", "https") or (incoming.netloc != host and not local_proxy):
            raise HTTPException(403, "다른 사이트에서의 등록 요청은 허용되지 않습니다.")


class CommitRequest(BaseModel):
    token: str
    confirm_replace: bool = False


def import_router(db_path: str | Path, classify_profile: ClassifyProfile | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/imports")
    folder = Path(db_path).resolve().parent / "imports"

    @router.post("/preview")
    async def preview(request: Request, filename: str, source_id: str, mode: str = "merge", sheet: str | None = None, profile: str = "{}") -> dict:
        local_write(request)
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", source_id):
            raise HTTPException(422, "원천 ID는 영문 소문자·숫자·하이픈·밑줄로 1~64자입니다.")
        if mode not in ("merge", "replace"):
            raise HTTPException(422, "등록 모드를 확인하세요.")
        if not filename.lower().endswith(".xlsx") or len(filename) > 255:
            raise HTTPException(422, "xlsx 파일을 선택하세요.")
        try:
            data = json.loads(profile)
            if not isinstance(data, dict) or set(data) - {"columns", "header_row", "memory_unit"}:
                raise ValueError("프로파일 형식을 확인하세요.")
            columns = data.get("columns", {})
            if not isinstance(columns, dict) or set(columns) - set(IMPORT_FIELDS) or not all(isinstance(v, str) for v in columns.values()):
                raise ValueError("필드 매핑을 확인하세요.")
            header_row = data.get("header_row")
            if header_row is not None and (type(header_row) is not int or not 1 <= header_row <= 100):
                raise ValueError("헤더 행은 1~100입니다.")
            if data.get("memory_unit", "auto") not in ("auto", "GB", "MB"):
                raise ValueError("메모리 단위를 확인하세요.")
            mapping = MappingProfile(sheet=sheet, columns=columns, header_row=header_row, memory_unit=data.get("memory_unit", "auto"))
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        token = uuid.uuid4().hex
        path = folder / f"{token}.xlsx"
        size = 0
        try:
            with path.open("xb") as out:
                os.chmod(path, 0o600)
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_FILE:
                        raise HTTPException(413, "Excel은 20MB 이하여야 합니다.")
                    out.write(chunk)
            return await run_in_threadpool(prepare, path, token, filename, source_id, mode, mapping)
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    def prepare(path: Path, token: str, filename: str, source_id: str, mode: str, mapping: MappingProfile) -> dict:
        try:
            with zipfile.ZipFile(path) as archive:
                if len(archive.infolist()) > 2000 or sum(f.file_size for f in archive.infolist()) > MAX_EXPANDED:
                    raise ValueError("압축 해제 크기가 허용 범위를 넘었습니다.")
            names = sheet_names(path)
            parsed = parse_source(path, mapping, source_id)
        except Exception as exc:
            raise HTTPException(422, "Excel을 읽지 못했습니다. 파일 형식·시트·매핑을 확인하세요.") from exc
        fields = COMPONENT_FIELDS if source_id in SOURCES else FIELDS
        mapping.sheet = parsed.sheet
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        with AtlasStore(db_path) as store:
            base = store.latest_run_id()
            hosts = store.list_assets(limit=1_000_000) if base else []
            old = store.list_components() if source_id in SOURCES else hosts
            previous = {a["key"]: a for a in old if a["source_id"] == source_id}
            incoming = {a.key: a.values for a in parsed.assets}
            conflicts = [a["key"] for a in old if a["source_id"] != source_id and a["key"] in incoming]
            missing = sorted({f for key in incoming.keys() & previous.keys() for f in fields
                              if f not in parsed.header.mapping and previous[key].get(f) is not None and incoming[key].get(f) is None}) if mode == "merge" else []
            changed = sum(1 for key in incoming.keys() & previous.keys() if any(incoming[key].get(f) != previous[key].get(f) for f in fields))
            removable = len(previous.keys() - incoming.keys())
            can_commit = bool(parsed.assets) and parsed.error_count == 0 and not conflicts and not missing
            store.conn.execute(
                "INSERT INTO pending_imports (token, path, source_id, source_name, sha256, profile_json, base_run, mode, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (token, path.name, source_id, Path(filename).name, sha, mapping.to_json(), base, mode, utc_now()),
            )
            store.conn.commit()
        return {
            "token": token, "source_id": source_id, "mode": mode, "sha256": sha, "base_run": base,
            "sheets": names, "sheet": parsed.sheet, "header_row": parsed.header.header_row,
            "headers": parsed.header.headers, "mapping": {f: parsed.header.headers[i] for f, i in parsed.header.mapping.items()},
            "unmapped": parsed.header.unmapped, "fields": list(fields), "assets": len(parsed.assets),
            "record_type": "component" if source_id in SOURCES else "asset",
            "host_matches": dict(Counter(a['match_status'] for a in associate([a.values for a in parsed.assets], hosts))) if source_id in SOURCES else {},
            "errors": parsed.error_count, "warnings": parsed.warning_count, "can_commit": can_commit,
            "issues": [vars(i) for i in parsed.issues[:100]], "conflicts": conflicts[:20],
            "missing_update_columns": missing,
            "changes": {"added": len(incoming.keys() - previous.keys()), "changed": changed, "removed": removable if mode == "replace" else 0, "retained": removable if mode == "merge" else 0},
            "preview": [a.values for a in parsed.assets[:5]],
        }

    @router.post("/commit")
    def commit(body: CommitRequest, request: Request) -> dict:
        local_write(request)
        with AtlasStore(db_path) as store:
            row = store.conn.execute("SELECT * FROM pending_imports WHERE token = ?", (body.token,)).fetchone()
            if not row:
                raise HTTPException(404, "검토한 파일을 찾지 못했습니다.")
            if row["committed_run"]:
                return {"run_id": row["committed_run"], "already_committed": True}
            if dt.datetime.now(dt.UTC) - dt.datetime.fromisoformat(row["created_at"]) > dt.timedelta(hours=24):
                raise HTTPException(410, "검토가 만료되었습니다. 파일을 다시 선택하세요.")
            if row["mode"] == "replace" and not body.confirm_replace:
                raise HTTPException(422, "전체 원천 교체를 확인해야 합니다.")
            path = folder / Path(row["path"]).name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
                raise HTTPException(409, "검토한 파일이 변경되었습니다. 다시 검토하세요.")
            data = json.loads(row["profile_json"])
            mapping = MappingProfile(**data)
            parsed = parse_source(path, mapping, row["source_id"])
            if not parsed.assets or parsed.error_count:
                raise HTTPException(422, "오류를 수정한 뒤 다시 검토하세요.")
            try:
                rid = store.import_parsed(
                    parsed, source_name=row["source_name"], source_sha256=row["sha256"], profile=mapping,
                    source_id=row["source_id"], mode=row["mode"], expected_run=row["base_run"], check_revision=True, token=body.token,
                    before_commit=lambda run_id: classify_run(store, profile=classify_profile, run_id=run_id),
                )
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc
            return {"run_id": rid, "assets": store.count_assets(rid)}

    return router
