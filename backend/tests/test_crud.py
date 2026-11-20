from backend.app import create_app


def test_archivio_persistente_e_esempio_idempotente(tmp_path):
    config = {'TESTING': True, 'DATABASE': tmp_path / 'archive.sqlite3'}
    client = create_app(config).test_client()
    assert client.get('/api/cvs').json == []
    created = client.post('/api/cvs', json={'title': 'Esempio sintetico', 'from_example': True})
    assert created.status_code == 201
    assert created.json['version_number'] == 1
    assert created.json['content']['sections']
    url = f"/api/cvs/{created.json['id']}"
    assert client.post('/api/cvs', json={'title': 'Esempio sintetico', 'from_example': True}).status_code == 200

    client = create_app(config).test_client()
    assert len(client.get('/api/cvs').json) == 1
    assert client.get(url).json['title'] == 'Esempio sintetico'
    assert client.patch(url, json={'title': 'Archivio sintetico'}).json['title'] == 'Archivio sintetico'
    assert client.delete(url).status_code == 204
    assert client.get(url).json['error']['code'] == 'cv_not_found'


def test_archivio_rifiuta_input_malformati(tmp_path):
    client = create_app({'TESTING': True, 'DATABASE': tmp_path / 'archive.sqlite3'}).test_client()
    for body in ({'title': ''}, {'title': 'x' * 101}, {'title': 'CV', 'from_example': 'sì'}):
        assert client.post('/api/cvs', json=body).status_code == 400
    assert client.get('/api/cvs/0').status_code == 404
