from contextlib import contextmanager
from pathlib import Path
import sqlite3

import click
from flask import current_app, g
from flask.cli import with_appcontext


SCHEMA_PATH = Path(__file__).with_name('schema.sql')
MESSAGE_MODEL_COLUMNS = {
    'llm_mode': "TEXT CHECK (llm_mode IN ('mock', 'openrouter'))",
    'requested_model_id': 'TEXT',
    'actual_model_id': 'TEXT',
}


def get_db() -> sqlite3.Connection:
    if 'db' not in g:
        # I confini della transazione sono espliciti anche con Python 3.12+.
        g.db = sqlite3.connect(current_app.config['DATABASE'], timeout=2.0, autocommit=True)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


def close_db(_error=None) -> None:
    connection = g.pop('db', None)
    if connection is not None:
        connection.close()


@contextmanager
def transaction(connection: sqlite3.Connection, *, write: bool = False):
    # Una scrittura riserva il lock prima di leggere i dati da verificare.
    connection.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
    try:
        yield
        connection.execute('COMMIT')
    except BaseException:
        if connection.in_transaction:
            connection.execute('ROLLBACK')
        raise


def init_db() -> None:
    database_path = Path(current_app.config['DATABASE'])
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = get_db()
    connection.executescript(SCHEMA_PATH.read_text(encoding='utf-8'))
    with transaction(connection, write=True):
        existing = {row['name'] for row in connection.execute('PRAGMA table_info(message)')}
        # Le colonne nullable mantengono neutra l’attribuzione dei messaggi già salvati.
        for column, definition in MESSAGE_MODEL_COLUMNS.items():
            if column not in existing:
                connection.execute(f'ALTER TABLE message ADD COLUMN {column} {definition}')


@click.command('init-db')
@with_appcontext
def init_db_command() -> None:
    init_db()
    click.echo('Database SQLite inizializzato.')
