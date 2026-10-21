# fixtures — 합성 시나리오와 API 응답 샘플

모든 값은 합성이다. IP는 문서용 대역만 쓴다.

| 파일 | 내용 | 만든 방법 |
|---|---|---|
| [sync-scenarios.json](sync-scenarios.json) | 자동 증분 동기화(TO-BE) 인수 시나리오 S01~S19 | 손으로 작성. 키·행 번호·헤더 탐지는 현재 파서로 확인 |
| [api/summary.json](api/summary.json) | `GET /api/summary` | `scripts/wiki_samples.py` |
| [api/projects.json](api/projects.json) | `GET /api/projects` | 〃 |
| [api/assets.json](api/assets.json) | `GET /api/assets?page_size=3` | 〃 |
| [api/asset-detail.json](api/asset-detail.json) | `GET /api/asset?key=합성조직\|시험센터\|erp-db-01` | 〃 |
| [api/components.json](api/components.json) | `GET /api/components` | 〃 |
| [api/runs.json](api/runs.json) | `GET /api/runs` | 〃 |
| [api/diff.json](api/diff.json) | `GET /api/diff` (직전 실행 대비) | 〃 |
| [api/diagram-idc.json](api/diagram-idc.json) | `GET /api/diagram/idc` | 〃 |
| [api/diagram-project.json](api/diagram-project.json) | `GET /api/diagram/project/{code}` | 〃 |
| [api/diagram-project.drawio](api/diagram-project.drawio) | 같은 업무 구성도의 draw.io XML | 〃 |
| [api/imports-preview.servers.json](api/imports-preview.servers.json) | 현재(AS-IS) 미리보기 응답 — 서버 | 〃 |
| [api/imports-preview.web.json](api/imports-preview.web.json) | 현재(AS-IS) 미리보기 응답 — WEB | 〃 |

## API 샘플 입력

`scripts/wiki_samples.py`가 빈 DB에 아래 6건을 차례로 등록(현재 미리보기 → 확정 API)한 뒤 조회했다.

1. servers: `erp-web-01`, `erp-web-02`(서로 이중화), `erp-db-01` — 합성조직/시험센터, ITSM `지원/업무/합성 ERP`, 용도 운영
2. equipment: `core-sw-01`(네트워크/L3 스위치), `nas-01`(스토리지/NAS)
3. security: `fw-01`(방화벽), `nac-01`(NAC)
4. web: Apache 2.4 :443 × 2 (`erp-web-01/02`)
5. db: Oracle 19c :1521 SID `ERPDB` RAC (`erp-db-01`)
6. servers 재등록: `erp-db-01` 메모리 256 → 512

재생성: `kit/.venv/bin/python scripts/wiki_samples.py` (먼저 `make kit-setup`). 시각은 고정, 파일 해시는 `<sha256>`으로 가린다(xlsx 저장 시각 때문에 매번 달라짐). 결과는 실행할 때마다 같다.

샘플에는 현재 코드의 결함도 그대로 들어 있다(예: `readiness`, 인스턴스 부제의 `p`). 목표 형태는 [20](../20-api-contract.md), 결함 목록은 [43](../43-known-gaps-and-pitfalls.md).
