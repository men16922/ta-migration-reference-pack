# 10. 데이터 모델 — 표준 필드, 식별 키, 목표 스키마

> **요약**: 자산 34개 + 인스턴스 전용 10개 = 표준 필드 44개. 자산 키는 `그룹사|설치지역|호스트명`(소문자), 인스턴스 키는 원천·호스트·제품·엔드포인트·업무의 해시다. 포팅 시 저장은 "현재 상태 + 변경 로그"로 바꾼다.
> **근거 소스**: `kit/src/onprem_atlas/ingest/mapping.py:FIELDS,SYNONYMS`, `ingest/validate.py:normalize_rows`, `components.py:IDENTITY_FIELDS`, `store/__init__.py:SCHEMA`
> **관련 페이지**: [11](11-excel-ingest.md), [12](12-auto-incremental-sync.md), [13](13-components-web-was-db.md)

## 표준 필드

헤더 비교는 `normalize_header`: 앞뒤 공백 제거, 연속 공백 1칸, **소문자**. 동의어와 **완전 일치**해야 한다(부분 일치 없음). `ip 주소`와 `ip주소`는 서로 다른 문자열이라 둘 다 등록되어 있다.
한 필드는 한 열에만 매핑된다. 왼쪽 열부터 보며 `IMPORT_FIELDS` 순서로 처음 맞는 필드에 붙는다(`mapping.py:match_headers`).

<!-- 아래 표는 코드에서 생성했다: FIELDS/SYNONYMS(mapping.py), _TYPES/_FTS_FIELDS(store), LABELS(ImportPage.tsx) -->

