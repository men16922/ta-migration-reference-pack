"""Shared diagram geometry, independent of inventory and rendering."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

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


