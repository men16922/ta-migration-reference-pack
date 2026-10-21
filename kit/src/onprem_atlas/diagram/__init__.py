"""diagram: IDC·프로젝트 구성도 — 결정적 배치 → 레이아웃 JSON(콘솔 SVG) + draw.io XML.

5,000건 전체를 개별 아이콘으로 그리지 않는다.
- `idc`: 센터별 장비와 WEB/WAS/DB 인스턴스 집계.
- `project`: 업무별 센터·애플리케이션 계층과 개별 인스턴스. `max_nodes` 초과 시 집계.
같은 입력이면 같은 좌표·같은 XML(셀 ID = 경로 해시, 자동 배치 미사용).
망 구획과 통신선은 사용자가 별도 편집본에 그린다. 자동 생성도는 통신을 추정하지 않는다.
스타일은 `styles` 인자로 분리해 회사 draw.io 규격(diagram-bot drawio_spec 계열)으로 바꿀 수 있다.
"""

from __future__ import annotations

import copy
from collections import defaultdict
from typing import TYPE_CHECKING, Any
from xml.sax.saxutils import escape, quoteattr

from .inventory import NET_LABELS, device_kind as device_kind
from .model import Box, Edge
from .enterprise import build_enterprise

if TYPE_CHECKING:
    from ..classify import ClassifyProfile
    from ..store import AtlasStore

NODE_W, NODE_H = 156, 48
AGG_W, AGG_H = 176, 52
PAD, HEAD, GAP = 14, 30, 12
TITLE_H = 64

DEFAULT_STYLES: dict[str, Any] = {
    "font": "IBM Plex Sans KR,IBM Plex Sans,Helvetica",
    "role": dict.fromkeys(('web', 'was', 'app', 'bat', 'db', 'svc', ''), '#262626'),
    "net": dict.fromkeys(('fw', 'security', 'l4', 'sw', 'san', 'storage', 'backup', 'other'), '#262626'),
    "zone": dict.fromkeys(('DMZ', '업무망', 'DB망', '개발망', '공통인프라망'), '#525252'),
    "zone_default": "#525252",
    "container": {"tier": ("#ffffff", "#525252"),
                  "site": ("#ffffff", "#161616"), "env": ("#ffffff", "#525252"), "zone": ("#ffffff", "#525252"), "subnet": ("#ffffff", "#525252"), "band": ("#ffffff", "#525252")},
    "edge": "#262626",
    # draw.io 내장 벡터 도형(별도 이미지 파일 없이 오프라인에서 열림). 회사 규격 아이콘으로 바꾸려면 이 표만 교체.
    "icon": {
        "role:web": "mxgraph.cisco.computers_and_peripherals.web_browser",
        "role:was": "mxgraph.cisco.servers.software_based_server",
        "role:app": "mxgraph.networks.server",
        "role:bat": "mxgraph.networks.server",
        "role:db": "cylinder3",
        "role:svc": "mxgraph.networks.server_storage",
        "role:": "mxgraph.networks.server",
        "net:fw": "mxgraph.networks.firewall",
        "net:security": "mxgraph.cisco.security.lock",
        "net:l4": "mxgraph.networks.load_balancer",
        "net:other": "mxgraph.networks.server_storage",
        "net:storage": "mxgraph.cisco.storage.fibre_channel_disk_subsystem",
        "net:san": "mxgraph.networks.switch",
        "net:backup": "mxgraph.networks.server_storage",
        "net:sw": "mxgraph.cisco.switches.layer_3_switch",
    },
}
ICON_SIZE = 28
ROLE_ORDER = ["web", "was", "app", "bat", "db"]
ROLE_LABELS = {"web": "WEB", "was": "WAS", "app": "APP", "bat": "BATCH", "db": "DB"}


# ── 배치 ───────────────────────────────────────────────────


def _pad(b: Box) -> tuple[float, float]:
    """(안쪽 여백, 머리글 높이). 머리글에 라벨 + 보조 라벨 두 줄."""
    if b.kind in ("root", "lane"):
        return 0, 0
    return PAD, HEAD + (16 if b.sublabel else 0)


