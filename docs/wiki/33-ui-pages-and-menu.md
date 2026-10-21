# 33. 화면 목록, 메뉴·라우팅, 디자인 시스템 매핑

> **요약**: 현재 콘솔은 자체 상단바·좌측 메뉴와 내부 state 전환을 쓴다. 포팅하면 호스트의 레이아웃·메뉴·라우터 아래 **하나의 상위 메뉴 + 하위 7개 화면**이 된다. Carbon 컴포넌트는 호스트 디자인 시스템으로 바꾼다.
> **근거 소스**: `src/App.tsx`, `src/console/nav.ts`, `src/console/pages/*`, `src/console/common.tsx`, `src/console/AssetDetail.tsx`
> **관련 페이지**: [30](30-dashboard.md), [31](31-diagram-engine.md), [12](12-auto-incremental-sync.md), [41](41-host-integration.md)

## 메뉴 구조 (D-11 기본값)

```text
온프렘 IDC                         /idc
├─ 대시보드                        /idc                       (기본)
├─ Excel 동기화                    /idc/sync
├─ IDC 구성도                      /idc/diagram               ?project=<code> 업무 보기
├─ 업무 시스템                     /idc/systems
│   └─ (상세)                      /idc/systems/:code         탭: 구성도 | 자산
├─ 자산 목록                       /idc/assets                ?q=<검색어>
├─ WEB · WAS · DB                  /idc/components            ?kind=web|was|db&q=
└─ 동기화 이력                     /idc/history               /idc/history/:batchId 배치 상세
```

