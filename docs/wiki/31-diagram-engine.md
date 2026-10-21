# 31. 구성도 엔진 — IDC 전체 / 업무 시스템 배치도

> **요약**: 자산·인스턴스로 상자 트리(센터 → 공통 장비 밴드 → WEB/WAS/DB 계층 → 기타 서버 → 공통 서비스)를 만들고, 자동 배치 라이브러리 없이 결정적으로 좌표를 계산해 **레이아웃 JSON(화면 SVG)** 과 **draw.io XML** 을 같은 좌표로 내보낸다. 통신선·서브넷은 추정하지 않는다.
> **근거 소스**: `kit/src/onprem_atlas/diagram/{model,inventory,enterprise,__init__}.py`, `src/console/pages/DiagramPage.tsx`, `kit/tests/test_diagram.py`, `kit/tests/golden/mini-erp.drawio`
> **관련 페이지**: [13](13-components-web-was-db.md), [14](14-business-classification.md), [32](32-diagram-editor-drawio.md), [fixtures/api/diagram-project.json](fixtures/api/diagram-project.json)

## 1. 원칙 (불변식)

- 같은 입력 → 같은 좌표·같은 셀 ID·같은 XML. 셀 ID = 경로 문자열의 SHA-1 앞 12자(`c…`, 간선은 `e…`).
- 5,000대를 개별 아이콘으로 그리지 않는다. IDC 보기는 항상 집계, 업무 보기는 노드가 `max_nodes`(기본 60)를 넘으면 집계.
- WEB/WAS/DB는 **애플리케이션 계층**이다. VLAN·보안존이 아니다.
- IP로 서브넷·통신선을 만들지 않는다. 그리는 선은 ESM에 기재된 **이중화 상대(ha_peer)** 뿐이며(실선, 화살표 없음), 방화벽·망 구획·통신선은 사용자가 편집본에 직접 그린다.
- 흑백 표기(검정 선, 흰 바탕, 역할별 아이콘). 색으로 의미를 구분하지 않는다.

## 2. 입력 준비 (`diagram/__init__.py:render`)

1. 분류가 안 된 데이터면 먼저 분류한다.
2. 자산·인스턴스의 `site`를 `"{organization} / {site 또는 (설치지역 미확인)}"`로 바꾼다(그룹사가 있을 때). 그룹사가 다르면 같은 센터 이름도 다른 상자다.
3. `build_enterprise(assets, components, view, project, profile, max_nodes)`로 트리를 만든다.
4. 이중화 선을 추가하고(§5) 배치(§4) 후 출력(§6).

## 3. 상자 트리 (`diagram/enterprise.py:build_enterprise`)

```text
root (row, 그리지 않음)
├─ title: "IDC 인프라 아키텍처 — 실행 #N" / "{업무명} 인프라 아키텍처 — 실행 #N"
│         부제 "자산 스냅샷 #N · 원천 파일 K개 · YYYY-MM-DD"  (TO-BE: 데이터 버전 #v)
└─ site × 센터 수 (col)            라벨 "{그룹사} / {센터}", 부제 "호스트·장비 N대 · 인스턴스 M개"
   ├─ band "네트워크 · 보안 · 공통 장비" (row, 한 줄 3개)   업무 보기는 라벨 끝에 " (참조)", 센터 전체 장비 기준
   │    └─ agg 장비 종류별: "방화벽 × 2" (부제 = 가장 흔한 모델) … 순서 fw, l4, sw, 나머지 가나다
   ├─ lane (row, 그리지 않음, 자식 높이 맞춤)
   │    ├─ tier "WEB · 프레젠테이션"  (col)
   │    ├─ tier "WAS · 애플리케이션"  (col)
   │    └─ tier "DB · 데이터"         (col)   비면 부제 "등록 정보 없음", 아니면 "애플리케이션 계층"
   ├─ band "서버 인벤토리 · 기타 역할" (row, 3개)  부제 "WEB/WAS/DB 미연결 호스트"
   └─ band "공통 서비스 (참조)" (row, 4개)          shared 자산을 업무별 agg
```