def _lines(b: Box) -> list[list[Box]]:
    if b.direction == "col":
        return [[c] for c in b.children]
    n = b.wrap or len(b.children) or 1
    return [b.children[i : i + n] for i in range(0, len(b.children), n)]


def _measure(b: Box) -> None:
    if b.kind == "title":
        b.w, b.h = 600, TITLE_H - GAP
        return
    if b.leaf and b.meta.get('record_type') == 'component':
        b.w, b.h = 236, 100
        return
    if b.leaf:
        b.w, b.h = (AGG_W, AGG_H) if b.kind == "agg" else (NODE_W, NODE_H)
        return
    for c in b.children:
        _measure(c)
    pad, head = _pad(b)
    lines = _lines(b)
    if b.kind == "root":
        body = [c for c in b.children if c.kind != "title"]
        title = next((c.w for c in b.children if c.kind == "title"), 0)
        inner_w = max(title, sum(c.w for c in body) + GAP * 2 * max(len(body) - 1, 0))
        inner_h = TITLE_H + max((c.h for c in body), default=0)
    else:
        widths = [sum(c.w for c in ln) + GAP * (len(ln) - 1) for ln in lines]
        heights = [max(c.h for c in ln) for ln in lines]
        inner_w = max(widths, default=236 if b.kind == "tier" else NODE_W)
        if b.kind == "tier":
            inner_w = max(inner_w, 236)
        inner_h = sum(heights) + GAP * max(len(lines) - 1, 0) if lines else NODE_H / 2
    b.w = inner_w + 2 * pad
    b.h = head + inner_h + (pad if b.kind not in ("root", "lane") else 0)
    if b.stretch:
        for ln in lines:
            line_h = max(c.h for c in ln)
            for c in ln:
                if not c.leaf:
                    if b.direction == "col":
                        c.w = inner_w
                    else:
                        c.h = line_h


def _place(b: Box, x: float, y: float) -> None:
    b.x, b.y = x, y
    if b.leaf:
        return
    pad, head = _pad(b)
    if b.kind == "root":
        title = next((c for c in b.children if c.kind == "title"), None)
        if title:
            _place(title, x, y)
        cx = x
        for c in (c for c in b.children if c.kind != "title"):
            _place(c, cx, y + TITLE_H)
            cx += c.w + GAP * 2
        return
    cy = y + head
    for ln in _lines(b):
        cx = x + pad
        for c in ln:
            _place(c, cx, cy)
            cx += c.w + GAP
        cy += max(c.h for c in ln) + GAP


def _route(s: Box, t: Box) -> list[tuple[float, float]]:
    """직교 경로. 위아래로 떨어져 있으면 세로(버스형), 아니면 좌우."""
    if s.y + s.h <= t.y or t.y + t.h <= s.y:
        y1, y2 = (s.y + s.h, t.y) if s.y + s.h <= t.y else (s.y, t.y + t.h)
        ym = round((y1 + y2) / 2, 1)
        sx, tx = s.x + s.w / 2, t.x + t.w / 2
        return [(sx, y1), (sx, ym), (tx, ym), (tx, y2)] if sx != tx else [(sx, y1), (tx, y2)]
    if s.x + s.w <= t.x or t.x + t.w <= s.x:  # 좌우
        x1, x2 = (s.x + s.w, t.x) if s.x + s.w <= t.x else (s.x, t.x + t.w)
        top, bot = max(s.y, t.y + HEAD), min(s.y + s.h, t.y + t.h)
        if top < bot:
            y = round(min((top + bot) / 2, top + 60), 1)
            return [(x1, y), (x2, y)]
        xm = (x1 + x2) / 2
        return [(x1, s.y + s.h / 2), (xm, s.y + s.h / 2), (xm, t.y + t.h / 2), (x2, t.y + t.h / 2)]
    return [(s.x + s.w / 2, s.y + s.h / 2), (t.x + t.w / 2, t.y + t.h / 2)]  # 겹침(배치상 없음)


