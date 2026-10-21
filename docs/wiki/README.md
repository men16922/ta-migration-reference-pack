# 온프렘 IDC 메뉴 포팅 위키 (LLM Wiki)

이 위키는 **onprem-atlas**(이 저장소)를 회사의 별도 프로젝트에 **하나의 메뉴**로 옮기기 위한 지식 베이스다.
사람과 코딩 에이전트(GPT 6.1 sol 등)가 함께 읽는다. 에이전트는 [00-start-here.md](00-start-here.md)부터 읽는다.

기준 코드: 브랜치 `feat/diagram-drawio-icons`(커밋 `0b4e617`) — Python `kit/`(FastAPI/SQLite) + React/Carbon `src/console/`.

## 위키 규칙

- **한 페이지 = 한 주제.** 각 페이지 머리에 `요약 / 근거 소스 / 관련 페이지`가 있다. 필요한 페이지만 연다.
- **근거 우선.** 현재 동작은 `파일:함수`로 근거를 단다. 근거 없는 서술은 "제안" 또는 "결정 필요"로 표시한다.
- **현재(AS-IS)와 목표(TO-BE)를 구분한다.** 포팅 대상 동작은 TO-BE다. 특히 [자동 증분 동기화](12-auto-incremental-sync.md)는 현재 코드와 다르다.
- **결정 필요 항목은 `D-번호`로 표시**하고 [결정 목록](40-porting-playbook.md#결정-필요-항목)에 모은다. 에이전트는 임의로 결정하지 않고 기본값을 적용한 뒤 기록한다.
- 실데이터를 위키·fixture에 넣지 않는다. 모든 예시는 합성 데이터다.

## 목차

| 구분 | 페이지 | 내용 |
|---|---|---|
| 시작 | [00-start-here](00-start-here.md) | 에이전트 임무·규칙·작업 루프·완료 기준 |
| 범위 | [01-product-scope](01-product-scope.md) | 메뉴 기능 범위, 포함/제외 |
| 구조 | [02-current-architecture](02-current-architecture.md) | 현재 모듈 지도, 데이터 흐름, 파일별 역할 |
| 데이터 | [10-data-model](10-data-model.md) | 표준 필드 44개, 식별 키, 목표 스키마(DDL) |
| 수집 | [11-excel-ingest](11-excel-ingest.md) | xlsx 읽기, 헤더 탐지, 정규화, 이슈 코드 |
| 수집 | [12-auto-incremental-sync](12-auto-incremental-sync.md) | **핵심 TO-BE**: 다중 파일 자동 증분 동기화(중복 overwrite) |
| 수집 | [13-components-web-was-db](13-components-web-was-db.md) | WEB/WAS/DB 인스턴스, 서버 연결 |
| 분류 | [14-business-classification](14-business-classification.md) | 업무 시스템(ITSM 계층) 분류, 환경 |
| API | [20-api-contract](20-api-contract.md) | 현재 API와 메뉴용 목표 API |
| 화면 | [30-dashboard](30-dashboard.md) | 대시보드 위젯과 데이터 |
| 화면 | [31-diagram-engine](31-diagram-engine.md) | IDC/업무 구성도 배치 엔진, draw.io XML |
| 화면 | [32-diagram-editor-drawio](32-diagram-editor-drawio.md) | (선택) draw.io 수동 편집·편집본 이력 |
| 화면 | [33-ui-pages-and-menu](33-ui-pages-and-menu.md) | 페이지 목록, 메뉴/라우팅, 디자인 시스템 매핑 |
| 포팅 | [40-porting-playbook](40-porting-playbook.md) | 단계별 수행 절차, 종료 조건, 결정 목록 |
| 포팅 | [41-host-integration](41-host-integration.md) | 인증·권한·저장소·파일·작업·보안 연동 |
| 검증 | [42-acceptance-tests](42-acceptance-tests.md) | 인수 테스트 매트릭스 |
| 주의 | [43-known-gaps-and-pitfalls](43-known-gaps-and-pitfalls.md) | 알려진 한계, 함정, 현재 코드 결함 |
| 용어 | [90-glossary](90-glossary.md) | 한/영 용어 |
| 도구 | [prompts/gpt-porting-kickoff](prompts/gpt-porting-kickoff.md) | 에이전트 시작 프롬프트(복사용) |
| 도구 | [templates/stack-profile](templates/stack-profile.md) | 회사 저장소 조사 결과 양식 |
| 도구 | [templates/porting-log](templates/porting-log.md) | 단계별 작업 기록 양식 |
| 데이터 | [fixtures/README](fixtures/README.md) | 동기화 시나리오, API 응답 샘플 |

## 빠른 경로

- "무엇을 만들어야 하나" → [01](01-product-scope.md) → [12](12-auto-incremental-sync.md) → [30](30-dashboard.md) → [31](31-diagram-engine.md)
- "어떤 순서로 옮기나" → [40](40-porting-playbook.md) → [41](41-host-integration.md) → [42](42-acceptance-tests.md)
- "현재 코드는 어떻게 동작하나" → [02](02-current-architecture.md) → [10](10-data-model.md) → [11](11-excel-ingest.md)

기계 판독용 색인은 저장소 루트 `llms.txt`에 있다.
