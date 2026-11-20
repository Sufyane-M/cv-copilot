from io import BytesIO
import re

import pytest
from pypdf import PdfReader

from backend.app import create_app


def rendered_pages(response):
    # Confronta testo e disegno di pagina, indipendenti dalla data di generazione del PDF.
    pages = PdfReader(BytesIO(response.data)).pages
    return [(page.extract_text(), page.get_contents().get_data()) for page in pages]


def has_embedded_image(page):
    resources = page['/Resources']
    return '/XObject' in resources and any(
        ref.get_object().get('/Subtype') == '/Image' for ref in resources['/XObject'].values()
    )


def test_pdf_follows_saved_cv_without_rendering_pending_proposals(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'pdf.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    created = client.post('/api/cvs', json={'title': 'CV attività & qualità', 'from_example': True}).json
    cv_id = created['id']
    base = f'/api/cvs/{cv_id}'

    original = client.get(f'{base}/pdf')
    assert original.status_code == 200
    assert original.mimetype == 'application/pdf'
    assert original.headers['Content-Disposition'] == f'inline; filename=cv-{cv_id}.pdf'
    assert original.cache_control.no_store
    assert original.headers['X-CV-Version'] == '1'
    assert original.data.startswith(b'%PDF-') and original.data.endswith(b'%%EOF\n')
    original_pages = rendered_pages(original)

    review = client.post(f'{base}/chat', json={
        'message': 'Rendi più leggibile il profilo.', 'section_id': 'profile', 'expected_version': 1,
    })
    assert review.status_code == 201
    proposal_id = review.json['proposals'][0]['id']
    assert rendered_pages(client.get(f'{base}/pdf')) == original_pages

    assert client.post(f'{base}/proposals/{proposal_id}/accept').status_code == 200
    accepted = client.get(f'{base}/pdf')
    assert accepted.headers['X-CV-Version'] == '2'
    accepted_pages = rendered_pages(accepted)
    assert accepted_pages != original_pages

    changed = client.put(f'{base}/content', json={
        'expected_version': 2,
        'content': {'sections': [{'id': 'profile', 'type': 'summary', 'title': 'Profilo', 'text': 'Modifica manuale.'}]},
    })
    assert changed.status_code == 200
    assert rendered_pages(client.get(f'{base}/pdf')) != accepted_pages

    assert client.post(f'{base}/versions/1/restore', json={'expected_version': 3}).status_code == 200
    restored = client.get(f'{base}/pdf')
    assert restored.headers['X-CV-Version'] == '4'
    assert rendered_pages(restored) == original_pages

    assert client.patch(base, json={'title': 'CV rinominato'}).status_code == 200
    renamed = client.get(f'{base}/pdf')
    assert renamed.headers['X-CV-Version'] == '4'
    assert rendered_pages(renamed) != original_pages


def test_pdf_endpoint_preserves_missing_cv_error(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'pdf.sqlite3', 'LLM_MODE': 'mock'})
    response = app.test_client().get('/api/cvs/1/pdf')
    assert response.status_code == 404
    assert response.json['error']['code'] == 'cv_not_found'



def test_preview_multipage_non_modifica_lo_snapshot(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'preview.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    cv = client.post('/api/cvs', json={'title': 'Curriculum sintetico'}).json
    base = f"/api/cvs/{cv['id']}"
    content = {
        'document_title': 'Curriculum nella bozza',
        'sections': [{
            'id': f's-{i}', 'type': 'projects', 'title': f'Progetto {i}',
            'text': '\n'.join(f'• Riga {i}-{n}, attività €' for n in range(36))
        } for i in range(8)],
    }
    response = client.post(f'{base}/pdf/preview', json={'content': content})
    assert response.status_code == 200 and response.mimetype == 'application/pdf'
    pages = PdfReader(BytesIO(response.data)).pages
    assert len(pages) > 1
    assert float(pages[0].mediabox.width) == pytest.approx(595.28, abs=1)
    assert float(pages[0].mediabox.height) == pytest.approx(841.89, abs=1)
    text = '\n'.join(page.extract_text() for page in pages)
    assert 'Curriculum nella bozza' in ' '.join(text.split()) and text.count('attività €') == 288
    assert client.get(base).json == cv
    assert len(client.get(f'{base}/versions').json) == 1