def layout(root: Box, edges: list[Edge]) -> None:
    _measure(root)
    _place(root, 0, 0)
    for e in edges:
        e.points = _route(e.source, e.target)


def walk(b: Box, parent: Box | None = None) -> list[tuple[Box, Box | None]]:
    """그리는 상자(부모 먼저)와 그려지는 부모. root·lane은 그리지 않고 자식을 위로 올린다."""
    hidden = b.kind in ("root", "lane")
    out = [] if hidden else [(b, parent)]
    for c in b.children:
        out += walk(c, parent if hidden else b)
    return out


# ── 출력 ───────────────────────────────────────────────────


def to_layout(root: Box, edges: list[Edge], stats: dict[str, Any], styles: dict[str, Any] | None = None) -> dict[str, Any]:
    st = styles or DEFAULT_STYLES
    boxes = []
    for b, parent in walk(root):
        color = _color(b.style, st)
        boxes.append(
            {
                "id": b.id,
                "parent": parent.id if parent else None,
                "kind": b.kind,
                "label": b.label,
                "sublabel": b.sublabel,
                "style": b.style,
                "color": color,
                "x": b.x,
                "y": b.y,
                "w": b.w,
                "h": b.h,
                "icon": st["icon"].get(b.style) if b.leaf and b.kind != "title" else None,
                "meta": b.meta,
            }
        )
    return {
        "width": root.w,
        "height": root.h,
        "stats": stats,
        "boxes": boxes,
        "edges": [{"id": e.id, "source": e.source.id, "target": e.target.id, "label": e.label, "kind": e.kind, "points": e.points} for e in edges],
        "legend": _legend(root, st),
        "notes": [
            "WEB·WAS·DB는 애플리케이션 계층이며 VLAN·보안존을 뜻하지 않습니다. 서버 대수와 인스턴스 수는 별도로 집계합니다.",
            "실선: ESM 기재 이중화 관계 (동작 상태·통신 경로 미확인). IP만으로 서브넷을 추정하지 않습니다.",
            "공통 서비스·IDC 장비는 센터 전체 기준 참조입니다. 방화벽·망 구획·통신선은 직접 편집하여 별도 저장할 수 있습니다.",
        ],
    }


def _color(style: str, st: dict[str, Any]) -> str | None:
    group, _, key = style.partition(":")
    if group == "role":
        return st["role"].get(key, st["role"][""])
    if group == "net":
        return st["net"].get(key)
    if group == "zone":
        return st["zone"].get(key, st["zone_default"])
    return None


def _legend(root: Box, st: dict[str, Any]) -> list[dict[str, str]]:
    seen = sorted({b.style for b, _ in walk(root) if b.leaf and b.style}, key=lambda s: (s.split(":")[0] != "role", ROLE_ORDER.index(s[5:]) if s[5:] in ROLE_ORDER else 9, s))
    out = []
    for s in seen:
        group, _, key = s.partition(":")
        role = ROLE_LABELS.get(key) or {"svc": "공통 서비스", "": "서버 (역할 미확인)"}.get(key, key.upper())
        label = {"role": role, "net": NET_LABELS.get(key, key)}.get(group, key)
        out.append({"style": s, "label": label, "color": _color(s, st) or "#8d8d8d"})
    return out


def _cell_style(b: Box, st: dict[str, Any]) -> str:
    font = f"fontFamily={st['font']};"
    if b.kind == "title":
        return f"text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=20;{font}"
    if b.leaf:
        color = _color(b.style, st) or "#8d8d8d"
        pad = 42 if st["icon"].get(b.style) else 10
        base = f"rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft={pad};spacingRight=4;fontSize=11;"
        return f"{base}fillColor=#ffffff;strokeColor={color};strokeWidth={2 if b.kind == 'agg' else 1};{font}"
    fill, stroke = st["container"].get(b.kind, ("#ffffff", "#c6c6c6"))
    if b.kind in ("zone", "tier"):
        stroke = _color(b.style, st) or stroke
    dashed = "dashed=1;" if b.kind in ("subnet", "band") else ""
    size = {"site": 15, "env": 13}.get(b.kind, 12)
    box = "rounded=0;whiteSpace=wrap;html=1;container=1;collapsible=0;align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;"
    return f"{box}fontSize={size};fontStyle=1;fillColor={fill};strokeColor={stroke};{dashed}{font}"


