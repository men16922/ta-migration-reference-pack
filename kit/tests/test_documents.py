import pytest
from fastapi.testclient import TestClient
from onprem_atlas.web import create_app
from onprem_atlas.web.documents import validate_xml
from test_enterprise_import import HEADERS, SERVER, preview, commit


def test_manual_drawio_revision_source_isolation_and_stale_inventory(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    original = client.get('/api/documents').json()
    assert original['revision'] == 0
    xml = original['xml'].replace('</root>', '<mxCell id="manual-fw" value="수동 방화벽" vertex="1" parent="1"><mxGeometry x="40" y="800" width="100" height="60" as="geometry"/></mxCell></root>')
    body = {'xml': xml, 'revision': 0, 'base_run': original['base_run']}
    assert client.put('/api/documents', json=body, headers={'X-Atlas-Request':'1'}).json()['revision'] == 1
    assert client.put('/api/documents', json=body, headers={'X-Atlas-Request':'1'}).status_code == 409
    assert client.get('/api/assets').json()['total'] == 1
    assert 'manual-fw' not in client.get('/api/documents?generated=true').json()['xml']
    assert 'manual-fw' in client.get('/api/documents/download').text
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    saved = client.get('/api/documents').json()
    assert saved['stale'] and saved['base_run'] == 1 and saved['current_run'] == 2
    assert 'manual-fw' in saved['xml']
    body['revision'] = 1
    assert client.put('/api/documents', json=body, headers={'X-Atlas-Request':'1'}).status_code == 200
    assert client.get('/api/documents?revision=1').json()['loaded_revision'] == 1
    assert len(client.get('/api/documents').json()['history']) == 2


def test_manual_network_connection_and_project_scopes_survive_reopen(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert commit(client, preview(client, [HEADERS, SERVER])).status_code == 200
    project = client.get('/api/projects').json()['items'][0]['code']
    original = client.get('/api/documents', params={'project': project}).json()
    additions = '''<mxCell id="zone" value="운영망 (수동)" vertex="1" parent="1"><mxGeometry x="40" y="800" width="500" height="200" as="geometry"/></mxCell>
    <mxCell id="fw" value="FW" vertex="1" parent="zone"><mxGeometry x="30" y="40" width="100" height="60" as="geometry"/></mxCell>
    <mxCell id="sw" value="SW" vertex="1" parent="zone"><mxGeometry x="200" y="40" width="100" height="60" as="geometry"/></mxCell>
    <mxCell id="flow" value="TCP 443 (수동)" edge="1" parent="zone" source="fw" target="sw"><mxGeometry relative="1" as="geometry"/></mxCell>'''
    xml = original['xml'].replace('</root>', additions + '</root>')
    body = {'xml': xml, 'revision': 0, 'base_run': original['base_run']}
    assert client.put('/api/documents', params={'project': project}, json=body, headers={'X-Atlas-Request':'1'}).status_code == 200
    reopened = TestClient(create_app(tmp_path / 'a.db'), client=('127.0.0.1', 1))
    assert reopened.get('/api/documents', params={'project': project}).json()['xml'] == xml
    assert reopened.get('/api/documents').json()['revision'] == 0
    assert reopened.get('/api/diagram/idc').json()['edges'] == []


@pytest.mark.parametrize('xml', [
    '<!DOCTYPE mxfile [<!ENTITY bad SYSTEM "file:///etc/passwd">]><mxfile>&bad;</mxfile>',
    '<mxfile><diagram>compressed</diagram></mxfile>',
    '<mxGraphModel><root><mxCell id="1"/><mxCell id="1"/></root></mxGraphModel>',
    '<mxGraphModel><root><mxCell><mxGeometry x="nan"/></mxCell></root></mxGraphModel>',
])
def test_rejects_unsafe_or_invalid_documents(xml):
    with pytest.raises(ValueError):
        validate_xml(xml)
