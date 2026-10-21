# 2026-10-21 — 시스템 운영자 중심 콘솔 재설계 (ESM·Zabbix 연동, LLM Wiki/Copilot, Azure형 디자인)

Status: Draft — **§0이 §3–§7·§10보다 우선**(2026-10-21 방향 갱신). 자산·구성도·용량산정 범위는 `2026-10-21-onprem-asset-kit.md`가 우선.

## 0. 방향 갱신 (2026-10-21) — diagram-bot 방식 정렬

- 목적: 온프렘 엔터프라이즈 자산 → **편집 가능한 draw.io 인프라 아키텍처** + 검토 + 변경 비교 + 채팅 질의, 최종 용도는 **AWS 마이그레이션**.
- 참조 구현: [men16922/diagram-bot](https://github.com/men16922/diagram-bot) (AWS 읽기 전용 수집 → 스냅샷 → 그래프 → 보기 → 결정적 배치 → draw.io, 검토 규칙, diff, 도구만 고르는 채팅 에이전트, `docs/wiki` + `llms.txt`).
- 자산 원천: API 대신 **ESM xlsx 내보내기 파일 동기화**가 1차. Zabbix 등 추가 연동은 확인 후(TODO).
- NetBox: 필수 경로에서 제외(ESM이 원천, 스냅샷이 사본). `netboxAdapter.ts`·NetBox CSV 내보내기는 선택 연동으로만 유지.
- MCP: 보류. 채팅은 diagram-bot처럼 앱 내부 함수 도구로 구현하고, `src/agent/engineTools.ts`(결정론 도구 6종)를 그대로 등록한다. 외부 채팅 UI(Open WebUI 등)나 다른 에이전트와 도구를 공유해야 할 때만 MCP 래퍼를 다시 만든다.
- D7(결정 대기): 구현 위치 — (a) 이 저장소(TS)에 diagram-bot 파이프라인 재구현, (b) diagram-bot(Python/FastAPI)에 온프렘 원천·보기 추가 + 이 저장소의 TS 엔진은 분석 라이브러리로 유지.

### 0.1 파이프라인 (diagram-bot 대응)

```
ESM xlsx ─▶ esm 스냅샷 {schema_version, metadata(파일·시트·매핑·동기화 시각), coverage(행 수·오류), raw(행 원본)}
             │ (+ 선택) 벤더 config · 연결 시트 · 방화벽 정책 export
             ▼
           graph {nodes: 자산, groups: 센터 > 망구분 > 서브넷/VLAN, edges: 근거 있는 관계만}
             ├─▶ views(전체 / 망구분 상세 / 선택 자산) ─▶ 결정적 배치 ─▶ draw.io XML · PNG
             ├─▶ review(온프렘 검토 규칙)   ├─▶ diff(ESM 동기화 시점 간)
             └─▶ engineTools(통신 확인·정책 점검·변경 영향·AWS 이관 비교) ◀─ 채팅 에이전트(GPT 6 Luna)
```

### 0.2 TODO — 누락 데이터 (ESM 목록만으로는 없는 것)

| # | 데이터 | 없으면 생기는 한계 | 후보 원천 | 상태 |
|---|---|---|---|---|
| TD1 | ESM 실제 헤더·시트 구성 | 자동 매핑 정확도 미확인 | `npm run esm:inspect`(값 미노출 리포트) | 확인 필요 |
| TD2 | 서브넷 마스크·VLAN | 서브넷 그룹을 /32로만 그림 | IP 대역 관리대장, L3 스위치 config | 미정 |
| TD3 | 장비 간 물리/논리 연결 | 연결선 없이 그룹 배치만 | 스위치 LLDP/CDP neighbor, 수동 "연결" 시트 | 형식 정의 필요 |
| TD4 | 라우팅·방화벽 정책 | 통신 판정 = unknown | 벤더 running-config(기존 파서 9종), 방화벽 정책 엑셀 export | 일부 구현 |
| TD5 | L4 VIP ↔ 풀 멤버 | 서비스 진입 경로 누락 | F5/L4 config | 파서 있음 |
| TD6 | 업무(서비스) ↔ 서버 매핑 | 업무 단위 보기·이관 웨이브 불가 | ESM 용도/시스템명 컬럼, CMDB 업무 목록 | 확인 필요 |
| TD7 | 상태·성능(CPU/메모리/트래픽) | 이관 사이징·유휴 판단 불가 | Zabbix export/API | 추후 확인 |
| TD8 | 서버 간 실제 통신 흐름 | 의존성은 정책 근거로만 추정 | 방화벽 로그·NetFlow, Zabbix | 추후 |
| TD9 | AWS To-Be 설계 | 이관 전후 비교 불가 | diagram-bot 설계/수집 스냅샷 | 연계 형식 정의 필요 |

### 0.3 TODO — 누락 기능

| # | 기능 | diagram-bot 대응 | 상태 |
|---|---|---|---|
| TF1 | ESM 스냅샷 봉투(raw 보존, graph 파생) + 동기화 이력 | `snapshot.py`, `store.py` | 미구현 |
| TF2 | 온프렘 그래프(센터 > 망구분 > 서브넷 그룹, 근거 있는 관계만) | `graph.py` | 미구현 |
| TF3 | 보기 3종 + 결정적 배치 + draw.io/PNG 내보내기 | `views.py`, `layout/`, `drawio.py` | 미구현 |
| TF4 | 온프렘 검토 규칙(담당자·IP 누락, 단일 장비 SPOF, EoS OS, 망구분 위반 허용 정책 등) | `findings.py` | 미구현 |
| TF5 | ESM 동기화 간 변경 비교(추가·삭제·속성 변경) | `diff.py` | 미구현 |
| TF6 | 채팅 에이전트(GPT 6 Luna, 함수 도구 = `engineTools.ts` + 자산 검색) | `agent.py` | 도구만 구현 |
| TF7 | AWS 이관 매핑(자산 → 대상 서비스·웨이브), To-Be 스냅샷 연계 | `designer.py` 브라운필드 | 미구현 |
| TF8 | 위키 `docs/wiki` + `llms.txt` | 동일 | 미구현 |
| TF9 | 화면 정리·디자인 시스템 결정(D6) | AWS 콘솔형 UI | 보류 |
| TF10 | Zabbix 연동 | — | 추후 확인 |

### 0.4 이번에 구현된 것 (2026-10-21)

- `src/adapters/esmAssetAdapter.ts`: 제목 행 건너뛰기, 한글 헤더 동의어 자동 매핑 + 수동 덮어쓰기, 호스트명 누락·중복·IP 형식·중복 IP 검증, (선택) NetBox import CSV 7종.
- `src/adapters/xlsxReader.ts`(exceljs, Node 전용), `scripts/esm-inspect.ts`(`npm run esm:inspect -- 파일.xlsx`): 값 없이 매핑·건수·문제 행 번호만 출력.
- `src/adapters/netboxAdapter.ts`: NetBox REST export → 엔진 스냅샷, 벤더 config 덧씌우기(선택 연동).
- `src/agent/engineTools.ts`: `check_reachability`, `propose_firewall_request`, `list_policy_findings`, `simulate_change`, `compare_migration`, `list_workloads` — 채팅 함수 도구로 등록할 결정론 도구.
- 테스트 `assetSources.test.ts`(7), `engineTools.test.ts`(6).

## 1. 문제 정의

현재 콘솔(`src/App.tsx` + 4개 View)은 엔진 개발자 시점으로 만들어져 있음.

- 내비게이션 중복: `HeaderNavigation` 4개 메뉴와 `ContentSwitcher` 4개 탭이 같은 기능을 서로 다른 라벨로 두 번 노출.
- 라벨 과다: "1. 통신 경로 분석기 & 토폴로지 맵 (Reachability Analyzer)"처럼 번호·영문 원어·괄호 설명이 한 줄에 몰림. 이모지 KPI 타일, 벤더명 Tag 나열.
- 내부 구현 노출: `REA 역공학 대역 분석`, `cidr-tools excludeCidr4`, `luciMatchSummary`, `정규화 AST`, `Batfish / Forward 방식`, `Forward Enterprise 및 IP Fabric ... 방식과 동일` 등 운영자에게 의미 없는 근거가 본 화면에 있음.
- 운영자 실제 질문("이 서버 누구 거?", "A→B 통신 돼?", "왜 막혀?", "지금 상태 정상?", "이거 내리면 뭐가 죽어?")에 대한 답보다 엔진 출력이 먼저 보임.
- 자산 원천이 하드코딩 fixture(`src/fixtures/onPremEnterpriseTopology.ts`)뿐이고, 사내 실제 원천(ESM 자산관리, Zabbix 성능)과 연결 경로가 없음.

## 2. 목표 원칙

1. **본 화면 = 운영자 답변만**. 결과 한 문장 + 핵심 수치 + 다음 행동. 판정 근거·알고리즘·원문 config는 "근거 보기" 링크로 Docs 상세 페이지에 둠.
2. **질의는 Copilot으로**. 메뉴를 늘리는 대신 우측 Copilot 패널(chat + agent)이 결정론 엔진을 도구로 호출해 답하고, 답변마다 근거 문서 링크를 붙임.
3. **결정론 엔진이 진실 원천**. LLM은 질의 해석·도구 선택·설명만 담당. 도달성/정책 판정은 `analyzer.ts`, `firewallAuditEngine.ts`, `whatIfMutator.ts`가 계산한 값을 그대로 인용.
4. **자산 원천은 ESM, 상태 원천은 Zabbix**. 토폴로지/정책(벤더 config)은 기존 파서 유지, 세 원천을 hostname/IP 기준으로 조인.

## 3. 정보 구조 (IA) — Azure Portal 패턴

```
┌ 상단바: 제품명 · 전역 검색(자산/IP/hostname) · Copilot 버튼 · 테마 · 사용자
├ 좌측 내비 레일(접기 가능, in-flow — fixed SideNav 금지, LESSONS 참고)
│   홈 / 자산 / 아키텍처 / 통신 확인 / 변경 영향 / 정책 점검 / 문서(Wiki)
├ 본문: Breadcrumb · 페이지 제목 · Command bar(가져오기, 내보내기, 새로고침)
│        └ 상세는 우측 슬라이드 "블레이드"(자산 상세 = 개요·연결·성능·정책·근거 탭)
└ 우측 Copilot 패널(토글)
```

| 메뉴 | 운영자에게 보이는 것 | Docs로 내리는 것 |
|---|---|---|
| 홈 | 자산 수, Zabbix 장애 건수, 최근 변경, 만료 임박 정책 | 엔진 버전·증거(evidence) 해시 |
| 자산 | ESM 목록 표(검색/필터), 상태 배지, 블레이드 상세 | 원본 xlsx 컬럼 매핑, 정규화 로그 |
| 아키텍처 | 존 박스 + 장비 + 링크 SVG 다이어그램, 경로 하이라이트, SVG/PNG/draw.io 내보내기 | 레이아웃 좌표 원본 |
| 통신 확인 | 출발/목적/포트 → "허용/차단 + 막힌 지점 1곳" + 다이어그램 표시 | Hop별 상세 trace, 매칭 룰 원문 |
| 변경 영향 | 변경안 → 깨지는 핵심 서비스 목록, 승인/반려 | MOP 전체, Intent matrix |
| 정책 점검 | 정리 필요 규칙 목록(사유 1줄) | CIDR set-algebra 결과, REA 대역 분석, CLI |
| 문서(Wiki) | 자산/존/정책/방법론 페이지 | (여기가 상세 근거의 집결지) |

멀티벤더 Config 파서/수동 룰 입력 화면은 "자산 > 가져오기" 마법사 안으로 흡수(ESM xlsx, 벤더 config, Containerlab YAML을 같은 가져오기 흐름으로).

## 4. 데이터 연동

### 4.1 ESM 자산 xlsx 가져오기

- 브라우저 내 파싱(서버 전송 없음). 라이브러리: `exceljs` 또는 `read-excel-file` (npm `xlsx@0.18.x`는 업데이트 중단·취약점 이슈로 제외).
- 흐름: 파일 선택 → 시트 선택 → **헤더 자동 매핑**(동의어 사전: 호스트명/Hostname, IP/IP주소, 자산번호, 담당자/관리자, 위치/랙, 용도, OS, 제조사/모델, 운영상태) → 수동 보정 → 검증 리포트(중복 IP, 누락 hostname, 형식 오류) → 반영.
- 매핑 프로파일 저장(재가져오기 시 재사용).
- 새 타입 `AssetRecord`(`src/core/types.ts`)와 `src/adapters/esmXlsxAdapter.ts`. 기존 `DeviceModel`/`WorkloadBinding`과 hostname → IP 순으로 조인, 조인 실패 자산은 "토폴로지 미연결"로 표시.
- 테스트: 합성 xlsx fixture(`fixtures/esm/sample-assets.xlsx`, 가짜 데이터만) + 헤더 변형 케이스.

### 4.2 Zabbix 성능 모니터링

- Zabbix API(JSON-RPC: `host.get`, `problem.get`, `item.get`, `history.get`)는 사내망·토큰·CORS 때문에 브라우저 직접 호출 불가 → **2단계**:
  1. 오프라인 단계 `[auto]`: `src/adapters/zabbixAdapter.ts`가 Zabbix 응답 JSON 형식을 정규화. 합성 fixture로 상태 배지(정상/경고/장애), 활성 Problem, CPU/메모리/트래픽 스파크라인 표시.
  2. 실연동 단계 `[manual]`: 사내에 읽기 전용 커넥터(컨테이너 1개, read-only API 토큰)를 두고 콘솔은 커넥터만 호출.
- 조인 키: Zabbix host `host`/`name`/interface IP ↔ ESM hostname/IP.

## 5. LLM Wiki + Copilot (chat & agent)

### 5.1 Wiki (근거 문서)

- 의미 모델에서 페이지 자동 생성: 자산별, 존별, 정책 규칙별, 점검 결과별, 방법론(기존 `docs/rea-reconstruction-ledger.md` 등) 페이지.
- 운영자 작성 페이지(런북, 장애 대응 절차) 병행. Markdown 저장, 콘솔 내 렌더링, 본 화면의 "근거 보기"가 해당 앵커로 이동.
- Copilot RAG의 검색 코퍼스로 재사용.

### 5.2 Copilot

- 도구(tool-use) 목록: `search_assets`, `get_asset`, `check_reachability`(analyzer), `explain_block`(첫 차단 hop), `simulate_change`(whatIfMutator), `list_policy_findings`, `get_health`(Zabbix), `open_doc`.
- 답변 규칙: 판정 수치는 도구 결과만 인용, 근거 문서 링크 필수, 변경 실행은 하지 않고 "변경안 초안 + 영향도"까지만(실행은 사람이 버튼으로).
- 아키텍처: API 키를 브라우저에 두지 않음 → 얇은 백엔드(Cloud Run scale-to-zero 또는 사내 컨테이너). 도구 실행은 결정론 엔진이므로 프론트/백엔드 어느 쪽이든 동일 코드 재사용.
- 오프라인 게이트: LLM 클라이언트 인터페이스 + mock 구현으로 도구 라우팅·근거 링크 포함 여부를 테스트. 실모델 호출은 `[manual]`.

## 6. 디자인 — Carbon 기반 Azure형

- Carbon 컴포넌트 유지, **테마 토큰 레이어 + 셸 레이아웃 CSS만** 추가(컴포넌트별 개별 override 금지). 기존 가드레일 "styles.css는 5줄 reset만"을 이렇게 완화 → `docs/DECISIONS.md`에 기록.
- 토큰: 주색 Azure 계열 블루, 표면 3단(배경/카드/블레이드), 카드·블레이드에 옅은 그림자와 4–8px 라운드, 한글 본문 폰트(Pretendard 또는 IBM Plex Sans KR), 밀도 높은 표(Compact row).
- 셸: 상단바 + 좌측 레일 + Breadcrumb + Command bar + 우측 블레이드/Copilot 패널.
- 문구: 메뉴 번호·이모지·괄호 영문 제거, 메뉴 라벨 2–6자, 상태는 색 배지 + 단어 1개.
- 라이트/다크 모두 대비 검증.

## 7. 단계별 실행 (NEXT_PLAN에 태그로 반영)

| 단계 | 내용 | 태그 |
|---|---|---|
| R1 | 셸 재구성(상단바·좌측 레일·블레이드), 테마 토큰, 중복 내비/이모지/내부 용어 제거, 근거 섹션을 Docs 링크로 대체 | `[auto]` |
| R2 | ESM xlsx 가져오기(어댑터·매핑·검증·합성 fixture·테스트), 자산 목록/블레이드 | `[auto]` |
| R3 | 아키텍처 SVG 다이어그램(존 박스·링크·경로 하이라이트·내보내기) | `[auto]` |
| R4 | Wiki 페이지 생성기 + 콘솔 내 Docs 뷰 + 근거 링크 연결 | `[auto]` |
| R5 | Zabbix 어댑터 + 합성 fixture + 상태 배지/스파크라인 | `[auto]` |
| R6 | Copilot 도구 레이어 + mock LLM + 패널 UI | `[auto]` |
| R7 | 실 Zabbix 커넥터, Copilot 백엔드·실모델 연결, 사내 배포 | `[manual]` |

R1은 단독 출시 가능. R2·R3·R5는 R1 이후 병렬 가능. R6은 R2–R5의 도구가 있어야 의미가 큼.

## 8. 결정 대기

- D1. **결정(2026-10-21)**: 사내 클라우드 테넌트의 GPT 6 Luna 사용. LLM 클라이언트는 provider 중립 인터페이스로 두고 OpenAI 호환 API 어댑터를 1차 구현.
- D2. ESM xlsx 실제 헤더 구성(값은 가린 헤더 행 1줄이면 충분). — 확인 필요(2026-10-21)
- D3. Zabbix 버전과 접근 방식(API 토큰 발급 가능 여부, 커넥터 설치 위치). — 확인 필요(2026-10-21)
- D4. "정책 점검·변경 영향" 메뉴를 운영자에게도 보일지, 보안/네트워크 담당 역할에만 보일지. — 보류(2026-10-21)

## 9. 가드레일 (유지)

- 자동 루프·테스트는 합성 데이터만. 실 ESM 파일·Zabbix·사내망은 사람 주도(`[manual]`).
- 실 ESM xlsx는 저장소에 커밋하지 않음(`.gitignore`에 `fixtures/esm/private/`).

## 10. 기존 솔루션 조사 (2026-10-21) — Build vs Adopt 제안, 결정 대기 D5/D6

| 필요 기능 | 기존 솔루션 | 비고 |
|---|---|---|
| 자산 SoT + 다이어그램 | NetBox + `netbox-topology-views`(draw.io XML/PNG export) | NetBox bulk import는 CSV/JSON/YAML → ESM xlsx는 변환 필요 |
| ESM↔Zabbix 동기화 | `netbox-zabbix-sync`(TheNetworkGuy), `nbxSync`, Zabbix 공식 NetBox 연동 | NetBox를 SoT로 둘 때만 해당 |
| AI 질의 | NetBox Copilot(2026-02 GA, BYO model), NetBox MCP(read-only), Zabbix MCP(initMAX, read-only 모드) | GPT 6 Luna는 OpenAI 호환 API로 연결 |
| Chat/RAG UI | Open WebUI, LibreChat(MCP 지원), Dify, Onyx | Wiki/런북 코퍼스 + MCP 도구 |
| 경로/관측 | SuzieQ(OSS, path trace), Batfish | 실장비 수집 필요 |
| 방화벽 정책 | Firewall Orchestrator(Cactus, Apache-2.0), Capirca/Aerleon | 시큐아이·안랩 미지원 가능성 높음 |
| 상용 | Forward AI, NetBrain 12.3 AI agents, IP Fabric | 국산 방화벽 지원·비용 확인 필요 |

- D5. 자산 SoT를 자체 구현(R2)할지, NetBox를 도입하고 본 콘솔은 결정론 엔진(도달성·정책·What-if)과 운영자 UX에 집중할지.
- D6. Azure 미감이 목표라면 Carbon 토큰 커스터마이즈 대신 Fluent UI React v9(`@fluentui/react-components`)로 전환할지.
