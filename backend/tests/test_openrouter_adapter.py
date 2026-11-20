import json

import httpx
import pytest

from backend import llm
from backend.validation import ApiError, validate_review_result


def config(handler):
    return {
        'LLM_MODE': 'openrouter', 'OPENROUTER_API_KEY': 'fixture-token',
        'OPENROUTER_DEFAULT_MODEL': 'demo/model', 'LLM_TIMEOUT': 2,
        'LLM_MAX_TOKENS': 400, 'OPENROUTER_TRANSPORT': httpx.MockTransport(handler),
    }


def test_strumento_e_contesto_inviati_senza_rete():
    def answer(request):
        assert request.url.path == '/api/v1/chat/completions'
        data = json.loads(request.content)
        assert data['model'] == 'demo/model'
        assert data['tools'][0]['function']['name'] == 'propose_edit'
        assert data['provider']['allow_fallbacks'] is False
        return httpx.Response(200, json={
            'model': 'demo/model',
            'choices': [{'finish_reason': 'stop', 'message': {'role': 'assistant', 'content': 'Puoi indicare una responsabilità concreta?'}}],
        })

    reply = llm.generate_review(config(answer), {'section': {'id': 'demo', 'text': 'Studio informatica'}})
    assert validate_review_result(reply, 'demo')['proposal'] is None


def test_limite_provider_controllato_senza_fallback():
    with pytest.raises(ApiError) as failure:
        llm.generate_review(config(lambda _: httpx.Response(429)), {'section': {'id': 'demo', 'text': 'Testo sintetico'}})
    assert failure.value.status == 429
