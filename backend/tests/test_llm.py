import json

import httpx
import pytest

from backend import llm, validation


MODEL_ID = 'demo/catalog-model'
ACTUAL_MODEL_ID = 'demo/served-model'
SECTION = {'id': 'profile', 'type': 'summary', 'title': 'Profilo', 'text': 'Studio informatica'}
CONTEXT = {
    'content': {'sections': [SECTION]},
    'section': SECTION,
    'message': 'Migliora la leggibilità.',
    'job_posting': 'Stage di sviluppo web',
    'history': [{'role': 'assistant', 'text': 'Proposta precedente', 'status': 'rejected'}],
    'base_version_number': 2,
    'model_id': MODEL_ID,
}
PROPOSAL = {'section_id': 'profile', 'new_text': 'Studio informatica.', 'reason': 'Completa la frase.'}
TOOL = {
    'type': 'function',
    'id': 'call_test',
    'function': {'name': 'propose_edit', 'arguments': json.dumps(PROPOSAL)},
}
CATALOG_MODEL = {
    'id': MODEL_ID,
    'name': 'Modello di prova',
    'architecture': {'input_modalities': ['text', 'image'], 'output_modalities': ['text']},
    'supported_parameters': ['tools'],
}


def completion(finish, text=None, calls=None, actual=ACTUAL_MODEL_ID):
    return {
        'choices': [{
            'finish_reason': finish,
            'message': {'role': 'assistant', 'content': text, 'tool_calls': calls},
        }],
        'model': actual,
    }


def configure_provider(handler, *, models=None):
    requests = []

    def intercept(request):
        requests.append(request)
        if request.url.path == '/api/v1/models':
            entries = [CATALOG_MODEL] if models is None else models
            return httpx.Response(200, json={'data': entries})
        assert request.url.path == '/api/v1/chat/completions'
        return handler(request)

    config = {
        'LLM_MODE': 'openrouter',
        'OPENROUTER_API_KEY': 'test-token',
        'LLM_TIMEOUT': 3.5,
        'LLM_MAX_TOKENS': 1600,
        'OPENROUTER_CATALOG': llm.ModelCatalog(),
        'OPENROUTER_TRANSPORT': httpx.MockTransport(intercept),
    }
    return config, requests


def reject_generation(_request):
    pytest.fail('La generazione non doveva partire.')


def test_openrouter_invia_il_modello_scelto_con_tool_e_contesto_applicativo():
    config, requests = configure_provider(lambda _: httpx.Response(200, json=completion('tool_calls', calls=[TOOL])))
    assert llm.get_models(config) == [{'id': MODEL_ID, 'name': 'Modello di prova'}]
    result = llm.generate_review(config, CONTEXT)
    assert result['actual_model_id'] == ACTUAL_MODEL_ID
    validated = validation.validate_review_result(result, SECTION['id'])
    assert validated['text'] == 'Proposta pronta per la revisione.'
    assert validated['proposal'] == PROPOSAL

    assert [request.method for request in requests] == ['GET', 'POST']
    assert dict(requests[0].url.params) == llm.CATALOG_FILTERS
    authorized = all(request.headers.get('Authorization') == 'Bearer test-token' for request in requests)
    assert authorized
    assert requests[1].extensions['timeout']['read'] == config['LLM_TIMEOUT']
    body = json.loads(requests[1].content)
    assert body['model'] == MODEL_ID
    assert body['max_completion_tokens'] == config['LLM_MAX_TOKENS']
    assert body['provider'] == {'require_parameters': True, 'allow_fallbacks': False}
    assert body['tool_choice'] == 'auto'
    assert body['stream'] is False
    assert not {'models', 'parallel_tool_calls'} & body.keys()
    assert [tool['function']['name'] for tool in body['tools']] == ['propose_edit']
    assert body['tools'][0]['function']['parameters']['required'] == ['section_id', 'new_text', 'reason']
    assert [message['role'] for message in body['messages']] == ['system', 'user']
    assert json.loads(body['messages'][1]['content']) == {key: value for key, value in CONTEXT.items() if key != 'model_id'}


def test_catalogo_controlla_compatibilita_e_riusa_la_cache_fino_alla_scadenza(monkeypatch):
    time = 100
    monkeypatch.setattr(llm, 'monotonic', lambda: time)
    image_architecture = {'input_modalities': ['text'], 'output_modalities': ['image']}
    audio_architecture = {'input_modalities': ['audio'], 'output_modalities': ['text']}
    config, requests = configure_provider(reject_generation, models=[
        CATALOG_MODEL,
        {**CATALOG_MODEL, 'id': 'demo/audio', 'architecture': audio_architecture},
        {**CATALOG_MODEL, 'id': 'demo/image', 'architecture': image_architecture},
        {**CATALOG_MODEL, 'id': 'demo/no-tool', 'supported_parameters': []},
        {'id': 'demo/invalid'},
    ])
    expected = [{'id': MODEL_ID, 'name': 'Modello di prova'}]
    assert llm.get_models(config) == expected
    time += llm.CATALOG_TTL - 1
    assert llm.get_models(config) == expected
    assert [request.method for request in requests] == ['GET']
    time += 1
    assert llm.get_models(config) == expected
    assert [request.method for request in requests] == ['GET', 'GET']


