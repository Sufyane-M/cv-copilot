import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier

import httpx
import pytest

from backend import db, llm
from backend.app import create_app
from backend.validation import ApiError, MAX_SECTION_TEXT


@pytest.fixture
def app(tmp_path):
    return create_app({"TESTING": True, "DATABASE": tmp_path / "test.sqlite3", "LLM_MODE": "mock"})


@pytest.fixture
def client(app):
    return app.test_client()


def create_cv(client, *, from_example=False):
    response = client.post("/api/cvs", json={"title": "CV studente", "from_example": from_example})
    assert response.status_code == 201
    return response.json


def content_with(text):
    return {"sections": [
        {"id": "profile", "type": "summary", "title": "Profilo", "text": text},
        {"id": "skills", "type": "skills", "title": "Competenze", "text": "Python e SQLite"},
    ]}


def save_content(client, url, version, text):
    return client.put(f"{url}/content", json={"expected_version": version, "content": content_with(text)})


@pytest.fixture
def saved_cv(client):
    cv = create_cv(client)
    url = f"/api/cvs/{cv['id']}"
    response = save_content(client, url, 1, "Studio informatica")
    assert response.status_code == 200
    assert response.json["version_number"] == 2
    return url


def request_review(client, url, *, section_id="profile", version=2, model_id=None):
    payload = {
        "message": "Rendi il testo più chiaro.",
        "section_id": section_id,
        "expected_version": version,
        "job_posting": "Stage di sviluppo web",
    }
    if model_id is not None:
        payload["model_id"] = model_id
    return client.post(f"{url}/chat", json=payload)


def create_proposal(client, url):
    response = request_review(client, url)
    assert response.status_code == 201
    return response.json["proposals"][-1]


def error_code(response):
    return response.json["error"]["code"]


def test_crud_persiste_dopo_riavvio_e_cancella_collegamenti(app, client):
    assert client.get("/api/cvs").json == []
    blank = create_cv(client)
    assert blank["version_number"] == 1
    assert blank["content"] == {"sections": []}

    example = create_cv(client, from_example=True)
    assert len(example["content"]["sections"]) >= 4
    duplicate = client.post("/api/cvs", json={"title": example["title"], "from_example": True})
    assert duplicate.status_code == 200
    assert duplicate.json["id"] == example["id"]
    url = f"/api/cvs/{blank['id']}"
    assert save_content(client, url, 1, "Studio informatica").status_code == 200
    create_proposal(client, url)
    renamed = client.patch(url, json={"title": "CV tirocinio"})
    assert renamed.status_code == 200
    assert renamed.json["version_number"] == 2
    assert len(client.get("/api/cvs").json) == 2

    resumed = create_app({"TESTING": True, "DATABASE": app.config["DATABASE"], "LLM_MODE": "mock"}).test_client()
    assert resumed.get(url).json["title"] == "CV tirocinio"
    assert resumed.get(f"{url}/chat").json["proposals"][0]["status"] == "pending"
    assert resumed.delete(url).status_code == 204
    assert resumed.get(url).status_code == 404
    assert [cv["id"] for cv in resumed.get("/api/cvs").json] == [example["id"]]
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        for table in ("cv_version", "message", "proposal"):
            count = connection.execute(f"SELECT COUNT(*) FROM {table} WHERE cv_id = ?", (blank["id"],)).fetchone()[0]
            assert count == 0


def test_salvataggio_invariato_e_snapshot_storico(client, saved_cv):
    no_change = save_content(client, saved_cv, 2, "Studio informatica")
    assert no_change.status_code == 200
    assert no_change.json["version_number"] == 2

    saved = save_content(client, saved_cv, 2, "Frequento il corso di informatica")
    assert saved.status_code == 200
    assert saved.json["version_number"] == 3
    assert saved.json["content"] == content_with("Frequento il corso di informatica")
    previous = client.get(f"{saved_cv}/versions/2").json
    assert previous["origin"] == "manual"
    assert previous["content"] == content_with("Studio informatica")
    assert client.get(f"{saved_cv}/versions/1").json["origin"] == "creation"


def test_conflitto_salvataggio_e_ripristino_da_versione_superata(client, saved_cv):
    stale_save = save_content(client, saved_cv, 1, "Testo concorrente")
    stale_restore = client.post(f"{saved_cv}/versions/1/restore", json={"expected_version": 1})
    for response in (stale_save, stale_restore):
        assert response.status_code == 409
        assert error_code(response) == "version_conflict"
    assert client.get(saved_cv).json["content"] == content_with("Studio informatica")
    assert len(client.get(f"{saved_cv}/versions").json) == 2


