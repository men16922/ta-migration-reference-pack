# 11. Excel 수집 — 읽기, 헤더 탐지, 정규화, 검증

> **요약**: xlsx를 문자열 표로 읽고(수식은 저장된 계산값), 앞 15행 중 표준 필드가 가장 많이 맞는 행을 헤더로 고른 뒤, 행마다 키·IP·숫자·메모리를 정규화한다. 문제는 행 번호가 붙은 이슈로 남긴다.
> **근거 소스**: `kit/src/onprem_atlas/ingest/xlsx.py`, `ingest/mapping.py`, `ingest/validate.py`, `web/imports.py:prepare`
> **관련 페이지**: [10](10-data-model.md), [12](12-auto-incremental-sync.md), [13](13-components-web-was-db.md)

## 1. 파일 검사 (불변식)

| 검사 | 값 | 근거 |
|---|---|---|
| 확장자 | `.xlsx`만. `.xls`·암호화 파일·이미지는 거부 | `imports.py:preview` |
| 업로드 크기 | 20MB 이하 (스트리밍 중 초과 시 413) | `MAX_FILE` |
| 압축 해제 | 항목 2,000개 이하, 총 100MB 이하 (zip bomb 방지) | `MAX_EXPANDED`, `prepare` |
| 시트 크기 | 50,000행·256열 이하 | `xlsx.py:read_sheet` |
| XML 파서 | 외부 엔티티(XXE) 비활성. Python은 openpyxl, 다른 언어는 라이브러리 설정 확인 | — |

## 2. 셀 → 문자열 (`xlsx.py:cell_text`)

| 셀 값 | 결과 |
|---|---|
| 빈 셀 | `""` |
| 불리언 | `Y` / `N` |
| 정수 값의 실수(`16.0`) | `"16"` |
| 날짜시간(자정) | `2026-10-21` |
| 날짜시간(자정 아님) | `2026-10-21 13:05:00` |
| 날짜 | `2026-10-21` |
| 그 밖 | `str()` 후 연속 공백(줄바꿈 포함)을 한 칸으로 |

- 수식 셀은 **파일에 저장된 계산값**을 읽는다(`data_only=True`). 계산값 없이 저장된 파일(일부 생성 도구)은 빈 값이 된다.
- 행 길이를 가장 긴 행에 맞춰 `""`로 채운다.
- 다른 언어 이식: Java는 Apache POI 스트리밍(SAX) 읽기, Node는 `exceljs` 스트리밍 리더 또는 SheetJS, .NET은 ExcelDataReader. 날짜·정수 표시 규칙을 위 표대로 맞추고, 셀 서식 문자열(예: 천 단위 구분)을 적용한 표시값이 아니라 **원시 값**을 쓴다.

## 3. 헤더 행 탐지 (`mapping.py:detect_header`)

ESM 내보내기는 위에 제목·조회 조건 행이 붙는다.

1. 매핑 프로파일에 `header_row`가 있으면 그 행만 본다(1부터 셈).
2. 없으면 앞 **15행**을 후보로, 각 행을 헤더로 가정했을 때 매핑된 필드 수를 센다.
3. 가장 많은 행을 고른다. 동점이면 **위쪽 행**.
4. 프로파일 `columns`(필드 → 헤더 이름)는 자동 매핑을 덮어쓴다. 지정한 헤더가 없으면 `PROFILE_COLUMN_NOT_FOUND` 오류.
5. 프로파일 `synonyms`(필드 → 추가 동의어)는 기본 동의어에 더해진다.

실측 예: 1행 `ESM 서버 목록 (조회일 …)`, 2행 빈 행, 3행 실제 헤더 → `header_row = 3`.

매핑 프로파일 형식 (`kit/examples/mapping-profile.json`):

```json
{
  "sheet": null,
  "header_row": null,
  "columns": { "system_name": "업무시스템명" },
  "synonyms": { "owner": ["운영부서", "정 담당자"], "zone": ["네트워크 구분"] },
  "memory_unit": "auto"
}
```

## 4. 행 정규화 (`validate.py:normalize_rows`)

헤더 다음 행부터, **모든 셀이 빈 행은 건너뛴다**(행 번호는 원본 기준 유지).

