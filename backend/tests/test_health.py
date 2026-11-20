from backend.app import create_app


def test_health_and_json_not_found():
    client = create_app({'TESTING': True}).test_client()
    assert client.get('/api/health').json == {'status': 'ok'}
    missing = client.get('/api/inesistente')
    assert missing.status_code == 404
    assert missing.json['error']['code'] == 'resource_not_found'


def test_same_origin_for_writes():
    client = create_app({'TESTING': True}).test_client()
    response = client.post('/api/health', headers={'Origin': 'https://example.test'})
    assert response.status_code == 403
    assert response.json['error']['code'] == 'invalid_origin'