def test_ripristino_crea_snapshot_con_provenienza(client, saved_cv):
    restored = client.post(f"{saved_cv}/versions/1/restore", json={"expected_version": 2})
    assert restored.status_code == 200
    assert restored.json["version_number"] == 3
    assert restored.json["content"] == {"sections": []}
    snapshot = client.get(f"{saved_cv}/versions/3").json
    assert snapshot["origin"] == "restore"
    assert snapshot["restored_from_number"] == 1
    assert client.get(f"{saved_cv}/versions/2").json["content"] == content_with("Studio informatica")


def test_accettazione_cambia_solo_sezione_e_rifiuto_non_crea_versioni(client, saved_cv):
    rejected = create_proposal(client, saved_cv)
    accepted = create_proposal(client, saved_cv)
    assert accepted["old_text"] == "Studio informatica"
    assert accepted["new_text"] == "Studio informatica."
    assert client.get(saved_cv).json["version_number"] == 2

    reject_url = f"{saved_cv}/proposals/{rejected['id']}/reject"
    assert client.post(reject_url).json == {"status": "rejected", "version_number": 2}
    accept_url = f"{saved_cv}/proposals/{accepted['id']}/accept"
    assert client.post(accept_url).json == {"status": "accepted", "version_number": 3}
    current = client.get(saved_cv).json
    assert current["content"] == content_with("Studio informatica.")
    assert client.get(f"{saved_cv}/versions/3").json["origin"] == "ai"
    chat = client.get(f"{saved_cv}/chat").json
    proposals = {proposal["id"]: proposal for proposal in chat["proposals"]}
    assert proposals[rejected["id"]]["status"] == "rejected"
    assert proposals[rejected["id"]]["applied_version_number"] is None
    assert proposals[accepted["id"]]["status"] == "accepted"
    assert proposals[accepted["id"]]["applied_version_number"] == 3
    assert any(message.get("job_posting") == "Stage di sviluppo web" for message in chat["messages"])

    repeated = client.post(accept_url)
    assert repeated.status_code == 409
    assert error_code(repeated) == "proposal_already_resolved"
    assert len(client.get(f"{saved_cv}/versions").json) == 3


def test_richiesta_con_sezione_inesistente_si_ferma_prima_del_provider(client, saved_cv, monkeypatch):
    def unexpected_call(_config, _context):
        pytest.fail("Il provider non deve ricevere una sezione inesistente")

    monkeypatch.setattr(llm, "generate_review", unexpected_call)
    response = request_review(client, saved_cv, section_id="missing")
    assert response.status_code == 404
    assert error_code(response) == "section_not_found"
    assert client.get(f"{saved_cv}/chat").json["proposals"] == []


@pytest.mark.parametrize("section_id,new_text", [
    ("skills", "Nuova formulazione"),
    ("profile", "   "),
    ("profile", "a" * (MAX_SECTION_TEXT + 1)),
])
def test_output_provider_non_autorizzato_o_invalido(client, saved_cv, monkeypatch, section_id, new_text):
    monkeypatch.setattr(llm, "generate_review", lambda _config, _context: {
        "text": "Risposta simulata",
        "proposal": {"section_id": section_id, "new_text": new_text, "reason": "Riformulazione"},
    })
    response = request_review(client, saved_cv)
    assert response.status_code == 502
    assert error_code(response) == "invalid_ai_response"
    assert client.get(saved_cv).json["version_number"] == 2
    assert client.get(f"{saved_cv}/chat").json["proposals"] == []


def test_proposta_obsoleta_con_modifica_durante_la_chiamata(app, client, saved_cv, monkeypatch):
    simulate = llm.generate_review

    def provider(config, context):
        assert context["base_version_number"] == 2
        assert context["section"]["text"] == "Studio informatica"
        with ThreadPoolExecutor(max_workers=1) as pool:
            # La seconda richiesta deve poter scrivere senza attendere il provider.
            updated = pool.submit(save_content, app.test_client(), saved_cv, 2, "Testo concorrente").result(timeout=8)
        assert updated.status_code == 200
        return simulate(config, context)

    monkeypatch.setattr(llm, "generate_review", provider)
    proposal = create_proposal(client, saved_cv)
    assert proposal["base_version_number"] == 2
    assert proposal["obsolete"] is True
    assert proposal["status"] == "pending"
    response = client.post(f"{saved_cv}/proposals/{proposal['id']}/accept")
    assert response.status_code == 409
    assert error_code(response) == "proposal_obsolete"
    assert client.get(saved_cv).json["content"] == content_with("Testo concorrente")
    assert len(client.get(f"{saved_cv}/versions").json) == 3


