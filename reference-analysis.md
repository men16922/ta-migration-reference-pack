# 레퍼런스 분석 및 역공학 계획

## 제품의 중심
"그림을 AWS 그림으로 바꾸는 도구"가 아니라, 원본 구성의 통신 원리를 설명하고 이전 전후 통신 의도가 유지되는지 검토하는 학습형 TA 작업 도구를 만든다.

## 1. Containerlab Apps — 편집기와 실행 계층의 가장 직접적인 레퍼런스
공식 문서에는 VS Code/Web/Desktop이 공유하는 TopoViewer, 실습 YAML과 annotations 분리, 패킷 캡처, Draw.io/SVG 내보내기 등이 기술되어 있다. 브라우저 sandbox는 토폴로지 편집·시각화용이며 실제 실습을 실행하지 않는다. Web/Desktop은 clab-api-server를 통해 Linux 실습 호스트를 사용한다.

패키지 문서상 @containerlab/clab-viewer는 읽기 전용 임베딩을 제공하며, @containerlab/clab-ui는 편집/host/session 통합을 제공한다. 전자를 가져왔다고 편집·배포 기능이 생기는 것은 아니다. 읽기 전용 패키지의 직접 mount API는 같은 모듈 인스턴스에서 store를 공유하므로 동시 복수 다이어그램은 문서의 iframe 컴포넌트 경로를 먼저 검토한다.

우리에게 필요한 실험:
- 샘플 YAML을 읽기 전용 viewer에 넣고 노드 선택을 학습 패널과 연결한다.
- YAML 변경과 annotations 변경을 구분한다. 위치만 이동했을 때 semantic model hash는 불변이어야 한다.
- 임베딩 → 전체 편집 UI 통합 → runner 연결을 별도 단계로 검증한다.
- 첫 실험에서는 host credential 입력, 실제 deploy, Docker socket 접근을 요구하지 않는다.

출처: https://containerlab.dev/manual/gui/
출처: https://github.com/srl-labs/containerlab-app/blob/main/packages/clab-viewer/README.md
출처: https://github.com/srl-labs/containerlab-app/blob/main/packages/clab-ui/README.md

## 2. NetBox — 화면이 아닌 네트워크 의미 모델
NetBox는 의도한 네트워크 상태를 기록하는 source of truth이며 그 자체를 실시간 통신 검증 엔진으로 취급하지 않는다. 인터페이스와 IP, VLAN과 prefix, VRF를 별도 개체로 보는 접근을 참고한다.

실제 Interface 소스에서 LAG 참조, VRF 참조, IP 관계, 가상 인터페이스의 물리 케이블 연결 검증을 확인했다. 따라서 단순한 node.ip 하나로 여러 NIC, bond, SVI를 표현하지 않는다.

우리 모델은 최소 Device, Interface, Link, L2Domain, Prefix, RoutingContext, Route, Policy, Workload, Intent, Evidence를 구분한다. 모든 기능을 첫 버전에 구현한다는 뜻은 아니다. 미지원 개체가 분석 경로에 관여할 때 UNKNOWN을 반환할 수 있도록 경계부터 둔다.

검토 질문:
- APP 서버가 데이터 NIC와 관리 NIC를 함께 가질 때 어떤 인터페이스로 나가는가?
- 다른 VRF에서 같은 CIDR을 사용하면 별도 주소 공간으로 남는가?
- 케이블 그림만 있고 L3 설정이 없을 때 연결 가능하다고 오판하지 않는가?

출처: https://netboxlabs.com/docs/netbox/introduction/
출처: https://netboxlabs.com/docs/netbox/models/ipam/prefix/

## 3. Batfish — 구성 분석과 변화 분석
Batfish의 bidirectionalTraceroute는 정방향과 역방향 trace를 구분한다. 실제 BidirectionalTrace 클래스는 forwardFlow/forwardTrace/newSessions/reverseFlow/reverseTrace를 별도로 보유한다. 일반 traceroute 질의의 정방향 성공만으로 응답 경로 성공을 간주하지 않는다.

differentialReachability는 두 스냅샷에서 통신 결과가 달라지는 flow를 찾는다. 이 원리를 Migration Intent Diff로 확장하되, 이전으로 IP가 바뀌면 같은 IP의 raw diff만 비교해서는 안 된다. 논리적 워크로드 ID에 대한 As-Is/To-Be endpoint binding을 먼저 수행한다.

검토 순서:
1. 공식 샘플 스냅샷과 SDK 예제로 API 출력을 확보한다.
2. 한 가지 설정만 바꾸어 결과 차이를 기록한다.
3. 공통적으로 지원하는 기능에 한해 내부 모델→Batfish 입력 변환을 개발한다.
4. parser 경고, 미지원 구문, 입력 누락을 결과에 포함한다.
5. 정적 모델과 실제 lab 결과를 대조하되 불일치 원인을 엔진·adapter·lab 설정·측정 조건으로 분류한다.

지원 장비 목록이 있다고 모든 기능, 동적 시간 변화, 실제 애플리케이션 응답까지 보장되는 것은 아니다. Batfish를 브라우저 ARP 학습 시뮬레이터나 일반 목적 성능 시뮬레이터로 포장하지 않는다.

출처: https://batfish.readthedocs.io/en/latest/notebooks/forwarding.html
출처: https://batfish.readthedocs.io/en/latest/notebooks/differentialQuestions.html
출처: https://batfish.readthedocs.io/en/latest/supported_devices.html

