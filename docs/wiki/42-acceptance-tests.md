# 42. 인수 테스트 매트릭스

> **요약**: 단계별로 통과해야 할 테스트 ID 목록이다. "기준"은 현재 저장소에서 같은 의미를 검증하는 테스트이며, 호스트 테스트 도구로 옮겨 쓴다. TO-BE 동기화는 [fixtures/sync-scenarios.json](fixtures/sync-scenarios.json)을 데이터 주도 테스트로 돌린다.
> **근거 소스**: `kit/tests/*.py`, `src/console/__tests__/*.tsx`, [fixtures](fixtures/README.md)
> **관련 페이지**: [40](40-porting-playbook.md)

## 키·수집 (P1·P2)

| ID | 검증 내용 | 기준 |
|---|---|---|
| KEY-01 | 그룹사가 있으면 `org\|site\|host` 소문자 키, 없으면 호스트명 소문자 | [10](10-data-model.md) 실측 예 |
| KEY-02 | 인스턴스 키가 `component-54c0a5b87449beefb3217903`(S12 WAS 행)와 일치(기존 데이터 이관 시) | `fixtures/sync-scenarios.json` S12 |
| KEY-03 | 업무 코드 `합성조직/지원/업무/합성 ERP` → `biz-bd93128d732c` | [14](14-business-classification.md) |
| ING-01 | 제목·빈 행 뒤 헤더 탐지(3행) | S16, `test_ingest.py:test_header_detection_skips_title_rows_and_reports_unmapped` |
| ING-02 | 동의어 매핑, 대소문자·공백 정규화, 매핑 프로파일 덮어쓰기 | `test_enterprise_import.py:test_scoped_duplicate_hostname_and_mapping_override` |
| ING-03 | 대표/관리/서비스 IP 분리, 여러 IP, 잘못된 IP | `test_company_headers_are_distinct_and_preserved` |
| ING-04 | CPU `2 x 8`=16, 메모리 단위(`64GB`, 단위 없는 32768 → 32GB + 경고) | `test_ingest.py:test_parse_memory`, `test_parse_numbers_and_ips` |
| ING-05 | 셀 문자열 규칙(불리언 Y/N, 정수 실수, 날짜) | `test_ingest.py:test_cell_text` |
| ING-06 | 잘못된 파일·`.xls`·20MB 초과·zip bomb·50,000행 초과 거부 | 잘못된 파일만 기존 테스트(`test_duplicate_conflict_empty_and_malformed_are_not_committable`). 나머지는 신규 |
| CMP-01 | 인스턴스가 서버 수를 늘리지 않고, 서버 갱신 후에도 남음 | `test_components.py:test_instance_rows_coexist_without_inflating_hosts_and_survive_asset_updates` |
| CMP-02 | 동명 서버 2개면 `ambiguous`, 없으면 `unmatched` | `test_unmatched_and_ambiguous_hosts_are_not_guessed` |
| CMP-03 | 포트 범위·제품·엔드포인트 누락 검증 | `test_duplicate_instances_and_invalid_ports_block_commit` |
| CMP-04 | 보안장비 유형 보존, 방화벽만 `fw` | `test_security.py` |

## 동기화·분류 (P3)

| ID | 검증 내용 | 기준 |
|---|---|---|
| SYNC-01~19 | `sync-scenarios.json`의 S01~S19 | 신규 |
| SYNC-20 | 동시에 두 배치를 보내도 직렬 적용, 결과는 순차 적용과 같음 | `test_concurrent_confirm_only_creates_one_run` |
| SYNC-21 | 적용 중 분류 단계에서 예외 → 아무것도 바뀌지 않음, 같은 토큰으로 재시도 성공 | `test_classification_failure_rolls_back_registration_and_allows_retry` |
| SYNC-22 | 적용 중인 배치의 데이터가 다른 조회에 보이지 않음 | `test_readers_do_not_see_snapshot_until_classification_completes` |
| SYNC-23 | 원천 간 데이터 보존(보안장비 등록이 서버를 지우지 않음) | `test_multiple_sources_partial_update_replace_and_provenance` |
| SYNC-24 | 자산 상세에서 원본 파일·시트·행·원문 값 확인 | `test_multiple_sources_partial_update_replace_and_provenance` |
| SYNC-25 | `needs_mapping` 시트에 매핑 지정 → 재적용, 같은 헤더의 다음 파일은 자동 판별(`profile:`) | 신규 |
| CLS-01 | 기본 설정에서 호스트명으로 업무를 추정하지 않음 | `test_default_registration_does_not_infer_from_demo_hostnames` |
| CLS-02 | 설정된 분류 프로파일(수동 지정)이 동기화에 적용됨 | `test_web_registration_uses_configured_classification_profile` |
| CLS-03 | `용도=운영` → env `p`, 시스템명으로 쓰지 않음 | `test_company_headers_are_distinct_and_preserved` |
| CLS-04 | 인스턴스 업무 코드는 자기 ITSM 계층, 없으면 연결 서버 업무 | `store.components` |

