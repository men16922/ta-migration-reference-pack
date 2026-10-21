# 01. 제품 범위 — 메뉴가 하는 일

> **요약**: ESM Excel을 올려 온프렘 IDC 자산을 최신으로 유지하고, 대시보드와 IDC/업무 구성도로 보여주는 메뉴다. 네트워크 통신 분석·이관 점수는 하지 않는다.
> **근거 소스**: `docs/plans/2026-10-21-enterprise-idc-tool.md`, `docs/DECISIONS.md`, `docs/evaluation.md`, `src/console/nav.ts`
> **관련 페이지**: [12](12-auto-incremental-sync.md), [30](30-dashboard.md), [31](31-diagram-engine.md), [33](33-ui-pages-and-menu.md)

## 사용자와 업무 흐름

사용자는 인프라 운영·IDC 담당자다. ESM(자산관리 시스템)에 SSO로 로그인해 목록을 Excel로 내려받는 것까지는 사람이 한다. 그 이후는 메뉴가 자동으로 처리한다.

```text
ESM에서 Excel 다운로드 (사람)
  → 메뉴에서 여러 파일 업로드
  → 시트 종류 자동 판별 + 헤더 매핑 + 검증
  → 자동 증분 동기화 (같은 자산은 최신 값으로 덮어씀, 없는 자산은 유지)
  → 대시보드 / IDC 구성도 / 업무 시스템 / 자산·인스턴스 / 변경 이력
```

## 원천(source) 6종

ESM 목록 종류가 곧 원천이다. 원천은 서로의 데이터를 지우지 않는다.

| source_id | 이름 | 레코드 종류 | 비고 |
|---|---|---|---|
| `servers` | 서버 목록 | 자산(asset) | 장비 범주가 비면 `서버` |
| `equipment` | 네트워크·스토리지·백업 장비 목록 | 자산 | 장비 범주가 비면 `미분류 장비` |
| `security` | 보안장비 목록 | 자산 | 장비 범주가 비면 `보안장비`. `솔루션 유형` → 세부분류 |
| `web` | WEB 인스턴스 목록 | 인스턴스(component) | 제품·URL·PORT |
| `was` | WAS 인스턴스 목록 | 인스턴스 | 제품·PORT |
| `db` | DB 인스턴스 목록 | 인스턴스 | 제품·SID·PORT·이중화 방식 |

근거: `kit/src/onprem_atlas/web/imports.py:source_defaults`, `kit/src/onprem_atlas/components.py:SOURCES`.

## 포함 (포팅 대상)

| 기능 | 현재 구현 | 포팅 시 |
|---|---|---|
| Excel 등록 | 파일 1개, 원천 수동 선택, 미리보기 → 확정 | **다중 파일 자동 동기화로 변경** ([12](12-auto-incremental-sync.md)) |
| 대시보드 | KPI 4개 + 업무별 자산 + 센터별 자산 | 그대로 + 제안 위젯 선택 ([30](30-dashboard.md)) |
| IDC 구성도 | 센터별 장비·WEB/WAS/DB 집계, SVG + `.drawio` | 그대로 ([31](31-diagram-engine.md)) |
| 업무 시스템 | 목록, 상세(구성도 탭·자산 탭) | 그대로 |
| 자산 목록·상세 | 검색, 원본 행·출처 확인 | 그대로 |
| WEB·WAS·DB | 인스턴스 목록, 서버 연결 상태 | 그대로 |
| 등록·변경 이력 | 실행 목록, 직전 대비 추가/삭제/변경 | 배치 단위 이력으로 변경 ([12](12-auto-incremental-sync.md#7-변경-이력-모델)) |
| draw.io 수동 편집 | 로컬 draw.io 임베드, 편집본 이력 | **선택**(D-10) ([32](32-diagram-editor-drawio.md)) |

## 제외 (다시 만들지 않음)

- 이관 준비도 점수·검토 규칙 화면 (`review` 모듈, `/api/review`, `summary.readiness`) — 제품에서 제거된 기능이다.
- FPMS·네트워크 실험실·방화벽 자동 허용·벤더 CLI·정책 감사·AWS 이관 시뮬레이션.
- IP만으로 `/24` 서브넷·보안존·통신선을 추정하는 기능.
- 지식 저장소(`knowledge.py`)와 Agent 도구(`agent_tools.py`) — 이 메뉴 범위 밖. 필요하면 별도 과제로 한다.
- Zabbix/ESM 사용률 수집 — 미구현이며 범위 밖.
- 랙 실장도·케이블 연결도 — 근거 데이터가 없다.

## 비기능 요구

- 50,000행·256열 이하, 파일당 20MB 이하(압축 해제 100MB 이하). 근거: `ingest/xlsx.py:read_sheet`, `web/imports.py:MAX_FILE`.
- 5,000행 등록이 5초 이내(D-12). 근거: `kit/tests/test_store.py:test_5000_assets_import_under_5_seconds`.
- 구성도는 같은 입력이면 같은 좌표·같은 XML. 근거: `kit/tests/test_diagram.py:test_project_diagram_deterministic_fast_and_complete`.
- 모든 자산은 원본 파일·시트·행으로 거슬러 올라갈 수 있어야 한다(출처 보존).