| # | 필드 | 한글 라벨 | 타입 | 기본 동의어 (정규화 후 완전 일치) | 검색 |
|---|---|---|---|---|---|
| 1 | `hostname` | 호스트명·장비명 | TEXT | `호스트명`, `호스트`, `hostname`, `host name`, `host`, `장비명`, `서버명`, `자산명` | ✓ |
| 2 | `ip` | 대표 IP | TEXT | `ip`, `ip주소`, `ip 주소`, `대표ip`, `ip address`, `호스트IP` | ✓ |
| 3 | `asset_tag` | 자산번호 | TEXT | `자산번호`, `자산코드`, `관리번호`, `asset tag`, `asset no` | ✓ |
| 4 | `serial` | 시리얼 | TEXT | `시리얼`, `BOX 시리얼 번호`, `BOX 시리얼번호`, `시리얼번호`, `s/n`, `serial`, `serial number` |  |
| 5 | `category` | 장비 범주 | TEXT | `자산분류`, `분류`, `자산유형`, `장비유형`, `장비범주`, `구분`, `category`, `type` | ✓ |
| 6 | `manufacturer` | 제조사 | TEXT | `제조사`, `BOX 제조사`, `벤더`, `manufacturer`, `vendor`, `maker` |  |
| 7 | `model` | 모델 | TEXT | `모델`, `모델명`, `BOX 모델`, `model` | ✓ |
| 8 | `os` | OS 종류 | TEXT | `os`, `OS종류`, `OS 종류`, `운영체제`, `platform` | ✓ |
| 9 | `cpu_model` | CPU 모델 | TEXT | `cpu`, `cpu모델`, `cpu 모델`, `cpu 모델명`, `프로세서`, `칩셋`, `cpu model` |  |
| 10 | `cpu_sockets` | CPU 소켓 | INTEGER | `cpu소켓`, `cpu 소켓`, `소켓수`, `소켓`, `sockets` |  |
| 11 | `cpu_cores` | CPU 코어 | INTEGER | `cpu코어`, `CPU Core(ea)`, `cpu 코어`, `코어수`, `총코어`, `core`, `cores`, `vcpu` |  |
| 12 | `memory_gb` | 메모리(GB) | REAL | `메모리`, `메모리(gb)`, `Memory(GB)`, `메모리 용량`, `memory`, `mem`, `ram` |  |
| 13 | `site` | 설치지역 | TEXT | `센터`, `설치위치`, `설치지역`, `위치`, `사이트`, `idc`, `site`, `location` | ✓ |
| 14 | `rack` | 상면번호 | TEXT | `랙`, `랙번호`, `상면번호`, `rack` |  |
| 15 | `zone` | 망구분 | TEXT | `망구분`, `보안존`, `보안영역`, `네트워크존`, `zone`, `security zone` | ✓ |
| 16 | `system_name` | 시스템명 | TEXT | `시스템명`, `업무명`, `서비스명`, `system`, `service` | ✓ |
| 17 | `owner` | 담당자 | TEXT | `담당자`, `관리자`, `운영담당`, `운영자`, `담당자(정)`, `owner` | ✓ |
| 18 | `status` | 사용 상태 | TEXT | `상태`, `운영상태`, `사용여부`, `사용`, `status` |  |
| 19 | `organization` | 그룹사(BOX) | TEXT | `그룹사명`, `그룹사명(BOX)`, `그룹사(BOX)`, `그룹사` | ✓ |
| 20 | `os_organization` | 그룹사(OS) | TEXT | `그룹사명(OS)`, `그룹사(OS)` |  |
| 21 | `management_ip` | 관리 IP | TEXT | `관리IP`, `관리 IP` | ✓ |
| 22 | `service_ip` | 서비스 IP | TEXT | `서비스IP`, `서비스 IP` | ✓ |
| 23 | `category_detail` | 장비 세부분류·솔루션 유형 | TEXT | `세부분류`, `솔루션 유형`, `솔루션유형` |  |
| 24 | `os_family` | OS 범주 | TEXT | `OS범주`, `OS 범주` |  |
| 25 | `os_version` | OS 버전 | TEXT | `OS 버전`, `OS버전` |  |
| 26 | `environment` | 환경·용도 | TEXT | `용도`, `환경` |  |
| 27 | `business_l1` | ITSM 업무 대분류 | TEXT | `ITSM 업무(대)`, `ITSM 업무명(대분류)`, `ITSM 업무(대분류)` |  |
| 28 | `business_l2` | ITSM 업무 중분류 | TEXT | `ITSM 업무(중)`, `ITSM 업무명(중분류)`, `ITSM 업무(중분류)` |  |
| 29 | `business_l3` | ITSM 업무 소분류 | TEXT | `ITSM 업무(소)`, `ITSM 업무명(소분류)`, `ITSM 업무(소분류)` | ✓ |
| 30 | `description` | 설명 | TEXT | `설명` | ✓ |
| 31 | `rack_unit` | 랙 시작 U | TEXT | `랙시작위치`, `랙 시작위치` |  |
| 32 | `ha_peer` | 이중화 서버 | TEXT | `이중화서버`, `이중화 서버` |  |
| 33 | `eos_date` | EOS 날짜 | TEXT | `EOS 날짜`, `EOS 종료 일자`, `EOS날짜` |  |
| 34 | `monitoring_proxy` | 모니터링 Proxy | TEXT | `Zabbix Proxy` |  |
| 35 | `product` | 제품명 | TEXT (인스턴스) | `WEB제품`, `WAS제품`, `DB제품`, `제품명` |  |
| 36 | `product_version` | 제품 버전 | TEXT (인스턴스) | `WEB제품버전`, `WAS제품버전`, `DB제품버전`, `제품버전` |  |
| 37 | `version_detail` | 버전 상세 | TEXT (인스턴스) | `WEB제품버전상세`, `WAS제품버전상세`, `버전상세` |  |
| 38 | `port` | PORT | TEXT (인스턴스) | `PORT`, `포트` |  |
| 39 | `url` | URL | TEXT (인스턴스) | `URL` |  |
| 40 | `sid` | DB명(SID) | TEXT (인스턴스) | `DB명(SID)`, `SID` |  |
| 41 | `ha_mode` | 이중화 방식 | TEXT (인스턴스) | `이중화방식` |  |
| 42 | `rto` | ITSM RTO | TEXT (인스턴스) | `ITSM RTO` |  |
| 43 | `monitoring` | 모니터링 여부 | TEXT (인스턴스) | `모니터링 여부` |  |
| 44 | `agent_status` | AGENT 상태 | TEXT (인스턴스) | `AGENT` |  |

매핑되지 않은 열도 버리지 않는다. 원본 행 전체(`cells`)를 보존하고 자산 상세에서 "원본 자산 정보"로 보여준다(보안장비의 동작방식·담당팀·모니터링 여부 등).

## 식별 키 (불변식)

### 자산 키 — `ingest/validate.py:normalize_rows`

```text
organization이 비어 있지 않으면:  lower(trim(organization)) + "|" + lower(trim(site)) + "|" + lower(trim(hostname))
organization이 비어 있으면:       lower(trim(hostname))
```

- `site`가 비어도 그룹사가 있으면 `합성조직||host01` 형태다.
- 원본 대소문자는 `hostname` 값에 그대로 남는다. 키만 소문자다.
- 실측 예: `그룹사명(BOX)=합성조직, 설치지역=시험센터, 호스트명=Test-App-01` → 키 `합성조직|시험센터|test-app-01`.
- 호스트명이 바뀌면 다른 자산이다. 자산번호/시리얼로 연결하지 않는다(D-01).

### 인스턴스 키 — `components.py:parse_components`

```text
identity = [kind, lower(organization), lower(site), lower(hostname),
            product, port, url, sid, business_l1, business_l2, business_l3, system_name]
key = "component-" + sha256(JSON(identity, ensure_ascii=False, 구분자 ", " / ": "))[:24]
```

