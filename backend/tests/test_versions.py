from backend.app import create_app


def make_cv(tmp_path):
    client = create_app({'TESTING': True, 'DATABASE': tmp_path / 'versions.sqlite3'}).test_client()
    created = client.post('/api/cvs', json={'title': 'Curriculum sintetico', 'from_example': True}).json
    return client, f"/api/cvs/{created['id']}", created['content']


def test_ripristino_crea_snapshot_e_conserva_le_versioni(tmp_path):
    client, url, original = make_cv(tmp_path)
    content = {'sections': [{**original['sections'][0], 'text': 'Profilo aggiornato'}]}
    saved = client.put(url + '/content', json={'expected_version': 1, 'content': content})
    assert saved.json['version_number'] == 2
    unchanged = client.put(url + '/content', json={'expected_version': 2, 'content': content})
    assert unchanged.json['version_number'] == 2
    assert client.get(url + '/versions/1').json['content'] == original

    restored = client.post(url + '/versions/1/restore', json={'expected_version': 2})
    assert restored.status_code == 200
    assert restored.json['version_number'] == 3
    assert restored.json['content'] == original
    assert client.get(url + '/versions/2').json['content'] == content
    versions = client.get(url + '/versions').json
    assert [item['number'] for item in versions] == [3, 2, 1]
    assert versions[0]['origin'] == 'restore'
    assert versions[0]['restored_from_number'] == 1


def test_scritture_obsolete_non_producono_snapshot(tmp_path):
    client, url, original = make_cv(tmp_path)
    content = {'sections': [{**original['sections'][0], 'text': 'Profilo aggiornato'}]}
    assert client.put(url + '/content', json={'expected_version': 1, 'content': content}).status_code == 200
    stale_save = client.put(url + '/content', json={'expected_version': 1, 'content': original})
    stale_restore = client.post(url + '/versions/1/restore', json={'expected_version': 1})
    for response in (stale_save, stale_restore):
        assert response.status_code == 409
        assert response.json['error']['code'] == 'version_conflict'
    assert client.get(url + '/versions/999').status_code == 404
    assert client.post(url + '/versions/2/restore', json={'expected_version': 2}).status_code == 400
    assert len(client.get(url + '/versions').json) == 2
    assert client.get(url).json['content'] == content