선택 규칙:

| 대상 | IDC 보기 | 업무 보기 (코드 P) |
|---|---|---|
| 자산 | 전체 | `project == P` 이거나, P 인스턴스가 연결된 서버 |
| 인스턴스 | 전체 | `project == P` |
| 장비 밴드 | 그 센터의 선택 자산 중 장비 | 그 센터의 **전체** 자산 중 장비(참조) |
| 계층 내용 | 집계 | 개별(노드 수 > max_nodes면 집계) |

계층 채우기:

- 집계: 인스턴스를 `(업무명 또는 '업무 미확인', 제품)`으로 묶어 agg `"{제품} × n"`, 부제 = 업무명, 메타에 `서버 연결 x/n`. 역할이 `web/was/db`인 서버(명명 규칙이 있을 때만 생김) 중 인스턴스가 없는 서버는 `"{ROLE} 서버 × n"`.
- 개별: 인스턴스마다 node — 라벨 = 제품, 부제 3줄 = `호스트명 · 환경`, `SID 또는 URL · PORT p`, `제품 버전`. 크기 236×100.
- 인스턴스가 연결된 서버는 계층·기타 밴드에 서버 카드로 **다시 그리지 않는다**.
- 기타 밴드: 장비가 아니고, 인스턴스가 연결되지 않았고, 역할이 web/was/db가 아니고, 공통이 아닌 서버. 집계 시 역할(기본은 `역할 미확인`)별 agg.

집계 노드(`inventory._agg_node`) 메타: `count`, `cpu_cores` 합, `memory_gb` 합, `hosts`(정렬 후 최대 20). 부제 기본값 `코어 N · 메모리 MGB`.

## 장비 종류 판별 (`device_kind`)

`cat = category + " " + category_detail`, 대소문자 무시.

| 순서 | 조건 | 결과 | 라벨 |
|---|---|---|---|
| 1 | 보안 정규식(`보안 장비, 방화벽, 악성코드, 이상징후, 바이패스, firewall, security, anti-ddos/spam, nac, ips, ids, waf, utm, fw`) | `방화벽`/`firewall`/단어 `fw`가 있으면 `fw`, 아니면 `security` | 방화벽 / 보안장비(세부분류명으로 묶음) |
| 2 | `미분류 장비` | `other` | 기타 장비 |
| 3 | `san switch`, `san 스위치` | `san` | SAN 스위치 |
| 4 | `백업장비`, `백업 장비`, `tape`, `backup`, `lto` | `backup` | 백업 장비 |
| 5 | `스토리지`, `storage`, `nas`, 또는 정확히 `san` | `storage` | 스토리지 |
| 6 | 네트워크 정규식(`네트워크, 보안 장비, 방화벽, 스위치, 라우터, l4, network, firewall, switch`)에 안 맞음 | `None` (서버) | — |
| 7 | `l4`, `로드밸런서`, `load`, `adc` | `l4` | L4 스위치 |
| 8 | 그 밖 | `sw` | L3/L2 스위치 |

정규식 원문은 `kit/src/onprem_atlas/review/__init__.py:SECURITY_CATEGORY, NETWORK_CATEGORY`. 실측: `보안장비/NAC`→security, `보안장비/방화벽`→fw, `네트워크/L4`→l4, `네트워크 장비/SAN SWITCH`→san, `스토리지/NAS`→storage, `백업장비`→backup, `서버`→None, `미분류 장비`→other.

## 4. 배치 알고리즘 (`diagram/__init__.py:_measure,_place`)

상수: 노드 156×48, 집계 176×52, 인스턴스 노드 236×100, 제목 600×52, `PAD=14`, `HEAD=30`(부제 있으면 +16), `GAP=12`, `TITLE_H=64`.

측정(아래에서 위로):

