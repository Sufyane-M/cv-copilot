from backend.app import create_app


def test_modifica_salva_sezioni_ordinate_con_id_stabili(tmp_path):
    client = create_app({'TESTING': True, 'DATABASE': tmp_path / 'sections.sqlite3'}).test_client()
    created = client.post('/api/cvs', json={'title': 'Curriculum sintetico'}).json
    url = f"/api/cvs/{created['id']}"
    profile = {'id': 'profile', 'type': 'summary', 'title': 'Profilo', 'text': 'Testo di prova'}
    skills = {'id': 'skills', 'type': 'skills', 'title': 'Competenze', 'text': ''}
    content = {'sections': [skills, profile]}

    saved = client.put(url + '/content', json={'expected_version': 1, 'content': content})
    assert saved.status_code == 200
    assert saved.json['version_number'] == 2
    assert client.get(url).json['content'] == content

    updated = {'sections': [{**profile, 'text': 'Profilo modificato'}]}
    response = client.put(url + '/content', json={'expected_version': 2, 'content': updated})
    assert response.json['content'] == updated
    assert response.json['version_number'] == 3


def test_salvataggio_rifiuta_identificativi_duplicati_e_testo_oltre_limite(tmp_path):
    client = create_app({'TESTING': True, 'DATABASE': tmp_path / 'sections.sqlite3'}).test_client()
    created = client.post('/api/cvs', json={'title': 'Curriculum sintetico'}).json
    url = f"/api/cvs/{created['id']}"
    section = {'id': 'profile', 'type': 'summary', 'title': 'Profilo', 'text': 'Testo'}
    for sections in ([section, section], [{**section, 'text': 'x' * 2001}], [{**section, 'title': ' '}]):
        response = client.put(url + '/content', json={'expected_version': 1, 'content': {'sections': sections}})
        assert response.status_code == 400
        assert response.json['error']['code'] == 'invalid_input'
    assert client.get(url).json['version_number'] == 1