- `kind`는 `web|was|db`. 빈 값은 그룹사·설치지역·호스트명만 `""`, 나머지는 `null`.
- `port`는 키 계산 전에 정수 문자열로 정규화된다(`"0443"` → `"443"`).
- 실측 예: `["was", "합성조직", "시험센터", "test-app-01", "Tomcat", "8080", null, null, "지원", "업무", "합성 ERP", null]` → `component-429ad84cab6a1139ccd38c56`.
- 기존 데이터를 옮기지 않는 새 구축이면 같은 필드 조합의 다른 안정적 해시를 써도 된다. 기존 DB를 이관하면 위 직렬화를 그대로 재현한다(Python `json.dumps` 기본 구분자 `", "`, `": "`).

### 업무 시스템 코드 — `classify/__init__.py:classify_assets`

```text
project = "biz-" + sha256("/".join([organization or "", business_l1 or "", business_l2 or "", business_l3_or_system_name]))[:12]
```

대소문자를 바꾸지 않는다. 실측 예: `합성조직/지원/업무/합성 ERP` → `biz-bd93128d732c`. 상세는 [14](14-business-classification.md).

## 목표 스키마 (TO-BE)

현재 SQLite 스키마(`sync_runs`, `run_assets`, `run_components` 등)는 등록마다 전체를 복사한다. 포팅에서는 아래처럼 **현재 상태 + 변경 로그**로 바꾼다. 호스트 DB 방언·명명 규칙에 맞게 바꾸되 의미는 유지한다. PostgreSQL 기준 예시:

