"""ingest: ESM xlsx → 정규화 자산. 의존성은 openpyxl 하나."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .mapping import FIELDS, SYNONYMS, HeaderMatch, MappingProfile, detect_header
from .validate import ERROR, WARNING, Asset, Issue, hostname_key, normalize_rows
from .xlsx import Sheet, file_sha256, read_sheet, sheet_names

__all__ = [
    "ERROR",
    "FIELDS",
    "SYNONYMS",
    "WARNING",
    "Asset",
    "HeaderMatch",
    "Issue",
    "MappingProfile",
    "ParsedSheet",
    "Sheet",
    "detect_header",
    "file_sha256",
    "hostname_key",
    "normalize_rows",
    "parse_rows",
    "parse_xlsx",
    "read_sheet",
    "sheet_names",
]


@dataclass
class ParsedSheet:
    sheet: str
    header: HeaderMatch
    rows: list[list[str]]
    assets: list[Asset]
    issues: list[Issue]

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == WARNING)


def parse_rows(rows: list[list[str]], profile: MappingProfile | None = None, sheet: str = "") -> ParsedSheet:
    profile = profile or MappingProfile()
    header = detect_header(rows, profile)
    assets, issues = normalize_rows(rows, header, profile)
    return ParsedSheet(sheet, header, rows, assets, issues)


def parse_xlsx(path: str | Path, profile: MappingProfile | None = None, sheet: str | None = None) -> ParsedSheet:
    profile = profile or MappingProfile()
    data = read_sheet(path, sheet or profile.sheet)
    return parse_rows(data.rows, profile, data.name)
