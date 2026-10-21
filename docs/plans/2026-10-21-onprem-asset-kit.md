# 2026-10-21 — 온프렘 자산 키트: ESM xlsx → SQLite → 온프렘 구성도 · 용량산정 입력

Status: 진행 중 — P1·P2·P2.5·읽기 API·P7 셸 완료(2026-10-21), P0 K2–K6 결정 대기. `2026-10-21-operator-console-redesign.md`의 §0.2–0.3 TODO 중 이 문서가 다루는 범위는 여기가 우선이다.

## 1. 목적과 경계

오픈소스로 만들고, 회사의 온프렘 → AWS 마이그레이션 시스템에 **모듈 단위로 떼어 이식**한다.
약 5,000건 ESM 자산(xlsx)을 SQLite에 동기화하고, 그 DB를 기준으로 (1) 온프렘 구성도(draw.io)를 그리며 (2) 회사 용량산정 모듈에 입력을 넘긴다.

### 만들지 않는 것 (회사에 이미 있음 — 중복 구현 금지)

| 회사 기존 기능 | 이 키트와의 관계 |
|---|---|
| Strands Agents + boto 기반 AI 에이전트 | 키트는 **도구 함수만** 제공, 에이전트·모델 호출·프롬프트 없음 |
| AWS 정책 질의 챗봇 (SQLite 키워드 검색) | 무관. 키트 자산 검색도 같은 방식(SQLite FTS5)으로 맞춰 이식 부담만 줄임 |
| 아키텍처 검토·수정 에이전트 (AWS To-Be) | 무관. 키트 검토는 **온프렘 데이터 품질·이관 준비도**만 |
| 용량산정 (CPU/메모리 사용률, 칩셋 tpmC 카탈로그 → 표준 인스턴스 세대 선정) | 키트는 **입력 내보내기 + 결과 받아 표시**만. 계산식·카탈로그 없음 |

## 2. 구현 언어와 위치

- **Python 패키지**로 만든다. 회사 에이전트(Strands·boto), 정책 DB(SQLite), 참조 구현 diagram-bot이 모두 Python이라 복사 이식이 가장 싸다.
- 위치: 이 저장소의 `kit/`(`kit/pyproject.toml`, `kit/src/onprem_kit/`, `kit/tests/`). 기존 TypeScript 앱은 분석 실험실(lab)로 그대로 둔다.
- 오늘 TS로 만든 `src/adapters/esmAssetAdapter.ts`의 헤더 동의어·검증 규칙은 P1에서 Python으로 옮기고, TS 쪽은 그 뒤 제거하거나 브라우저 미리보기용으로만 둔다(P1 끝에 결정).

## 3. 모듈 구성 (의존은 아래로만, 각 모듈 단독 이식 가능)

```
onprem_kit/
  ingest/      xlsx 읽기(openpyxl read_only) · 헤더 매핑 프로파일 · 행 검증          ← openpyxl
  store/       SQLite 스키마 · 동기화 실행 이력 · FTS5 검색 · sizing_input 뷰        ← stdlib sqlite3
  diff/        두 동기화 실행 간 추가·삭제·속성 변경                                 ← store
  review/      데이터 품질·이관 준비도 규칙                                          ← store
  classify/    프로젝트(업무 시스템) 분류: 명명 규칙 정규식 · ESM 컬럼 · 수동 지정       ← store
  graph/       프로젝트 > 망구분 > 서브넷 그룹 + 근거 있는 관계만(inferred 표시)       ← store, classify
  diagram/     보기(project index·project·focus) · 결정적 배치 · draw.io XML       ← graph, defusedxml
  sizing_bridge/ 회사 용량산정 입력 내보내기 · 결과(권장 인스턴스) 가져오기           ← store
  tools/       에이전트 도구 함수(순수 Python) + strands.py(선택, 지연 import)        ← 위 전부
  cli.py       import · inspect · diff · review · render · export-sizing
```

이식 규칙(diagram-bot `docs/porting` 방식):
- 코어(`ingest`~`sizing_bridge`)는 웹·에이전트 프레임워크를 import하지 않는다. DB 경로·매핑 프로파일·draw.io 규격은 인자로 받는다.
- Strands 어댑터는 `tools/strands.py` 한 파일. 회사 에이전트 등록부에 `@tool` 래퍼만 붙이면 된다.
- 이식 레벨: L0 ingest+store → L1 +diff·review → L2 +graph·diagram → L3 +sizing_bridge → L4 +tools. 레벨마다 단독 테스트.

