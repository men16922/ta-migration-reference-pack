# Engineering Interpretation — Onprem Atlas

현재 제품의 구현 위치와 검증 기준이다. 일반 engineering bible은 overnight-harness 플러그인에 있고 저장소에 복제하지 않는다.

## 읽는 순서와 기준 문서

`docs/AGENT_BRIEF.md` → `docs/STATUS.md` → `docs/NEXT_PLAN.md` → `docs/PROGRESS_LOG.md` → `docs/LESSONS.md`.
제품 범위는 `docs/plans/2026-10-21-enterprise-idc-tool.md`, 사용법·데이터 계약은 `docs/enterprise-operations.md`, 인수 평가는 `docs/evaluation.md`가 담당한다.
`docs/archive/`는 과거 기록이며 현재 실행 지침이 아니다. brief ≤60, status/plan/log ≤120, lessons ≤40줄을 `make doc-budget`으로 확인한다.

## 구현 경계

- `src/console`: Carbon UI, Excel 검토/등록, 자산·인스턴스 조회, 구성도, 변경 이력.
- `useDrawioDocument.ts`: 로컬 iframe 메시지 검증과 편집본 저장 상태. `DrawioEditor.tsx`: 화면 표시.
- `kit/src/onprem_atlas/ingest`, `web/imports.py`, `store`: Excel 정규화, 원천별 스냅샷과 출처, 원자적 등록.
- `components.py`: WEB/WAS/DB 식별과 호스트 연결. `diagram/model.py`·`inventory.py`·`enterprise.py`: 도형 모델·장비 분류·업무 배치. `diagram/__init__.py`: 레이아웃·출력 진입점.
- `web/documents.py`: 원천과 분리된 도면 버전. `knowledge.py`, `agent_tools.py`: 별도 지식 저장소와 읽기 도구.
- `backup.py`: SQLite와 등록 원본의 휴대 가능한 백업·검증.

## 검증

`make check`: 문서 예산/현행 문서 링크, TypeScript, Vitest, Python ruff/pytest, Vite build. 자동 검증은 합성 입력만 사용한다.

검토 불변 조건:
1. 한 원천의 갱신·교체가 다른 원천을 지우지 않는다. 실패한 등록은 분류와 토큰까지 되돌린다.
2. 인스턴스 수와 서버 대수를 혼동하지 않고 모호한 호스트 연결은 미확인으로 남긴다.
3. IP·계층·Active/Standby 문자열만으로 망 구획, 통신 성공, 이중화 관계를 생성하지 않는다.
4. 자산 갱신이 수동 도면을 덮어쓰지 않고, 저장 중 새 편집의 미저장 상태를 보존한다.
5. Agent 결과는 출처를 포함하고 허용된 지식 그룹·자산 DB 범위를 벗어나지 않는다.

Chrome 확인은 실제 화면의 등록·검색·구성도·편집 흐름을 보완한다. 회사 Excel/권한/SSO/실모델 검증은 로컬 테스트와 별개다.

## Harness

`Makefile`이 설치된 플러그인의 runner를 찾는다. `.claude/harness-config.json`, `scripts/overnight/*`, `.codex/rules/overnight.rules`의 기존 권한 경계를 유지한다.
현재 단일 엔진 실행이며 이 작업에서 자동 루프·다중 에이전트·외부 배포·모델 호출은 실행하지 않았다.
