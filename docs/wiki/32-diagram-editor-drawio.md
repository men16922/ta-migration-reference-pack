# 32. (선택) draw.io 수동 편집과 편집본 이력

> **요약**: 자동 구성도를 draw.io 편집기(iframe embed)로 열어 방화벽·망 구획·통신선을 사용자가 그리고, 자산과 분리된 **추가 전용 편집본 이력**으로 저장한다. 회사가 draw.io 자체 호스팅을 허용할 때만 포팅한다(D-10).
> **근거 소스**: `kit/src/onprem_atlas/web/documents.py`, `web/editor-bridge.js`, `src/console/useDrawioDocument.ts`, `src/console/DrawioEditor.tsx`, `kit/tests/test_documents.py`, `src/console/__tests__/DrawioEditor.test.tsx`
> **관련 페이지**: [31](31-diagram-engine.md), [41](41-host-integration.md)

## 1차 릴리스 권장

편집기 없이도 다음은 동작한다: 자동 구성도 화면, `.drawio` 내려받기(사용자가 데스크톱 draw.io에서 편집). 1차는 이것만 포팅하고, 편집기는 2차로 미룬다.

## 구성 요소

| 요소 | 동작 |
|---|---|
| 편집기 배포 | draw.io 웹 배포본(검증 버전 32.4.1)을 **같은 출처**에서 정적 제공(`/editor/`). 외부 `embed.diagrams.net` 사용 금지(사내 데이터 외부 전송). 저장소가 자동 다운로드하지 않는다 |
| bridge 스크립트 | upstream `js/app.min.js` 뒤에 `editor-bridge.js`를 붙여 제공: 흑백 전용 팔레트(보안장비, 방화벽, 스위치, 로드밸런서, WEB, WAS, 서버, DB, 스토리지, 외부망, 망 구획, `TCP / PORT` 연결선), `atlasDocument`(현재 XML 추출)·`atlasFit` 메시지 처리. 같은 출처·부모 창 메시지만 받는다 |
| iframe URL | `/editor/index.html?embed=1&proto=json&configure=1&spin=1&ui=kennedy&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&offline=1&local=1&stealth=1&lang=ko` |
| 메시지 흐름 | `configure` → 설정 전송, `init` → 문서 `load`, `load` → `atlasFit`, `autosave` → 미저장 표시, 저장 버튼 → `atlasDocument` 요청 → 응답 XML을 PUT |
| 범위(scope) | `idc` 또는 `project:<업무 코드>`. 범위마다 별도 이력 |

## 저장 규칙 (불변식)

- 저장 = 새 revision 추가(덮어쓰기 없음). 요청의 `revision`이 서버 최신과 다르면 **409**(다른 사람이 먼저 저장).
- 각 편집본은 기준 데이터 버전(`base_run` → TO-BE `base_dataset_version`)을 가진다. 현재 버전과 다르면 `stale=true`로 "새 자산 등록이 있습니다" 경고. 편집본은 자동 병합하지 않는다.
- `최신 자산으로 새 도면`은 자동 생성도를 새로 불러온다. 수동 배치는 합쳐지지 않고, 이전 편집본은 이력에 남는다.
- XML 검증(`validate_xml`): 10MB 이하, `defusedxml` 파싱, 루트 `mxfile|mxGraphModel`, **비압축만**, 셀 10,000개 이하, 페이지 내 ID 중복 금지, 좌표는 유한값·절댓값 1e7 이하·폭/높이 음수 금지.
- 저장 중 새 편집이 들어오면 서버 응답 후에도 미저장 상태를 유지한다(저장한 XML과 현재 XML이 같을 때만 미저장 해제). 근거: `docs/LESSONS.md` 2026-10-22 drawing-save race.
- 저장하지 않은 편집이 있으면 페이지 이동·새로고침 전에 확인한다.

## 포팅 카드

- **반드시 유지**: 같은 출처 자체 호스팅, 메시지 출처 검사, 추가 전용 이력 + 409, 기준 버전·stale 표시, XML 검증, 저장 경합 처리.
- **권한**: 조회 `idc.viewer`, 저장 `idc.editor`.
- **검증**: `kit/tests/test_documents.py` 3개, `DrawioEditor.test.tsx` 2개의 의미를 옮긴다(`DOC-*`, [42](42-acceptance-tests.md)).
