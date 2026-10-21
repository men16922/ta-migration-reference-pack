# 41. 호스트 연동 — 인증·권한·저장·파일·작업·보안

> **요약**: 현재 앱은 로컬 단독 실행용이라 쓰기를 loopback + 사용자 정의 헤더 + Origin 검사로 막는다. 메뉴로 옮기면 이 검사를 **호스트 인증·권한·CSRF로 대체**하고, 저장소·파일 보관·감사는 호스트 기능을 쓴다.
> **근거 소스**: `kit/src/onprem_atlas/web/imports.py:local_write`, `web/documents.py`, `docs/enterprise-operations.md`, `docs/LESSONS.md`
> **관련 페이지**: [12](12-auto-incremental-sync.md), [20](20-api-contract.md), [40](40-porting-playbook.md)

## 1. 인증·권한

| 권한(예시 이름) | 허용 |
|---|---|
| `idc.viewer` | 메뉴 표시, 모든 조회 API, 구성도·`.drawio` 내려받기, 동기화 이력 조회 |
| `idc.editor` | + Excel 동기화, 매핑 지정, (선택) 구성도 편집본 저장 |
| `idc.admin` | + 범위 한정 삭제 옵션(D-06), 분류 프로파일 변경·전체 재분류, 저장된 매핑 프로파일 삭제 |

- 권한 이름은 호스트 규칙을 따른다. 메뉴 노출과 API 검사를 **둘 다** 한다.
- 현재 `local_write`(loopback 주소만, `X-Atlas-Request: 1` 헤더 필수, Origin이 같은 호스트 또는 loopback 프록시)는 로컬 실행 보호 장치다. 호스트에서는 인증된 세션 + 호스트 CSRF 방식으로 바꾼다. **검사를 지우기만 하고 공개하면 안 된다**(`docs/enterprise-operations.md` 마지막 절).
- 배치·변경·편집본에 `requested_by`/`created_by`로 사용자 ID를 남긴다(감사).
- 그룹사별 접근 제어(D-14)를 하면 모든 조회·구성도·검색 쿼리에 `organization` 조건을 강제하고, 동기화 시 권한 밖 그룹사 행은 건너뛴다(`FORBIDDEN_ORGANIZATION` 경고 신규).

## 2. 저장소

- 테이블은 [10](10-data-model.md#목표-스키마-to-be)의 목표 스키마. 호스트 마이그레이션 도구로 만든다. 테이블 접두사는 호스트 규칙(예: `idc_`).
- 동기화 적용은 **한 트랜잭션 + 테넌트 단위 직렬화**. PostgreSQL이면 `idc_dataset` 행 `SELECT … FOR UPDATE`, MySQL이면 `SELECT … FOR UPDATE`(InnoDB), 그 밖은 호스트의 분산 잠금.
- 현재 SQLite 연결 주의사항(요청마다 연결, `check_same_thread=False`)은 호스트 DB 풀을 쓰면 해당 없다.
- 검색: `pg_trgm` 또는 호스트 검색. 5만 건 이하면 `ILIKE`로 시작해도 된다.

## 3. 파일

| 항목 | 현재 | 호스트에서 |
|---|---|---|
| 업로드 수신 | 요청 본문 스트리밍, 20MB 초과 즉시 413 | 호스트 multipart 한도 설정(파일당 20MB, 요청당 합계는 D-15와 함께 결정) |
| 임시 저장 | DB 옆 `imports/` 폴더, 권한 0600, 토큰 이름 | 호스트 임시 디렉터리 또는 객체 저장소 |
| 원본 보관 | 자동 삭제 없음 | 객체 저장소 + 보관 기간(D-09), `idc_sync_file.storage_uri` |
| 검증 | 확장자, zip 항목 수·해제 크기, 시트 크기 | 동일 + 호스트 악성코드 검사가 있으면 연결 |
| 무결성 | SHA-256 | 동일. 같은 SHA 재업로드는 `skipped_same_file` |

## 4. 처리 방식

- 기본 동기 처리: 요청 안에서 준비 → 적용 → `BatchReport` 반환.
- 호스트 게이트웨이 시간 제한이 짧거나 파일이 크면 비동기(D-15): `202 {batch_id}` → 작업 큐에서 처리 → 화면은 `GET /sync/batches/{id}`를 폴링(1~2초 간격)하고 상태 `running → applied|no_change|partial|failed`.
- 동기화 후 캐시(대시보드·구성도)를 `dataset_version`으로 무효화한다. 구성도 응답에 `ETag: "<dataset_version>-<view>-<project>"`를 붙이면 재계산을 줄일 수 있다.

## 5. 프런트엔드

- 호스트 라우터·데이터 패칭(React Query, SWR, Pinia 등)을 쓴다. 현재 `useApi` 훅은 참고만 한다.
- 업로드는 `FormData`에 `files[]`와 `meta`(JSON 문자열)를 담는다. `meta.files[i].last_modified = File.lastModified`(ms → ISO).
- 현재 Vite 개발 프록시(`/api`, `/editor` → 8770)는 이식하지 않는다.
- 다국어: 문구는 한국어 기본. 호스트에 i18n이 있으면 키로 옮긴다.

## 6. 보안 체크리스트

- [ ] 메뉴·API 권한 검사 (viewer/editor/admin)
- [ ] CSRF 보호(호스트 방식), 업로드는 인증 세션에서만
- [ ] 업로드 한도·zip bomb·시트 크기 검사
- [ ] XML 파서 XXE 비활성 (xlsx, draw.io XML)
- [ ] draw.io 편집기를 쓰면 같은 출처 자체 호스팅, `postMessage` 출처·발신 창 검사
- [ ] 로그·오류 응답에 원본 셀 값(담당자 이름 등)을 과도하게 남기지 않음
- [ ] 감사: 누가 언제 어떤 파일로 무엇을 바꿨는지(`idc_sync_batch`, `idc_change`)
- [ ] 테스트·fixture는 합성 데이터만
