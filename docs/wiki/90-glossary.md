# 90. 용어집

> **요약**: 화면 한국어 용어와 코드 이름의 대응.
> **관련 페이지**: [10](10-data-model.md), [12](12-auto-incremental-sync.md)

| 화면/업무 용어 | 코드 이름 | 뜻 |
|---|---|---|
| ESM | — | 회사 자산관리 시스템. SSO 로그인 후 목록을 Excel로 내려받는다 |
| 원천 / 목록 종류 | `source_id` | servers, equipment, security, web, was, db |
| 자산 | asset, `run_assets` → `idc_asset` | 서버·네트워크·보안·스토리지·백업 장비 한 대 |
| 인스턴스 | component, `run_components` → `idc_component` | WEB/WAS/DB 소프트웨어 설치 단위(제품·포트·URL/SID) |
| 서버 연결 | `asset_key`, `match_status` | 인스턴스가 어느 서버에 있는지. matched / ambiguous / unmatched |
| 업무 시스템 | `project`, `project_code`, `project_name` | ITSM 대/중/소 + 그룹사로 정한 업무 단위. 코드 `biz-…` |
| 공통 서비스 | `shared` | 프로파일 `shared_codes`에 있는 업무(AD/DNS 등). 기본값에는 없음 |
| 환경 | `env` (`p`/`d`/`s`) | 운영/개발/스테이징(검증). ESM `용도` |
| 역할 | `role` | web/was/db 등. 명명 규칙에서만 나옴 |
| 그룹사 | `organization` | 소유 회사. 키와 구성도 센터 경계에 포함 |
| 설치지역 / 센터 | `site` | IDC 위치 |
| 망구분 | `zone` | ESM 기재 값. 구성도에서 보안존으로 그리지 않음 |
| 장비 종류 | `device_kind` | fw, security, l4, sw, san, storage, backup, other, None(서버) |
| 실행 (AS-IS) | `sync_runs` | 등록 한 번 = 전체 스냅샷 |
| 배치 (TO-BE) | `idc_sync_batch` | 업로드 한 번(파일 여러 개) |
| 데이터 버전 | `dataset_version` | 실제 변경이 있을 때만 증가하는 현재 데이터 버전 |
| 헤더 서명 | `header_signature` | 정규화 헤더 목록의 해시. 저장된 매핑 재사용 키 |
| 매핑 프로파일 | `MappingProfile` | 시트·헤더 행·필드→열 이름·추가 동의어·메모리 단위 |
| 분류 프로파일 | `ClassifyProfile` | 명명 규칙·공통 코드·수동 지정·표시 이름 |
| 이중화 서버 | `ha_peer` | ESM에 기재된 상대 호스트명. 구성도의 유일한 선 |
| IDC 구성도 | `view=idc` | 센터별 집계 배치도 |
| 업무 구성도 | `view=project` | 업무 하나의 배치도 |
| 편집본 | `diagram_documents` → `idc_diagram_document` | 사용자가 draw.io로 고친 도면. 추가 전용 이력 |
| 출처 / 인용 | `citation`, `origin_*` | 레코드 값을 쓴 원본 파일·시트·행 |
