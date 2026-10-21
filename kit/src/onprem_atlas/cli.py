"""onprem-atlas 명령줄.

onprem-atlas inspect 자산목록.xlsx [--sheet 시트] [--profile 매핑.json]   # 값 없이 매핑·건수·문제 행 번호만
onprem-atlas import 자산목록.xlsx --db atlas.db [--sheet] [--profile]
onprem-atlas runs --db atlas.db
onprem-atlas search 키워드 --db atlas.db [--limit 20]
onprem-atlas issues --db atlas.db [--run N] [--severity error|warning] [--code CODE]
onprem-atlas diagram --db atlas.db --view idc|project [--project 코드] --out 구성도.drawio [--layout 레이아웃.json]
onprem-atlas synth --out 합성.xlsx [--count 5000] [--seed N]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from . import __version__
from .ingest import MappingProfile, file_sha256, parse_xlsx, sheet_names
from .store import AtlasStore

SHOWN_FIELDS = ("hostname", "ip", "system_name", "zone", "category", "os", "cpu_cores", "memory_gb")


def _emit(data: Any, as_json: bool, text: str) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str) if as_json else text)


def cmd_inspect(a: argparse.Namespace) -> int:
    profile = MappingProfile.load(a.profile)
    parsed = parse_xlsx(a.xlsx, profile, a.sheet)
    h = parsed.header
    codes = Counter(i.code for i in parsed.issues)
    report = {
        "sheet": parsed.sheet,
        "sheets": sheet_names(a.xlsx),
        "header_row": h.header_row,
        "mapping": {f: h.headers[i] for f, i in sorted(h.mapping.items(), key=lambda kv: kv[1])},
        "unmapped_headers": h.unmapped,
        "missing_profile_columns": h.missing_overrides,
        "assets": len(parsed.assets),
        "errors": parsed.error_count,
        "warnings": parsed.warning_count,
        "issue_codes": dict(sorted(codes.items())),
        "error_rows": [i.row_number for i in parsed.issues if i.severity == "error"][:50],
    }
    lines = [
        f"시트: {report['sheet']} (전체 {len(report['sheets'])}개: {', '.join(report['sheets'])}) · 헤더 행 {h.header_row}",
        "매핑:",
        *(f"  {f:<13} ← {name}" for f, name in report["mapping"].items()),
        f"매핑 안 된 헤더: {', '.join(h.unmapped) or '(없음)'}",
    ]
    if h.missing_overrides:
        lines.append(f"프로파일 지정 헤더 없음: {', '.join(h.missing_overrides)}")
    lines += [
        f"자산 {len(parsed.assets)}건 · 오류 {parsed.error_count}건 · 경고 {parsed.warning_count}건",
        *(f"  {c}: {n}" for c, n in sorted(codes.items())),
    ]
    if report["error_rows"]:
        lines.append(f"오류 행(최대 50): {', '.join(map(str, report['error_rows']))}")
    _emit(report, a.json, "\n".join(lines))
    return 0 if "hostname" in h.mapping else 1


def cmd_import(a: argparse.Namespace) -> int:
    profile = MappingProfile.load(a.profile)
    parsed = parse_xlsx(a.xlsx, profile, a.sheet)
    if "hostname" not in parsed.header.mapping:
        print("호스트명 컬럼을 찾지 못해 가져오지 않았습니다. `inspect`로 매핑을 확인하세요.", file=sys.stderr)
        return 1
    with AtlasStore(a.db) as store:
        run_id = store.import_parsed(parsed, source_name=Path(a.xlsx).name, source_sha256=file_sha256(a.xlsx), profile=profile)
        run = store.run(run_id) or {}
    summary = {k: run.get(k) for k in ("id", "source_name", "sheet", "row_count", "asset_count", "error_count", "warning_count", "finished_at")}
    text = (
        f"실행 #{run_id}: {summary['source_name']} / {summary['sheet']} — 행 {summary['row_count']} · 자산 {summary['asset_count']} · 오류 {summary['error_count']} · 경고 {summary['warning_count']}"
    )
    _emit(summary, a.json, text)
    return 0


def cmd_runs(a: argparse.Namespace) -> int:
    with AtlasStore(a.db) as store:
        runs = store.runs()
    lines = [f"#{r['id']} {r['finished_at']} {r['source_name']} / {r['sheet']} — 자산 {r['asset_count']} · 오류 {r['error_count']} · 경고 {r['warning_count']}" for r in runs]
    _emit(runs, a.json, "\n".join(lines) or "동기화 이력이 없습니다.")
    return 0


def cmd_search(a: argparse.Namespace) -> int:
    with AtlasStore(a.db) as store:
        result = store.search(a.query, a.limit)
    items = [{f: r.get(f) for f in SHOWN_FIELDS} for r in result["items"]]
    lines = [f"{result['total']}건 (표시 {len(items)})", *("  " + " · ".join(str(i[f] or "-") for f in SHOWN_FIELDS) for i in items)]
    _emit({"total": result["total"], "items": items}, a.json, "\n".join(lines))
    return 0


def cmd_issues(a: argparse.Namespace) -> int:
    with AtlasStore(a.db) as store:
        rows = store.issues(a.run, severity=a.severity, code=a.code, limit=a.limit)
    _emit(rows, a.json, "\n".join(f"{r['row_number']}행 [{r['severity']}] {r['code']}: {r['message']}" for r in rows) or "이슈 없음")
    return 0


def cmd_synth(a: argparse.Namespace) -> int:
    from .synth import drift_rows, generate_rows, write_xlsx

    rows = generate_rows(a.count, a.seed)
    print(f"합성 자산 {a.count}건 → {write_xlsx(a.out, rows)}")
    if a.drift_out:
        drifted = drift_rows(rows, a.seed + 1)
        print(f"다음 동기화 시점(삭제·변경·추가) {len(drifted)}건 → {write_xlsx(a.drift_out, drifted)}")
    return 0


def cmd_classify(a: argparse.Namespace) -> int:
    from .classify import ClassifyProfile, classify_run

    with AtlasStore(a.db) as store:
        summary = classify_run(store, ClassifyProfile.load(a.profile), a.run)
    src = summary["by_source"]
    text = (
        f"실행 #{summary['run_id']}: 자산 {summary['assets']} · 프로젝트 {summary['projects']} · 공통 인프라 {summary['shared_assets']}\n"
        f"  근거: 명명 규칙 {src.get('naming', 0)} · 시스템명 {src.get('column', 0)} · 수동 {src.get('manual', 0)} · 미분류 {src.get('unclassified', 0)}\n"
        f"  명명 규칙 위반 {summary['naming_violations']} · 근거 충돌 {summary['conflicts']}"
    )
    _emit(summary, a.json, text)
    return 0


def _ensure_classified(store: AtlasStore, profile_path: str | None = None) -> None:
    from .classify import ClassifyProfile, classify_run

    if not store.is_classified():
        classify_run(store, ClassifyProfile.load(profile_path))


def cmd_review(a: argparse.Namespace) -> int:
    from .review import review_run

    with AtlasStore(a.db) as store:
        _ensure_classified(store)
        result = review_run(store)
    findings = [f for f in result["findings"] if not a.rule or f["rule"] == a.rule]
    lines = [f"이관 준비도 {result['readiness_percent']}% (서버 {result['ready_servers']}/{result['servers']}, high 이슈 없는 서버 비율)"]
    lines += [f"  [{r['severity']}] {r['rule']} {r['title']}: {r['count']}" for r in result["rules"] if r["count"]]
    if a.rule:
        lines += [f"  {f['hostname']} · {f['detail']}" for f in findings[: a.limit]]
    _emit({**result, "findings": findings[: a.limit]}, a.json, "\n".join(lines))
    return 0


def cmd_diff(a: argparse.Namespace) -> int:
    from .diff import diff_runs

    with AtlasStore(a.db) as store:
        d = diff_runs(store, a.before, a.after)
    c = d["counts"]
    lines = [f"실행 #{d['before']} → #{d['after']}: 추가 {c['added']} · 삭제 {c['removed']} · 변경 {c['changed']} · 동일 {c['unchanged']}"]
    lines += [f"  변경 필드 {f}: {n}" for f, n in d["changed_fields"].items()]
    _emit({**d, "added": d["added"][: a.limit], "removed": d["removed"][: a.limit], "changed": d["changed"][: a.limit]}, a.json, "\n".join(lines))
    return 0


def cmd_diagram(a: argparse.Namespace) -> int:
    from .classify import ClassifyProfile
    from .diagram import render

    with AtlasStore(a.db) as store:
        layout, xml = render(store, a.view, project=a.project, profile=ClassifyProfile.load(a.profile), max_nodes=a.max_nodes, run_id=a.run)
    Path(a.out).write_text(xml, encoding="utf-8")
    if a.layout:
        Path(a.layout).write_text(json.dumps(layout, ensure_ascii=False, indent=1), encoding="utf-8")
    st = layout["stats"]
    shown = f"표시 {st['shown']}/{st['servers']}대{' (역할별 집계)' if st['aggregated'] else ''}" if a.view == "project" else f"자산 {st['assets']}대 집계"
    _emit({"out": a.out, **st}, a.json, f"{a.out}: {a.view} 구성도 · {shown} · 상자 {len(layout['boxes'])} · 화살표 {len(layout['edges'])}")
    return 0


def cmd_serve(a: argparse.Namespace) -> int:
    try:
        import uvicorn

        from .classify import ClassifyProfile
        from .web import create_app
    except ImportError:
        print("웹 의존성이 없습니다: pip install 'onprem-atlas[web]'", file=sys.stderr)
        return 2
    uvicorn.run(create_app(a.db, ClassifyProfile.load(a.profile)), host=a.host, port=a.port, log_level="warning")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="onprem-atlas", description="ESM 자산 엑셀 → SQLite")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp: argparse.ArgumentParser, db: bool = True) -> None:
        if db:
            sp.add_argument("--db", required=True, help="SQLite 파일 경로")
        sp.add_argument("--json", action="store_true", help="JSON으로 출력")

    sp = sub.add_parser("inspect", help="매핑·건수·문제 행 번호 점검(값 미출력)")
    sp.add_argument("xlsx")
    sp.add_argument("--sheet")
    sp.add_argument("--profile")
    common(sp, db=False)
    sp.set_defaults(func=cmd_inspect)

    sp = sub.add_parser("import", help="엑셀을 동기화 실행 하나로 저장")
    sp.add_argument("xlsx")
    sp.add_argument("--sheet")
    sp.add_argument("--profile")
    common(sp)
    sp.set_defaults(func=cmd_import)

    sp = sub.add_parser("runs", help="동기화 이력")
    common(sp)
    sp.set_defaults(func=cmd_runs)

    sp = sub.add_parser("search", help="최신 실행 키워드 검색")
    sp.add_argument("query")
    sp.add_argument("--limit", type=int, default=20)
    common(sp)
    sp.set_defaults(func=cmd_search)

    sp = sub.add_parser("issues", help="검증 이슈")
    sp.add_argument("--run", type=int)
    sp.add_argument("--severity", choices=["error", "warning"])
    sp.add_argument("--code")
    sp.add_argument("--limit", type=int, default=200)
    common(sp)
    sp.set_defaults(func=cmd_issues)

    sp = sub.add_parser("classify", help="프로젝트 분류")
    sp.add_argument("--profile", help="분류 프로파일 JSON (명명 규칙·공통 인프라·수동 지정)")
    sp.add_argument("--run", type=int)
    common(sp)
    sp.set_defaults(func=cmd_classify)

    sp = sub.add_parser("review", help="데이터 품질·이관 준비도")
    sp.add_argument("--rule")
    sp.add_argument("--limit", type=int, default=50)
    common(sp)
    sp.set_defaults(func=cmd_review)

    sp = sub.add_parser("diff", help="동기화 실행 간 변경")
    sp.add_argument("--before", type=int)
    sp.add_argument("--after", type=int)
    sp.add_argument("--limit", type=int, default=50)
    common(sp)
    sp.set_defaults(func=cmd_diff)

    sp = sub.add_parser("diagram", help="IDC·프로젝트 구성도(draw.io)")
    sp.add_argument("--view", choices=["idc", "project"], default="project")
    sp.add_argument("--project", help="프로젝트 코드 (project 보기)")
    sp.add_argument("--out", required=True, help=".drawio 출력 경로")
    sp.add_argument("--layout", help="레이아웃 JSON도 저장")
    sp.add_argument("--max-nodes", type=int, default=60, help="넘으면 역할별 집계")
    sp.add_argument("--profile", help="분류 프로파일 JSON")
    sp.add_argument("--run", type=int)
    common(sp)
    sp.set_defaults(func=cmd_diagram)

    sp = sub.add_parser("serve", help="읽기 전용 HTTP API")
    sp.add_argument("--host", default="127.0.0.1")
    sp.add_argument("--port", type=int, default=8770)
    sp.add_argument("--profile", help="분류 프로파일 JSON")
    common(sp)
    sp.set_defaults(func=cmd_serve)

    sp = sub.add_parser("synth", help="합성 ESM 엑셀 생성")
    sp.add_argument("--out", required=True)
    sp.add_argument("--count", type=int, default=5000)
    sp.add_argument("--seed", type=int, default=20261021)
    sp.add_argument("--drift-out", help="다음 동기화 시점 엑셀도 함께 생성")
    sp.set_defaults(func=cmd_synth)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (ValueError, FileNotFoundError) as e:
        print(f"오류: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