```text
leaf: 위 크기
container:
  pad, head = (0, 0) if kind in (root, lane) else (14, 30 + (16 if sublabel else 0))
  lines = col이면 자식마다 한 줄, row면 wrap개씩(0이면 한 줄)
  root: inner_w = max(제목 폭, Σ본문 폭 + 2·GAP·(n-1)), inner_h = TITLE_H + max(본문 높이)
  그 밖: inner_w = max(줄 폭들; 줄 폭 = Σ폭 + GAP·(k-1)), 기본값 tier 236 / 그 외 156, tier는 최소 236
         inner_h = Σ줄 높이 + GAP·(줄 수-1), 자식 없으면 24
  w = inner_w + 2·pad,  h = head + inner_h + (root·lane이 아니면 pad)
  stretch(lane): 줄마다 컨테이너 자식의 높이를 줄 최대 높이로 맞춤(col이면 폭을 inner_w로)
```

배치(위에서 아래로): root는 제목을 (0,0), 센터들을 y=`TITLE_H`에 왼쪽부터 폭 + 2·GAP 간격으로 둔다. 컨테이너는 `(x+pad, y+head)`부터 줄 단위로 왼쪽→오른쪽, 위→아래, 간격 GAP.

간선 경로(`_route`): 위아래로 떨어져 있으면 중간 y에서 꺾는 4점(같은 x면 2점), 좌우로 떨어져 있으면 직선 또는 중간 x에서 꺾는 4점.

## 5. 이중화 선 (`render`)

자산 `a`의 `ha_peer`를 소문자로, 같은 그룹사·같은(재작성된) 센터의 호스트명과 비교한다. 정확히 1개 일치하고, 두 자산이 모두 **개별 node 상자로 그려져 있고**, 자기 자신이 아니면 `declared` 간선을 한 번만 추가한다. 집계 보기나 인스턴스가 연결된 서버에는 선이 생기지 않는다([43](43-known-gaps-and-pitfalls.md)).

## 6. 출력

### 레이아웃 JSON (화면용)

`{width, height, stats, boxes[], edges[], legend[], notes[]}` — 실제 예: [diagram-project.json](fixtures/api/diagram-project.json).

- `boxes[]`: `id, parent, kind(title|site|band|tier|node|agg), label, sublabel, style(role:web|net:fw…), color, x, y, w, h, icon, meta`. 부모 먼저 나오며 root·lane은 빠지고 자식이 위로 붙는다. 좌표는 절대 좌표.
- `stats`: `view, project, name, assets, servers, shown, components, unmatched_components, aggregated, sites[], notation, sources[], run`.
- `legend[]`: 그려진 leaf 스타일별 `{style, label, color}`. 순서: role 먼저(WEB, WAS, APP, BATCH, DB 순), 그다음 net.
- `notes[]`: 해석 주의 3문장(계층 ≠ 보안존, 실선 = ESM 기재 이중화, 공통 장비는 참조·수동 편집 가능). 화면 하단에 그대로 보여준다.

### draw.io XML

- `<mxfile compressed="false">` 한 페이지, 셀 `0`, `1` 다음에 상자 셀. 자식 좌표는 **부모 기준 상대 좌표**.
- 컨테이너: `container=1;collapsible=0;align=left;verticalAlign=top`, band·subnet은 점선. leaf: 흰 바탕, 테두리 검정(집계는 두께 2), 아이콘이 있으면 왼쪽 여백 42.
- 아이콘: leaf의 자식 셀 `{id}i`, x=8, 세로 중앙, 28×28, draw.io 내장 도형(오프라인 동작). DB는 `cylinder3`.
- 간선: 직교, 앵커 좌표 지정, `declared`는 화살표 없음.
- 하단 출처 문구 셀 `atlas-provenance`: `자산 목록 기반 배치도 | 실선: ESM 기재 이중화 | 망 구획·통신선: 수동 편집 | 실제 통신·케이블·VLAN 미확인`.
- 스타일·아이콘 표는 `DEFAULT_STYLES` 하나에 모여 있다. 회사 표준 아이콘으로 바꿀 때 이 표만 교체한다.

