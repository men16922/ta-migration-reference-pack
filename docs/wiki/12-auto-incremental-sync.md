# 12. 자동 증분 동기화 (TO-BE 핵심 사양)

> **요약**: 여러 `.xlsx`를 올리면 미리보기·확정 단계 없이 시트마다 원천을 자동 판별하고, 식별 키가 같은 레코드는 **최신 값으로 덮어쓰며(overwrite)**, 파일에 없는 기존 레코드는 유지한다. 변경은 필드 단위 로그로 남고, 변경이 없으면 데이터 버전이 그대로다.
> **근거 소스**: 현재 동작 `kit/src/onprem_atlas/store/__init__.py:import_parsed`, `web/imports.py`. 이 페이지의 TO-BE 규칙은 신규 사양이다.
> **관련 페이지**: [10](10-data-model.md), [11](11-excel-ingest.md), [13](13-components-web-was-db.md), [20](20-api-contract.md), [fixtures/sync-scenarios.json](fixtures/sync-scenarios.json)

## 1. AS-IS와 TO-BE 차이

| 항목 | 현재 (AS-IS) | 목표 (TO-BE) |
|---|---|---|
| 입력 | 파일 1개, 시트 1개 | 파일 여러 개, 파일마다 모든 시트 |
| 원천 지정 | 사용자가 선택 | 자동 판별 + 헤더 서명별 저장 매핑 |
| 흐름 | 미리보기 → 사용자 확정 | 업로드 즉시 적용, 결과 보고 |
| 같은 키 | 레코드 전체 교체(merge) | 파일에 있는 열만 덮어씀(필드 단위) |
| 파일에 없는 열 | 기존 값이 있으면 **등록 전체 거부** | 기존 값 유지(D-03) |
| 파일 내 중복 키 | 오류, 등록 거부 | 마지막 행 채택 + 경고(D-04) |
| 다른 원천과 키 충돌 | 등록 전체 거부 | 해당 행만 건너뜀 + 경고(D-05) |
| 행 오류 | 하나라도 있으면 등록 거부 | 해당 행만 건너뜀 |
| 같은 파일 재업로드 | 새 실행 + 전체 복사본 | `skipped_same_file`, 변경 0, 버전 유지 |
| 저장 | 실행마다 전체 스냅샷 복사 | 현재 상태 + 필드 단위 변경 로그 |
| 삭제 | `replace` 모드(원천 전체) | 기본 없음. 선택적 범위 한정 소프트 삭제(D-06) |

AS-IS의 안전장치(원천 간 데이터 보존, 원자적 적용, 동시 등록 직렬화, 출처 보존, 멱등 재시도)는 TO-BE에서도 유지한다.

## 2. 용어

