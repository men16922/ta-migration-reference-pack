"""Create and verify a portable local backup without overwriting any workspace."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

from .store import utc_now


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def create_backup(assets: Path, destination: Path, knowledge: Path | None = None) -> dict:
    if not assets.is_file() or (knowledge and not knowledge.is_file()):
        raise ValueError("원본 DB를 찾을 수 없습니다.")
    destination.mkdir(parents=True, exist_ok=False)
    files = []
    for source, name in [(assets, "atlas.db"), *([(knowledge, "knowledge.db")] if knowledge else [])]:
        with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as src, sqlite3.connect(destination / name) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("DB 무결성 검증 실패")
        files.append(name)
    # Raw rows are already in SQLite; preserve uploaded Excel originals as well.
    with sqlite3.connect(destination / "atlas.db") as db:
        uploads = db.execute("SELECT token, path, sha256 FROM pending_imports").fetchall()
        for token, path, sha in uploads:
            src = assets.resolve().parent / "imports" / Path(path).name
            if not src.is_file() or digest(src) != sha:
                raise ValueError(f"등록 원본 파일 무결성 확인 실패: {token}")
            folder = destination / "imports"
            folder.mkdir(mode=0o700, exist_ok=True)
            name = f"imports/{token}.xlsx"
            shutil.copyfile(src, destination / name)
            (destination / name).chmod(0o600)
            db.execute("UPDATE pending_imports SET path = ? WHERE token = ?", (f"{token}.xlsx", token))
            files.append(name)
    manifest = {"version": 1, "created_at": utc_now(), "files": {name: digest(destination / name) for name in files}}
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return verify_backup(destination)


def verify_backup(folder: Path) -> dict:
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or "atlas.db" not in manifest.get("files", {}):
        raise ValueError("지원하지 않는 백업 형식")
    for name, sha in manifest["files"].items():
        path = (folder / name).resolve()
        if not path.is_relative_to(folder.resolve()) or not path.is_file() or digest(path) != sha:
            raise ValueError(f"백업 파일 검증 실패: {name}")
        if name.endswith(".db"):
            with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
                if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError(f"DB 무결성 검증 실패: {name}")
    return {"verified": True, "files": len(manifest["files"]), "created_at": manifest["created_at"]}


def main() -> int:
    p = argparse.ArgumentParser(description="로컬 자산/지식 저장소 백업 및 검증")
    sub = p.add_subparsers(dest="command", required=True)
    backup = sub.add_parser("create")
    backup.add_argument("--assets", type=Path, required=True)
    backup.add_argument("--knowledge", type=Path)
    backup.add_argument("--out", type=Path, required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("folder", type=Path)
    args = p.parse_args()
    result = create_backup(args.assets, args.out, args.knowledge) if args.command == "create" else verify_backup(args.folder)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
