# 코딩 에이전트 작업 지시 — TA Migration Lab Reference Spike

## 목표
벤더 중립적인 온프렘 IDC 네트워크 학습·구성도·통신 분석을 만들고, AWS 이전 전후의 통신 의도 비교로 확장한다. 자격증 문제은행, 전체 NetBox 복제, 범용 네트워크 OS 에뮬레이터, 자동 서버 복제 플랫폼은 만들지 않는다.

## 작업 전
1. README.md, reference-analysis.md, source-inspection.md, references.json을 읽는다.
2. 신규/기존 저장소를 읽어 중복 기능과 기술 스택을 확인한다. 기존 코드를 확인하지 않은 상태에서 전면 재작성하지 않는다.
3. 외부 의존성은 현재 공식 문서와 실제 package 배포 버전을 확인하고 version/commit을 고정한다.
4. 공개 예제와 합성 데이터만 쓴다. 회사 파일·계정·운영망·AWS 배포는 대상이 아니다.

## P0: 통합 가능성 실험
- @containerlab/clab-viewer의 읽기 전용 임베딩을 검증한다.
- APP–Router–DB YAML을 표시하고 node selection 이벤트로 옆 학습 패널을 갱신한다.
- viewer를 editor/runner처럼 표시하지 않는다.
- 직접 mount와 복수 iframe 컴포넌트 방식의 제약을 문서에 남긴다.
- 직접 mount는 문서상 동시 여러 뷰의 store를 공유할 수 있으므로 As-Is/To-Be 두 개 동시 비교는 지원되는 격리 경로를 검증한다.
- 전체 clab-ui 채택은 P0 결과를 보고 별도 결정한다. unsupported deep import 금지.
- 외부 패키지가 목적에 맞지 않으면 그 근거를 기록하고 내부 viewer adapter를 유지한다.

P0 결과물: 실행 가능한 작은 웹 화면, 호환성 테스트, package lock, evidence note. AWS/runner 배포 없음.

## P1: 의미 모델과 교육용 분석
UI node/edge와 별도로 아래를 정의한다.
- workload identity 및 snapshot별 endpoint binding
- device/interface/link, routing context, IP prefix, route
- 별도 view annotations
- evidence provenance 및 data completeness
- intent, analysis result, limitation/capability

MVP 지원: IPv4, 연결된 네트워크, 명시적 static route, longest-prefix match, 단일 경로, 양방향 분석. 문서화된 폐쇄형 교육 모델에서만 결과를 확정한다. L2는 명시한 broadcast domain과 interface membership으로 제한한다. 실제 STP 수렴이나 ARP 타이밍을 구현했다고 주장하지 않는다.

경로 누락과 데이터 미수집을 구분한다. 라우팅 테이블이 '완전 수집됨'으로 표시되어 있고 일치 경로가 없을 때만 NO_ROUTE를 확정한다. 입력을 받지 못했거나 지원하지 않는 NAT/VRF/PBR 등이 관련 경로에 관여하면 UNKNOWN이다. VRF를 flatten해서 global table로 분석하지 않는다.

분석 결과는 두 축을 구분한다.
- 네트워크 결과: reachable / blocked / unknown
- 의도 검증: pass / fail / unknown
차단해야 하는 통신이 차단되면 intent 검증은 pass일 수 있다. 실패가 아니라고 성공으로 계산하지 않는다.

각 trace step에는 stage, node/interface ID, before/after header(지원 범위), 참조 route/policy/evidence ID, 이유를 둔다. UI/자연어는 이 구조화 결과를 렌더링한다.

## P2: 외부 엔진 비교
- Batfish의 공식 sample snapshot부터 실행해 bidirectionalTraceroute 및 differentialReachability의 실제 출력 fixture를 확보한다.
- 임의 내부 JSON을 Batfish가 직접 처리한다고 가정하지 않는다.
- 지원 범위의 변환기/host 모델만 추가하며 parse warnings와 unsupported 항목을 보존한다.
- Linux/containerlab runner는 분리된 VM/namespace에서만 사용한다. 공개 브라우저에 Docker socket을 노출하지 않는다.
- Linux runner API는 인증/권한, TLS 검증, 경로 제한, 허용된 이미지/명령, 작업 quota, TTL/cleanup, 감사 기록을 갖춘다.
- 관리 네트워크의 기본 경로가 실습 데이터 경로를 우회하지 않도록 명시적으로 검증한다.
- 측정 오류나 engine error를 PASS로 처리하지 않는다.

## P3: AWS 이전 설계
- 첫 범위는 To-Be 설계 및 검토서이며 실제 AWS 리소스를 만들지 않는다.
- 동일한 workload ID에 As-Is/To-Be IP 및 위치를 binding하여 intent를 비교한다.
- VLAN→VPC 같은 일대일 치환을 금지한다. 분리 의도·가용성·라우팅·정책을 별도로 검토한다.
- VGW/TGW/DXGW/SG/NACL을 일반 router/ACL로 뭉개지 않는다. 지원되는 AWS resource semantics만 구현하고 나머지는 UNKNOWN.
- firewall/LB/DNS/인증 의존성을 단순 아이콘 변경으로 해결했다고 표시하지 않는다.
- AWS Transform에 존재를 확인하지 않은 자동화 API를 가정하지 않는다. 초기에는 명시적 파일 교환과 검토를 지원한다.

## 테스트
fixtures/fixture-specifications.json의 테스트들은 아직 실행하지 않은 명세다. 각 fixture에 input snapshot, intent, expected network result, expected intent verdict, 실제 실행 증거를 별도로 기록한다.

최소 통과 기준:
1. 정상/반환 경로 삭제/복구에서 결과가 일관되게 바뀐다.
2. UI 배치 변경으로 분석 의미가 바뀌지 않는다.
3. 저장/복원 후 결과가 동일하다.
4. 미지원/미수집을 unknown으로 보존한다.
5. 양방향 네트워크 경로와 실제 TCP/DB/TLS/인증 성공을 혼동하지 않는다.
6. 구조화된 trace와 UI 표시가 일치한다.
7. 목표 정책이 deny인 경우의 pass를 별도로 검증한다.
8. AWS 이동 시 workload ID와 IP 변경을 분리한다.

## 범위 밖
결제, 멀티테넌트 SaaS, 회사 SSO, 장비 전체 자동 수집, 모든 벤더 config parser, STP/BGP convergence, throughput 예측, 멀티클라우드, 실제 마이그레이션 실행. 각 항목은 후속 명세/검증 없이는 구현 완료로 주장하지 않는다.

## 작업 보고
변경 파일, 실제 실행한 테스트와 출력, 실행하지 못한 테스트, 현재 지원 범위, 미확인 사항, 참고한 commit/package version을 구분해 보고한다. 최초 작업은 P0까지 완료하고 결과에 따라 다음 단계 범위를 결정한다.
