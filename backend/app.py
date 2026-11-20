from pathlib import Path

from flask import Flask, request
from werkzeug.exceptions import HTTPException

from .validation import ApiError


ROOT = Path(__file__).resolve().parent


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_path=str(ROOT / 'instance'))
    app.config.from_mapping(
        MAX_CONTENT_LENGTH=512 * 1024,
        TRUSTED_HOSTS=['localhost', '127.0.0.1', '[::1]'],
    )
    if test_config is not None:
        app.config.update(test_config)
    app.json.ensure_ascii = False
    register_routes(app)
    return app


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
