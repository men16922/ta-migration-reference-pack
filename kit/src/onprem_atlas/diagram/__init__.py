"""diagram: IDC·프로젝트 구성도 — 결정적 배치 → 레이아웃 JSON(콘솔 SVG) + draw.io XML.

5,000건 전체를 개별 아이콘으로 그리지 않는다.
- `idc`: 센터별 망구분 × 역할 집계(`WAS × 412`) + 네트워크 장비 + 공통 서비스. 전체 그림.
- `project`: 프로젝트 하나 → 센터 → 환경 → 망구분 → 서브넷(/24) → 서버. 서버가 `max_nodes`를 넘으면 역할별로 집계.
같은 입력이면 같은 좌표·같은 XML(셀 ID = 경로 해시, 자동 배치 미사용).
점선 화살표는 역할·망구분으로 **추정한 흐름**이다. 연결 시트·Zabbix 같은 실제 관계 원천은 아직 없다(TODO).
스타일은 `styles` 인자로 분리해 회사 draw.io 규격(diagram-bot drawio_spec 계열)으로 바꿀 수 있다.
"""

from __future__ import annotations

import copy
import hashlib
import ipaddress
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from xml.sax.saxutils import escape, quoteattr

from ..review import NETWORK_CATEGORY

if TYPE_CHECKING:
    from ..classify import ClassifyProfile
    from ..store import AtlasStore

NODE_W, NODE_H = 156, 48
AGG_W, AGG_H = 176, 52
PAD, HEAD, GAP = 14, 30, 12
TITLE_H = 64

DEFAULT_STYLES: dict[str, Any] = {
    "font": "IBM Plex Sans KR,IBM Plex Sans,Helvetica",
    "role": {"web": "#0f62fe", "was": "#009d9a", "app": "#1192e8", "bat": "#8a3ffc", "db": "#d02670", "svc": "#6f6f6f", "": "#8d8d8d"},
    "net": {"fw": "#da1e28", "l4": "#198038", "sw": "#525252"},
    "zone": {"DMZ": "#ff8389", "업무망": "#78a9ff", "DB망": "#ff7eb6", "개발망": "#a8a8a8", "공통인프라망": "#be95ff"},
    "zone_default": "#a8a8a8",
    "container": {"site": ("#ffffff", "#161616"), "env": ("#f4f4f4", "#8d8d8d"), "zone": ("#ffffff", "#c6c6c6"), "subnet": ("#ffffff", "#c6c6c6"), "band": ("#f4f4f4", "#c6c6c6")},
    "edge": "#6f6f6f",
    # draw.io 내장 벡터 도형(별도 이미지 파일 없이 오프라인에서 열림). 회사 규격 아이콘으로 바꾸려면 이 표만 교체.
    "icon": {
        "role:web": "mxgraph.networks.web_server",
        "role:was": "mxgraph.networks.server",
        "role:app": "mxgraph.networks.server",
        "role:bat": "mxgraph.networks.server",
        "role:db": "mxgraph.networks.storage",
        "role:svc": "mxgraph.networks.server_storage",
        "role:": "mxgraph.networks.server",
        "net:fw": "mxgraph.networks.firewall",
        "net:l4": "mxgraph.networks.load_balancer",
        "net:sw": "mxgraph.cisco.switches.layer_3_switch",
    },
}
ICON_SIZE = 28
ZONE_ORDER = ["DMZ", "업무망", "DB망", "개발망"]
TIER_ZONES = ["DMZ", "업무망", "DB망"]
ENV_ORDER = ["p", "s", "d"]
ROLE_ORDER = ["web", "was", "app", "bat", "db"]
ROLE_LABELS = {"web": "WEB", "was": "WAS", "app": "APP", "bat": "BATCH", "db": "DB"}
NET_LABELS = {"fw": "방화벽", "l4": "L4 스위치", "sw": "L3/L2 스위치"}


@dataclass
class Box:
    path: str
    kind: str  # root | title | site | env | zone | subnet | band | lane | node | agg
    label: str = ""
    sublabel: str = ""
    style: str = ""  # 스타일 표 키: role:was, net:fw, zone:DMZ
    children: list[Box] = field(default_factory=list)
    direction: str = "row"  # row | col
    wrap: int = 0
    stretch: bool = False  # 컨테이너 자식을 교차축으로 맞춤
    meta: dict[str, Any] = field(default_factory=dict)
    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0

    @property
    def id(self) -> str:
        return "c" + hashlib.sha1(self.path.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]

    @property
    def leaf(self) -> bool:
        return self.kind in ("node", "agg", "title")


