# 20. API 계약 — 현재와 메뉴용 목표

> **요약**: 현재 API는 `/api/*`(조회) + `/api/imports/*`(등록) + `/api/documents`(편집본)이다. 메뉴로 옮길 때는 호스트 API 규칙(접두사·인증·오류 형식)에 맞추되, **조회 응답의 필드 이름과 의미는 유지**해 화면 이식을 쉽게 한다. 등록 API는 배치 동기화 API로 바꾼다.
> **근거 소스**: `kit/src/onprem_atlas/web/__init__.py`, `web/imports.py`, `web/documents.py`, `src/console/api.ts`, [fixtures/api](fixtures/README.md)
> **관련 페이지**: [12](12-auto-incremental-sync.md), [30](30-dashboard.md), [31](31-diagram-engine.md), [41](41-host-integration.md)

아래에서 `{base}`는 호스트에서 정할 접두사다(예: `/api/idc`, D-11). 응답 예시는 `docs/wiki/fixtures/api/*.json`에 실제 합성 응답으로 있다(`scripts/wiki_samples.py`로 재생성).

## 1. 현재 조회 API → 목표

| 현재 | 목표 | 응답 핵심 | 샘플 | 비고 |
|---|---|---|---|---|
| `GET /api/workspace` | `GET {base}/workspace` | `{has_assets}` | — | 빈 상태 화면 분기 |
| `GET /api/summary` | `GET {base}/summary` | run, assets, projects, components, sites, last_diff, runs | [summary.json](fixtures/api/summary.json) | 아래 §2 변경 |
| `GET /api/projects?q&page&page_size` | `GET {base}/projects` | `Page<ProjectRow>` | [projects.json](fixtures/api/projects.json) | `readiness`, `issues` 제거 |
| `GET /api/assets?q&project&zone&page&page_size` | `GET {base}/assets` | `Page<AssetRow>` | [assets.json](fixtures/api/assets.json) | 내부 열(`run_id`, `rule_id`, `naming_ok`, `conflict`, `site_code`) 제거 가능 |
| `GET /api/asset?key` | `GET {base}/assets/{key}` | asset, source, row_number, raw[], issues[], components[] | [asset-detail.json](fixtures/api/asset-detail.json) | 키에 `\|`가 있어 URL 인코딩 필수 |
| `GET /api/components?q&kind&project&page&page_size` | `GET {base}/components` | `Page<Component>` | [components.json](fixtures/api/components.json) | 기본 page_size 50 |
| `GET /api/component?key` | `GET {base}/components/{key}` | 자산 상세와 같은 형태 | — | |
| `GET /api/runs` | `GET {base}/sync/batches` | 배치 목록 | [runs.json](fixtures/api/runs.json) | 실행 → 배치 |
| `GET /api/diff?before&after&limit` | `GET {base}/sync/batches/{id}/changes` | added/removed/changed, counts, changed_fields | [diff.json](fixtures/api/diff.json) | 변경 로그 기반 |
| `GET /api/diagram/idc?format=json\|drawio` | `GET {base}/diagrams/idc` | 레이아웃 JSON 또는 `.drawio` | [diagram-idc.json](fixtures/api/diagram-idc.json) | [31](31-diagram-engine.md) |
| `GET /api/diagram/project/{code}?format&max_nodes` | `GET {base}/diagrams/projects/{code}` | 레이아웃 JSON 또는 `.drawio` | [diagram-project.json](fixtures/api/diagram-project.json), [.drawio](fixtures/api/diagram-project.drawio) | `max_nodes` 1~500, 기본 60 |
| `GET /api/review` | 제거 | — | — | 이관 준비도 기능 제외 |

공통: 목록은 `{total, page, page_size, items}`. 페이지는 1부터. 오류는 현재 `{"detail": "한국어 메시지"}` — 호스트 오류 형식으로 바꾸되 사용자에게 보일 한국어 메시지는 유지한다.

## 2. `summary` 목표 형태

