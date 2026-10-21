# 43. 알려진 한계·함정·현재 코드 결함

> **요약**: 포팅 중 그대로 옮기면 안 되는 현재 동작과, 이 저장소에서 실제로 겪은 함정을 모았다. 각 항목에 "포팅 시 조치"가 있다.
> **근거 소스**: `docs/LESSONS.md`, `docs/evaluation.md`, 이 위키 작성 중 합성 데이터로 재현한 결과(`scripts/wiki_samples.py`)
> **관련 페이지**: [12](12-auto-incremental-sync.md), [31](31-diagram-engine.md), [33](33-ui-pages-and-menu.md)

## 현재 코드 결함·어색한 동작 (그대로 옮기지 말 것)

| # | 현상 | 근거 | 포팅 시 조치 |
|---|---|---|---|
| G-01 | 인스턴스 상자 부제에 환경 코드 `p`가 그대로 보인다(`erp-web-01 · p`) | `store.components`가 서버의 `env` 코드로 `environment`를 채움, [diagram-project.json](fixtures/api/diagram-project.json) | 표시할 때 `ENV_LABELS`로 바꾸거나, 보강 시 라벨 값을 넣는다 |
| G-02 | 업무 보기에서 인스턴스가 연결된 서버끼리의 이중화 선이 그려지지 않는다(`erp-web-01 ↔ 02`) | 이중화 선은 개별 서버 node 사이에만 생기는데, 인스턴스가 있는 서버는 서버 node로 그리지 않음([31 §5](31-diagram-engine.md#5-이중화-선-render)) | 1차는 현재 동작 유지. 필요하면 "같은 계층 인스턴스의 호스트가 서로 ha_peer"일 때 인스턴스 노드 사이 선을 추가(신규 결정) |
| G-03 | `/api/projects`가 이관 준비도 잔재인 `readiness`, `issues`를 반환한다 | `web/__init__.py:projects` | 제거 |
| G-04 | `summary.assets.network`는 보안·스토리지·백업 장비까지 포함한다 | `is_server` 반대 집합 | 이름을 `devices`로 |
| G-05 | 인스턴스 원천에서 `MISSING_IP` 경고가 행마다 나온다(인스턴스 목록엔 IP 열이 없는 게 정상) | `components.parse_components`가 `normalize_rows` 재사용 | 인스턴스 원천에서는 `MISSING_IP` 생략 |
| G-06 | 인스턴스 분류는 설정된 분류 프로파일이 아니라 항상 기본 프로파일을 쓴다 | `store.components`: `ClassifyProfile()` | 자산과 같은 프로파일 사용 |
| G-07 | 같은 파일 재등록도 새 실행·전체 복사본·원본 파일이 쌓인다 | `docs/evaluation.md` | [12](12-auto-incremental-sync.md) TO-BE |
| G-08 | `replace`는 원천 전체를 대상으로 해서 일부 그룹사/센터 파일로 다른 범위를 지울 수 있다 | `docs/evaluation.md` | 범위 한정 소프트 삭제(D-06) |
| G-09 | 보안장비의 동작방식·담당팀·부담당자·모니터링 여부는 원본 행에만 있고 변경 비교 대상이 아니다 | `docs/evaluation.md` | 1차는 동일. 필요하면 표준 필드 추가 |
| G-10 | 네트워크 공통 장비가 업무 미분류로 집계되어 대시보드 `미분류 자산`을 키운다 | `summary.assets.unclassified` | 미분류 수를 서버 기준으로 따로 보여줄지 결정(제안: 서버 미분류와 장비를 분리 표시) |
| G-11 | `summary.sites`는 센터 이름만 세고, 구성도는 `그룹사 / 센터`로 나눈다 | `web/__init__.py:summary`, `diagram.render` | 그룹사가 여럿이면 대시보드도 `그룹사 / 센터`로 |
| G-12 | `store.get_asset(hostname)`은 키를 호스트명 소문자로 가정한다(그룹사 범위 키는 키 전체를 넘겨야 찾음) | `store/__init__.py:get_asset` | 키로만 조회하는 API로 정리 |

## 실제로 겪은 함정

- **SQLite + 실제 서버 동시 요청**: FastAPI 의존성과 핸들러가 다른 스레드에서 돌아 기본 sqlite 연결이 500을 냈다. `TestClient` 순차 요청으로는 재현되지 않았다. → 호스트 DB 풀을 쓰면 해당 없음. 그래도 **실제 서버에 병렬 요청하는 테스트**를 하나 둔다(API-04).
- **분류 실패 시 부분 커밋**: 등록 후 분류가 실패하면 등록만 남는 문제가 있었다. 분류를 같은 트랜잭션(중첩은 savepoint)에서 끝낸다(SYNC-21).
- **저장 경합**: 편집본 저장 응답 전에 들어온 편집이 "저장됨"으로 표시됐다. 서버가 확인한 XML과 현재 XML이 같을 때만 미저장 표시를 지운다.
- **좁은 화면 메뉴**: 42rem 미만에서 내비를 무조건 숨겨 메뉴를 열어도 안 보였다. 호스트 레이아웃에서는 해당 없음.
- **Carbon `SideNav` 겹침**: 고정 위치 SideNav가 본문을 가렸다. 호스트 레이아웃에서는 해당 없음.
- **ESM 의미**: `용도=운영`은 환경이지 업무명이 아니다. OS 종류/버전, 대표/관리/서비스 IP, 서버/장비 원천은 분리해야 한다. 화면 캡처의 잘린 헤더는 실제 헤더가 아닐 수 있다 → 실제 파일로 D-08 보정.
- **Vite 프록시 Origin**: 로컬 개발 프록시가 Host 포트를 바꿔 Origin 검사가 실패했다. 호스트에서는 Vite 프록시를 쓰지 않는다.
- **xlsx 해시**: 같은 내용이라도 저장할 때마다 zip 항목 시각이 달라 SHA-256이 달라진다. "같은 파일" 판단은 바이트 해시, "같은 내용" 판단은 레코드 비교로 한다(S02 vs S03).

## 범위 밖 (요청이 와도 별도 과제)

랙 실장도·케이블 경로, 실제 통신 경로·정책 판정, Zabbix 사용률, 회사 Agent 연동, AWS 이관 분석.