- 현재 `ConsolePage` 타입(`nav.ts`)의 `{id, code, project, q}`는 URL 경로·쿼리로 옮긴다. 새로고침·링크 공유가 되게 한다.
- 메뉴 그룹 `자산`(업무 시스템, 자산 목록, WEB·WAS·DB)은 호스트 메뉴가 3단계를 지원하지 않으면 평평하게 둔다.
- 상세 화면에서는 상위 메뉴를 선택 상태로 둔다(`navIdOf`: 업무 상세 → 업무 시스템).
- 자산이 없으면 대시보드·구성도·목록 대신 빈 상태 안내([30](30-dashboard.md#빈-상태))를 보여주고, 동기화 화면은 항상 열린다.
- 구성도 편집 중 미저장 변경이 있으면 메뉴 이동 시 확인한다(선택 기능 사용 시).

## 화면별 이식 명세

| 화면 | 현재 파일 | 핵심 동작 | 이식 메모 |
|---|---|---|---|
| 대시보드 | `pages/DashboardPage.tsx` | [30](30-dashboard.md) | — |
| Excel 동기화 | `pages/ImportPage.tsx` | 다중 업로드, 결과 표, 매핑 지정 | **재작성**. 현재 미리보기/확정 UI 중 매핑 선택 부분만 재사용 ([12 §10](12-auto-incremental-sync.md#10-화면-동작-업로드-페이지)) |
| IDC 구성도 | `pages/DiagramPage.tsx` | [31 §7](31-diagram-engine.md#7-화면-diagrampagetsx) | SVG 그리기 코드는 그대로 옮기기 쉬움 |
| 업무 시스템 목록 | `ListPages.tsx:ProjectsPage` | 검색(코드·이름), 열: 업무 시스템·자산·인스턴스·역할·환경·망구분, 행 클릭 → 상세 | 페이지 크기 20/50/100 |
| 업무 시스템 상세 | `ListPages.tsx:ProjectDetailPage` | 제목=업무명, 부제 `자산 N대`, 버튼 `업무 구성도 편집`, 탭 구성도/자산(페이지 50) | — |
| 자산 목록 | `ListPages.tsx:AssetsPage` | 검색(호스트명·IP·시스템명·담당자), 열 10개, 행 클릭 → 상세 모달 | 열: 호스트명, IP, 업무 시스템(미분류·공통 태그), 환경, 설치지역, 장비 종류, OS(+버전), 코어, 메모리(GB), 담당자 |
| 자산 상세 | `AssetDetail.tsx` | 원본 파일/시트/행·등록 번호, 업무 분류 근거 태그, `업무 구성도 열기`, 원본 열 전체 표, SHA-256 | 모달 또는 사이드 패널 |
| WEB · WAS · DB | `pages/ComponentsPage.tsx` | 검색, 종류 필터, 열: 계층·호스트·제품·버전·URL/SID·PORT·업무·서버 연결 | 서버 연결 라벨: 서버 연결됨 / 동명 서버 확인 필요 / 서버 목록 미확인 |
| 동기화 이력 | `ListPages.tsx:SyncPage` | 실행 표 + 직전 대비 변경(서버·장비 / WEB·WAS·DB 전환, 변경·추가·삭제 탭) | **배치 목록 + 배치 상세**로 변경. 변경 내용은 `필드: 이전 → 이후` 최대 3개 |

공통 컴포넌트(`common.tsx`): `PageHeader`(빵부스러기, 제목, 부제, 오른쪽 동작), `ApiGate`(로딩: `불러오는 중…`, 오류: `데이터를 불러오지 못했습니다` + 메시지), `SimpleTable`(빈 표: `표시할 항목이 없습니다.`), `Pager`(`페이지당`, `min–max / 총 N건`). 호스트에 같은 역할의 컴포넌트가 있으면 그것을 쓴다.

## 표시 라벨

- 필드 한글 라벨: [10](10-data-model.md#표준-필드)의 표(원본: `ImportPage.tsx:LABELS`, `ListPages.tsx:FIELD_LABELS`).
- 환경: `p` 운영, `d` 개발, `s` 스테이징(`api.ts:ENV_LABELS`).
- 분류 근거: `column` ESM 컬럼, `host` 연결된 서버, `manual` 수동 지정, `naming` 이름 규칙, 없음 미확인.
- 숫자: ko-KR 천 단위. 시각: UTC를 보는 사람 현지 시각 `YYYY. MM. DD. HH:mm`(24시간).

## Carbon → 호스트 디자인 시스템 매핑

| 현재 (Carbon) | 용도 | 호스트에서 찾을 것 |
|---|---|---|
| `Header`, `HeaderMenuButton`, `Theme`, 자체 `atlas-nav` | 앱 셸·테마 | **이식하지 않음** (호스트 레이아웃 사용) |
| 헤더 `Search` | 전역 자산 검색 | 자산 목록 화면의 검색창으로 충분. 호스트 전역 검색 연동은 선택 |
| `Tile`, `ClickableTile` | KPI·위젯 카드 | Card / Panel |
| `Grid`, `Column` | 대시보드 격자 | Grid / Row-Col |
| `Table*`, `TableContainer`, `Pagination` | 목록 | DataTable / Pagination |
| `Tag` | 상태 태그(미분류, 공통, 추가/삭제/변경) | Badge / Tag |
| `ProgressBar` | 센터별 분포 | Progress / Bar chart |
| `ContentSwitcher`, `Switch` | IDC/업무 전환, 변경 종류 전환 | Segmented control / Tabs |
| `ComboBox` | 업무 선택 | Autocomplete / Select |
| `Tabs`, `Tab*` | 업무 상세 탭 | Tabs |
| `ComposedModal` | 자산 상세 | Modal / Drawer |
| `InlineNotification`, `InlineLoading` | 오류·경고·로딩 | Alert / Spinner |
| `Select`, `Checkbox`, `Button`, `IconButton` | 폼 | 동일 |
| `@carbon/icons-react` 아이콘 | 구성도 노드·범례 | 호스트 아이콘 세트에서 같은 의미(웹, 앱 서버, DB, 방화벽, 보안, 스위치, 스토리지, 백업, 서버) — D-17 |
| `atlas-dg-*` CSS (`styles.css` 204행 이후 구성도 블록) | 구성도 SVG | 호스트 테마 토큰으로 바꿔 이식(배경·테두리·글자색) |

## 포팅 카드

- **반드시 유지**: 화면 목록과 이동 경로, 빈 상태, 검색·필터·페이지, 자산 상세의 원본 행 표시, 구성도 상세 패널.
- **바꿔도 됨**: 셸·테마 전환(제거), 컴포넌트 라이브러리, 레이아웃 세부.
- **검증**: `UI-*`([42](42-acceptance-tests.md)), 기준 `src/console/__tests__/Console.test.tsx`, `Import.test.tsx`.