```json
{
  "dataset_version": 17,
  "last_batch": { "id": 42, "finished_at": "2026-10-22T00:00:00Z", "files": 3, "status": "applied" },
  "assets": { "total": 7, "servers": 3, "devices": 4, "shared": 0, "unclassified": 4 },
  "projects": 1,
  "components": { "total": 3, "unmatched": 0 },
  "sites": [["시험센터", 7]],
  "device_kinds": [["fw", 1], ["security", 1], ["sw", 1], ["storage", 1]],
  "last_change": { "batch_id": 41, "added": 0, "removed": 0, "changed": 1, "changed_fields": { "memory_gb": 1 } },
  "recent_batches": [ { "id": 42, "finished_at": "…", "status": "no_change", "added": 0, "changed": 0 } ]
}
```

- `assets.network`(현재 이름)은 서버가 아닌 모든 장비(네트워크·보안·스토리지·백업)라서 `devices`로 바꾼다. 화면 이식 시 함께 바꾼다.
- `readiness`, `by_severity`, `top_rules`, `zones`, `envs`는 현재 화면이 쓰지 않으므로 제거한다.
- `device_kinds`는 제안 위젯용 신규 필드다(선택). 계산은 [31](31-diagram-engine.md#장비-종류-판별-device_kind)의 `device_kind`.
- `sites`는 현재 `site` 값 그대로 센다(그룹사 접두 없음). 구성도는 `그룹사 / 설치지역`으로 묶는다. 둘을 맞추려면 D-14와 함께 결정한다.

## 3. 동기화 API (신규)

| 메서드·경로 | 권한 | 요청 | 응답 |
|---|---|---|---|
| `POST {base}/sync/batches` | `idc.editor` | multipart: `files[]`(xlsx), `meta`(JSON: `client_token`, `files:[{name,last_modified}]`, `options:{full_snapshot_sources:[]}`) | `200 BatchReport` 또는 비동기면 `202 {batch_id}`(D-15) |
| `GET {base}/sync/batches?page&page_size` | `idc.viewer` | — | `Page<BatchSummary>` |
| `GET {base}/sync/batches/{id}` | `idc.viewer` | — | `BatchReport` |
| `GET {base}/sync/batches/{id}/changes?record_type&op&page` | `idc.viewer` | — | `Page<Change>` + counts |
| `GET {base}/sync/batches/{id}/issues?sheet_id&severity&page` | `idc.viewer` | — | `Page<Issue>` |
| `GET {base}/sync/sheets/{sheet_id}/headers` | `idc.editor` | — | `{sheets, header_row, headers, mapping, fields}` (매핑 지정 화면용) |
| `PUT {base}/sync/sheets/{sheet_id}/mapping` | `idc.editor` | `{source_id, columns, header_row?, memory_unit?}` | 저장 후 해당 시트 재적용 결과 `BatchReport` |

`BatchReport` 형식은 [12 §8](12-auto-incremental-sync.md#8-응답-batchreport). 필드 목록·라벨은 [10](10-data-model.md).

`full_snapshot_sources`는 `idc.admin`만 허용한다(D-06).

## 4. 구성도 편집본 API (선택, D-10)

| 현재 | 목표 | 비고 |
|---|---|---|
| `GET /api/documents/editor` | `GET {base}/diagram-documents/editor` | 편집기 사용 가능 여부 |
| `GET /api/documents?project&revision&generated` | `GET {base}/diagram-documents?scope&revision&generated` | `{xml, revision, loaded_revision, base_run, current_run, stale, history[]}` → `base_run/current_run`을 `base_dataset_version/current_dataset_version`으로 |
| `PUT /api/documents?project` | `PUT {base}/diagram-documents?scope` | `{xml, revision, base_dataset_version}`. 최신 revision이 다르면 409 |
| `GET /api/documents/download` | `GET {base}/diagram-documents/download` | `.drawio` 첨부 |

상세는 [32](32-diagram-editor-drawio.md).

## 5. 프런트엔드 타입

`src/console/api.ts`의 `Summary`, `ProjectRow`, `AssetRow`, `DiffResult`, `DiagramBox`, `DiagramLayout`을 호스트 타입 위치로 옮기고 §2 변경을 반영한다. `ENV_LABELS = {p: '운영', d: '개발', s: '스테이징'}`, `fmt`(ko-KR 천 단위), `fmtTime`(UTC → 현지, 24시간)도 함께 옮긴다.
