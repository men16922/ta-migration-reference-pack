# TA Migration Lab — Reference Research Pack

작성: 2026-10-20

## 목적
벤더 중립적 IDC 네트워크 학습, 구성도, 통신 분석, AWS 이전 검토를 연결하는 웹 애플리케이션을 기획한다. 상용 네트워크 디지털 트윈 전체를 복제하지 않고, 공개 도구의 데이터 모델·입출력·검증 방식을 분석하여 필요한 기능만 구현/연동한다.

## 확인한 것과 확인하지 않은 것
- 공식 제품 문서, 공개 UI 예시, NetBox와 Batfish의 일부 실제 소스, containerlab-app 패키지 README와 루트 LICENSE를 읽었다.
- Containerlab 앱의 viewer/editor/runner 분리, Batfish 양방향 Trace 모델, NetBox 인터페이스 모델을 검토했다.
- 상용 서비스 로그인 및 제품 조작, Containerlab/Batfish/NetBox 구동, 실제 패킷 전송, AWS 배포는 수행하지 않았다.
- 이 패키지는 연구 결과와 구현 명세다. 웹사이트/분석 엔진/실행 가능한 실습 제품이 아니다.
- JSON 파일은 테스트 설계용 데이터다. 기대 결과는 실행 측정치가 아니다.

## 파일
- reference-analysis.md: 제품별 역할, 재사용 판단, 구체적인 역공학 실험
- source-inspection.md: 실제 읽은 코드/문서와 확인 범위
- implementation-brief.md: 코딩 에이전트에 전달할 단계별 개발 지시
- references.json: 공식 출처 URL 및 확인 범위
- fixtures/intent-example.json: 논리적 워크로드 식별자를 유지하는 통신 요구사항 예시
- fixtures/fixture-specifications.json: 12개 테스트 시나리오 명세

## 핵심 결정
1. Containerlab의 읽기 전용 임베딩 viewer로 첫 통합 가능성을 확인한다. 읽기 전용 viewer를 편집기나 실행기로 오인하지 않는다.
2. 실습 토폴로지와 화면 배치를 분리하고, IDC/AWS 의미 모델은 별도로 소유한다.
3. 작은 교육용 분석 엔진은 결정적 코드로 만들고, 지원 범위 밖은 UNKNOWN으로 처리한다.
4. Batfish는 별도 분석 엔진으로 연동을 검토한다. 임의의 내부 JSON을 바로 받아 준다고 가정하지 않는다.
5. 실제 실습은 격리된 Linux runner에 맡긴다. 회사 운영망과 연결하지 않는다.
6. AWS 이전안은 IP 문자열이 아닌 논리적 APP/DB 식별자와 통신 의도로 비교한다.
7. AI는 설명·변경안 초안만 작성하고 통신 가능 여부를 판정하지 않는다.

개인 공개 개발에는 합성 데이터만 사용한다. 제품과 패키지는 구현 직전에 버전/commit과 라이선스를 다시 고정한다.
