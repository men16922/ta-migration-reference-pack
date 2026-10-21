# 14. 업무 시스템 분류와 환경

> **요약**: 업무 시스템(내부 이름 `project`)은 ESM의 **ITSM 업무 대/중/소 분류와 그룹사**로 정한다. 호스트 명명 규칙은 회사가 확인한 프로파일이 있을 때만 쓴다. 기본 설정에서는 이름으로 추정하지 않는다.
> **근거 소스**: `kit/src/onprem_atlas/classify/__init__.py`, `kit/examples/classify-synthetic.json`(테스트 전용), `kit/tests/test_enterprise_import.py:test_default_registration_does_not_infer_from_demo_hostnames`
> **관련 페이지**: [10](10-data-model.md), [13](13-components-web-was-db.md), [31](31-diagram-engine.md)

## 우선순위 (불변식)

레코드마다 아래 순서로 결정하며 뒤의 규칙이 앞의 결과를 덮는다.

1. **명명 규칙**(프로파일 `rules`에 정규식이 있을 때만): 호스트명 첫 마디(`.` 앞)를 소문자로 매칭. 이름 그룹 `project`(필수), `env`, `role`, `site`. `source='naming'`.
2. **시스템명 학습**: 명명 규칙으로 분류된 자산들의 `system_name`별 다수결 코드를, 규칙에 걸리지 않은 같은 `system_name` 자산에 적용. `source='column'`.
3. **명시적 ITSM 계층 (기본 경로)**: `explicit = business_l3`, 없으면 (2번 학습값이 없을 때) `system_name`. 값이 있으면
   `project = "biz-" + sha256(organization/business_l1/business_l2/explicit)[:12]`, `source='column'`, 충돌 표시 해제.
4. **환경**: `environment` 값이 `운영`→`p`, `개발`→`d`, `검증`·`스테이징`→`s`, 그 밖은 원문 그대로.
5. **수동 지정**: 프로파일 `manual`(자산 키 → 코드)이 있으면 최우선. `source='manual'`.
6. **공통 여부**: 코드가 프로파일 `shared_codes`에 있으면 `shared=true`(구성도에서 "공통 서비스(참조)").

기본 프로파일(규칙·공통 코드·수동 지정 없음)에서는 1·2·5·6이 동작하지 않는다. 즉 **ITSM 소분류(또는 시스템명)가 없는 자산은 미분류**다. `role`도 명명 규칙에서만 나오므로 기본값에서는 비어 있다.

실측 예: `합성조직 / 지원 / 업무 / 합성 ERP`, `용도=운영` → `project=biz-bd93128d732c`, `env=p`, `source=column`.

## 표시 이름 (`project_display_names`)

업무 코드별로 소속 레코드의 `business_l3`(없으면 `system_name`) 값을 다수결로 고른다. 동률이면 사전순 첫 값. 프로파일 `project_names`가 있으면 덮어쓴다. 이름이 없으면 화면은 코드를 대문자로 보여준다.

## 프로파일 형식 (선택)

```json
{
  "rules": [{ "id": "std", "pattern": "^(?P<site>[a-z])\\d(?P<env>[pds])-(?P<project>[a-z0-9]+)-(?P<role>web|was|db)\\d+$" }],
  "shared_codes": ["ad", "dns"],
  "env_names": { "p": "운영", "d": "개발", "s": "스테이징" },
  "project_names": { "erp": "ERP 시스템" },
  "manual": { "합성조직|시험센터|legacy-01": "erp" },
  "column": "system_name"
}
```

위 정규식은 예시다. 회사 명명 규칙이 확인되기 전에는 프로파일을 쓰지 않는다(D-13). 합성 예제 `kit/examples/classify-synthetic.json`은 테스트·데모 전용이다.

## 포팅 시 적용 시점

- 현재: 실행(스냅샷)마다 `classify_run`으로 전체 분류를 저장. 프로파일이 바뀌어도 기존 스냅샷은 자동 재분류하지 않는다.
- TO-BE: 배치 적용 후처리에서 **변경·추가된 레코드만** 재분류하고, 영향을 받은 업무 코드의 표시 이름을 다시 계산한다. 프로파일 변경 시에는 관리자 작업으로 전체 재분류를 제공한다.
- 분류는 배치와 같은 트랜잭션에서 끝나야 한다(분류 실패 시 배치 전체 롤백).

## 포팅 카드

- **반드시 유지**: 명시적 ITSM 계층 우선, 기본 프로파일에서 이름 추정 없음, `biz-` 코드 공식, 환경 매핑, 수동 지정 최우선.
- **검증**: `CLS-*` 테스트([42](42-acceptance-tests.md)).
