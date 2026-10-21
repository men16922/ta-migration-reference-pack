# onprem-atlas

ESM Excel → 출처가 보존되는 SQLite 자산 스냅샷 → IDC/업무 구성도(draw.io)를 만드는 Python 패키지입니다.
별도 지식 DB와 읽기 전용 Agent 도구를 회사 Python 환경에 이식할 수 있습니다.

사용 방법은 [운영 가이드](../docs/enterprise-operations.md), 범위는 [제품 계획](../docs/plans/2026-10-21-enterprise-idc-tool.md)을 참고하세요.

| 모듈 | 역할 |
|---|---|
| `components` | WEB/WAS/DB 인스턴스 식별, 호스트 연결, 포트·URL·SID 보존 |
| `ingest` | xlsx 읽기, 헤더 매핑, ESM 필드 정규화, 검증 |
| `store` | 원천별 현재 자산을 합친 스냅샷, 원본 행/파일 해시, 이력, FTS 검색, v1/v2→v3 갱신 |
| `classify` | 명시적 ITSM 업무 계층·환경, 프로파일 분류 |
| `diagram` | 그룹사/센터·업무 보기, 장비 종류, 기재된 이중화, JSON/draw.io |
| `diff` | 실행 간 추가·제외·필드 변경 |
| `web` | 검색·상세·구성도 API, 로컬 업로드/검토/확정, 빌드된 UI 제공 |
| `knowledge` | 자산과 분리된 문서/버전/출처/그룹 권한·키워드 검색 |
| `agent_tools` | 회사 Agent용 읽기 도구와 선택적인 Strands 등록 |
| `backup` | DB와 업로드 원본 백업, 해시/무결성 검증 |

```bash
# 저장소 루트에서
make kit-setup
make kit
make atlas
```

일반 등록은 웹의 **Excel 등록**을 사용합니다. CLI `import`의 과거 기본 동작은 하나의 legacy 원천 교체이며 웹의 원천 선택/부분 갱신 흐름과 다릅니다.
원본 Excel은 최대 20MB(웹), 50,000행·256열입니다. 잘못된 행과 누락 열은 원본 파일을 확인해 보정하고 재검토합니다.

`review` 및 합성 생성기, 기존 CLI는 오프라인 검증/호환을 위해 남아 있습니다. 이관 준비도 점수와 네트워크 실험실은 제품 화면에서 사용하지 않습니다.
회사 Agent·SSO·Zabbix 실연동, 랙 실장/실제 케이블 구성도는 구현 완료로 표시하지 않습니다.