@dataclass
class Edge:
    source: Box
    target: Box
    label: str = ""
    kind: str = "inferred"
    points: list[tuple[float, float]] = field(default_factory=list)

    @property
    def id(self) -> str:
        return "e" + hashlib.sha1(f"{self.source.path}->{self.target.path}".encode(), usedforsecurity=False).hexdigest()[:12]


# ── 분류 보조 ──────────────────────────────────────────────


def device_kind(a: dict[str, Any]) -> str | None:
    """네트워크 장비면 fw | l4 | sw, 서버면 None."""
    cat = a.get("category") or ""
    if not NETWORK_CATEGORY.search(cat):
        return None
    low = cat.lower()
    if "방화벽" in cat or "firewall" in low or "보안장비" in cat or "utm" in low:
        return "fw"
    if "l4" in low or "로드밸런서" in cat or "load" in low or "adc" in low:
        return "l4"
    return "sw"


def subnet_of(ip: str | None) -> str:
    try:
        return str(ipaddress.ip_network(f"{ip}/24", strict=False))
    except ValueError:
        return "(IP 없음)"


def _ordered(values: set[str], order: list[str]) -> list[str]:
    return sorted(values, key=lambda v: (order.index(v) if v in order else len(order), v))


def _num(n: float | None) -> str:
    return f"{int(n):,}" if n is not None else "-"


def _role_rank(role: str | None) -> int:
    return ROLE_ORDER.index(role) if role in ROLE_ORDER else len(ROLE_ORDER)


def _role_label(role: str | None) -> str:
    return ROLE_LABELS.get(role or "", (role or "기타").upper())


def _server_node(path: str, a: dict[str, Any]) -> Box:
    sub = " · ".join(x for x in (a.get("ip"), a.get("os")) if x)
    meta = {k: a.get(k) for k in ("key", "hostname", "ip", "os", "cpu_model", "cpu_cores", "memory_gb", "zone", "env", "role", "site", "status", "project")}
    return Box(f"{path}/n:{a['key']}", "node", a.get("hostname") or a["key"], sub, f"role:{a.get('role') or ''}", meta=meta)


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
            groups[k].append(a)
    if not groups:
        return None
    band = Box(f"{path}/net", "band", "IDC 네트워크", "", direction="row")
    for k in _ordered(set(groups), ["fw", "l4", "sw"]):
        models = Counter(m.get("model") or "-" for m in groups[k]).most_common(1)[0][0]
        band.children.append(_agg_node(band.path, k, NET_LABELS[k], groups[k], f"net:{k}", sub=models))
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


# ── 보기 ───────────────────────────────────────────────────


