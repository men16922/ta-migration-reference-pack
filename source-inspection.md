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