- **배치(batch)**: 업로드 한 번. 파일 N개를 포함한다.
- **원천(source)**: `servers | equipment | security | web | was | db`. → [01](01-product-scope.md#원천source-6종)
- **레코드**: 자산(servers/equipment/security) 또는 인스턴스(web/was/db).
- **데이터 버전(dataset_version)**: 테넌트의 현재 데이터 버전. 실제 변경이 있는 배치가 적용될 때만 1 증가. 구성도 편집본·캐시가 이 값을 기준으로 한다.

## 3. 처리 절차

```text
POST /sync/batches (files[], meta)
│
├─ A. 준비 단계 (DB 쓰기 없음, 파일은 임시 보관)
│   1. client_token이 이미 있으면 그 배치 결과를 그대로 반환 (멱등)
│   2. 파일 검사: 확장자·크기·압축 해제 한도 (11번 §1). 실패 → file.status=failed
│   3. sha256 계산. 같은 테넌트에서 이미 applied인 파일과 같으면 → skipped_same_file (파싱 생략)
│   4. 적용 순서 정렬: last_modified 오름차순, 같으면 업로드 순서 (D-07)
│   5. 파일마다 보이는 시트 전부:
│        a. 행 읽기 → 빈 시트면 status=empty
│        b. header_signature 계산 → 저장된 매핑 프로파일이 있으면 사용
│        c. 헤더 탐지 (11번 §3)
│        d. 원천 판별 (§4). 실패 → status=needs_mapping, UNKNOWN_SHEET
│        e. 파싱·정규화 (11번 §4, 인스턴스는 13번)
│        f. 시트 수준 오류(호스트 열 없음 등) → status=needs_mapping
│        g. 행 오류 행은 제외, 같은 키 중복은 마지막 행 채택 + DUPLICATE_IN_FILE (D-04)
│
├─ B. 적용 단계 (단일 트랜잭션, 테넌트 잠금)
│   1. idc_dataset 행을 잠근다 (SELECT … FOR UPDATE) → 동시 배치 직렬화
│   2. batch/file/sheet/issue/raw_row 기록
│   3. 정렬된 순서대로 시트별 upsert (§5)
│   4. (선택) full_snapshot 지정 원천의 범위 한정 소프트 삭제 (§6)
│   5. 후처리: 인스턴스-서버 재연결(13번), 변경 레코드 재분류(14번), 업무 표시 이름 갱신, 검색 색인 갱신
│   6. 변경(add/update/remove)이 1건 이상이면 dataset.version += 1, batch.status=applied
│      변경이 0건이면 version 유지, batch.status=no_change
│   7. 커밋. 어떤 단계든 실패하면 전체 롤백 후 별도 트랜잭션으로 batch.status=failed 기록
│
└─ 응답: BatchReport (§8)
```

- 비교(§5)는 **잠금을 잡은 뒤** 현재 상태를 읽어 계산한다. 준비 단계에서 계산한 변경 건수를 그대로 쓰지 않는다(그 사이 다른 배치가 적용될 수 있음). 현재 코드의 `expected_run` 재검토 검사와 같은 목적이다.
- 시트 하나가 `needs_mapping`/`failed`여도 나머지 시트는 적용한다. 배치 상태는 그런 시트가 있으면 `partial`.
- 다른 조회 요청은 커밋 전 상태만 본다(분류까지 끝난 상태만 노출). 근거: `kit/tests/test_enterprise_import.py:test_readers_do_not_see_snapshot_until_classification_completes`.

## 4. 시트 종류 자동 판별

입력: 정규화 헤더 집합 `H`(11번 §3의 `normalize_header`), 매핑 결과 `M`(필드 → 열), 시트 이름, 파일 이름. 위에서부터 처음 맞는 규칙을 쓴다.

| 순서 | 조건 | 원천 | detect_reason 예 |
|---|---|---|---|
| 1 | `header_signature`에 저장된 매핑 프로파일이 있음 | 저장된 원천 | `profile:<signature 앞 8자>` |
| 2 | `H`에 `web제품` | `web` | `header:WEB제품` |
| 3 | `H`에 `was제품` | `was` | `header:WAS제품` |
| 4 | `H`에 `db제품` 또는 `db명(sid)` 또는 `sid` | `db` | `header:DB제품` |
| 5 | `M`에 `product`가 있음 (예: `제품명`) | 시트·파일 이름의 `web`/`was`/`db` 토큰(대소문자 무시). 없으면 판별 실패 | `name:WAS` |
| 6 | `H`에 `솔루션 유형` 또는 `솔루션유형` | `security` | `header:솔루션 유형` |
| 7 | `H`에 `장비명` 또는 `장비범주`가 있고 `호스트명`은 없음 | `equipment` | `header:장비명` |
| 8 | `M`에 `hostname`이 있고 `os`, `os_family`, `os_version`, `cpu_cores`, `memory_gb` 중 하나 | `servers` | `header:호스트명+OS종류` |
| 9 | 시트·파일 이름에 `서버`/`server` → `servers`, `보안`/`security` → `security`, `장비`/`network`/`storage` → `equipment` | 이름 기준 원천 | `name:보안` |
| 10 | 해당 없음 | 판별 실패 (`needs_mapping`) | — |

- `header_signature = sha256(JSON(정규화한 비어 있지 않은 헤더 목록, 열 순서대로))`.
- 사용자가 `needs_mapping` 시트에 원천·열 매핑을 지정하면 서명별로 저장한다(`idc_mapping_profile`). 같은 양식의 다음 파일은 규칙 1로 자동 처리된다. 이것이 "한 번 지정, 이후 자동"의 핵심이다.
- 회사 실제 헤더로 규칙을 보정한다(D-08). 보정 결과는 이 표와 [fixtures](fixtures/README.md)에 반영한다.

## 5. 레코드 upsert 규칙 (덮어쓰기 정책)

시트 `s`(원천 `src`, 매핑된 필드 집합 `F`, 파일 수정 시각 `t_file`)의 각 레코드 `r`(키 `k`)에 대해:

```text
cur = 현재 레코드(k)  # 자산이면 idc_asset, 인스턴스면 idc_component

if cur 없음 또는 cur.active == false:
    INSERT (F에 없는 필드는 null), source_id = src
    change(op=add)                                  → added
elif cur.source_id != src:
    건너뜀, CROSS_SOURCE_CONFLICT 경고 (D-05)         → conflicts
elif t_file < cur.source_modified_at:               # 더 오래된 파일 (D-07)
    건너뜀, STALE_FILE 경고                          → skipped
else:
    diff = { f ∈ F : norm(cur[f]) != norm(r[f]) }   # F 밖의 필드는 비교·변경하지 않음 (D-03)
    if diff 비어 있음:
        last_seen_batch_id만 갱신                    → unchanged
    else:
        diff 필드만 덮어씀 (빈 셀이면 null로 덮어씀, D-02)
        change(op=update, field, before, after) × |diff|
        origin_sheet_id/row, last_changed_batch_id, source_modified_at 갱신   → changed
```

- `norm`: 문자열은 앞뒤 공백 제거 후 그대로 비교(대소문자 구분). 숫자 필드(`cpu_sockets`, `cpu_cores`, `memory_gb`)는 수치 비교(`32`와 `32.0`은 같음). `null`과 `""`는 같다.
- 인스턴스는 키에 제품·엔드포인트·업무가 들어 있으므로, 실제 갱신 대상은 키 밖의 필드(버전, 이중화 방식, RTO, 모니터링, AGENT, 환경, IP 등)다. 포트·SID·업무가 바뀌면 **새 인스턴스**가 추가되고 이전 인스턴스는 남는다. 이전 것을 없애려면 §6을 쓴다.
- `hostname` 값의 대소문자만 바뀐 경우 키는 같고 `hostname` 필드가 갱신된다.
- `source_modified_at`이 없으면(구 데이터) 비교하지 않고 적용한다. 파일의 `last_modified`가 없으면 업로드 시각을 쓴다.
- 원천 기본값(`category`: 서버/미분류 장비/보안장비, [11 §4](11-excel-ingest.md#4-행-정규화-validatepynormalize_rows))은 **INSERT 때 또는 현재 값이 비어 있을 때만** 채운다. 매핑된 열이 아니므로 `F`에 넣지 않는다.
- 변경 로그의 `before`/`after`는 문자열이다. 숫자는 정수 값이면 소수점 없이(`256.0` → `"256"`), `null`은 그대로 `null`.
- 자산 키는 그대로인데 레코드가 이번 배치에서 두 번 이상 나오면(여러 파일) §3의 적용 순서대로 차례로 적용된다. 결과적으로 가장 최근 파일의 값이 남는다.

## 6. 선택: 범위 한정 소프트 삭제 (D-06, 기본 꺼짐)

ESM에서 "이 원천 전체"를 내려받은 경우에만 사용한다. 배치 옵션 `full_snapshot_sources: ["servers"]`처럼 원천을 지정하고, 권한 `idc.admin`이 필요하다.

```text
범위 = 해당 시트들에 나온 (lower(organization), lower(site)) 쌍 집합
삭제 대상 = active이고 source_id == 지정 원천이고 (organization, site)가 범위 안이며 이번 배치에 키가 없는 레코드
→ active=false, removed_batch_id=배치, change(op=remove)
```

- 현재 `replace` 모드는 원천 전체를 지우므로, 일부 그룹사/센터만 내려받은 파일로 다른 범위까지 지우는 위험이 있었다(`docs/evaluation.md`). 범위 한정으로 이 위험을 막는다.
- 물리 삭제는 하지 않는다. 같은 키가 다시 들어오면 `add`로 되살아난다.

## 7. 변경 이력 모델

- 배치 목록 = `idc_sync_batch` 최신순. 배치 상세 = 파일·시트별 통계 + `idc_change`.
- "직전 대비 변경"(현재 `/api/diff`)은 **마지막으로 변경이 있었던 배치**의 `idc_change` 집계로 대체한다: `added`, `removed`, `changed`(키 수), `changed_fields`(필드별 건수).
- 특정 시점 상태가 필요하면 현재 상태에서 그 뒤 배치들의 변경을 역으로 적용해 재구성할 수 있다. 1차 범위에서는 구현하지 않는다.
- 원본 행(`idc_raw_row`)은 적용된 시트만 저장한다. `skipped_same_file`, `no_change` 배치는 원본 파일을 보관하지 않아도 된다(D-09).

## 8. 응답: BatchReport

```json
{
  "batch_id": 42,
  "status": "partial",
  "dataset_version": 17,
  "totals": { "added": 3, "changed": 1, "unchanged": 120, "removed": 0, "skipped": 2, "conflicts": 1, "errors": 1, "warnings": 4 },
  "files": [
    {
      "file_id": 88, "file_name": "esm-servers-1021.xlsx", "status": "applied", "last_modified": "2026-10-21T09:00:00Z",
      "sheets": [
        {
          "sheet_id": 301, "sheet_name": "서버", "status": "applied", "source_id": "servers", "detect_reason": "header:호스트명+OS종류",
          "header_row": 3, "counts": { "rows": 125, "added": 3, "changed": 1, "unchanged": 120, "skipped": 1, "conflicts": 0, "errors": 1, "warnings": 3 },
          "changed_fields": { "memory_gb": 1 },
          "issues": [ { "row_number": 57, "severity": "error", "code": "MISSING_HOSTNAME", "message": "호스트명이 비어 있어 제외했습니다." } ]
        },
        { "sheet_id": 302, "sheet_name": "메모", "status": "needs_mapping", "source_id": null, "detect_reason": null, "header_row": 1, "counts": { "rows": 4 }, "issues": [] }
      ]
    },
    { "file_id": 89, "file_name": "esm-servers-1020.xlsx", "status": "skipped_same_file", "sheets": [] }
  ]
}
```

이슈는 시트당 최대 100건만 응답에 담고(현재 미리보기와 같음), 전체는 `GET /sync/batches/{id}/issues`로 페이지 조회한다.

## 9. 동시성·멱등·성능

- **직렬화**: 테넌트 잠금(§3-B1). 현재 근거 테스트: `test_concurrent_confirm_only_creates_one_run`.
- **멱등**: 클라이언트가 배치마다 `client_token`(UUID)을 보낸다. 같은 토큰 재요청은 이전 결과를 반환한다. 현재 근거: `test_revision_conflict_and_idempotent_retry`.
- **원자성**: 적용 단계 실패 시 아무 레코드도 바뀌지 않는다. 현재 근거: `test_classification_failure_rolls_back_registration_and_allows_retry`.
- **성능**: 원천별 현재 레코드를 한 번에 메모리로 읽어 비교하고, 쓰기는 일괄 upsert(`INSERT … ON CONFLICT DO UPDATE`, COPY 등)로 한다. 5,000행 5초 이내(D-12).
- **동기/비동기**: 20MB 이하 동기 처리가 기본. 호스트에 작업 큐가 있고 처리 시간이 요청 제한을 넘으면 202 + 배치 상태 조회로 바꾼다(D-15).

## 10. 화면 동작 (업로드 페이지)

1. 끌어다 놓기 또는 파일 선택(다중). 파일마다 이름·크기·수정 시각을 보여주고 20MB 초과·`.xlsx` 아님은 즉시 표시한다.
2. `동기화` 버튼 하나. 미리보기·확정 단계 없음. 진행 중에는 버튼 비활성.
3. 결과: 배치 합계 + 시트별 표(파일, 시트, 판별 종류와 근거, 추가/변경/동일/건너뜀/충돌/오류/경고, 상태). 행을 펼치면 이슈 목록.
4. `needs_mapping` 시트에는 `매핑 지정` 버튼: 원천 선택 + 필드별 열 선택(현재 `ImportPage.tsx`의 매핑 UI 재사용) → 저장하면 해당 시트를 다시 적용하고 이후 같은 양식은 자동.
5. 완료 후 바로가기: 대시보드, IDC 구성도, 이번 배치 변경 내역.
6. (관리자) 고급 옵션: 원천별 `전체 목록으로 처리(범위 내 없는 항목 비활성)` 체크박스 — 경고 문구와 함께.

## 포팅 카드

- **반드시 유지**: 원천 분리, 키 규칙, 필드 단위 덮어쓰기, 열 부재 시 기존 값 유지, 단일 트랜잭션 + 테넌트 잠금, 멱등 토큰, 변경 0건이면 버전 유지, 출처(시트·행) 추적.
- **기본값으로 구현 후 기록**: D-02~D-09, D-12, D-15.
- **검증**: [fixtures/sync-scenarios.json](fixtures/sync-scenarios.json) 전 시나리오, [42](42-acceptance-tests.md)의 `SYNC-*`.
