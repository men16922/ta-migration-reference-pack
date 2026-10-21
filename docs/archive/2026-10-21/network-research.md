# 이전 네트워크 연구 기록

2026-10-22에 현행 제품 문서에서 분리한 과거 기록이다. 아래 경로·기능·가격·검증 결과는 당시 상태이며 현재 실행 지침이 아니다. 참조 자료 목록은 `references.json`에 보존한다.

---

## 원래 문서: implementation-brief.md

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

---

## 원래 문서: reference-analysis.md

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

---

## 원래 문서: source-inspection.md

# 공개 소스 확인 기록

확인일: 2026-10-20. 아래는 소스/문서 읽기 기록이며 런타임 검증 결과가 아니다.

| 대상 | 파일 | 확인 사항 | 식별자 |
|---|---|---|---|
| NetBox | netbox/dcim/models/device_components.py | Interface의 LAG, VRF, IP 관계 및 가상 인터페이스 케이블 검증 | commit 6b86582935cad46f2eebe8fda7369ce0c6f7e8d4; blob 486c5972122fc4563c9f0b310324f25c9c876d15 |
| Batfish | projects/common/src/main/java/org/batfish/datamodel/flow/BidirectionalTrace.java | forward/reverse flow 및 trace, newSessions 분리; forward 성공과 reverse 객체 존재의 constructor 검증 | blob d4e1797dbbad89f8ff918e755f7e57c64817aaaa |
| Containerlab Apps | README.md | Web/Desktop/VS Code 공유 구성, Linux API runner 분리 | blob cb201ad064feaab51ea61459b7d4b0d8c4b62f89 |
| Containerlab viewer | packages/clab-viewer/README.md | 읽기 전용 embed, YAML/annotations, node callback; 직접 mount store 공유 주의 | blob 86f0e07d012868bce1a43b066f101171c775b4a8 |
| Containerlab editor | packages/clab-ui/README.md | public UI/host/session entrypoints, 비공개 deep import 지양 | blob af4d815b05434f974abc5e46e16f7e74dbfb7cb2 |
| Containerlab Apps | LICENSE | 저장소 루트 MIT License 확인 | blob 863c1c56a2fdcf2a2f8fcdc65f3d1e77fc180623 |

blob SHA는 파일 내용의 식별자이며 repository commit SHA가 아니다. 구현 시작 시 각 저장소 commit, package version, dependency lock을 별도로 고정한다. 문서만 읽은 패키지의 번들 동작과 통합 호환성은 아직 확인하지 않았다.

## 라이선스 메모
NetBox와 Batfish 루트 라이선스는 Apache-2.0, containerlab 루트는 BSD 3-Clause 형식, containerlab-app 루트는 MIT로 확인했다. 개별 패키지/의존성/장비 이미지/아이콘의 조건까지 자동으로 동일하다고 가정하지 않는다. 재배포 시 적용되는 고지·라이선스 파일을 확인하고 유지한다. 이 패키지에는 타사 소스나 바이너리를 복제하여 포함하지 않았다.

공식 라이선스:
- https://github.com/netbox-community/netbox/blob/main/LICENSE.txt
- https://github.com/batfish/batfish/blob/master/LICENSE
- https://github.com/srl-labs/containerlab/blob/main/LICENSE
- https://github.com/srl-labs/containerlab-app/blob/main/LICENSE

---

## 원래 문서: docs/gcp-cost-minimal-architecture.md

# Google Cloud Zero-VM & Cost-Minimal Deployment Architecture

Date: 2026-10-20

## Core Design Principle: 100% Client-Side Deterministic Engine (No VM Required)

To eliminate always-on VM costs (no Compute Engine, no GKE nodes, no Linux Containerlab runner VM, no Java Batfish server VM), **TA Migration Lab** executes all analysis deterministically inside a pure TypeScript engine (`src/core/analyzer.ts`, `src/core/migrationDiff.ts`) bundled with the static web app:

- **P1 Bidirectional Reachability & Intent Engine**: Runs in `< 1 ms` in browser memory.
- **P0 Topology Viewer & Containerlab YAML/Annotation Adapter**: Runs in browser memory (`src/adapters/clabAdapter.ts`).
- **P2 External Engine Fixture Comparison**: Ingests pre-captured Batfish `BidirectionalTrace` JSON fixtures (`src/adapters/batfishAdapter.ts`) offline without running a JVM container in production.
- **P3 AWS Migration As-Is vs To-Be Diff & Markdown Report**: Runs in browser memory (`src/core/migrationDiff.ts`).

---

## Deployment Options on Google Cloud (Ordered by Lowest Cost)

