"""On-prem deployment view: site boundary, network, WEB/WAS/DB tiers, infrastructure.

Tier membership is not a traffic edge or a security zone. No network equipment is invented.
"""
from collections import defaultdict

from .model import Box
from .inventory import _agg_node, _net_band, _server_node, _shared_band, device_kind


def build_enterprise(assets, components, view, project, profile, max_nodes=60):
    hosts = {c['asset_key'] for c in components if c.get('project') == project}
    selected = [a for a in assets if view == 'idc' or a.get('project') == project or a['key'] in hosts]
    deployments = [c for c in components if view == 'idc' or c.get('project') == project]
    if view == 'project' and not selected and not deployments:
        raise ValueError('해당 업무 시스템의 자산이 없습니다.')
    name = next((c.get('project_name') for c in deployments if c.get('project_name')), None) or next((a.get('project_name') for a in selected if a.get('project_name')), project)
    title = 'IDC 인프라 아키텍처' if view == 'idc' else f'{name} 인프라 아키텍처'
    root = Box(f'enterprise/{view}/{project or "all"}', 'root', direction='row')
    root.children.append(Box(root.path + '/title', 'title', title))
    def site_name(a):
        return a.get('site') or '(설치지역 미확인)'
    sites = sorted({site_name(a) for a in [*selected, *deployments]})
    aggregate = view == 'idc' or len(selected) + len(deployments) > max_nodes
    for site in sites:
        local = [a for a in selected if site_name(a) == site]
        instances = [c for c in deployments if site_name(c) == site]
        references = [a for a in assets if site_name(a) == site]
        s = Box(f'{root.path}/{site}', 'site', site, f'호스트·장비 {len(local)}대 · 인스턴스 {len(instances)}개', direction='col')
        network = _net_band(s.path, references if view == 'project' else local)
        if network:
            network.label = '네트워크 · 보안 · 공통 장비' + (' (참조)' if view == 'project' else '')
            s.children.append(network)
        lanes = Box(s.path + '/tiers', 'lane', direction='row', stretch=True)
        deployed_hosts = {c['asset_key'] for c in instances if c.get('asset_key')}
        for role, label in [('web', 'WEB · 프레젠테이션'), ('was', 'WAS · 애플리케이션'), ('db', 'DB · 데이터')]:
            tier = Box(s.path + '/' + role, 'tier', label, '애플리케이션 계층', style=f'role:{role}', direction='col')
            group = [c for c in instances if c['component_kind'] == role]
            servers = [a for a in local if a['key'] not in deployed_hosts and a.get('role') == role and not device_kind(a)]
            if aggregate:
                batches = defaultdict(list)
                for c in group:
                    batches[(c.get('project_name') or '업무 미확인', c.get('product') or '-')].append(c)
                for (business, product), members in sorted(batches.items()):
                    node = _agg_node(tier.path, business + '/' + product, product, members, f'role:{role}', sub=business)
                    node.meta.update({'record_type': 'component', 'instances': len(members), 'match_status': f"서버 연결 {sum(bool(c['asset_key']) for c in members)}/{len(members)}"})
                    tier.children.append(node)
                if servers:
                    tier.children.append(_agg_node(tier.path, 'hosts', role.upper() + ' 서버', servers, f'role:{role}'))
            else:
                for c in group:
                    endpoint = c.get('sid') or c.get('url') or ''
                    sub = '\n'.join(filter(None, [
                        ' · '.join(filter(None, [c['hostname'], c.get('environment')])), ' · '.join(filter(None, [endpoint, f"PORT {c['port']}" if c.get('port') else ''])),
                        c.get('product_version')]))
                    tier.children.append(Box(f"{tier.path}/{c['key']}", 'node', c.get('product') or role.upper(), sub, f'role:{role}', meta={**c, 'record_type': 'component'}))
                tier.children.extend(_server_node(tier.path, a) for a in servers)
            if not tier.children:
                tier.sublabel = '등록 정보 없음'
            lanes.children.append(tier)
        s.children.append(lanes)
        other = [a for a in local if not device_kind(a) and a['key'] not in deployed_hosts and a.get('role') not in ('web', 'was', 'db') and not a.get('shared')]
        if other:
            group = Box(s.path + '/hosts', 'band', '서버 인벤토리 · 기타 역할', 'WEB/WAS/DB 미연결 호스트', direction='row', wrap=3)
            if aggregate:
                batches = defaultdict(list)
                for a in other:
                    batches[a.get('role') or '역할 미확인'].append(a)
                group.children.extend(_agg_node(group.path, k, k, v, 'role:') for k, v in sorted(batches.items()))
            else:
                group.children.extend(_server_node(group.path, a) for a in other)
            s.children.append(group)
        shared = _shared_band(s.path, [a for a in references if a.get('shared')])
        if shared:
            s.children.append(shared)
        root.children.append(s)
    servers = sum(not device_kind(a) for a in selected)
    stats = {'view': view, 'project': project, 'name': name if view == 'project' else None,
             'assets': len(selected), 'servers': servers, 'shown': servers, 'components': len(deployments),
             'unmatched_components': sum(c['match_status'] != 'matched' for c in deployments),
             'aggregated': aggregate, 'sites': sites, 'notation': 'onprem-deployment'}
    return root, [], stats
