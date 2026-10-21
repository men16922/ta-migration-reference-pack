# Onprem Atlas — ESM 자산과 IDC 구성도

ESM에서 내려받은 Excel을 검토·등록하고, 자산 목록과 업무별 IDC 구성도를 관리하는 로컬 업무 도구입니다.
Python/FastAPI/SQLite와 React/IBM Carbon을 사용합니다. 별도 지식 저장소의 문서는 회사 AI Agent가 검색할 수 있도록 읽기 도구로 제공합니다.

## 실행

```bash
npm ci
make kit-setup
make check
make atlas
```

브라우저에서 `http://127.0.0.1:8770`을 엽니다. `kit/local/atlas.db`를 사용하며 기존 DB를 초기화하거나 합성 자산을 넣지 않습니다.

## 주요 기능

- Excel 파일 검토: 시트/헤더/열 매핑, 오류·경고, 변경 건수 확인 후 확정
- 서버·장비·보안장비·WEB·WAS·DB 원천별 등록: 부분 목록 추가·갱신, 명시적인 전체 교체, 다른 원천 보존
- 자산 검색과 상세: 대표·관리·서비스 IP, 업무 계층, 원본 파일/시트/행/해시
- IDC·업무별 흑백 구성도, 로컬 draw.io 편집·이력·내보내기
- 스냅샷 변경 이력, 백업·무결성 검증, 기존 v1 DB 보존 갱신
- 별도 버전 지식 저장소와 회사 Agent용 출처 포함 검색 도구

구성도는 자산 목록 기반입니다. IP만으로 서브넷이나 통신 경로를 만들지 않으며, ESM 기재 이중화와 관측된 네트워크 상태를 구분합니다.
WEB/WAS/DB 인스턴스는 서버와 분리하며, 방화벽·망 구획·통신선은 편집기에서 직접 추가합니다. 수동 편집본은 자산 스냅샷과 별도로 보존합니다.
현재 실제 회사 ESM·SSO·Zabbix·Agent에는 연결하지 않았습니다. 로컬 합성 테스트 결과는 회사 인수 검증을 대신하지 않습니다.

## 문서

- [실행·등록·백업·Agent 연결](docs/enterprise-operations.md)
- [제품 범위와 구현 계획](docs/plans/2026-10-21-enterprise-idc-tool.md)
- [현재 상태](docs/STATUS.md) · [다음 작업](docs/NEXT_PLAN.md) · [검증 기록](docs/PROGRESS_LOG.md)
- [기능·사용성 평가](docs/evaluation.md) · [과거 연구 기록](docs/archive/README.md)
- [Python 키트](kit/README.md)

회사 원본 Excel과 `sample/` 캡처는 로컬 입력이며 Git에 포함하지 않습니다. 자동 검증은 합성 데이터만 사용합니다.
사용하지 않는 네트워크 학습 코드는 제거했고, 이전 연구·설계 기록은 `docs/archive/`에 통합했습니다.
