from datetime import datetime, timezone
import json
from pathlib import Path

from . import llm, validation
from .db import get_db, transaction
from .validation import ApiError


EXAMPLE_PATH = Path(__file__).with_name('example_cv.json')
HISTORY_LIMIT = 8


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def encode_content(content: dict) -> str:
    return json.dumps(content, ensure_ascii=False, separators=(',', ':'))


def list_cvs() -> list:
    rows = get_db().execute('''
        SELECT cv.*, (SELECT MAX(number) FROM cv_version WHERE cv_id = cv.id) AS version_number
        FROM cv ORDER BY updated_at DESC, id DESC
    ''')
    return [dict(row) for row in rows]


def get_cv(cv_id: int) -> dict:
    row = get_db().execute('''
        SELECT cv.*, cv_version.number AS version_number, cv_version.content_json
        FROM cv JOIN cv_version ON cv_version.cv_id = cv.id
        WHERE cv.id = ? ORDER BY cv_version.number DESC LIMIT 1
    ''', (cv_id,)).fetchone()
    if row is None:
        raise ApiError('cv_not_found', 'Questo CV non esiste più.', 404)
    cv = dict(row)
    cv['content'] = json.loads(cv.pop('content_json'))
    return cv


def insert_version(cv_id: int, number: int, content: dict, origin: str, restored_from: int | None = None) -> None:
    connection = get_db()
    now = timestamp()
    connection.execute('''
        INSERT INTO cv_version (cv_id, number, content_json, origin, created_at, restored_from_number)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (cv_id, number, encode_content(content), origin, now, restored_from))
    connection.execute('UPDATE cv SET updated_at = ? WHERE id = ?', (now, cv_id))


def create_cv(title: str, from_example: bool) -> tuple[dict, bool]:
    content = {'sections': []}
    if from_example:
        content = validation.content(json.loads(EXAMPLE_PATH.read_text(encoding='utf-8')))

    connection = get_db()
    with transaction(connection, write=True):
        if from_example:
            existing = connection.execute('''
                SELECT cv.id FROM cv JOIN cv_version ON cv_version.cv_id = cv.id
                WHERE cv.title = ? AND cv_version.number = 1 AND cv_version.content_json = ?
                ORDER BY cv.id LIMIT 1
            ''', (title, encode_content(content))).fetchone()
            if existing is not None:
                return get_cv(existing['id']), False

        now = timestamp()
        cursor = connection.execute('INSERT INTO cv (title, created_at, updated_at) VALUES (?, ?, ?)', (title, now, now))
        insert_version(cursor.lastrowid, 1, content, 'creation')
        return get_cv(cursor.lastrowid), True


def rename_cv(cv_id: int, title: str) -> dict:
    connection = get_db()
    with transaction(connection, write=True):
        cv = get_cv(cv_id)
        if cv['title'] != title:
            connection.execute('UPDATE cv SET title = ?, updated_at = ? WHERE id = ?', (title, timestamp(), cv_id))
        return get_cv(cv_id)


def delete_cv(cv_id: int) -> None:
    cursor = get_db().execute('DELETE FROM cv WHERE id = ?', (cv_id,))
    if cursor.rowcount == 0:
        raise ApiError('cv_not_found', 'Questo CV non esiste più.', 404)


def require_expected_version(cv: dict, expected_version: int) -> None:
    # La bozza potrebbe essere stata aperta prima di una modifica in un'altra scheda.
    if cv['version_number'] != expected_version:
        raise ApiError('version_conflict', 'Il CV è cambiato. Ricarica la versione corrente e riprova.', 409)


def save_content(cv_id: int, expected_version: int, content: dict) -> dict:
    with transaction(get_db(), write=True):
        cv = get_cv(cv_id)
        require_expected_version(cv, expected_version)
        if cv['content'] == content:
            return cv
        insert_version(cv_id, expected_version + 1, content, 'manual')
        return get_cv(cv_id)


def list_versions(cv_id: int) -> list:
    connection = get_db()
    with transaction(connection):
        get_cv(cv_id)
        rows = connection.execute('''
            SELECT number, origin, created_at, restored_from_number
            FROM cv_version WHERE cv_id = ? ORDER BY number DESC
        ''', (cv_id,))
        return [dict(row) for row in rows]


def find_version(cv_id: int, number: int) -> dict:
    row = get_db().execute('''
        SELECT number, origin, created_at, restored_from_number, content_json
        FROM cv_version WHERE cv_id = ? AND number = ?
    ''', (cv_id, number)).fetchone()
    if row is None:
        raise ApiError('version_not_found', 'Questa versione del CV non esiste.', 404)
    version = dict(row)
    version['content'] = json.loads(version.pop('content_json'))
    return version


def restore_version(cv_id: int, number: int, expected_version: int) -> dict:
    with transaction(get_db(), write=True):
        cv = get_cv(cv_id)
        require_expected_version(cv, expected_version)
        version = find_version(cv_id, number)
        if number == expected_version:
            raise ApiError('invalid_restore', 'Scegli una versione precedente da ripristinare.')
        insert_version(cv_id, expected_version + 1, version['content'], 'restore', number)
        return get_cv(cv_id)


def find_section(content: dict, section_id: str) -> dict | None:
    return next((section for section in content['sections'] if section['id'] == section_id), None)


def get_chat(cv_id: int) -> dict:
    connection = get_db()
    with transaction(connection):
        cv = get_cv(cv_id)
        messages = [dict(row) for row in connection.execute('SELECT * FROM message WHERE cv_id = ? ORDER BY id', (cv_id,))]
        proposals = [dict(row) for row in connection.execute('SELECT * FROM proposal WHERE cv_id = ? ORDER BY id', (cv_id,))]
        contents = {cv['version_number']: cv['content']}
        for message in messages:
            base = message['base_version_number']
            if base not in contents:
                contents[base] = find_version(cv_id, base)['content']
            section = find_section(contents[base], message['section_id'])
            message['section_title'] = section['title']
        for proposal in proposals:
            base = proposal['base_version_number']
            section = find_section(contents[base], proposal['section_id'])
            proposal['section_title'] = section['title']
            proposal['old_text'] = section['text']
            proposal['obsolete'] = proposal['status'] == 'pending' and base != cv['version_number']
        return {'messages': messages, 'proposals': proposals, 'version_number': cv['version_number']}


def recent_history(cv_id: int, current_version: int) -> list:
    rows = get_db().execute('''
        SELECT m.role, m.text, m.base_version_number, m.section_id, m.job_posting,
               p.status, p.new_text, p.reason
        FROM message AS m LEFT JOIN proposal AS p ON p.message_id = m.id
        WHERE m.cv_id = ? ORDER BY m.id DESC LIMIT ?
    ''', (cv_id, HISTORY_LIMIT)).fetchall()
    history = []
    for row in reversed(rows):
        message = dict(row)
        if message['status'] == 'pending' and message['base_version_number'] != current_version:
            message['status'] = 'obsolete'
        history.append(message)
    return history


def request_review(cv_id: int, revision: dict, config: dict) -> dict:
    connection = get_db()
    base = revision['expected_version']
    section_id = revision['section_id']
    mode = config['LLM_MODE']
    requested_model_id = revision['model_id'] if mode == 'openrouter' else None
    with transaction(connection):
        cv = get_cv(cv_id)
        require_expected_version(cv, base)
        section = find_section(cv['content'], section_id)
        if section is None:
            raise ApiError('section_not_found', 'Seleziona una sezione presente nel CV corrente.', 404)
        content = cv['content']
        context = {
            'base_version_number': base,
            # Contatti, ritratto e design servono alla stampa, non alla revisione del testo.
            'content': {field: content[field] for field in ('sections', 'document_title') if field in content},
            'section': section,
            'message': revision['message'],
            'job_posting': revision['job_posting'],
            'history': recent_history(cv_id, base),
        }

    if mode == 'openrouter':
        context['model_id'] = requested_model_id
    # La chiamata esterna avviene fuori dalla transazione. Restituisce solo una proposta.
    result = validation.validate_review_result(llm.generate_review(config, context), section_id)
    with transaction(connection, write=True):
        get_cv(cv_id)
        now = timestamp()
        connection.execute('''
            INSERT INTO message (cv_id, role, text, created_at, base_version_number, section_id, job_posting)
            VALUES (?, 'user', ?, ?, ?, ?, ?)
        ''', (cv_id, revision['message'], now, base, section_id, revision['job_posting']))
        assistant = connection.execute('''
            INSERT INTO message (cv_id, role, text, created_at, base_version_number, section_id,
                                 llm_mode, requested_model_id, actual_model_id)
            VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)
        ''', (cv_id, result['text'], now, base, section_id, mode, requested_model_id, result['actual_model_id']))
        proposal = result['proposal']
        if proposal is not None:
            connection.execute('''
                INSERT INTO proposal (cv_id, message_id, base_version_number, section_id, new_text, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (cv_id, assistant.lastrowid, base, section_id, proposal['new_text'], proposal['reason'], now))
    return get_chat(cv_id)


