import pytest

from backend.app import create_app
from backend.db import get_db, init_db, transaction


def test_schema_idempotente_e_rollback(tmp_path):
    database = tmp_path / 'rebuild.sqlite3'
    app = create_app({'TESTING': True, 'DATABASE': database})
    assert database.exists()
    with app.app_context():
        connection = get_db()
        assert connection.execute('PRAGMA foreign_keys').fetchone()[0] == 1
        init_db()
        with pytest.raises(RuntimeError):
            with transaction(connection, write=True):
                connection.execute("INSERT INTO cv(title, created_at, updated_at) VALUES ('CV sintetico', 'ora', 'ora')")
                raise RuntimeError('Prova del rollback')
        assert connection.execute('SELECT COUNT(*) FROM cv').fetchone()[0] == 0