def test_rifiuta_modello_non_disponibile_prima_di_generare():
    config, requests = configure_provider(reject_generation)
    with pytest.raises(validation.ApiError) as error:
        llm.generate_review(config, {**CONTEXT, 'model_id': 'demo/non-presente'})
    assert error.value.code == 'model_unavailable'
    assert error.value.status == 400
    assert [request.method for request in requests] == ['GET']


def test_chiave_mancante_e_modalita_demo_non_accedono_alla_rete():
    config, requests = configure_provider(reject_generation)
    config['OPENROUTER_API_KEY'] = ''
    with pytest.raises(validation.ApiError) as error:
        llm.get_models(config)
    assert error.value.code == 'llm_not_configured'
    with pytest.raises(validation.ApiError) as error:
        llm.generate_review(config, CONTEXT)
    assert error.value.code == 'llm_not_configured'

    config['LLM_MODE'] = 'mock'
    assert llm.get_models(config) == []
    assert llm.generate_review(config, CONTEXT)['proposal']['section_id'] == SECTION['id']
    assert requests == []


def test_openrouter_ammette_una_domanda_senza_proposta():
    text = 'Quale aspetto del profilo vuoi evidenziare?'
    config, requests = configure_provider(lambda _: httpx.Response(200, json=completion('stop', text=text, actual=None)))
    assert llm.generate_review(config, CONTEXT) == {'text': text, 'proposal': None, 'actual_model_id': None}
    assert [request.method for request in requests] == ['GET', 'POST']


@pytest.mark.parametrize('data', [
    completion('length', calls=[TOOL]),
    completion('tool_calls', calls=[{**TOOL, 'function': {**TOOL['function'], 'name': 'inatteso'}}]),
    completion('tool_calls', calls=[TOOL, {**TOOL, 'id': 'call_extra'}]),
    completion('tool_calls', calls=[{**TOOL, 'function': {**TOOL['function'], 'arguments': '{'}}]),
    completion('tool_calls'),
    completion('stop', text='  '),
    completion('tool_calls', calls=[{**TOOL, 'function': {
        **TOOL['function'], 'arguments': json.dumps({**PROPOSAL, 'section_id': 'other'}),
    }}]),
], ids=['troncata', 'tool-inatteso', 'tool-multipli', 'json-malformato', 'tool-mancante', 'testo-vuoto', 'altra-sezione'])
def test_openrouter_rifiuta_risposte_fuori_contratto(data):
    config, requests = configure_provider(lambda _: httpx.Response(200, json=data))
    with pytest.raises(validation.ApiError) as error:
        validation.validate_review_result(llm.generate_review(config, CONTEXT), SECTION['id'])
    assert error.value.code == 'invalid_ai_response'
    assert error.value.status == 502
    assert [request.method for request in requests] == ['GET', 'POST']


@pytest.mark.parametrize(('status', 'code', 'app_code', 'app_status'), [
    (401, 401, 'provider_authentication', 502),
    (402, 402, 'provider_credit', 402),
    (403, 403, 'provider_restricted', 502),
    (429, 429, 'provider_rate_limit', 429),
    (503, 503, 'provider_unavailable', 502),
    (200, '429', 'provider_rate_limit', 429),
])
def test_openrouter_non_diffonde_errori_del_provider(status, code, app_code, app_status):
    def refuse(_):
        return httpx.Response(status, json={'error': {'code': code, 'message': 'DETTAGLIO_RISERVATO'}})

    config, requests = configure_provider(refuse)
    with pytest.raises(validation.ApiError) as error:
        llm.generate_review(config, CONTEXT)
    assert error.value.code == app_code
    assert error.value.status == app_status
    assert 'DETTAGLIO_RISERVATO' not in str(error.value)
    assert [request.method for request in requests] == ['GET', 'POST']


def test_openrouter_timeout_senza_retry_o_simulazione():
    def timeout(request):
        raise httpx.ReadTimeout('timeout simulato', request=request)

    config, requests = configure_provider(timeout)
    with pytest.raises(validation.ApiError) as error:
        llm.generate_review(config, CONTEXT)
    assert error.value.code == 'provider_timeout'
    assert error.value.status == 504
    assert [request.method for request in requests] == ['GET', 'POST']


@pytest.mark.parametrize(('response', 'app_code'), [
    (httpx.Response(200, text='<html>Gateway indisponibile</html>'), 'invalid_ai_response'),
    (httpx.Response(200, json={
        'choices': [{'finish_reason': 'error', 'error': {'code': 503}}],
    }), 'provider_unavailable'),
])
def test_openrouter_gestisce_risposta_non_json_ed_errore_nella_scelta(response, app_code):
    config, requests = configure_provider(lambda _: response)
    with pytest.raises(validation.ApiError) as error:
        llm.generate_review(config, CONTEXT)
    assert error.value.code == app_code
    assert [request.method for request in requests] == ['GET', 'POST']
