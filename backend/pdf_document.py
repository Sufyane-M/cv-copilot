import json
import subprocess
from io import BytesIO
from pathlib import Path

from .validation import ApiError


RENDERER = Path(__file__).resolve().parents[1] / 'frontend' / 'render-pdf.mjs'


def render_cv_pdf(cv: dict) -> BytesIO:
    # Il processo riceve il solo snapshot da stampare. L'API e il database restano in Flask.
    document = {'title': cv['title'], 'content': cv['content']}
    try:
        result = subprocess.run(
            ['node', str(RENDERER)],
            input=json.dumps(document, ensure_ascii=False).encode('utf-8'),
            capture_output=True,
            timeout=40,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
    except FileNotFoundError:
        raise ApiError('pdf_runtime_unavailable', 'Installa Node.js per esportare il PDF.', 503) from None
    except subprocess.TimeoutExpired:
        raise ApiError('pdf_timeout', 'L’esportazione PDF ha richiesto troppo tempo. Riprova.', 504) from None
    if result.returncode != 0 or not result.stdout.startswith(b'%PDF-'):
        raise ApiError('pdf_runtime_unavailable', 'Verifica Playwright e Chromium seguendo le istruzioni di avvio.', 503)
    return BytesIO(result.stdout)