def build_project(assets: list[dict[str, Any]], project: str, profile: ClassifyProfile, *, max_nodes: int = 60, title: str = "") -> tuple[Box, list[Edge], dict[str, Any]]:
    mine = [a for a in assets if a.get("project") == project and not a.get("shared")]
    if not mine:
        raise ValueError(f"프로젝트 '{project}'에 자산이 없습니다.")
    servers = [a for a in mine if device_kind(a) is None]
    aggregate = len(servers) > max_nodes
    name = mine[0].get("project_name") or project.upper()
    root = Box(f"project:{project}", "root", direction="row")
    root.children.append(Box(f"{root.path}/title", "title", title or f"{name} ({project}) 온프렘 현행 구성도", ""))
    edges: list[Edge] = []
    sites = sorted({a.get("site") or "(미지정)" for a in mine})
    shown = 0
    for site in sites:
        site_assets = [a for a in assets if (a.get("site") or "(미지정)") == site]
        here = [a for a in mine if (a.get("site") or "(미지정)") == site]
        sbox = Box(f"{root.path}/s:{site}", "site", site, f"이 프로젝트 자산 {len(here):,}대", direction="col", stretch=True)
        net = _net_band(sbox.path, site_assets)
        if net:
            net.label = "IDC 네트워크 (참조)"
            sbox.children.append(net)
        for env in _ordered({a.get("env") or "" for a in here}, ENV_ORDER):
            env_assets = [a for a in here if (a.get("env") or "") == env]
            ebox = Box(f"{sbox.path}/e:{env}", "env", profile.env_names.get(env, "(명명 규칙 외)"), f"{len(env_assets):,}대", direction="row", stretch=True)
            zboxes: dict[str, Box] = {}
            for zone in _ordered({a.get("zone") or "(미지정)" for a in env_assets}, ZONE_ORDER):
                za = [a for a in env_assets if (a.get("zone") or "(미지정)") == zone]
                zbox = Box(f"{ebox.path}/z:{zone}", "zone", zone, f"{len(za):,}대", f"zone:{zone}", direction="col")
                subnets = sorted({subnet_of(a.get("ip")) for a in za})
                for net_cidr in subnets:
                    sa = sorted((a for a in za if subnet_of(a.get("ip")) == net_cidr), key=lambda a: (_role_rank(a.get("role")), a["key"]))
                    holder = Box(f"{zbox.path}/n:{net_cidr}", "subnet", net_cidr, "", direction="row", wrap=2) if len(subnets) > 1 else zbox
                    if holder is zbox:
                        zbox.sublabel = f"{net_cidr} · {len(za):,}대"
                        zbox.direction, zbox.wrap = "row", 2
                    if aggregate:
                        by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
                        for a in sa:
                            by_role[a.get("role") or ""].append(a)
                        for role in _ordered(set(by_role), ROLE_ORDER):
                            holder.children.append(_agg_node(holder.path, role or "-", _role_label(role), by_role[role], f"role:{role}"))
                    else:
                        holder.children.extend(_server_node(holder.path, a) for a in sa)
                    shown += len(sa)
                    if holder is not zbox:
                        zbox.children.append(holder)
                ebox.children.append(zbox)
                zboxes[zone] = zbox
            tiers = [z for z in TIER_ZONES if z in zboxes]
            edges += [Edge(zboxes[a], zboxes[b], "추정") for a, b in zip(tiers, tiers[1:], strict=False)]
            sbox.children.append(ebox)
        shared = _shared_band(sbox.path, [a for a in site_assets if a.get("shared")])
        if shared:
            sbox.children.append(shared)
        root.children.append(sbox)
    stats = {"view": "project", "project": project, "name": name, "assets": len(mine), "servers": len(servers), "shown": shown, "aggregated": aggregate, "max_nodes": max_nodes, "sites": sites}
    return root, edges, stats


def build_idc(assets: list[dict[str, Any]], profile: ClassifyProfile, *, title: str = "") -> tuple[Box, list[Edge], dict[str, Any]]:
    root = Box("idc", "root", direction="row")
    root.children.append(Box(f"{root.path}/title", "title", title or "IDC 현행 인프라 구성도", ""))
    edges: list[Edge] = []
    sites = sorted({a.get("site") or "(미지정)" for a in assets})
    for site in sites:
        here = [a for a in assets if (a.get("site") or "(미지정)") == site]
        servers = [a for a in here if device_kind(a) is None]
        sbox = Box(f"idc/s:{site}", "site", site, f"자산 {len(here):,}대 · 서버 {len(servers):,}대", direction="col", stretch=True)
        net = _net_band(sbox.path, here)
        if net:
            sbox.children.append(net)
        lane = Box(f"{sbox.path}/zones", "lane", direction="row", stretch=True)
        project_servers = [a for a in servers if not a.get("shared")]
        for zone in _ordered({a.get("zone") or "(미지정)" for a in project_servers}, ZONE_ORDER):
            za = [a for a in project_servers if (a.get("zone") or "(미지정)") == zone]
            n_proj = len({a["project"] for a in za if a.get("project")})
            zbox = Box(f"{lane.path}/z:{zone}", "zone", zone, f"서버 {len(za):,}대 · 프로젝트 {n_proj:,}", f"zone:{zone}", direction="col")
            by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for a in za:
                by_role[a.get("role") or ""].append(a)
            for role in _ordered(set(by_role), ROLE_ORDER):
                members = by_role[role]
                envs = Counter(a.get("env") or "" for a in members)
                sub = " · ".join(f"{profile.env_names.get(e, '기타')} {envs[e]:,}" for e in _ordered(set(envs), ENV_ORDER))
                zbox.children.append(_agg_node(zbox.path, role or "-", _role_label(role) if role else "기타/미분류", members, f"role:{role}", sub=sub))
            lane.children.append(zbox)
        sbox.children.append(lane)
        shared = _shared_band(sbox.path, [a for a in servers if a.get("shared")])
        if shared:
            sbox.children.append(shared)
        root.children.append(sbox)
        core = next((c for c in (net.children if net else []) if c.style == "net:sw"), None)
        edges += [Edge(core, z) for z in lane.children] if core else []
    stats = {"view": "idc", "assets": len(assets), "servers": sum(1 for a in assets if device_kind(a) is None), "sites": sites, "aggregated": True}
    return root, edges, stats


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
        inner_w = max(widths, default=NODE_W)
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
        "notes": ["점선 화살표는 망구분·역할로 추정한 흐름입니다(실제 연결 데이터 아님).", "공통 서비스·IDC 네트워크는 센터 전체 기준 참조 표시입니다."],
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
        role = ROLE_LABELS.get(key) or {"svc": "공통 서비스", "": "기타/미분류"}.get(key, key.upper())
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
    if b.kind == "zone":
        stroke = _color(b.style, st) or stroke
    dashed = "dashed=1;" if b.kind in ("subnet", "band") else ""
    size = {"site": 15, "env": 13}.get(b.kind, 12)
    box = "rounded=0;whiteSpace=wrap;html=1;container=1;collapsible=0;align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;"
    return f"{box}fontSize={size};fontStyle=1;fillColor={fill};strokeColor={stroke};{dashed}{font}"


