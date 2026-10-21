from fastapi.testclient import TestClient

from onprem_atlas.diagram import device_kind
from onprem_atlas.review import is_server
from onprem_atlas.web import create_app
from test_enterprise_import import HEADERS, SERVER, DEVICE_HEADERS, DEVICE, preview, commit


SECURITY_HEADERS = ['그룹사명', '설치지역', '장비명', '관리IP', 'OS버전', '솔루션 유형', '제조사', '모델명', '동작방식', 'S/N', '담당팀', '담당자(정)', '담당자(부)', '모니터링 여부', '설명']


def row(name, solution, mode='Active'):
    return ['합성조직', '시험센터', name, '192.0.2.40', '1.0', solution, '합성제조사', 'TEST-100', mode, 'TEST-SERIAL', '시험보안팀', '시험담당', '시험부담당', '예', '합성 검증 자료']


def test_security_inventory_preserves_types_raw_values_and_other_sources(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    assert commit(client, preview(client, [DEVICE_HEADERS, DEVICE], 'equipment')).status_code == 200
    types = ['NAC', 'Anti-DDoS', 'Anti-Spam', '악성코드대응', '바이패스 스위치', '이상징후탐지', '방화벽']
    rows = [row(f'test-security-{i}', solution) for i, solution in enumerate(types)]
    p = preview(client, [SECURITY_HEADERS, *rows], 'security')
    assert p['can_commit'] and p['mapping']['category_detail'] == '솔루션 유형'
    assert commit(client, p).status_code == 200
    summary = client.get('/api/summary').json()
    assert summary['assets']['total'] == 9 and summary['assets']['servers'] == 1
    assets = client.get('/api/assets', params={'q': 'test-security'}).json()['items']
    assert len(assets) == 7 and {a['category_detail'] for a in assets} == set(types)
    assert all(not is_server(a) and a['category'] == '보안장비' for a in assets)
    assert sum(device_kind(a) == 'fw' for a in assets) == 1
    layout = client.get('/api/diagram/idc').json()
    labels = {b['label'] for b in layout['boxes']}
    assert 'NAC × 1' in labels and 'Anti-DDoS × 1' in labels and '방화벽 × 1' in labels
    assert layout['edges'] == []  # Active/Standby is not a declared peer or observed connection.
    detail = client.get('/api/asset', params={'key': assets[0]['key']}).json()
    raw = {r['column']: r['value'] for r in detail['raw']}
    assert raw['동작방식'] == 'Active' and raw['담당팀'] == '시험보안팀' and raw['모니터링 여부'] == '예'
    assert commit(client, preview(client, [SECURITY_HEADERS, rows[0]], 'security', mode='replace'), confirm_replace=True).status_code == 200
    assert client.get('/api/assets').json()['total'] == 3
    assert client.get('/api/summary').json()['assets']['servers'] == 1


def test_solution_type_alone_is_not_mistaken_for_a_server_or_firewall():
    for solution in ('NAC', 'Anti-DDoS', 'Anti-Spam', 'IPS', '바이패스 스위치', '이상징후탐지', '악성코드대응'):
        asset = {'category_detail': solution}
        assert not is_server(asset) and device_kind(asset) == 'security'


def test_security_repeat_is_zero_diff_and_changed_solution_updates_same_asset(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    first = [SECURITY_HEADERS, row('test-security-01', 'NAC')]
    assert commit(client, preview(client, first, 'security')).status_code == 200
    same = preview(client, first, 'security')
    assert same['changes']['added'] == same['changes']['changed'] == same['changes']['removed'] == 0
    assert commit(client, same).status_code == 200
    changed = preview(client, [SECURITY_HEADERS, row('test-security-01', 'WAF')], 'security')
    assert changed['changes']['added'] == 0 and changed['changes']['changed'] == 1
    assert commit(client, changed).status_code == 200
    result = client.get('/api/assets').json()
    assert result['total'] == 1 and result['items'][0]['category_detail'] == 'WAF'
    assert device_kind({'category': '보안장비', 'category_detail': 'FW'}) == 'fw'
