"""Local draw.io editing. Source inventory and append-only edited documents stay separate.

Follows diagram-bot's local embed / revision / source-separation pattern; no AWS model is imported.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from defusedxml import ElementTree as ET
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..diagram import render
from ..store import AtlasStore, utc_now
from .imports import local_write

MAX_XML = 10 * 1024 * 1024


def editor_path() -> Path:
    return Path(os.environ.get('ONPREM_ATLAS_EDITOR_DIR', Path.home() / '.cache/diagram-bot/drawio/32.4.1'))


def validate_xml(xml: str) -> None:
    if len(xml.encode()) > MAX_XML:
        raise ValueError('draw.io 문서는 10MB 이하여야 합니다.')
    try:
        root = ET.fromstring(xml)
    except Exception as exc:
        raise ValueError('유효한 draw.io XML이 아닙니다.') from exc
    if root.tag not in ('mxfile', 'mxGraphModel') or not list(root.iter('mxGraphModel')):
        raise ValueError('비압축 draw.io XML을 사용하세요.')
    if any(not list(p) for p in root.findall('diagram')):
        raise ValueError('압축된 페이지는 지원하지 않습니다.')
    cells = list(root.iter('mxCell'))
    if len(cells) > 10000:
        raise ValueError('도형은 10,000개 이하여야 합니다.')
    for page in root.iter('mxGraphModel'):
        ids = [e.get('id') for e in page.iter() if e.get('id')]
        if len(ids) != len(set(ids)):
            raise ValueError('중복된 도형 ID가 있습니다.')
    for geo in root.iter():
        if geo.tag in ('mxGeometry', 'mxPoint'):
            for field in ('x', 'y', 'width', 'height'):
                if field in geo.attrib:
                    value = float(geo.get(field))
                    if not math.isfinite(value) or abs(value) > 1e7 or (field in ('width', 'height') and value < 0):
                        raise ValueError('잘못된 도형 좌표입니다.')


class SaveDocument(BaseModel):
    xml: str = Field(max_length=MAX_XML)
    revision: int = Field(ge=0)
    base_run: int = Field(gt=0)


def document_router(db_path, profile=None):
    router = APIRouter(prefix='/api/documents')

    @router.get('/editor')
    def editor():
        return {'available': (editor_path() / 'index.html').is_file(), 'local': True}

    def scope(project):
        return 'project:' + project if project else 'idc'

    @router.get('')
    def read(project: str = '', revision: int | None = None, generated: bool = False):
        with AtlasStore(db_path) as store:
            current = store.latest_run_id()
            if current is None:
                raise HTTPException(404, '먼저 Excel을 등록하세요.')
            rows = store.conn.execute('SELECT revision, base_run, created_at FROM diagram_documents WHERE scope = ? ORDER BY revision DESC', (scope(project),)).fetchall()
            latest = rows[0]['revision'] if rows else 0
            wanted = revision if revision is not None else latest
            saved = store.conn.execute('SELECT * FROM diagram_documents WHERE scope = ? AND revision = ?', (scope(project), wanted)).fetchone() if wanted else None
            if revision is not None and saved is None:
                raise HTTPException(404, '편집 이력이 없습니다.')
            if generated or saved is None:
                try:
                    _, xml = render(store, 'project' if project else 'idc', project=project or None, profile=profile)
                except ValueError as exc:
                    raise HTTPException(404, str(exc)) from exc
                base = current
            else:
                xml, base = saved['xml'], saved['base_run']
            return {'xml': xml, 'revision': latest, 'loaded_revision': wanted if saved and not generated else None,
                    'base_run': base, 'current_run': current, 'stale': base != current,
                    'history': [dict(r) for r in rows]}

    @router.put('')
    def save(body: SaveDocument, request: Request, project: str = ''):
        local_write(request)
        try:
            validate_xml(body.xml)
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        with AtlasStore(db_path) as store, store._tx():
            store.conn.execute('BEGIN IMMEDIATE')
            latest = store.conn.execute('SELECT COALESCE(MAX(revision), 0) FROM diagram_documents WHERE scope = ?', (scope(project),)).fetchone()[0]
            if latest != body.revision:
                raise HTTPException(409, '다른 편집본이 저장되었습니다. 다시 불러온 후 저장하세요.')
            if store.run(body.base_run) is None:
                raise HTTPException(422, '기준 자산 스냅샷을 찾을 수 없습니다.')
            new = latest + 1
            store.conn.execute('INSERT INTO diagram_documents VALUES (?,?,?,?,?)', (scope(project), new, body.base_run, body.xml, utc_now()))
            return {'revision': new, 'base_run': body.base_run}

    @router.get('/download')
    def download(project: str = '', revision: int | None = None):
        doc = read(project, revision)
        return Response(doc['xml'], media_type='application/vnd.jgraph.mxfile', headers={'Content-Disposition': 'attachment; filename="onprem-architecture.drawio"'})

    return router