## 4. 데이터 모델 (SQLite)

| 테이블/뷰 | 내용 |
|---|---|
| `sync_runs` | 실행 id, 파일명·SHA-256, 시트, 헤더 행, 매핑 프로파일(JSON), 시작·종료 시각, 행 수·오류 수 |
| `asset_rows` | 실행별 원본 행(JSON) + 행 번호 — 원본 보존(diagram-bot의 `raw`) |
| `assets` | 정규화 현재본: hostname(키), IP, 자산번호, 분류, 제조사·모델, OS, CPU 모델·소켓·코어, 메모리, 센터·랙, 망구분, 담당자, 용도/시스템명, 상태, `last_run_id` |
| `asset_issues` | 실행별 검증 결과(행 번호, 심각도, 코드, 메시지) |
| `assets_fts` | FTS5(hostname, IP, 용도, 담당자, 모델…) — 키워드 검색 |
| `subnets`, `links` (선택) | 대역 관리대장·연결 시트를 받으면 채움. 없으면 그래프가 /24 추정 그룹을 `inferred`로 표시 |
| `utilization` (선택) | CPU/메모리 사용률(avg·p95, 기간). ESM 컬럼·별도 시트·추후 Zabbix |
| `sizing_results` (선택) | 회사 용량산정 결과(권장 인스턴스 패밀리·크기·세대, 근거) 가져온 것 |
| `projects`, `asset_projects` | 프로젝트 목록과 자산 소속(근거: `naming`·`column`·`manual`, 적용 규칙 id). 한 자산이 공통 인프라면 `shared` 표시 |
| `v_sizing_input` | 회사 용량산정 입력 계약에 맞춘 뷰(필드는 P0에서 확정) |

- 키: hostname 정규화(소문자·공백 제거). 같은 hostname 중복 행은 오류, 같은 IP 중복은 경고(VIP·클러스터 가능).
- 동기화는 전량 교체가 아니라 실행 단위 기록 → `diff`가 실행 두 개를 비교.

## 5. 구성도 — 프로젝트 단위 (5,000건 전체를 그리지 않음)

### 5.1 프로젝트 분류 (`classify/`)

- 구성도·이관 웨이브·용량산정 집계의 단위는 **프로젝트(업무 시스템)**.
- 분류 근거는 우선순위 순서로 적용하고, 어떤 근거로 분류했는지 기록한다:
  1. 수동 지정(`manual`) — 예외 자산 보정용 표(엑셀 시트 또는 CLI).
  2. 명명 규칙(`naming`) — 프로파일의 정규식 이름 그룹. 예: `^(?P<site>[a-z]{2})(?P<env>[pdst])-(?P<project>[a-z0-9]{2,6})-(?P<role>[a-z]+)(?P<seq>\d{2})$` → project·env·role 추출.
  3. ESM 컬럼(`column`) — 시스템명/업무명/용도 컬럼 값(동의어 매핑 + 별칭표).
- 규칙은 코드가 아니라 **프로파일 파일**(YAML/JSON)로 관리: 정규식 목록, 코드 → 프로젝트명 별칭표, 공통 인프라 판정(AD·DNS·백업·모니터링 등).
- 결과 리포트: 프로젝트별 자산 수, **미분류 자산**, 명명 규칙 위반, 근거 충돌(이름은 A인데 컬럼은 B). 이 리포트가 준비도 검토(`review/`) 항목이 된다.
- 명명 규칙에서 나온 env(운영/개발/스테이징)·role(web/was/db)은 구성도 배치와 사이징 집계에 그대로 쓴다.

### 5.2 보기

- **project index**: 프로젝트 목록 표(자산 수·망구분·env·준비도). 구성도가 아니라 목록 — 여기서 프로젝트를 골라 들어간다.
- **project**: 프로젝트 하나 → env별 → 망구분 → 서브넷 그룹 → 역할(web/was/db…) 행. 프로젝트 하나는 보통 수~수십 대라 개별 아이콘으로 그림. 상한(예: 60)을 넘으면 같은 역할을 `WAS × 37`로 집계.
- **focus**: 자산 하나와 근거 있는 관계(같은 서브넷, 연결 시트, 같은 프로젝트).
- 공통 인프라(AD·DNS·백업 등)는 프로젝트 구성도 바깥 "공통 서비스" 상자에 참조로만 표시.
- 결정적 배치(같은 입력 → 같은 좌표·같은 XML), draw.io 자동 배치 미사용. 셀 ID는 자산 키 해시.
- To-Be 표시: `sizing_results`가 있으면 자산 라벨에 권장 인스턴스를 덧붙이는 옵션.
- 회사 draw.io 규격(diagram-bot `drawio_spec` 계열)을 받을 수 있게 스타일 표를 인자로 분리.
- **IDC 보기(구현)**: 센터별 IDC 네트워크(방화벽·L4·L3 집계) → 망구분 열(역할 × 대수, 환경별 내역) → 공통 서비스. L3 → 망구분 점선은 추정.
- 구현 메모(2026-10-21): 관계 원천이 없어 화살표는 망구분 계층(DMZ → 업무망 → DB망) 추정만 그린다(`kind: inferred`, 점선, "추정").
  TODO: 연결 시트/방화벽 정책/Zabbix 의존성 → `kind: link` 실선, `focus` 보기, To-Be 라벨(P4), 서브넷 대장 연동(현재 IP /24 추정).