def _cell_value(b: Box) -> str:
    if b.kind == "title":
        return f"<b>{escape(b.label)}</b>" + (f"<br><font style=\"font-size:12px\" color=\"#525252\">{escape(b.sublabel).replace(chr(10), '<br>')}</font>" if b.sublabel else "")
    sub = f"<br><font color=\"#525252\" style=\"font-weight:normal;font-size:10px\">{escape(b.sublabel).replace(chr(10), '<br>')}</font>" if b.sublabel else ""
    label = f"<b>{escape(b.label)}</b>" if b.leaf else escape(b.label)
    return label + sub


def to_drawio(root: Box, edges: list[Edge], stats: dict[str, Any], styles: dict[str, Any] | None = None) -> str:
    st = styles or DEFAULT_STYLES
    cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
    for b, parent in walk(root):
        pid, px, py = (parent.id, parent.x, parent.y) if parent else ("1", 0, 0)
        geo = f'<mxGeometry x="{b.x - px:g}" y="{b.y - py:g}" width="{b.w:g}" height="{b.h:g}" as="geometry"/>'
        cells.append(f'<mxCell id="{b.id}" value={quoteattr(_cell_value(b))} style="{_cell_style(b, st)}" vertex="1" parent="{pid}">{geo}</mxCell>')
        icon = st["icon"].get(b.style) if b.leaf and b.kind != "title" else None
        if icon:  # 카드 안쪽 왼쪽에 아이콘(카드의 자식이라 카드를 옮기면 같이 움직인다)
            ig = f'<mxGeometry x="8" y="{(b.h - ICON_SIZE) / 2:g}" width="{ICON_SIZE}" height="{ICON_SIZE}" as="geometry"/>'
            istyle = f"shape={icon};html=1;fillColor=#ffffff;strokeColor={_color(b.style, st) or '#262626'};strokeWidth=1;verticalLabelPosition=bottom;verticalAlign=top;"
            if icon == 'cylinder3':
                istyle += 'size=5;boundedLbl=1;backgroundOutline=1;'
            cells.append(f'<mxCell id="{b.id}i" value="" style="{istyle}" vertex="1" parent="{b.id}">{ig}</mxCell>')
    for e in edges:
        dash = "dashed=1;dashPattern=6 4;" if e.kind == "inferred" else ""
        (sx, sy), (tx, ty) = e.points[0], e.points[-1]
        s, t = e.source, e.target
        anchor = f"exitX={(sx - s.x) / s.w:.4f};exitY={(sy - s.y) / s.h:.4f};entryX={(tx - t.x) / t.w:.4f};entryY={(ty - t.y) / t.h:.4f};exitPerimeter=0;entryPerimeter=0;"
        arrow = "none" if e.kind == "declared" else "block"
        style = f"edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow={arrow};endFill=1;strokeColor={st['edge']};fontSize=10;{dash}{anchor}"
        mids = "".join(f'<mxPoint x="{x:g}" y="{y:g}"/>' for x, y in e.points[1:-1])
        ends = f'<mxPoint x="{sx:g}" y="{sy:g}" as="sourcePoint"/><mxPoint x="{tx:g}" y="{ty:g}" as="targetPoint"/>'
        geo = f'<mxGeometry relative="1" as="geometry">{ends}' + (f'<Array as="points">{mids}</Array>' if mids else "") + "</mxGeometry>"
        cells.append(f'<mxCell id="{e.id}" value={quoteattr(e.label)} style="{style}" edge="1" parent="1" source="{e.source.id}" target="{e.target.id}">{geo}</mxCell>')
    note = "자산 목록 기반 배치도 | 실선: ESM 기재 이중화 | 망 구획·통신선: 수동 편집 | 실제 통신·케이블·VLAN 미확인"
    cells.append(f'<mxCell id="atlas-provenance" value={quoteattr(note)} style="text;html=0;align=left;fontSize=11;" vertex="1" parent="1">'
                 f'<mxGeometry x="0" y="{root.h + 12:g}" width="{max(root.w, 600):g}" height="50" as="geometry"/></mxCell>')
    name = stats.get("name") or stats.get("view", "diagram")
    w, h = int(max(root.w, 600)) + 40, int(root.h) + 80
    return (
        '<mxfile host="onprem-atlas" agent="onprem-atlas" version="24.0.0" compressed="false">'
        f'<diagram id="{root.id}" name={quoteattr(str(name))}>'
        f'<mxGraphModel dx="{w}" dy="{h}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="{w}" pageHeight="{h}" math="0" shadow="0">'
        f"<root>{''.join(cells)}</root></mxGraphModel></diagram></mxfile>\n"
    )