| 스타일 | draw.io 도형 | 화면 아이콘(Carbon) |
|---|---|---|
| `role:web` | `mxgraph.cisco.computers_and_peripherals.web_browser` | ApplicationWeb |
| `role:was` | `mxgraph.cisco.servers.software_based_server` | Application |
| `role:db` | `cylinder3` | Db2Database |
| `role:`(역할 미확인), `role:app`, `role:bat` | `mxgraph.networks.server` | BareMetalServer |
| `role:svc` | `mxgraph.networks.server_storage` | BareMetalServer |
| `net:fw` | `mxgraph.networks.firewall` | Firewall |
| `net:security` | `mxgraph.cisco.security.lock` | Security |
| `net:l4` | `mxgraph.networks.load_balancer` | Network_3 |
| `net:sw`, `net:san` | `mxgraph.cisco.switches.layer_3_switch`, `mxgraph.networks.switch` | Network_3 |
| `net:storage` | `mxgraph.cisco.storage.fibre_channel_disk_subsystem` | StoragePool |
| `net:backup`, `net:other` | `mxgraph.networks.server_storage` | DataBackup / Network_3 |

## 7. 화면 (`DiagramPage.tsx`)

- 상단: `draw.io에서 직접 편집`(선택 기능) 버튼, `IDC 전체 | 업무 시스템` 전환, 업무 선택 콤보(`{이름} · {자산}대`, 최대 200개).
- 도구 막대: 범례(아이콘+라벨), 업무 보기 집계 시 `서버 N대 — 역할별 집계` 태그, 축소/배율%/확대/화면 맞춤, `draw.io 내려받기`.
- SVG: 컨테이너는 사각형 + 라벨(폭에 맞춰 말줄임), 노드는 카드 + 아이콘 + 라벨 + 부제 최대 3줄, 노드는 키보드 선택 가능(Enter/Space).
- 배율: 처음에는 `max(0.6, 화면 맞춤)`, 화면 맞춤 = `min(1, max(0.2, (프레임 폭-16)/레이아웃 폭))`, 버튼 한 번에 ×1.25, 범위 0.2~2.
- 상세 패널(노드 선택 시): 인스턴스는 제품·버전·PORT·URL/SID·서버 연결·출처, 집계는 자산 수·코어 합계·메모리 합계·호스트 20개, 서버는 IP·OS·CPU·메모리·망구분·운영상태 + `자산 목록에서 보기`.
- 하단: `notes[]` 3문장.
- 업무 시스템 상세 페이지의 `구성도` 탭도 같은 `DiagramView`를 쓴다.

## 8. 포팅 선택지 (D-16)

| 선택 | 장점 | 단점 |
|---|---|---|
| **A. 서버에서 계산 (권장)** — 호스트 백엔드 언어로 약 600줄 이식 | JSON·draw.io가 한 구현에서 나와 좌표 일치, 테스트 쉬움 | 백엔드 언어로 재작성 |
| B. 프런트에서 계산 (TypeScript) | 서버 부담 없음 | `.drawio` 내려받기도 프런트에서 생성해야 함, 데이터 전체 전송 |
| C. Python `onprem_atlas.diagram` 재사용 | 이식 비용 최소 | 호스트가 Python일 때만. `AtlasStore` 의존을 입력 리스트로 바꿔야 함 |

어느 쪽이든 입력을 "분류된 자산 목록 + 보강된 인스턴스 목록"으로 받는 순수 함수로 만든다.

## 포팅 카드

- **반드시 유지**: §1 원칙, 트리 구조와 선택 규칙, device_kind, 집계 기준, 결정적 ID·배치, JSON/XML 좌표 일치, 출처 문구·notes.
- **바꿔도 됨**: 상수(간격·크기), 아이콘 세트(D-17 회사 표준), 글꼴, 화면 컴포넌트.
- **검증**: `DIA-*`([42](42-acceptance-tests.md)) — 부모 이탈·형제 겹침·ID 중복 없음, 두 번 계산 결과 동일, 모든 leaf에 아이콘, 업무 보기 집계 전환, IDC 보기에서 서버가 정확히 한 번 집계. 기준 `kit/tests/test_diagram.py:assert_geometry`.