## 4. IP Fabric — Path Inspector의 UI 동작 명세
공식 문서의 end-to-end path, host-to-gateway path, 장비별 forwarding decision 화면을 기능 레퍼런스로 삼는다. 문서상 Security Rules의 Continue 옵션은 차단 정책을 적용하지 않고 이후 분석을 진행하는 진단 기능이다.

우리 제품에서는 다음을 구분한다.
- 실제 정책을 반영한 분석 결과
- 교육용으로 차단 이후 경로를 가정하여 보여주는 결과
- 수집 누락으로 경로를 완성하지 못한 결과

가정상 경로를 초록색 성공으로 표시하지 않는다. 출발지/목적지/프로토콜/포트, 입력·출력 인터페이스, 경로 및 정책 근거, 분석 전제, 미확인 항목을 보여준다. 상용 UI의 그래픽·문구·소스를 그대로 복제하지 않는다.

출처: https://docs.ipfabric.io/main/IP_Fabric_GUI/diagrams/
출처: https://docs.ipfabric.io/main/IP_Fabric_GUI/diagrams/how_to_use_path-lookup/

## 5. Forward Networks — 검증할 의도와 변경 영향
공식 제품 설명은 디지털 트윈 기반 경로/정책 검증 및 제안 변경의 영향 분석을 다룬다. 이는 제품 기능 주장에 대한 공식 출처이지, 이번 조사에서 제품의 정확도를 독립 벤치마크했다는 뜻은 아니다.

우리 제품은 핵심 경험만 취한다: 요구한 허용 통신이 유지되는가, 차단해야 하는 통신이 새로 열렸는가, 근거는 무엇인가. "완벽한 디지털 트윈"이라는 표현은 사용하지 않는다.

출처: https://www.forwardnetworks.com/forward-enterprise/
출처: https://www.forwardnetworks.com/predict/

## 6. AWS Transform — 경쟁 대상이면서 출력/검토 연계 레퍼런스
공식 문서에는 source file 업로드, topology 및 SG mapping 검토, 다이어그램, IaC, 승인된 배포 과정이 있다. RVTools만 제공할 경우 SG를 생성하지 않는다는 입력 제한과, firewall/LB 설정을 입력으로 활용해도 해당 리소스 자체를 생성하지 않는다는 범위를 확인했다.

우리 제품의 가치는 자동 변환 자체보다 학습, 원본 모델 해석, 입력 누락, 원본 정책과 목표 정책의 의미 차이, 잔존 IDC와의 혼재 기간 검토에 둔다. AWS Transform에 임의로 job을 생성하는 공개 API가 있다고 가정하지 않는다. 처음에는 지원되는 파일 교환 및 사용자 검토 단계만 설계한다.

출처: https://docs.aws.amazon.com/transform/latest/userguide/transform-vmware-migrate-network.html
출처: https://docs.aws.amazon.com/transform/latest/userguide/transform-vmware-diagrams-and-reports.html

## 7. netlab — 학습을 테스트로 채점
netlab validate는 실행 중인 lab에서 topology에 선언한 테스트를 수행하며 교육 과제 채점에도 활용할 수 있다. 이를 참고해 '정답 설정과 완전히 같은가'보다 '요구한 동작을 충족하는가'를 평가한다.

우리 제품에서 차단 요구사항의 성공은 연결 실패 자체가 아니라, 충분한 관측/설정 근거를 바탕으로 의도한 차단을 확인한 경우다. 정책 누락으로 모르는 상태는 학습 PASS로 처리하지 않는다.

출처: https://netlab.tools/netlab/validate/
출처: https://netlab.tools/topology/validate/

## 8. REA의 위치
morluto/rea는 공개 README상 허용된 local browser 관찰, 정적 분석, evidence 보존 등을 제공한다. 이 프로젝트에서는 선택적 증거 수집 도구로 둔다. 공개 OSS는 소스와 테스트를 먼저 읽고, SaaS는 공개 문서와 권한 있는 시험 계정으로 관측한다. 화면이나 bundle만 보고 서버의 비공개 알고리즘을 복원했다고 주장하지 않는다.

실험 레코드: reference/version → input → action → observed output → source/evidence → hypothesis → unresolved → independent acceptance test.

출처: https://github.com/morluto/rea

## 기능별 재사용 결정
| 영역 | 결정 |
|---|---|
| 토폴로지 렌더링 | clab-viewer 짧은 통합 실험 후 채택 판단 |
| 편집 UI | clab-ui 적합성 확인; 필요하면 얇은 자체 UI와 adapter |
| 실습 실행 | containerlab/Linux runner 활용 |
| 학습 콘텐츠/설명/채점 | 자체 구현 |
| IDC/AWS 공통 의미 모델과 출처 | 자체 구현, NetBox 모델 참고 |
| 제한된 교육용 분석 | 자체 결정적 코드 |
| 실제 설정 정적 분석 | Batfish adapter 검토 |
| AWS 통신 의도 비교/검토서 | 자체 구현 |
| 서버 복제/데이터 이전 엔진 | 자체 제작하지 않음; 별도 연동 대상 |

## 첫 행동 실험
APP–Router–DB 합성 모델 하나에서 정상 → DB 반환 경로 삭제 → 복구를 비교한다. 이때 먼저 결과를 예상하고, 분석 trace를 읽고, 가능한 경우 격리 lab의 packet capture로 확인한다. 이후 VLAN trunk 누락, 정책 차단, 미수집 정책으로 확장한다. 모든 도구를 한 번에 설치하지 않는다.