# ── 진입점 ─────────────────────────────────────────────────


def render(
    store: AtlasStore,
    view: str,
    *,
    project: str | None = None,
    profile: ClassifyProfile | None = None,
    max_nodes: int = 60,
    styles: dict[str, Any] | None = None,
    run_id: int | None = None,
    include_inferred: bool = False,
) -> tuple[dict[str, Any], str]:
    """(레이아웃 JSON, draw.io XML). 분류가 안 된 실행이면 먼저 분류한다."""
    from ..classify import ClassifyProfile, classify_run

    profile = profile or ClassifyProfile()
    if not store.is_classified(run_id):
        classify_run(store, profile, run_id)
    assets = store.classified_assets(run_id)
    # Explicit ownership/location boundaries; same site label across companies stays separate.
    assets = [{**a, "site": f"{a['organization']} / {a.get('site') or '(설치지역 미확인)'}"} if a.get("organization") else a for a in assets]
    run = store.run(run_id or store.latest_run_id() or 0) or {}

    components = store.components(run_id)
    components = [{**c, "site": f"{c['organization']} / {c.get('site') or '(설치지역 미확인)'}"} if c.get('organization') else c for c in components]
    if view not in ('idc', 'project'):
        raise ValueError(f"알 수 없는 보기: {view}")
    if view == 'project' and not project:
        raise ValueError('project 보기는 프로젝트 코드가 필요합니다.')
    root, edges, stats = build_enterprise(assets, components, view, project, profile, max_nodes)
    if not include_inferred:
        edges = []
    # A declared HA peer is a source assertion, not observed traffic or active/standby status.
    nodes = {b.meta.get("key"): b for b, _ in walk(root) if b.kind == "node"}
    by_host: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for a in assets:
        by_host[(a.get("organization") or "", a.get("site") or "", a["hostname"].lower())].append(a)
    linked: set[tuple[str, str]] = set()
    for a in assets:
        peer = (a.get("ha_peer") or "").strip().lower()
        matches = by_host.get((a.get("organization") or "", a.get("site") or "", peer), [])
        if len(matches) == 1 and a["key"] in nodes and matches[0]["key"] in nodes and a["key"] != matches[0]["key"]:
            pair = tuple(sorted((a["key"], matches[0]["key"])))
            if pair not in linked:
                edges.append(Edge(nodes[pair[0]], nodes[pair[1]], "", "declared"))
                linked.add(pair)
    source_runs = {a.get("origin_run_id") or a["run_id"] for a in [*assets, *components]}
    stats["sources"] = [{k: r.get(k) for k in ("id", "source_id", "source_name", "source_sha256", "finished_at")} for r in store.runs() if r["id"] in source_runs]
    stats["run"] = {k: run.get(k) for k in ("id", "source_name", "finished_at")}
    title = root.children[0]
    title.sublabel = f"자산 스냅샷 #{run.get('id')} · 원천 파일 {len(source_runs)}개 · {str(run.get('finished_at') or '')[:10]}"
    title.label = f"{title.label} — 실행 #{run.get('id')}"
    layout(root, edges)
    st = copy.deepcopy(styles) if styles else DEFAULT_STYLES
    return to_layout(root, edges, stats, st), to_drawio(root, edges, stats, st)
