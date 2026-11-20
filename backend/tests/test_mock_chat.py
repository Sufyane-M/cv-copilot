from backend.app import create_app


def test_chat_mock_persistente_con_annuncio(tmp_path):
    config = {'TESTING': True, 'DATABASE': tmp_path / 'chat.sqlite3', 'LLM_MODE': 'mock'}
    client = create_app(config).test_client()
    cv = client.post('/api/cvs', json={'title': 'Esempio chat', 'from_example': True}).json
    url = f"/api/cvs/{cv['id']}/chat"
    response = client.post(url, json={
        'section_id': 'profile', 'expected_version': 1,
        'message': 'Rendi chiaro il profilo', 'job_posting': 'Stage web',
    })
    assert response.status_code == 201
    assert [message['role'] for message in response.json['messages']] == ['user', 'assistant']
    assert response.json['messages'][0]['job_posting'] == 'Stage web'
    assert all(message['base_version_number'] == 1 for message in response.json['messages'])
    assert response.json['messages'][1]['text']
    assert create_app(config).test_client().get(url).json == response.json