| 단계 | 규칙 |
|---|---|
| 호스트명 | 비면 `MISSING_HOSTNAME`(오류)로 행 제외 |
| 키 | [10](10-data-model.md#식별-키-불변식) 규칙. 같은 파일 안 중복이면 현재는 `DUPLICATE_HOSTNAME`(오류)로 **뒤 행 제외** → TO-BE는 D-04 |
| 대표 IP (`ip`) | 쉼표·세미콜론·`\|`·공백으로 나눠 IPv4만 인정. `/길이`가 붙어 있으면 CIDR 표기를 유지. 첫 값이 대표, 나머지가 있으면 `MULTIPLE_IP`(경고). 유효값이 없으면 `INVALID_IP`(경고) 후 비움 |
| 관리·서비스 IP | 유효한 IPv4 전체를 `", "`로 이어 저장. 유효값이 없으면 `INVALID_IP`(경고) |
| 대표 IP 보완 | 대표 IP가 비면 `service_ip` → `management_ip`의 첫 값을 표시용으로 쓴다(주소 역할은 각 필드에 보존) |
| IP 중복 | 같은 파일에서 대표 IP(`/길이` 제외)가 겹치면 `DUPLICATE_IP`(경고, VIP·클러스터 가능) |
| IP 없음 | 원본 IP 칸이 비고 보완도 못 하면 `MISSING_IP`(경고) |
| CPU 소켓/코어 | `2 x 8`, `2*8`, `2×8` → 곱(16). 아니면 첫 정수. 읽지 못하면 `INVALID_NUMBER`(경고) 후 비움 |
| 메모리 | 공백 제거 후 `숫자[단위]`. `T/테라`→×1024, `G/기가`→그대로, `M/메가`→÷1024, `K`→÷1024²(소수 3자리). 단위가 없으면 프로파일 `memory_unit`(`GB`/`MB`), `auto`면 16,384 초과 시 MB로 보고 환산 + `MEMORY_UNIT_ASSUMED_MB`(경고). 형식 오류는 `INVALID_MEMORY`(경고) |
| 기타 필드 | 앞뒤 공백 제거, 빈 문자열은 `null` |

실측 예 (합성): `대표IP="192.0.2.11, 192.0.2.12"` → `ip=192.0.2.11` + `MULTIPLE_IP`; `CPU Core(ea)="2 x 8"` → `16`; `Memory(GB)="32768"` → `32.0` + `MEMORY_UNIT_ASSUMED_MB`; `"64GB"` → `64.0`.

원천별 기본값(`imports.py:source_defaults`): `category`가 비면 `servers`→`서버`, `equipment`→`미분류 장비`, `security`→`보안장비`.

## 5. 이슈 코드

코드는 화면·로그가 참조하므로 이름을 바꾸지 않는다.

| 코드 | 심각도 | 범위 | 현재 결과 | TO-BE 자동 동기화 |
|---|---|---|---|---|
| `HOSTNAME_COLUMN_NOT_FOUND` | error | 시트 | 등록 불가 | 시트 `needs_mapping` |
| `MISSING_HOST_COLUMN` | error | 시트(인스턴스) | 등록 불가 | 시트 `needs_mapping` |
| `PROFILE_COLUMN_NOT_FOUND` | error | 시트 | 등록 불가 | 시트 `needs_mapping` |
| `MISSING_HOSTNAME` | error | 행 | 행 제외, 등록 불가 | 행만 건너뜀 |
| `DUPLICATE_HOSTNAME` | error | 행 | 뒤 행 제외, 등록 불가 | `DUPLICATE_IN_FILE`(경고), 마지막 행 채택(D-04) |
| `DUPLICATE_COMPONENT` | error | 행(인스턴스) | 등록 불가 | `DUPLICATE_IN_FILE`(경고), 마지막 행 채택 |
| `MISSING_PRODUCT` | error | 행(인스턴스) | 등록 불가 | 행만 건너뜀 |
| `MISSING_ENDPOINT` | error | 행(인스턴스) | 등록 불가 | 행만 건너뜀 |
| `INVALID_PORT` | error | 행(인스턴스) | 등록 불가 | 행만 건너뜀 |
| `INVALID_IP`, `MULTIPLE_IP`, `DUPLICATE_IP`, `MISSING_IP` | warning | 행 | 등록 가능 | 동일. 인스턴스 원천에서는 `MISSING_IP` 생략 권장([43](43-known-gaps-and-pitfalls.md)) |
| `INVALID_NUMBER`, `INVALID_MEMORY`, `MEMORY_UNIT_ASSUMED_MB` | warning | 행 | 등록 가능 | 동일 |
| `CROSS_SOURCE_CONFLICT` | warning | 행 | (현재는 등록 전체 거부) | 신규. 행 건너뜀(D-05) |
| `UNKNOWN_SHEET` | warning | 시트 | — | 신규. 종류 판별 실패 |
| `DUPLICATE_IN_FILE` | warning | 행 | — | 신규. 같은 시트에서 키 중복, 마지막 행 채택(D-04) |
| `STALE_FILE` | warning | 행 | — | 신규. 현재 값을 쓴 파일보다 오래된 파일이라 건너뜀(D-07) |

## 6. 시트 선택

- **현재**: 파일당 시트 하나(첫 시트 또는 사용자가 고른 시트), 원천은 사용자가 선택.
- **TO-BE**: 모든 보이는 시트를 읽고 시트마다 원천을 자동 판별한다. → [12](12-auto-incremental-sync.md#4-시트-종류-자동-판별)

## 포팅 카드

- **반드시 유지**: 셀 문자열 규칙, 헤더 정규화·완전 일치, 15행 탐지, 키 규칙, IP/숫자/메모리 정규화, 이슈 코드 이름.
- **바꿔도 됨**: 라이브러리, 이슈 메시지 문구(한국어 유지 권장), 크기 한도(호스트 정책).
- **검증**: [42](42-acceptance-tests.md)의 `ING-*` 테스트. 기준 테스트: `kit/tests/test_ingest.py`, `kit/tests/test_enterprise_import.py:test_company_headers_are_distinct_and_preserved`.