def _cell_value(b: Box) -> str:
    if b.kind == "title":
        return f"<b>{escape(b.label)}</b>" + (f"<br><font style=\"font-size:12px\" color=\"#525252\">{escape(b.sublabel)}</font>" if b.sublabel else "")
    sub = f"<br><font color=\"#525252\" style=\"font-weight:normal;font-size:10px\">{escape(b.sublabel)}</font>" if b.sublabel else ""
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
            istyle = f"shape={icon};html=1;fillColor={_color(b.style, st) or '#8d8d8d'};strokeColor=none;verticalLabelPosition=bottom;verticalAlign=top;"
            cells.append(f'<mxCell id="{b.id}i" value="" style="{istyle}" vertex="1" parent="{b.id}">{ig}</mxCell>')
    for e in edges:
        dash = "dashed=1;dashPattern=6 4;" if e.kind == "inferred" else ""
        (sx, sy), (tx, ty) = e.points[0], e.points[-1]
        s, t = e.source, e.target
        anchor = f"exitX={(sx - s.x) / s.w:.4f};exitY={(sy - s.y) / s.h:.4f};entryX={(tx - t.x) / t.w:.4f};entryY={(ty - t.y) / t.h:.4f};exitPerimeter=0;entryPerimeter=0;"
        style = f"edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;strokeColor={st['edge']};fontSize=10;{dash}{anchor}"
        mids = "".join(f'<mxPoint x="{x:g}" y="{y:g}"/>' for x, y in e.points[1:-1])
        ends = f'<mxPoint x="{sx:g}" y="{sy:g}" as="sourcePoint"/><mxPoint x="{tx:g}" y="{ty:g}" as="targetPoint"/>'
        geo = f'<mxGeometry relative="1" as="geometry">{ends}' + (f'<Array as="points">{mids}</Array>' if mids else "") + "</mxGeometry>"
        cells.append(f'<mxCell id="{e.id}" value={quoteattr(e.label)} style="{style}" edge="1" parent="1" source="{e.source.id}" target="{e.target.id}">{geo}</mxCell>')
    name = stats.get("name") or stats.get("view", "diagram")
    w, h = int(root.w) + 40, int(root.h) + 40
    return (
        '<mxfile host="onprem-atlas" agent="onprem-atlas" version="24.0.0">'
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
) -> tuple[dict[str, Any], str]:
    """(레이아웃 JSON, draw.io XML). 분류가 안 된 실행이면 먼저 분류한다."""
    from ..classify import ClassifyProfile, classify_run

    profile = profile or ClassifyProfile()
    if not store.is_classified(run_id):
        classify_run(store, profile, run_id)
    assets = store.classified_assets(run_id)
    run = store.run(run_id or store.latest_run_id() or 0) or {}
    if view == "idc":
        root, edges, stats = build_idc(assets, profile)
    elif view == "project":
        if not project:
            raise ValueError("project 보기는 프로젝트 코드가 필요합니다.")
        root, edges, stats = build_project(assets, project.lower(), profile, max_nodes=max_nodes)
    else:
        raise ValueError(f"알 수 없는 보기: {view} (idc | project)")
    stats["run"] = {k: run.get(k) for k in ("id", "source_name", "finished_at")}
    title = root.children[0]
    title.sublabel = f"동기화 실행 #{run.get('id')} · {run.get('source_name')}"
    title.label = f"{title.label} — 실행 #{run.get('id')}"
    layout(root, edges)
    st = copy.deepcopy(styles) if styles else DEFAULT_STYLES
    return to_layout(root, edges, stats, st), to_drawio(root, edges, stats, st)
