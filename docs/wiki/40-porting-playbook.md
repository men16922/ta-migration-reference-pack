# 40. 포팅 플레이북 — 단계, 종료 조건, 결정 목록

> **요약**: P0(호스트 조사)부터 P8(마무리)까지 9단계. 각 단계는 읽을 페이지·산출물·종료 조건이 정해져 있다. 단계를 끝낼 때마다 호스트 CI를 통과시키고 작업 기록을 남긴다.
> **근거 소스**: 이 위키 전체
> **관련 페이지**: [00](00-start-here.md), [41](41-host-integration.md), [42](42-acceptance-tests.md), [templates/stack-profile](templates/stack-profile.md), [templates/porting-log](templates/porting-log.md)

## 단계 요약

| 단계 | 이름 | 읽을 페이지 | 산출물 | 종료 조건 |
|---|---|---|---|---|
| P0 | 호스트 조사 | 00, 01, 41, templates/stack-profile | 채운 `stack-profile.md`, 파일 배치 계획 | 아래 P0 체크리스트 전부 답함 |
| P1 | 저장 계층 | 10, 12 §7 | DB 마이그레이션, 저장소(repository) 코드 | 마이그레이션 적용·롤백 성공, 키 단위 테스트 `KEY-*` 통과 |
| P2 | 수집 라이브러리 | 11, 13 | xlsx 읽기, 헤더 탐지, 정규화, 인스턴스 파싱 | `ING-*`, `CMP-*` 통과 |
| P3 | 자동 증분 동기화 | 12, 14 | 동기화 서비스, `/sync/*` API, 분류·연결 후처리 | `SYNC-*`, `CLS-*`, [sync-scenarios.json](fixtures/sync-scenarios.json) 전부 통과 |
| P4 | 조회 API | 20 | summary/projects/assets/components/batches API | `API-*` 통과, 응답이 [fixtures/api](fixtures/README.md)와 의미 일치 |
| P5 | 구성도 엔진 | 31 | 레이아웃 JSON + `.drawio` 생성 | `DIA-*` 통과 |
| P6 | 화면·메뉴 | 30, 31 §7, 33 | 메뉴 등록, 7개 화면 | `UI-*`, `DASH-*` 통과, 실제 브라우저에서 업로드 → 대시보드 → 구성도 → 내려받기 확인 |
| P7 | (선택) 편집기 | 32 | draw.io 자체 호스팅, 편집본 API·화면 | `DOC-*` 통과 (D-10이 "포함"일 때만) |
| P8 | 마무리 | 41, 42, 43 | 권한·감사·한도·성능 검증, 운영 문서 | `SEC-*`, `PERF-*` 통과, 호스트 CI 전체 통과 |

P2와 P5는 서로 독립이라 병행할 수 있다. P3은 P1·P2 뒤, P4는 P3 뒤, P6은 P4·P5 뒤.

## P0 체크리스트 (호스트 조사)

[templates/stack-profile.md](templates/stack-profile.md)를 채운다. 최소 질문:

1. 백엔드 언어·프레임워크, API 라우팅·버전 규칙, 오류 응답 형식
2. DB 종류·마이그레이션 도구·ORM/쿼리 방식, 트랜잭션·잠금 사용 예
3. 파일 업로드 처리 방식(multipart 한도, 임시 파일, 객체 저장소)
4. 백그라운드 작업 실행기 유무(D-15)
5. 인증·권한 모델(역할/권한 문자열, 메뉴 노출 조건), CSRF 방식, 감사 로그
6. 프런트엔드 프레임워크·라우터·상태/데이터 패칭 라이브러리·디자인 시스템·차트·아이콘
7. 메뉴 등록 위치(정적 설정/DB/권한 기반), 다국어 처리
8. 테스트 도구(단위·통합·E2E), 린트·포맷·타입체크 명령, CI 구성
9. 멀티테넌시·그룹사별 데이터 경계 유무(D-14)
10. 기존에 비슷한 기능(엑셀 업로드, 대시보드, 다이어그램)이 있는지 — 있으면 그 패턴을 따른다

## 원본 → 대상 매핑 (P0에서 채움)