## 6. 에이전트 도구 (회사 Strands 에이전트에 등록)

| 도구 | 반환 |
|---|---|
| `search_assets(query, zone?, role?, limit)` | FTS 검색 결과(자산 요약) |
| `get_asset(hostname)` | 정규화 필드 + 최근 이슈 + 사이징 결과 |
| `list_projects(query?, env?)` | 프로젝트 목록·자산 수·준비도 |
| `project_summary(project)` | 역할·env·망구분·OS별 개수, 미분류·충돌, 이관 준비도 |
| `readiness_report(scope)` | 용량산정에 필요한 필드 누락 자산 목록 |
| `diff_runs(run_a, run_b)` | 추가·삭제·변경 요약 |
| `render_diagram(view, project?, hostname?)` | `.drawio` 경로(또는 XML) + 표시/집계 개수 |
| `export_sizing_input(scope)` | 회사 용량산정 입력 파일/행 수 |

모두 읽기 전용. 결과는 짧은 JSON, 큰 목록은 상한 + 총건수.

## 7. 단계

| 단계 | 내용 | 완료 기준 | 태그 |
|---|---|---|---|
| P0 | 결정: 패키지 이름, ESM 실제 헤더(TD1), 용량산정 입력 필드 계약, 회사 draw.io 규격 유무 | 결정 기록 | `[manual]` |
| P1 | `kit/` 골격, ingest+store+CLI(`import`, `inspect`), 합성 5,000건 생성기, 매핑 프로파일 | 5,000행 import < 5초, 재실행 결정성, pytest | `[auto]` |
| P2 | diff + review(준비도 규칙) + CLI | 합성 두 실행 diff 골든 테스트 | `[auto]` |
| P2.5 | classify: 명명 규칙·컬럼·수동 지정 프로파일, 분류 리포트(미분류·위반·충돌) | 합성 5,000건에서 규칙별 분류 골든 테스트 | `[auto]` |
| P3 | graph + project/focus 배치 + draw.io XML | 골든 XML, 60대 프로젝트 렌더 < 1초, draw.io에서 열림 | **완료(2026-10-21)**: `idc`·`project` 보기, CLI `diagram`, API `/api/diagram/*`, 콘솔 구성도 페이지. 렌더 ≈30ms, draw.io 데스크톱 PNG 내보내기로 열림 확인. `focus` 보기는 TODO |
| P4 | sizing_bridge: 입력 내보내기 + 결과 가져오기 + 구성도 To-Be 라벨 | 계약 스키마 테스트 | `[auto]`(계약 확정 후) |
| P5 | tools + `strands.py` 어댑터 | 도구 단위 테스트, Strands 없이도 import 가능 | `[auto]` |
| P6 | `docs/wiki` + `llms.txt` + 포팅 카드(L0–L4) | 문서 링크 검사 | `[auto]` |
| 이후 | 사용률 시트/Zabbix, 연결 시트, 대역 관리대장, 벤더 config 덧씌우기, 웹 화면 | — | `[manual]` 확인 후 |

게이트: `make check`에 `kit` pytest + ruff를 추가(오프라인, 합성 데이터만).

## 8. P0 결정 항목