### Option 1 (Recommended, $0/month): Firebase Hosting or Cloud Storage + CDN
Because `npm run build` outputs a purely static `dist/` bundle with zero server-side compute dependencies:
- **Config**: [`firebase.json`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/firebase.json)
- **Compute Instances**: `0` (No VM, no container runtime billing)
- **Estimated Monthly Cost**: **$0.00/month** within the Firebase Hosting free tier (10 GB storage, 360 MB/day transfer) or pennies per month on Google Cloud Storage.
- **Manual Deploy Command** (run only when desired by a human operator):
  ```bash
  npm run build
  npx firebase-tools deploy --only hosting
  ```

### Option 2 ($0 Idle Cost): Google Cloud Run with Scale-to-Zero (`minScale: "0"`)
When IAM/IAP integration or a container endpoint on Cloud Run is preferred:
- **Configs**: [`Dockerfile`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/Dockerfile), [`deploy/gcp/nginx.conf`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/deploy/gcp/nginx.conf), [`deploy/gcp/cloudrun-service.yaml`](file:///Users/men1692/Desktop/On-Premise/ta-migration-reference-pack/deploy/gcp/cloudrun-service.yaml)
- **Cost Guardrails Enforced in `cloudrun-service.yaml`**:
  1. `autoscaling.knative.dev/minScale: "0"` — Scales down to **zero instances** when no user is loading the page (**$0.00 idle cost**).
  2. `autoscaling.knative.dev/maxScale: "2"` — Hard ceiling to prevent unexpected traffic/billing spikes.
  3. `run.googleapis.com/cpu-throttling: "true"` — CPU is billed **only** during the few milliseconds Nginx serves static files (`index.html`, JS/CSS assets with `max-age=31536000, immutable`).
  4. `memory: "128Mi"`, `cpu: "1000m"`, `containerConcurrency: 80` — Minimal footprint; fits well inside Cloud Run's monthly free tier (2 million requests, 180,000 vCPU-seconds, 360,000 GiB-seconds free per month).
  5. **No VPC Connector / No Cloud SQL / No NAT Gateway**: Avoids all hidden fixed hourly charges on GCP.

---

## 원래 문서: docs/p0-viewer-evaluation.md

# P0 Evaluation Note — `@containerlab/clab-viewer` vs Internal Isolated Viewer Adapter

Date: 2026-10-20
Locked Package Inspected: `@containerlab/clab-viewer@0.1.0` (MIT License, tarball sha1 `6f37112a91a8b3e0e9bed9b723e3f77836e348a9`)

## 1. Inspected Public Entrypoints & Types

From `node_modules/@containerlab/clab-viewer/dist/index.d.ts` and `types.d.ts`:

```ts
/** Mount one read-only canvas. Use the HTML component for multiple isolated diagrams. */
export declare function mountViewer(container: Element, options: MountViewerOptions): ViewerHandle;
```

- `MountViewerOptions`: accepts `yaml: string`, `annotations?: string`, `theme?: "light" | "dark"`, `viewerOptions?: ViewerOptions` (including `onNodeSelect?: (id: string | null) => void`), `onReady`, `onError`.
- `ViewerHandle`: provides `unmount(): void`.

## 2. Architectural Findings & Constraints

1. **Single-Instance Store Sharing**:
   - As documented in `index.d.ts` (*"Mount one read-only canvas. Use the HTML component for multiple isolated diagrams"*), calling `mountViewer` directly multiple times in the same JS module shares global state.
   - However, **P3 (AWS Migration Intent Diff)** requires rendering **two interactive topologies side by side** (`As-Is IDC` and `To-Be AWS`) with synchronized trace step highlighting, completeness badges, and independent node selection.
2. **Separation of Topology Semantics vs Layout Annotations**:
   - Containerlab separates `.clab.yml` (nodes and link endpoints) from `.clab.annotations.json` (`nodeAnnotations` with `{ id, position: { x, y }, label, group }`).
   - However, a raw `.clab.yml` file only guarantees L1/L2 link endpoints—it does **not** guarantee that complete L3 routing tables or firewall policies were collected.
   - Our `src/adapters/clabAdapter.ts` (`exportToContainerlabArtifacts` / `importFromContainerlabArtifacts`) preserves this exact split while enforcing the closed-world rule: imported YAML nodes without explicit `ta.routingComplete: "true"` metadata default to `routingTableComplete: false` (`unknown` outcome rather than false `reachable`).
3. **Why an Isolated React SVG Viewer Adapter (`TopologyCanvas.tsx`) is Primary**:
   - Zero shared global store: multiple `<TopologyCanvas />` instances mount side by side in the same DOM without iframe overhead or store collisions.
   - First-class rendering of **Forward/Reverse Trace overlays**, **Completeness indicators**, and **Live T08 Coordinate Nudge (`semanticHash` invariance proof)**.
   - Works deterministically in headless JSDOM/Vitest tests as well as every browser without requiring WebGL or a Linux backend runner.

---

## 원래 문서: docs/rea-reconstruction-ledger.md

# REA Reverse Engineering & Reconstruction Obligation Ledger

## 1. Authenticated REA Evidence Inventory (`rea@6.5.0`)

All reverse-engineering artifacts were generated deterministically using `/Users/men1692/Desktop/AI/rea/scripts/rea.mjs` (`analyze-javascript-application`) against downloaded open-source & production distribution bundles:

| Target Distribution | Version | REA Evidence ID | Root Artifact SHA-256 | Inventory Manifest ID | Semantic Graph Size |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`cidr-tools`** (`dist/index.js`) | `13.0.4` | `ev_0fcaead6f4cd53e6e210930a5c333e12be87b06ba5120f2449710aed8e345ba8` | `2198cdf2e9be128f2575e543b9cc8c2b54d5f0078e93b19d533bb849835bb19a` | `agm_...` (`rea-cidr-tools.json`) | `2,693` nodes / `2,428` relations |
| **`ipaddr.js`** (`lib/ipaddr.js`) | `2.5.0` | `ev_b47d4f61291f9dedcfd10625ae960054b8e85efd97daf473fac25d0f96c0aa6d` | `36d5b0012fbd9bd3f8f91f4570a7f1f3224fb2d1aea33eb959460c6ad1b67e8b` | `agm_...` (`rea-ipaddr.json`) | `2,671` nodes / `1,961` relations |
| **`luci-app-firewall`** (`rules.js`, `zones.js`, `forwards.js`) | `24.10.0` | `ev_ee089d1b0150593078dc07661106acee493af7672748a49a7200708085f3515a` | `8a31e0eb8abf74df92818d462ceecebac66e476fc2d279e426f8677fa999f5ad` | `agm_88b1a55ace91c04da0ec20d6444809bed3f9de7201758acc4b2e28b8a7477694` | `5,934` nodes / `4,870` relations |
| **`@containerlab/clab-viewer`** (`dist/component.mjs`, `viewer-CGUGxblp.js`) | `0.1.0` | `ev_274d5bef2573493c0539bf39d1f34588f43f8054a745886d302ad96a723c194d` | `26986f9a28211692ed16a31185d15eaa16e8cb9580a96a9b51820936405ecabd` | `agm_09854a8acbbdcfb3f46b9853a544c0b29dcdd37c878bface0a0f1f08eef9e055` | `100,000` nodes / `91,132` relations |

---

## 2. Reconstructed Algorithms & Obligation Mapping

| Obligation ID | Source Distribution & Function | Reconstructed Target in Repo | Verification Invariant |
| :--- | :--- | :--- | :--- |
| `REA-CIDR-01` | `cidr-tools@13.0.4` (`dist/index.js`: `subparts4`, `biggestPowerOfTwo4`, `mergeIntervalsRaw4`) | `src/core/firewallAuditEngine.ts` (`subparts4`, `mergeIntervalsRaw4`) | Bitwise `Math.clz32` and `(start & -start) >>> 0` power-of-two aligned CIDR decomposition of arbitrary `[pStart, pEnd]` IPv4 intervals. |
| `REA-CIDR-02` | `cidr-tools@13.0.4` (`dist/index.js`: `subtractSorted4`, `excludeCidr`) | `src/core/firewallAuditEngine.ts` (`excludeCidr4`) | Two-pointer sorted interval subtraction (`base \ excl`) decomposing over-permissive firewall rules (`10.0.0.0/8`, `0.0.0.0/0`) into exact residual exposed CIDR blocks (`residualCidrs`). |
| `REA-CIDR-03` | `cidr-tools@13.0.4` (`dist/index.js`: `containsCidr` coalesced sweep `cur = iv.end + 1`) | `src/core/firewallAuditEngine.ts` (`containsCoalescedCidr4`, `isPrefixSubset`) | Detects both single-rule and multi-interval coalesced prefix coverage (`10.10.20.0/25` + `10.10.20.128/25` covering `10.10.20.0/24`) for `SHADOWED` and `REDUNDANT` firewall rules. |
| `REA-LUCI-01` | `luci-app-firewall@24.10.0` (`rules.js`: `rule_proto_txt`, `rule_src_txt`, `rule_dest_txt`, `rule_target_txt`) | `src/core/firewallAuditEngine.ts` (`synthesizeLuciRuleSummary`) | Synthesizes canonical human-readable firewall match specifications (`Forwarded IPv4, protocol TCP \| From Zone [X] IP [A] ➔ To Zone [Y] IP [B], port [P] ➔ [ACCEPT/DROP]`). |
| `REA-CLAB-01` | `@containerlab/clab-viewer@0.1.0` (`dist/assets/viewer-CGUGxblp.js`: `findNodeLineRange`) | `src/adapters/clabAdapter.ts` (`findNodeLineRangeInYaml`) | Maps topology node IDs to exact `startLine` and `endLine` ranges in `topology.clab.yml`. |