def test_doppia_accettazione_concorrente_crea_una_sola_versione(app, client, saved_cv):
    proposal = create_proposal(client, saved_cv)
    gate = Barrier(2, timeout=5)

    def accept():
        with app.test_client() as concurrent_client:
            gate.wait()
            return concurrent_client.post(f"{saved_cv}/proposals/{proposal['id']}/accept")

    with ThreadPoolExecutor(max_workers=2) as pool:
        requests = [pool.submit(accept) for _ in range(2)]
        responses = sorted((future.result(timeout=10) for future in requests), key=lambda result: result.status_code)

    assert [response.status_code for response in responses] == [200, 409]
    assert error_code(responses[1]) == "proposal_already_resolved"
    assert client.get(saved_cv).json["version_number"] == 3
    assert len(client.get(f"{saved_cv}/versions").json) == 3


def test_eliminazione_durante_revisione_non_crea_orfani(app, client, saved_cv, monkeypatch):
    simulate = llm.generate_review

    def provider(config, context):
        with ThreadPoolExecutor(max_workers=1) as pool:
            removed = pool.submit(app.test_client().delete, saved_cv).result(timeout=8)
        assert removed.status_code == 204
        return simulate(config, context)

    monkeypatch.setattr(llm, "generate_review", provider)
    response = request_review(client, saved_cv)
    assert response.status_code == 404
    assert error_code(response) == "cv_not_found"
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        assert connection.execute("SELECT COUNT(*) FROM message").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM proposal").fetchone()[0] == 0


def test_database_occupato_restituisce_errore_recuperabile(app, client, saved_cv):
    with closing(sqlite3.connect(app.config["DATABASE"], autocommit=True)) as connection:
        connection.execute("BEGIN IMMEDIATE")
        response = save_content(client, saved_cv, 2, "Testo concorrente")
        connection.execute("ROLLBACK")

    assert response.status_code == 503
    assert error_code(response) == "database_busy"
    assert client.get(saved_cv).json["version_number"] == 2
    assert save_content(client, saved_cv, 2, "Testo concorrente").status_code == 200


def test_rollback_se_aggiornamento_proposta_fallisce(app, client, saved_cv):
    proposal = create_proposal(client, saved_cv)
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        # SQLite fa fallire l'ultimo aggiornamento dopo l'inserimento dello snapshot.
        connection.executescript("""
            CREATE TRIGGER fail_proposal_update BEFORE UPDATE OF status ON proposal
            WHEN NEW.status = 'accepted'
            BEGIN SELECT RAISE(ABORT, 'errore simulato'); END;
        """)

    response = client.post(f"{saved_cv}/proposals/{proposal['id']}/accept")
    assert response.status_code == 500
    assert response.is_json
    assert "errore simulato" not in response.get_data(as_text=True)
    assert client.get(saved_cv).json["version_number"] == 2
    assert len(client.get(f"{saved_cv}/versions").json) == 2
    chat = client.get(f"{saved_cv}/chat").json
    assert chat["proposals"][0]["status"] == "pending"
    assert chat["proposals"][0]["applied_version_number"] is None


def test_errore_provider_non_modifica_documento(client, saved_cv, monkeypatch):
    def unavailable(_config, _context):
        raise ApiError("provider_timeout", "Tempo della richiesta scaduto.", 504)

    before = client.get(saved_cv).json
    monkeypatch.setattr(llm, "generate_review", unavailable)
    response = request_review(client, saved_cv)
    assert response.status_code == 504
    assert error_code(response) == "provider_timeout"
    assert client.get(saved_cv).json == before
    assert client.get(f"{saved_cv}/chat").json["proposals"] == []

