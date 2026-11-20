from pathlib import Path
import sqlite3

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from . import cv_service, db, validation
from .validation import ApiError


ROOT = Path(__file__).resolve().parent


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_path=str(ROOT / 'instance'))
    app.config.from_mapping(
        DATABASE=str(Path(app.instance_path) / 'cv_copilot.sqlite3'),
        MAX_CONTENT_LENGTH=512 * 1024,
        TRUSTED_HOSTS=['localhost', '127.0.0.1', '[::1]'],
    )
    if test_config is not None:
        app.config.update(test_config)
    app.json.ensure_ascii = False
    app.teardown_appcontext(db.close_db)
    app.cli.add_command(db.init_db_command)
    register_routes(app)
    with app.app_context():
        db.init_db()
    return app


def body(required: set, optional: set = frozenset()) -> dict:
    if not request.is_json:
        raise ApiError('unsupported_media_type', 'Invia il corpo della richiesta come JSON.', 415)
    return validation.fields(request.get_json(), required, optional)


def register_routes(app: Flask) -> None:
    @app.get('/api/health')
    def health():
        return {'status': 'ok'}

    @app.before_request
    def check_browser_origin():
        origin = request.headers.get('Origin')
        if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} and origin and origin != request.host_url.rstrip('/'):
            raise ApiError('invalid_origin', 'Apri il progetto dall’indirizzo del server locale.', 403)


    @app.errorhandler(ApiError)
    def api_error(error):
        return {'error': {'code': error.code, 'message': error.message}}, error.status


    @app.errorhandler(HTTPException)
    def http_error(error):
        known = {
            400: ('invalid_input', 'Richiesta o JSON non valido.'),
            404: ('resource_not_found', 'Risorsa non trovata.'),
            405: ('method_not_allowed', 'Metodo non consentito per questa risorsa.'),
            413: ('payload_too_large', 'La richiesta è troppo grande.'),
        }
        code, message = known.get(error.code, ('http_error', 'La richiesta non è stata completata.'))
        response = error.get_response()
        if error.code == 500:
            code, message = 'internal_error', 'Si è verificato un errore interno. Riprova.'
        response.set_data(app.json.dumps({'error': {'code': code, 'message': message}}))
        response.mimetype = 'application/json'
        return response

    @app.errorhandler(sqlite3.Error)
    def database_error(error):
        if getattr(error, 'sqlite_errorcode', 0) & 0xFF in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED}:
            return {'error': {'code': 'database_busy', 'message': 'Il database è occupato. Riprova tra poco.'}}, 503, {'Retry-After': '2'}
        app.logger.error('Operazione SQLite non riuscita (%s).', getattr(error, 'sqlite_errorname', type(error).__name__))
        return {'error': {'code': 'internal_error', 'message': 'Non è stato possibile completare l’operazione.'}}, 500

    @app.url_value_preprocessor
    def check_path_ids(_endpoint, values):
        if values and any(not 1 <= value <= validation.MAX_VERSION_NUMBER for value in values.values()):
            raise ApiError('resource_not_found', 'Risorsa non trovata.', 404)


    @app.get('/api/cvs')
    def list_cvs():
        return jsonify(cv_service.list_cvs())


    @app.post('/api/cvs')
    def create_cv():
        payload = body({'title'}, {'from_example'})
        from_example = payload.get('from_example', False)
        if type(from_example) is not bool:
            raise ApiError('invalid_input', 'from_example deve essere un booleano.')
        cv, created = cv_service.create_cv(validation.cv_title(payload['title']), from_example)
        return cv, 201 if created else 200


    @app.get('/api/cvs/<int:cv_id>')
    def read_cv(cv_id):
        return cv_service.get_cv(cv_id)


    @app.patch('/api/cvs/<int:cv_id>')
    def rename_cv(cv_id):
        payload = body({'title'})
        return cv_service.rename_cv(cv_id, validation.cv_title(payload['title']))


    @app.delete('/api/cvs/<int:cv_id>')
    def delete_cv(cv_id):
        cv_service.delete_cv(cv_id)
        return '', 204

    @app.put('/api/cvs/<int:cv_id>/content')
    def save_content(cv_id):
        payload = body({'expected_version', 'content'})
        return cv_service.save_content(cv_id, validation.version_number(payload['expected_version']), validation.content(payload['content']))

    @app.get('/api/cvs/<int:cv_id>/versions')
    def list_versions(cv_id):
        return jsonify(cv_service.list_versions(cv_id))

    @app.get('/api/cvs/<int:cv_id>/versions/<int:number>')
    def read_version(cv_id, number):
        return cv_service.find_version(cv_id, number)

    @app.post('/api/cvs/<int:cv_id>/versions/<int:number>/restore')
    def restore_version(cv_id, number):
        payload = body({'expected_version'})
        return cv_service.restore_version(cv_id, number, validation.version_number(payload['expected_version']))

    @app.get('/api/config')
    def get_config():
        return {'llm_mode': 'mock', 'llm_configured': True, 'limits': {
            'title': validation.MAX_TITLE,
            'sections': validation.MAX_SECTIONS,
            'section_title': validation.MAX_SECTION_TITLE,
            'section_text': validation.MAX_SECTION_TEXT,
            'message': validation.MAX_MESSAGE,
            'job_posting': validation.MAX_JOB_POSTING,
            'section_subtitle': validation.MAX_SECTION_SUBTITLE,
            'section_period': validation.MAX_SECTION_PERIOD,
        }}

    @app.get('/api/cvs/<int:cv_id>/chat')
    def read_chat(cv_id):
        return cv_service.get_chat(cv_id)

    @app.post('/api/cvs/<int:cv_id>/chat')
    def request_review(cv_id):
        payload = body({'message', 'section_id', 'expected_version'}, {'job_posting'})
        posting = payload.get('job_posting')
        if posting is not None:
            posting = validation.string(posting, 'L’annuncio', validation.MAX_JOB_POSTING, allow_empty=True).strip() or None
        revision = {
            'message': validation.string(payload['message'], 'Il messaggio', validation.MAX_MESSAGE).strip(),
            'section_id': validation.section_id(payload['section_id']),
            'expected_version': validation.version_number(payload['expected_version']),
            'job_posting': posting,
        }
        return cv_service.request_review(cv_id, revision, app.config), 201
