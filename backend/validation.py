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
