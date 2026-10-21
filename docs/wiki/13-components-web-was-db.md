# 13. WEB/WAS/DB 인스턴스와 서버 연결

> **요약**: WEB/WAS/DB 목록의 한 행은 서버가 아니라 **소프트웨어 인스턴스**다. 서버 대수에 더하지 않고 별도로 저장하며, 그룹사·설치지역·호스트명이 **유일하게** 일치하는 서버에만 연결한다. 추정 연결은 없다.
> **근거 소스**: `kit/src/onprem_atlas/components.py`, `store/__init__.py:components`, `kit/tests/test_components.py`
> **관련 페이지**: [10](10-data-model.md#인스턴스-키--componentspyparse_components), [12](12-auto-incremental-sync.md), [31](31-diagram-engine.md)

## 파싱 (`parse_components`)

1. 헤더 탐지는 자산과 같다. 행마다 `normalize_rows`로 공통 필드(호스트명, 그룹사, 설치지역, 업무 계층, IP 등)를 정규화한다.
2. 인스턴스 전용 필드 10개를 읽는다: `product, product_version, version_detail, port, url, sid, ha_mode, rto, monitoring, agent_status`.
3. 검증:
   - `product` 없음 → `MISSING_PRODUCT`(오류)
   - `port`, `url`, `sid` 모두 없음 → `MISSING_ENDPOINT`(오류)
   - `port`가 1~65535 정수가 아님 → `INVALID_PORT`(오류). 정상이면 정수 문자열로 정규화(`"0443"` → `"443"`)
   - 같은 인스턴스 키 중복 → `DUPLICATE_COMPONENT`(오류) — TO-BE는 마지막 행 채택(D-04)
   - 호스트 열 없음 → `MISSING_HOST_COLUMN`(오류)
4. 키: [10](10-data-model.md) 인스턴스 키. `component_kind` = 원천(`web|was|db`).

같은 서버의 다른 포트·SID·URL은 별도 인스턴스다. 제품 버전 변경은 같은 인스턴스의 갱신이다.

## 서버 연결 (`associate`) — 불변식

```text
후보 = 현재 자산 중 lower(hostname)가 같은 것
인스턴스에 organization이 있으면 → 후보 중 lower(organization)이 같은 것만
인스턴스에 site가 있으면         → 후보 중 lower(site)가 같은 것만
후보가 정확히 1개 → asset_key = 그 자산, match_status = matched
후보가 2개 이상   → asset_key = null, match_status = ambiguous
후보가 0개        → asset_key = null, match_status = unmatched
```

- IP·VIP·이름 유사도로 연결하지 않는다.
- 인스턴스에 없는 그룹사·설치지역은 후보를 좁히는 데 쓰지 않는다.
- 서버 목록을 나중에 등록하면 다시 연결된다(연결은 조회 시점 계산). 포팅에서는 **배치 적용 후처리에서 전체 재계산**해 `idc_component.asset_key/match_status`에 저장한다. 5만 건 이하에서는 전체 재계산이 단순하고 충분히 빠르다.

## 조회 시 보강 (`store.components`)

인스턴스마다 다음을 붙여 반환한다.

| 필드 | 값 |
|---|---|
| `project`, `project_name`, `classify_source` | 인스턴스 자체 업무 계층으로 분류([14](14-business-classification.md)). 없으면 연결된 서버의 업무, `classify_source='host'` |
| `environment` | 인스턴스 값, 없으면 서버의 `env` 코드(`p/d/s`) — 표시할 때 라벨로 바꿔야 한다([43](43-known-gaps-and-pitfalls.md)) |
| `site`, `organization` | 인스턴스 값, 없으면 서버 값 |
| `citation` | `component:<key>@run<origin_run>:row<row>` — 포팅 시 `component:<key>@sheet<sheet_id>:row<row>` 형태로 바꿔도 된다 |

## 화면에서의 의미

- 대시보드 KPI `WEB · WAS · DB` = 인스턴스 수, 보조 문구 = 서버 연결 미확인(`match_status != matched`) 수.
- 업무 시스템 목록의 `인스턴스` 열 = 그 업무의 인스턴스 수. `자산` 열에는 업무 분류된 자산 + 그 업무 인스턴스가 연결된 서버가 들어간다(`web/__init__.py:projects`).
- 구성도에서 WEB/WAS/DB 계층은 인스턴스로 채운다. 인스턴스가 있는 서버는 서버 카드로 따로 그리지 않는다. → [31](31-diagram-engine.md)

## 포팅 카드

- **반드시 유지**: 인스턴스 ≠ 서버, 유일 일치 연결, 키 구성, 포트 정규화.
- **검증**: `kit/tests/test_components.py` 3개 테스트의 의미를 호스트 테스트로 옮긴다(인스턴스가 서버 수를 늘리지 않음, 모호·미확인 연결, 중복·잘못된 포트).
