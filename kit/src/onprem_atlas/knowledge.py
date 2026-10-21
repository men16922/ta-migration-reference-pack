"""Versioned knowledge store, separate from operational assets. No model calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

from .store import utc_now


class KnowledgeStore:
    def __init__(self, path: str | Path, *, read_only: bool = False):
        if read_only:
            self.conn = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("PRAGMA query_only = ON")
            return
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
              id INTEGER PRIMARY KEY, document_key TEXT NOT NULL, version INTEGER NOT NULL,
              title TEXT NOT NULL, source_uri TEXT NOT NULL, content TEXT NOT NULL,
              sha256 TEXT NOT NULL, recorded_at TEXT NOT NULL, UNIQUE(document_key, version)
            );
            CREATE TABLE IF NOT EXISTS document_groups (
              document_key TEXT NOT NULL, group_id TEXT NOT NULL, PRIMARY KEY(document_key, group_id)
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, content, tokenize='trigram');
        """)

    def close(self):
        self.conn.close()

    def ingest(self, *, source_uri: str, title: str, content: str, groups: frozenset[str]) -> dict:
        if not groups or not title.strip() or not source_uri.strip() or not content.strip():
            raise ValueError("문서 제목·출처·본문·접근 그룹이 필요합니다.")
        if len(content.encode()) > 2 * 1024 * 1024:
            raise ValueError("지식 문서는 2MB 이하여야 합니다.")
        key = hashlib.sha256(source_uri.encode()).hexdigest()
        sha = hashlib.sha256(content.encode()).hexdigest()
        with self.conn:
            self.conn.execute("BEGIN IMMEDIATE")
            prior = self.conn.execute("SELECT * FROM documents WHERE document_key = ? ORDER BY version DESC LIMIT 1", (key,)).fetchone()
            self.conn.execute("DELETE FROM document_groups WHERE document_key = ?", (key,))
            self.conn.executemany("INSERT INTO document_groups VALUES (?,?)", [(key, g) for g in sorted(groups)])
            if prior and prior["sha256"] == sha and prior["title"] == title:
                return self._result(prior, include_content=False)
            version = prior["version"] + 1 if prior else 1
            cur = self.conn.execute("INSERT INTO documents (document_key, version, title, source_uri, content, sha256, recorded_at) VALUES (?,?,?,?,?,?,?)",
                                    (key, version, title, source_uri, content, sha, utc_now()))
            self.conn.execute("INSERT INTO knowledge_fts (rowid, title, content) VALUES (?,?,?)", (cur.lastrowid, title, content))
            row = self.conn.execute("SELECT * FROM documents WHERE id = ?", (cur.lastrowid,)).fetchone()
            return self._result(row, include_content=False)

    @staticmethod
    def _result(row: sqlite3.Row, *, include_content: bool) -> dict:
        result = {k: row[k] for k in ("id", "version", "title", "source_uri", "sha256", "recorded_at")}
        result["citation"] = f"knowledge:{row['id']}@v{row['version']}"
        result["content" if include_content else "excerpt"] = row["content"] if include_content else row["content"][:500]
        return result

    @staticmethod
    def _access(groups: frozenset[str]) -> tuple[str, list[str]]:
        if not groups:
            return "0", []
        marks = ",".join("?" for _ in groups)
        return f"EXISTS (SELECT 1 FROM document_groups g WHERE g.document_key = d.document_key AND g.group_id IN ({marks}))", sorted(groups)

    def search(self, query: str, *, groups: frozenset[str], limit: int = 10) -> dict:
        terms = re.findall(r"[\w.-]+", query[:1000])[:12]
        if not terms or not groups:
            return {"total": 0, "items": []}
        access, args = self._access(groups)
        # Literal matching also supports two-character Korean words. Never interpolate query SQL.
        clauses = []
        long_terms = [term for term in terms if len(term) >= 3]
        if long_terms:
            clauses.append("d.id IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?)")
            args.append(" OR ".join('"' + term.replace('"', '""') + '"' for term in long_terms))
        for term in (term for term in terms if len(term) < 3):
            clauses.append("(d.title LIKE ? ESCAPE '\\' OR d.content LIKE ? ESCAPE '\\')")
            literal = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            args.extend([literal, literal])
        where = f"{access} AND d.version = (SELECT MAX(v.version) FROM documents v WHERE v.document_key = d.document_key) AND ({' OR '.join(clauses)})"
        total = self.conn.execute(f"SELECT COUNT(*) FROM documents d WHERE {where}", args).fetchone()[0]
        rows = self.conn.execute(f"SELECT d.* FROM documents d WHERE {where} ORDER BY d.recorded_at DESC, d.id DESC LIMIT ?", (*args, min(max(limit, 1), 20))).fetchall()
        return {"total": total, "items": [self._result(row, include_content=False) for row in rows]}

    def read(self, document_id: int, *, groups: frozenset[str]) -> dict | None:
        access, args = self._access(groups)
        row = self.conn.execute(f"SELECT d.* FROM documents d WHERE d.id = ? AND {access}", [document_id, *args]).fetchone()
        return self._result(row, include_content=True) if row else None


def main() -> int:
    parser = argparse.ArgumentParser(description="별도 지식 저장소 등록·검색 (로컬 관리자용)")
    parser.add_argument("--db", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import")
    imp.add_argument("file")
    imp.add_argument("--title", required=True)
    imp.add_argument("--source", required=True)
    imp.add_argument("--group", action="append", required=True)
    search = sub.add_parser("search")
    search.add_argument("query")
    search.add_argument("--group", action="append", required=True)
    args = parser.parse_args()
    store = KnowledgeStore(args.db)
    try:
        groups = frozenset(args.group)
        if args.command == "import":
            path = Path(args.file)
            if path.suffix.lower() not in (".md", ".txt") or path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("2MB 이하 Markdown 또는 텍스트를 선택하세요.")
            result = store.ingest(source_uri=args.source, title=args.title, content=path.read_text(encoding="utf-8"), groups=groups)
        else:
            result = store.search(args.query, groups=groups)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