## API·구성도 (P4·P5)

| ID | 검증 내용 | 기준 |
|---|---|---|
| API-01 | `summary` 값이 [fixtures/api/summary.json](fixtures/api/summary.json)과 같은 의미(자산 7, 서버 3, 업무 1, 인스턴스 3, 연결 미확인 0) — 같은 입력 6건 적용 후 | `scripts/wiki_samples.py` 입력 |
| API-02 | `projects`, `assets`, `components` 페이지·검색·필터 | `test_web.py:test_projects_assets_review_runs_diff` |
| API-03 | 데이터가 없을 때 조회 API는 404 또는 빈 상태 응답 | `test_web.py:test_empty_db_returns_404` |
| API-04 | 실제 서버(병렬 요청)에서 모든 조회 API 200 | `test_web.py:test_real_uvicorn_server_serves_all_endpoints` |
| DIA-01 | 부모 이탈·형제 겹침·셀 ID 중복 없음 | `test_diagram.py:assert_geometry` |
| DIA-02 | 같은 입력 두 번 → 레이아웃·XML 동일 | `test_project_diagram_deterministic_fast_and_complete` |
| DIA-03 | 모든 leaf에 아이콘, `.drawio` 자식 좌표가 부모 기준 | `test_drawio_icons_on_every_leaf_node`, `test_drawio_cells_relative_to_parent` |
| DIA-04 | 업무 보기에서 노드 > max_nodes면 집계 | `test_project_aggregates_over_max_nodes` |
| DIA-05 | IDC 보기에서 모든 서버가 정확히 한 번 집계 | `test_idc_diagram_counts_every_server_once` |
| DIA-06 | 기재된 이중화만 선으로, IP 기반 선·서브넷 없음 | `test_explicit_business_ha_and_no_invented_network` |
| DIA-07 | [fixtures/api/diagram-project.json](fixtures/api/diagram-project.json)과 같은 상자 트리(제목, 센터, 장비 밴드 4종, WEB 2, WAS 비어 있음, DB 1) | 신규 |
| DIA-08 | 5,000행 데이터에서 구성도 계산이 시간 내(기준 테스트의 한도) | `test_project_diagram_deterministic_fast_and_complete` |

## 화면·권한·성능 (P6~P8)

| ID | 검증 내용 | 기준 |
|---|---|---|
| UI-01 | 메뉴와 7개 화면 이동, URL 직접 진입·새로고침 | `Console.test.tsx` |
| UI-02 | 자산 없음 → 빈 상태 안내, 동기화 화면은 열림 | `src/App.tsx` |
| UI-03 | 다중 파일 업로드 → 결과 표, `needs_mapping` 매핑 지정 | `Import.test.tsx`(현재 단일 파일 흐름 기준) |
| UI-04 | 구성도: IDC/업무 전환, 확대·맞춤, 노드 선택 상세, `.drawio` 내려받기 | `DiagramPage.tsx` |
| DASH-01 | KPI 4개 값·이동, 업무별 자산 → 상세, 센터별 분포 % | `Console.test.tsx` |
| DOC-01~02 | (선택) 편집본 추가 전용·409·stale, 저장 경합 시 미저장 유지 | `test_documents.py`, `DrawioEditor.test.tsx` |
| SEC-01 | viewer는 업로드 403, editor는 범위 삭제 403(S18) | 신규 |
| SEC-02 | CSRF 없는 업로드 거부(호스트 방식) | `test_cross_site_and_remote_writes_rejected`의 의도 |
| SEC-03 | 악성 XML(XXE)·zip bomb 거부 | `test_rejects_unsafe_or_invalid_documents` |
| PERF-01 | 5,000행 업로드 처리 5초 이내(D-12) | `test_store.py:test_5000_assets_import_under_5_seconds` |

## 합성 데이터 만들기

- 시나리오 시트는 `sync-scenarios.json`의 `sheets`를 그대로 xlsx로 쓴다.
- 5,000행 데이터는 `kit/src/onprem_atlas/synth.py:generate_rows`의 규칙(문서용 IP 대역, 합성 호스트명)을 참고해 호스트 테스트 유틸로 만든다. 실제 회사 파일로 만든 fixture는 금지.
