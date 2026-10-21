from __future__ import annotations

from fastapi.testclient import TestClient
from onprem_atlas.store import AtlasStore
from onprem_atlas.web import create_app
from test_enterprise_import import HEADERS, SERVER, preview, commit

HEADER = ['그룹사', '설치지역', '호스트', '호스트IP', 'DB제품', 'DB제품버전', 'DB명(SID)', 'PORT', 'ITSM 업무(소)', '이중화방식']
ROW = ['합성조직', '시험센터', 'test-app-01', '192.0.2.11', 'ORACLE', '19c', 'APP', '1521', '합성 ERP', 'A-S']


def test_instance_rows_coexist_without_inflating_hosts_and_survive_asset_updates(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    other = [*ROW]
    other[6] = 'AUDIT'
    p = preview(client, [HEADER, ROW, other], 'db')
    assert p['can_commit'] and p['host_matches'] == {'matched': 2}
    assert commit(client, p).status_code == 200
    assert client.get('/api/assets').json()['total'] == 1
    items = client.get('/api/components').json()['items']
    assert len(items) == 2 and {c['sid'] for c in items} == {'APP', 'AUDIT'}
    assert all(c['asset_key'] and c['match_status'] == 'matched' for c in items)
    assert client.get('/api/summary').json()['components'] == {'total': 2, 'unmatched': 0}
    assert client.get('/api/diff').json()['components']['counts']['added'] == 2
    assert client.get('/api/component', params={'key': items[0]['key']}).json()['source']['source_id'] == 'db'
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    assert client.get('/api/components').json()['total'] == 2
    changed = [*ROW]
    changed[5] = '23ai'
    p = preview(client, [HEADER, changed], 'db')
    assert p['changes'] == {'added': 0, 'changed': 1, 'removed': 0, 'retained': 1}
    assert commit(client, p).status_code == 200
    assert client.get('/api/diff').json()['components']['changed'][0]['fields']['product_version'] == {'before': '19c', 'after': '23ai'}
    p = preview(client, [HEADER, changed], 'db', mode='replace')
    assert commit(client, p, confirm_replace=True).status_code == 200
    assert client.get('/api/components').json()['total'] == 1
    assert client.get('/api/assets').json()['total'] == 1
    with AtlasStore(tmp_path / 'a.db') as store:
        assert len(store.list_components(2)) == 2
    from onprem_atlas.agent_tools import AssetKnowledgeTools

    tools = AssetKnowledgeTools(tmp_path / 'a.db', tmp_path / 'knowledge.db', knowledge_groups=frozenset())
    result = tools.search_components('APP', kind='DB')
    assert result['total'] == 1 and result['items'][0]['citation'].startswith('component:')
    assert len(tools.get_asset(items[0]['asset_key'])['components']) == 1


def test_unmatched_and_ambiguous_hosts_are_not_guessed(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert commit(client, preview(client, [HEADER, ROW], 'db')).status_code == 200
    assert client.get('/api/workspace').json()['has_assets']
    assert client.get('/api/components').json()['items'][0]['match_status'] == 'unmatched'
    other = [*SERVER]
    other[0] = '다른합성조직'
    assert commit(client, preview(client, [HEADERS, SERVER, other])).status_code == 200
    assert client.get('/api/components').json()['items'][0]['match_status'] == 'matched'
    ambiguous = [*ROW]
    ambiguous[0] = ''
    assert commit(client, preview(client, [HEADER, ambiguous], 'db')).status_code == 200
    assert {r['match_status'] for r in client.get('/api/components').json()['items']} == {'matched', 'ambiguous'}


def test_duplicate_instances_and_invalid_ports_block_commit(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert not preview(client, [HEADER, ROW, ROW], 'db')['can_commit']
    row = [*ROW]
    row[7] = '65536'
    p = preview(client, [HEADER, row], 'db')
    assert not p['can_commit'] and commit(client, p).status_code == 422