def test_catalogo_e_attribuzione_openrouter_persistono(app, saved_cv):
    model_id = "test/modello"
    actual_id = "test/modello-versionato"
    sent = []

    def upstream(request):
        if request.method == "GET":
            return httpx.Response(200, json={"data": [{
                "id": model_id, "name": "Modello di prova",
                "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]},
                "supported_parameters": ["tools"],
            }]})
        sent.append(json.loads(request.content)["model"])
        return httpx.Response(200, json={"model": actual_id, "choices": [{
            "finish_reason": "stop", "message": {"role": "assistant", "content": "Quale esperienza vuoi descrivere?"},
        }]})

    settings = {
        "TESTING": True, "DATABASE": app.config["DATABASE"], "LLM_MODE": "openrouter",
        "OPENROUTER_API_KEY": "placeholder-di-test", "OPENROUTER_DEFAULT_MODEL": model_id,
        "OPENROUTER_TRANSPORT": httpx.MockTransport(upstream),
    }
    client = create_app(settings).test_client()
    config = client.get("/api/config").json
    assert set(config) == {"llm_mode", "llm_configured", "limits"}
    assert config["llm_configured"] is True
    assert client.get("/api/models").json == {
        "models": [{"id": model_id, "name": "Modello di prova"}], "default_model_id": model_id,
    }

    response = request_review(client, saved_cv, model_id="test/non-consentito")
    assert response.status_code == 400 and error_code(response) == "model_unavailable"
    assert sent == []
    assert client.get(f"{saved_cv}/chat").json["messages"] == []
    assert request_review(client, saved_cv, model_id=model_id).status_code == 201
    assert sent == [model_id]
    assert client.get(saved_cv).json["version_number"] == 2

    restarted = create_app(settings).test_client()
    user, assistant = restarted.get(f"{saved_cv}/chat").json["messages"]
    assert user["llm_mode"] is None and user["requested_model_id"] is None
    assert assistant["llm_mode"] == "openrouter"
    assert assistant["requested_model_id"] == model_id
    assert assistant["actual_model_id"] == actual_id


def test_migrazione_attribuzione_conserva_storico_e_supporta_demo(tmp_path):
    database = tmp_path / "precedente.sqlite3"
    old_schema = "\n".join(
        line for line in db.SCHEMA_PATH.read_text(encoding="utf-8").splitlines()
        if not line.strip().startswith(tuple(f"{column} " for column in db.MESSAGE_MODEL_COLUMNS))
    )
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.executescript(old_schema)
        connection.execute("INSERT INTO cv VALUES (1, 'CV conservato', '2026-01-01', '2026-01-01')")
        connection.execute("""INSERT INTO cv_version (cv_id, number, content_json, origin, created_at)
                            VALUES (1, 1, ?, 'creation', '2026-01-01')""", (json.dumps(content_with("Studio informatica")),))
        connection.execute("""INSERT INTO message (cv_id, role, text, created_at, base_version_number, section_id)
                            VALUES (1, 'assistant', 'Messaggio precedente', '2026-01-01', 1, 'profile')""")

    settings = {"TESTING": True, "DATABASE": database, "LLM_MODE": "mock"}
    client = create_app(settings).test_client()
    assert client.get("/api/models").json == {"models": [], "default_model_id": None}
    assert request_review(client, "/api/cvs/1", version=1).status_code == 201
    restarted = create_app(settings).test_client()
    previous, _, last = restarted.get("/api/cvs/1/chat").json["messages"]
    assert previous["text"] == "Messaggio precedente"
    assert all(previous[field] is None for field in db.MESSAGE_MODEL_COLUMNS)
    assert last["llm_mode"] == "mock"
    assert last["requested_model_id"] is None and last["actual_model_id"] is None
    assert restarted.get("/api/cvs/1").json["version_number"] == 1

def test_openrouter_senza_chiave_lascia_accessibili_cv_e_pdf(app, saved_cv):
    def unexpected(_request):
        pytest.fail("L’app non deve contattare OpenRouter senza chiave")

    client = create_app({
        "TESTING": True, "DATABASE": app.config["DATABASE"], "LLM_MODE": "openrouter",
        "OPENROUTER_API_KEY": "", "OPENROUTER_TRANSPORT": httpx.MockTransport(unexpected),
    }).test_client()
    assert client.get("/api/config").json["llm_configured"] is False
    assert error_code(client.get("/api/models")) == "llm_not_configured"
    failed = request_review(client, saved_cv, model_id="test/modello")
    assert failed.status_code == 503 and error_code(failed) == "llm_not_configured"
    assert client.get(f"{saved_cv}/chat").json["messages"] == []
    assert client.get(saved_cv).status_code == 200
    assert client.get(f"{saved_cv}/pdf").data.startswith(b"%PDF-")
