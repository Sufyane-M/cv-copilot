import re


MAX_TITLE = 100
MAX_MESSAGE = 1000
MAX_JOB_POSTING = 4000
MAX_SECTIONS = 16
MAX_SECTION_TITLE = 100
MAX_SECTION_TEXT = 2000
MAX_SECTION_SUBTITLE = 120
MAX_SECTION_PERIOD = 48
MAX_VERSION_NUMBER = 2**63 - 1
SECTION_TYPES = {'summary', 'experience', 'education', 'skills', 'projects', 'other'}
SECTION_ID = re.compile(r'[a-zA-Z0-9_-]{1,64}')
INVALID_CHARACTER = re.compile(r'[\x00\ud800-\udfff]')


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def fields(value, required: set, optional: set = frozenset()) -> dict:
    if not isinstance(value, dict) or required - value.keys() or value.keys() - required - optional:
        raise ApiError('invalid_input', 'I campi inviati non corrispondono al formato richiesto.')
    return value


def string(value, label: str, limit: int, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ApiError('invalid_input', f'{label} deve essere testo.')
    if len(value) > limit:
        raise ApiError('invalid_input', f'{label} può contenere al massimo {limit} caratteri.')
    if INVALID_CHARACTER.search(value):
        raise ApiError('invalid_input', f'{label} contiene caratteri non validi.')
    if not allow_empty and not value.strip():
        raise ApiError('invalid_input', f'{label} è obbligatorio.')
    return value


def cv_title(value) -> str:
    return string(value, 'Il titolo del CV', MAX_TITLE).strip()


def section_id(value) -> str:
    if not isinstance(value, str) or SECTION_ID.fullmatch(value) is None:
        raise ApiError('invalid_input', 'Identificativo della sezione non valido.')
    return value


def version_number(value) -> int:
    if type(value) is not int or not 1 <= value <= MAX_VERSION_NUMBER:
        raise ApiError('invalid_input', 'La versione attesa deve essere un intero positivo valido.')
    return value


def content(value) -> dict:
    fields(value, {'sections'}, {'document_title'})
    sections = value['sections']
    if not isinstance(sections, list) or len(sections) > MAX_SECTIONS:
        raise ApiError('invalid_input', f'Il CV può contenere al massimo {MAX_SECTIONS} sezioni.')

    normalized = []
    seen_ids = set()
    for section in sections:
        fields(section, {'id', 'type', 'title', 'text'}, {'subtitle', 'period'})
        identifier = section_id(section['id'])
        if identifier in seen_ids:
            raise ApiError('invalid_input', 'Gli identificativi delle sezioni devono essere univoci.')
        seen_ids.add(identifier)
        section_type = section['type']
        if not isinstance(section_type, str) or section_type not in SECTION_TYPES:
            raise ApiError('invalid_input', 'Tipo di sezione non valido.')
        item = {
            'id': identifier,
            'type': section_type,
            'title': string(section['title'], 'Il titolo della sezione', MAX_SECTION_TITLE).strip(),
            'text': string(section['text'], 'Il testo della sezione', MAX_SECTION_TEXT, allow_empty=True),
        }
        if 'subtitle' in section:
            item['subtitle'] = string(section['subtitle'], 'Il sottotitolo della sezione', MAX_SECTION_SUBTITLE, allow_empty=True).strip()
        if 'period' in section:
            item['period'] = string(section['period'], 'Il periodo della sezione', MAX_SECTION_PERIOD, allow_empty=True).strip()
        normalized.append(item)
    result = {'sections': normalized}
    if 'document_title' in value:
        result['document_title'] = string(value['document_title'], 'Il titolo del documento', MAX_TITLE).strip()
    return result
