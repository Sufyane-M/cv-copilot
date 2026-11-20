import pytest

from backend.app import create_app


@pytest.fixture
def cv(tmp_path):
    client = create_app({'TESTING': True, 'DATABASE': tmp_path / 'design.sqlite3', 'LLM_MODE': 'mock'}).test_client()
    created = client.post('/api/cvs', json={'title': 'Curriculum sintetico con design'}).json
    return client, f"/api/cvs/{created['id']}"


SECTION = {'id': 'profilo', 'type': 'summary', 'title': 'Profilo', 'text': 'Studio informatica'}
DESIGN = {
    'templateId': 'classic-roma',
    'colors': {'accent': '#297D76'},
    'typography': {'font': 'mono'},
    'page': {'margin': 12},
    'blocks': {'profilo': {'width': 72, 'minHeight': 27}},
}


def save(client, url, expected_version, content):
    return client.put(url + '/content', json={'expected_version': expected_version, 'content': content})


def test_salva_normalizza_e_ripristina_il_design(cv):
    client, url = cv
    original = client.get(url).json['content']
    assert original == {'sections': []}

    content = {'sections': [SECTION], 'document_title': 'Titolo del documento', 'design': DESIGN}
    saved = save(client, url, 1, content)
    assert saved.status_code == 200
    assert saved.json['version_number'] == 2
    snapshot = saved.json['content']
    assert snapshot['sections'] == content['sections']
    assert snapshot['document_title'] == content['document_title']
    design = snapshot['design']
    assert design['templateId'] == DESIGN['templateId']
    assert design['colors']['accent'] == '#297d76'
    assert design['colors']['background'] == '#fffffd'
    assert design['typography']['font'] == 'mono'
    assert design['page']['margin'] == 12
    assert design['blocks']['profilo']['width'] == 72
    assert design['blocks']['profilo']['minHeight'] == 27
    assert save(client, url, 2, snapshot).json['version_number'] == 2

    legacy = client.post(url + '/versions/1/restore', json={'expected_version': 2})
    assert legacy.status_code == 200 and legacy.json['content'] == original
    restored = client.post(url + '/versions/2/restore', json={'expected_version': 3})
    assert restored.status_code == 200
    assert restored.json['version_number'] == 4
    assert restored.json['content'] == snapshot
    assert client.get(url + '/versions/2').json['content'] == snapshot


def test_design_invalido_non_crea_versioni(cv):
    client, url = cv
    for changes in (
        {'templateId': 'inesistente'},
        {'colors': {'accent': 'blu'}},
        {'typography': {'textSize': True}},
        {'page': {'columns': 2}},
        {'page': {'margin': 99}},
        {'blocks': {'sezione-assente': {'width': 72}}},
        {'blocks': {'profilo': {'width': 101}}},
        {'css': 'non supportato'},
    ):
        response = save(client, url, 1, {'sections': [SECTION], 'design': {**DESIGN, **changes}})
        assert response.status_code == 400
        assert response.json['error']['code'] == 'invalid_input'
    assert client.get(url).json['version_number'] == 1


def test_accettazione_ai_conserva_design_e_profilo(cv):
    client, url = cv
    snapshot = save(client, url, 1, {
        'sections': [SECTION], 'design': DESIGN, 'profile': {'role': 'Sviluppatrice'},
    }).json['content']
    review = client.post(url + '/chat', json={
        'expected_version': 2, 'section_id': SECTION['id'], 'message': 'Migliora il profilo.',
    })
    assert review.status_code == 201
    proposal = review.json['proposals'][0]
    accepted = client.post(f"{url}/proposals/{proposal['id']}/accept")
    assert accepted.status_code == 200
    assert accepted.json['version_number'] == 3
    assert client.get(url).json['content'] == {
        **snapshot, 'sections': [{**SECTION, 'text': proposal['new_text']}],
    }