- K1. 패키지 이름(가칭 `onprem_kit`)과 `kit/` 위치 — 이 저장소 안 vs 별도 저장소.
- K2. ESM 실제 헤더: `npm run esm:inspect`(P1 뒤에는 `onprem-kit inspect`) 출력 공유. 특히 CPU 모델·코어·메모리·망구분·시스템명 컬럼 유무.
- K3. 회사 용량산정 입력 계약: 필수 필드 이름·단위(메모리 GB/MB, 사용률 avg/p95·기간, 칩셋 표기), 입력 형식(SQLite 테이블 / CSV / 함수 인자).
- K4. 회사 draw.io 규격(아이콘·색·폰트) 재사용 여부.
- K5. 사용률 데이터 1차 원천: ESM 컬럼 / 별도 엑셀 / Zabbix(추후).
- K6. 프로젝트 구분 근거: 호스트 명명 규칙 예시(값은 가린 패턴, 예: `<센터2><환경1>-<업무코드>-<역할><순번2>`), 업무코드 → 프로젝트명 대응표 존재 여부, ESM의 시스템명/업무명 컬럼 유무, 공통 인프라 판정 기준.

## 9. 웹 화면 (2026-10-21 결정)

결정: 디자인 시스템은 **Carbon, IBM Cloud 콘솔형**. 어시스턴트는 **GCP 콘솔의 Gemini / Azure 포털의 Copilot과 같은 패턴**. **MCP는 제외**(EC2 배포 시 연동 불가).

### 9.1 셸 (IBM Cloud 콘솔 패턴)

- 상단 `Header`(g100): 제품명 · 전역 검색(hostname/IP/시스템명, FTS) · 동기화 상태 · 어시스턴트 버튼 · 알림 · 프로필.
- 좌측 내비: 접기 가능, 본문을 밀어내는 in-flow 레일(LESSONS: fixed `SideNav` 금지). 메뉴: 대시보드 / 프로젝트 / 자산 / 구성도 / 동기화 이력 / 준비도 검토 / 용량산정 결과 / 문서.
- 본문(g10): `Breadcrumb` + 페이지 제목 + 우측 주요 버튼, 목록은 Carbon `DataTable`(서버 페이지네이션·필터, 5,000건 기준), 상세는 우측 슬라이드 패널.
- 대시보드: IBM Cloud 대시보드처럼 위젯 타일(자산 수, 프로젝트 수·미분류 자산, 준비도 미충족, 최근 동기화 diff).
- 기존 분석 화면(경로·정책 점검·변경 영향)은 "네트워크 분석(실험)" 메뉴 하나로 접어 둔다.
- 스타일은 Carbon 토큰·컴포넌트만, 컴포넌트별 CSS override 없음(셸 레이아웃 CSS만 허용).

### 9.2 어시스턴트 패널 (Gemini Cloud Assist / Azure Copilot 패턴)

- 상단바 버튼(`AILabel`/sparkle 아이콘)으로 열고, 우측에 **도킹되어 본문을 밀어내는** 패널. 폭 조절, 전체 화면 확대, 새 대화, 닫기.
- 열 때 **현재 화면 문맥**을 같이 보냄(보고 있는 망구분·자산·구성도·동기화 실행) → 첫 화면에 문맥 기반 추천 질문 칩 3–4개.
- 응답: 스트리밍 텍스트, 도구 실행 단계 표시("자산 검색 중…"), **액션 카드**(구성도 열기, 자산 목록 필터 적용, 내보내기 다운로드), 근거 링크(자산·실행·문서), 👍/👎 피드백, "AI 응답은 틀릴 수 있습니다" 안내.
- 구현 후보: `@carbon/ai-chat`(Apache-2.0, 사이드바/커스텀 요소 배치 지원 여부를 P7 착수 시 확인) → 안 맞으면 `@carbon/react`(`AILabel`, `ChatButton`, `TextArea`)로 직접 구성.
- 백엔드 계약(프런트와 에이전트 분리): `POST /api/assistant/messages` → SSE 이벤트 `text_delta` · `tool_start` · `tool_result` · `action`(카드) · `citation` · `done` · `error`. 요청에 `context`(화면 문맥)와 `conversation_id`.
  - 오픈소스 기본 구현: `tools/strands.py` 도구를 쓰는 최소 Strands 에이전트(선택 의존성, 모델 설정 가능).
  - 회사 이식: 같은 SSE 계약으로 **회사 기존 Strands 에이전트**에 도구만 등록 — 에이전트 중복 구현 없음.

### 9.3 단계 추가

| 단계 | 내용 | 태그 |
|---|---|---|
| P7 | 웹 셸(IBM Cloud형) + 자산 DataTable + 구성도 보기(draw.io 뷰어 임베드) — kit HTTP 라우터(FastAPI, 선택 의존성) 위 | `[auto]` |
| P8 | 어시스턴트 패널 + SSE 계약 + 오픈소스 기본 Strands 에이전트 | `[auto]` |