```sql
-- 테넌트 단위 데이터 버전. 변경이 있는 배치가 적용될 때만 +1.
CREATE TABLE idc_dataset (
  tenant_id   TEXT PRIMARY KEY,
  version     BIGINT NOT NULL DEFAULT 0
);

-- 업로드 1회 = 배치 1개
CREATE TABLE idc_sync_batch (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  requested_by  TEXT NOT NULL,
  client_token  TEXT,                         -- 멱등 재시도 키
  status        TEXT NOT NULL,                -- running | applied | no_change | partial | failed
  dataset_version BIGINT,                     -- 적용 후 버전
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  added INT DEFAULT 0, changed INT DEFAULT 0, unchanged INT DEFAULT 0, removed INT DEFAULT 0,
  skipped INT DEFAULT 0, conflicts INT DEFAULT 0, errors INT DEFAULT 0, warnings INT DEFAULT 0,
  UNIQUE (tenant_id, client_token)
);

CREATE TABLE idc_sync_file (
  id            BIGSERIAL PRIMARY KEY,
  batch_id      BIGINT NOT NULL REFERENCES idc_sync_batch(id),
  file_name     TEXT NOT NULL,
  sha256        CHAR(64) NOT NULL,
  size_bytes    BIGINT NOT NULL,
  last_modified TIMESTAMPTZ,                  -- 브라우저 File.lastModified (적용 순서, D-07)
  storage_uri   TEXT,                         -- 원본 보관 위치 (D-09)
  status        TEXT NOT NULL                 -- applied | skipped_same_file | failed
);
CREATE INDEX idc_sync_file_sha ON idc_sync_file (sha256);

CREATE TABLE idc_sync_sheet (
  id            BIGSERIAL PRIMARY KEY,
  file_id       BIGINT NOT NULL REFERENCES idc_sync_file(id),
  sheet_name    TEXT NOT NULL,
  source_id     TEXT,                         -- servers|equipment|security|web|was|db, 미판별이면 NULL
  detect_reason TEXT,                         -- 자동 판별 근거 (예: "header:WAS제품")
  header_row    INT,
  headers       JSONB,
  mapping       JSONB,                        -- 필드 → 열 이름
  header_signature CHAR(64),                  -- 정규화 헤더 목록 해시 (저장된 매핑 재사용)
  status        TEXT NOT NULL,                -- applied | needs_mapping | failed | empty
  row_count INT, added INT, changed INT, unchanged INT, skipped INT, conflicts INT, errors INT, warnings INT
);

CREATE TABLE idc_sync_issue (
  sheet_id   BIGINT NOT NULL REFERENCES idc_sync_sheet(id),
  row_number INT NOT NULL,
  severity   TEXT NOT NULL,                   -- error | warning
  code       TEXT NOT NULL,                   -- 11번 페이지 "이슈 코드" 표
  message    TEXT NOT NULL
);

CREATE TABLE idc_raw_row (                    -- 출처 보존용 원본 행
  sheet_id   BIGINT NOT NULL REFERENCES idc_sync_sheet(id),
  row_number INT NOT NULL,
  cells      JSONB NOT NULL,
  PRIMARY KEY (sheet_id, row_number)
);

-- 현재 자산 (servers/equipment/security)
CREATE TABLE idc_asset (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  hostname TEXT NOT NULL, ip TEXT, asset_tag TEXT, serial TEXT, category TEXT, manufacturer TEXT, model TEXT,
  os TEXT, cpu_model TEXT, cpu_sockets INT, cpu_cores INT, memory_gb DOUBLE PRECISION, site TEXT, rack TEXT,
  zone TEXT, system_name TEXT, owner TEXT, status TEXT, organization TEXT, os_organization TEXT,
  management_ip TEXT, service_ip TEXT, category_detail TEXT, os_family TEXT, os_version TEXT, environment TEXT,
  business_l1 TEXT, business_l2 TEXT, business_l3 TEXT, description TEXT, rack_unit TEXT, ha_peer TEXT,
  eos_date TEXT, monitoring_proxy TEXT,
  -- 분류 결과 (14번 페이지)
  project_code TEXT, env TEXT, role TEXT, classify_source TEXT, shared BOOLEAN DEFAULT FALSE,
  -- 추적
  origin_sheet_id BIGINT, origin_row_number INT,   -- 마지막으로 값을 쓴 원본 행
  source_modified_at TIMESTAMPTZ,                 -- 마지막으로 값을 쓴 파일의 수정 시각 (D-07)
  first_batch_id BIGINT, last_changed_batch_id BIGINT, last_seen_batch_id BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE, removed_batch_id BIGINT,   -- 소프트 삭제 (D-06)
  PRIMARY KEY (tenant_id, key)
);

-- 현재 인스턴스 (web/was/db)
CREATE TABLE idc_component (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,                   -- component-…
  source_id   TEXT NOT NULL,                   -- web|was|db
  component_kind TEXT NOT NULL,                -- = source_id
  values      JSONB NOT NULL,                  -- 44개 필드 중 값 (열로 펼쳐도 됨)
  asset_key   TEXT,                            -- 연결된 서버 자산 키
  match_status TEXT NOT NULL,                  -- matched | ambiguous | unmatched
  project_code TEXT, env TEXT, classify_source TEXT,
  origin_sheet_id BIGINT, origin_row_number INT, source_modified_at TIMESTAMPTZ,
  first_batch_id BIGINT, last_changed_batch_id BIGINT, last_seen_batch_id BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE, removed_batch_id BIGINT,
  PRIMARY KEY (tenant_id, key)
);

-- 업무 시스템 표시 이름
CREATE TABLE idc_project (
  tenant_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  organization TEXT, business_l1 TEXT, business_l2 TEXT, business_l3 TEXT,
  PRIMARY KEY (tenant_id, code)
);

-- 필드 단위 변경 로그 (이력·대시보드 "최근 변경"의 근거)
CREATE TABLE idc_change (
  id          BIGSERIAL PRIMARY KEY,
  batch_id    BIGINT NOT NULL REFERENCES idc_sync_batch(id),
  record_type TEXT NOT NULL,                   -- asset | component
  key         TEXT NOT NULL,
  op          TEXT NOT NULL,                   -- add | update | remove
  field       TEXT,                            -- update일 때 필드명
  before      TEXT,
  after       TEXT
);
CREATE INDEX idc_change_batch ON idc_change (batch_id, record_type, op);

-- 헤더 서명별 매핑 프로파일 (한 번 지정하면 이후 자동)
CREATE TABLE idc_mapping_profile (
  tenant_id TEXT NOT NULL, header_signature CHAR(64) NOT NULL,
  source_id TEXT NOT NULL, profile JSONB NOT NULL,   -- {"columns": {...}, "header_row": n, "memory_unit": "auto"}
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, header_signature)
);

-- (선택, D-10) draw.io 편집본
CREATE TABLE idc_diagram_document (
  tenant_id TEXT NOT NULL, scope TEXT NOT NULL,      -- 'idc' | 'project:<code>'
  revision INT NOT NULL, base_dataset_version BIGINT NOT NULL,
  xml TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, scope, revision)
);
```

### 검색

현재는 SQLite FTS5 trigram(3자 이상 부분 문자열, 미만은 LIKE)을 쓴다(`store.search`). 포팅에서는 호스트 기능을 쓴다: PostgreSQL `pg_trgm` GIN 인덱스, 호스트 검색 엔진, 또는 5만 건 이하라면 `ILIKE`. 검색 대상 필드는 위 표의 "검색" 열 15개다.

### 테넌트

호스트에 멀티테넌시가 없으면 `tenant_id`를 상수로 두거나 열을 뺀다. 그룹사별 접근 제어(D-14)는 `organization` 열 필터로 구현한다.