def resolve_proposal(cv_id: int, proposal_id: int, accept: bool) -> dict:
    connection = get_db()
    with transaction(connection, write=True):
        proposal = connection.execute('''
            SELECT p.*, m.section_id AS authorized_section_id, m.role AS message_role
            FROM proposal AS p JOIN message AS m ON m.id = p.message_id AND m.cv_id = p.cv_id
            WHERE p.id = ?
        ''', (proposal_id,)).fetchone()
        if proposal is None or proposal['cv_id'] != cv_id:
            raise ApiError('proposal_not_found', 'La proposta non appartiene a questo CV.', 404)
        if proposal['status'] != 'pending':
            raise ApiError('proposal_already_resolved', 'La proposta è già stata risolta. Aggiorna la revisione.', 409)

        cv = get_cv(proposal['cv_id'])
        version = cv['version_number']
        applied_version = None
        status = 'rejected'
        if accept:
            if proposal['base_version_number'] != version:
                raise ApiError('proposal_obsolete', 'La proposta è obsoleta. Richiedine una sulla versione corrente.', 409)
            section = find_section(cv['content'], proposal['section_id'])
            if section is None or proposal['section_id'] != proposal['authorized_section_id'] or proposal['message_role'] != 'assistant':
                raise ApiError('invalid_proposal_section', 'La sezione della proposta non è autorizzata.', 409)

            section['text'] = validation.proposal_text(proposal['new_text'])
            applied_version = version + 1
            insert_version(cv_id, applied_version, cv['content'], 'ai')
            status = 'accepted'

        connection.execute('''
            UPDATE proposal SET status = ?, resolved_at = ?, applied_version_number = ? WHERE id = ?
        ''', (status, timestamp(), applied_version, proposal_id))
        return {'status': status, 'version_number': applied_version or version}
