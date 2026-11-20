from datetime import datetime, timezone
import json
from pathlib import Path

from . import validation
from .db import get_db, transaction
from .validation import ApiError


EXAMPLE_PATH = Path(__file__).with_name('example_cv.json')


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
