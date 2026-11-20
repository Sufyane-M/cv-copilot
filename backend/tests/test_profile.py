import base64

import pytest

from backend import llm
from backend.app import create_app


PHOTO = ('data:image/png;base64,'
         'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


@pytest.fixture
def saved_document(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'profile.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    created = client.post('/api/cvs', json={'title': 'CV sintetico'}).json
    return client, f'/api/cvs/{created["id"]}'


def sample_document():
    return {
        'document_title': 'Ada Neri',
        'sections': [{
            'id': 'first-job', 'type': 'experience', 'title': 'Sviluppatrice web',
            'subtitle': 'Laboratorio didattico', 'period': '2024–2025',
            'text': 'Sviluppo di una piccola applicazione per la biblioteca.',
        }],
        'profile': {
            'role': 'Sviluppatrice web', 'email': 'ada@example.test', 'phone': '+39 020000000',
            'location': 'Torino', 'website': 'portfolio.example.test', 'photo': PHOTO,
        },
    }


def test_profilo_e_dettagli_restano_versionati_e_privati_nella_revisione(saved_document, monkeypatch):
    client, url = saved_document
    document = sample_document()
    saved = client.put(f'{url}/content', json={'expected_version': 1, 'content': document})
    assert saved.status_code == 200
    assert saved.json['content'] == document
    assert client.get(f'{url}/versions/1').json['content'] == {'sections': []}

    def suggest_edit(_config, context):
        assert context['content'] == {field: document[field] for field in ('sections', 'document_title')}
        assert context['section'] == document['sections'][0]
        return {'text': '', 'proposal': {
            'section_id': 'first-job', 'new_text': 'Ho sviluppato una piccola applicazione per la biblioteca.',
            'reason': 'Testo in prima persona.',
        }}

    monkeypatch.setattr(llm, 'generate_review', suggest_edit)
    response = client.post(f'{url}/chat', json={
        'expected_version': 2, 'section_id': 'first-job', 'message': 'Rendi il testo più diretto.',
    })
    assert response.status_code == 201
    proposal = response.json['proposals'][0]
    accepted = client.post(f'{url}/proposals/{proposal["id"]}/accept')
    assert accepted.json == {'status': 'accepted', 'version_number': 3}
    current = client.get(url).json['content']
    assert current['profile'] == document['profile']
    assert current['sections'][0] == {**document['sections'][0], 'text': proposal['new_text']}

    restored = client.post(f'{url}/versions/2/restore', json={'expected_version': 3})
    assert restored.json['version_number'] == 4
    assert restored.json['content'] == document


@pytest.mark.parametrize('photo', [
    'https://example.test/photo.jpg',
    'data:image/png;base64,!!!',
    PHOTO.replace('image/png', 'image/jpeg'),
    'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff' + b'a' * (256 * 1024) + b'\xff\xd9').decode(),
], ids=['url-remoto', 'base64-invalido', 'formato-discordante', 'foto-troppo-grande'])
def test_foto_non_valida_non_viene_salvata(saved_document, photo):
    client, url = saved_document
    document = sample_document()
    document['profile']['photo'] = photo
    response = client.put(f'{url}/content', json={'expected_version': 1, 'content': document})
    assert response.status_code == 400
    assert response.json['error']['code'] == 'invalid_input'
    assert client.get(url).json['version_number'] == 1


def test_limiti_dei_campi_strutturati(saved_document):
    client, url = saved_document
    limits = client.get('/api/config').json['limits']
    document = sample_document()
    document['sections'][0]['period'] = 'X' * (limits['section_period'] + 1)
    assert client.put(f'{url}/content', json={'expected_version': 1, 'content': document}).status_code == 400
    document['sections'][0]['period'] = ''
    document['profile']['email'] = 'X' * (limits['profile_email'] + 1)
    assert client.put(f'{url}/content', json={'expected_version': 1, 'content': document}).status_code == 400
    document['profile']['email'] = ''
    document['profile']['photo'] = ''
    assert client.put(f'{url}/content', json={'expected_version': 1, 'content': document}).status_code == 200