| 원본 | 역할 | 호스트 대상 위치(예) |
|---|---|---|
| `ingest/xlsx.py`, `mapping.py`, `validate.py` | 수집 | `<backend>/idc/ingest/*` |
| `components.py` | 인스턴스 | `<backend>/idc/ingest/components.*` |
| `store/__init__.py` | 저장 | `<backend>/idc/repository/*` + 마이그레이션 |
| (신규) | 동기화 서비스 | `<backend>/idc/sync/*` |
| `classify/__init__.py` | 분류 | `<backend>/idc/classify.*` |
| `diagram/*` | 구성도 | `<backend>/idc/diagram/*` (D-16) |
| `web/__init__.py`, `web/imports.py` | API | `<backend>/idc/api/*` |
| `src/console/api.ts` | 타입·포맷 | `<frontend>/features/idc/api.*` |
| `src/console/pages/*`, `AssetDetail.tsx` | 화면 | `<frontend>/features/idc/pages/*` |
| `src/styles.css` 구성도 블록 | SVG 스타일 | `<frontend>/features/idc/diagram.*css` |

## 결정 필요 항목

에이전트는 **기본값으로 구현**하고 작업 기록에 "D-번호: 기본값 적용"을 남긴다. 기본값을 바꾸는 것은 사람의 결정이다.

| ID | 질문 | 기본값 | 근거·영향 |
|---|---|---|---|
| D-01 | 자산 식별 키 | `그룹사\|설치지역\|호스트명`(소문자). 호스트명 변경 = 다른 자산 | 현재 코드. 자산번호/시리얼 기준으로 바꾸면 [10](10-data-model.md) 키 규칙과 테스트 모두 변경 |
| D-02 | 파일에 있는 열의 빈 셀 | 덮어써서 `null` | "최신 우선". 부분 입력 파일이 흔하면 "빈 셀 무시"로 |
| D-03 | 파일에 없는 열 | 기존 값 유지 | 현재는 등록 거부. 자동화를 위해 변경 |
| D-04 | 같은 시트의 중복 키 | 마지막 행 채택 + `DUPLICATE_IN_FILE` 경고 | 현재는 오류로 등록 거부 |
| D-05 | 다른 원천과 키 충돌 | 그 행만 건너뜀 + `CROSS_SOURCE_CONFLICT` | 현재는 등록 전체 거부 |
| D-06 | 삭제 | 기본 없음. 관리자 옵션으로 범위 한정 소프트 삭제 | 현재 `replace`는 원천 전체 대상이라 위험 |
| D-07 | 최신 판단 | 파일 `last_modified`가 더 오래되면 해당 레코드 건너뜀(`STALE_FILE`), 배치 안은 오래된 것부터 적용 | 대안: 업로드 순서가 항상 이김 |
| D-08 | 시트 자동 판별 실패 | `needs_mapping`, 사용자가 한 번 지정하면 헤더 서명별 저장 | 실제 회사 헤더로 [12 §4](12-auto-incremental-sync.md#4-시트-종류-자동-판별) 규칙 보정 필요 |
| D-09 | 원본 보관 | 적용된 시트의 원본 행 보관, 원본 파일은 호스트 파일 보관 정책 | 보관 기간·용량은 회사 정책 |
| D-10 | draw.io 편집기 | 1차 제외(자동 구성도 + `.drawio` 내려받기만) | 자체 호스팅 허용 필요 |
| D-11 | 메뉴 이름·경로·API 접두사 | `온프렘 IDC`, `/idc`, `/api/idc` | 호스트 명명 규칙 |
| D-12 | 성능 기준 | 5,000행 처리 5초 이내 | 현재 테스트 기준 |
| D-13 | 업무 분류 프로파일 | 없음(ITSM 컬럼만) | 명명 규칙은 회사 확인 후 |
| D-14 | 그룹사별 접근 제어 | 없음(메뉴 권한자는 전체 조회) | 필요하면 `organization` 필터 |
| D-15 | 동기/비동기 처리 | 동기(20MB 이하). 요청 제한을 넘으면 비동기 | 호스트 작업 큐 유무 |
| D-16 | 구성도 계산 위치 | 서버 | [31 §8](31-diagram-engine.md#8-포팅-선택지-d-16) |
| D-17 | 아이콘 세트 | draw.io 내장 도형 + 호스트 아이콘 중 같은 의미 | 회사 표준 아이콘이 있으면 교체 |

## 하지 말 것

- 현재 코드 구조(SQLite 실행 스냅샷, loopback 검사, Vite 프록시)를 그대로 복사하지 않는다.
- `review`(이관 준비도), 지식·Agent, CLI, 합성 데이터 생성기를 제품 코드로 옮기지 않는다(합성 생성기는 테스트 데이터 생성 참고용).
- 결정 필요 항목을 묻지 않고 기본값과 다르게 구현하지 않는다.
- 실데이터·회사 샘플 이미지를 테스트·문서에 넣지 않는다.
