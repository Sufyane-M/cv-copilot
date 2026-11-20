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

def test_pdf_preview_renders_draft_content_and_style_without_saving(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'preview.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    cv_id = client.post('/api/cvs', json={'title': 'CV salvato', 'from_example': True}).json['id']
    base = f'/api/cvs/{cv_id}'
    saved_cv = client.get(base).json
    saved_versions = client.get(f'{base}/versions').json

    draft = {
        'document_title': 'CV in lavorazione',
        'sections': [
            {'id': 'profile', 'type': 'summary', 'title': 'Profilo', 'text': 'Competenze aggiunte senza salvare.'},
            {'id': 'study', 'type': 'education', 'title': 'Formazione', 'text': 'Programma di studio sintetico.'},
        ],
        'design': {
            'templateId': 'sidebar-studio',
            'colors': {'sidebar': '#c3bbd9'},
            'typography': {'font': 'mono'},
        },
    }
    response = client.post(f'{base}/pdf/preview', json={'content': draft})
    assert response.status_code == 200
    assert response.mimetype == 'application/pdf'
    assert response.cache_control.no_store
    assert 'X-CV-Version' not in response.headers
    assert response.headers['Content-Disposition'] == f'inline; filename=cv-{cv_id}-bozza.pdf'

    page = PdfReader(BytesIO(response.data)).pages[0]
    text = page.extract_text()
    assert 'CV in lavorazione' in text and 'CV salvato' not in text
    assert 'Competenze aggiunte senza salvare.' in text
    fonts = [reference.get_object()['/BaseFont'] for reference in page['/Resources']['/Font'].values()]
    assert fonts and all('DejaVuSansMono' in font for font in fonts)
    fill_colors = [list(map(float, operands)) for operands, operator in page.get_contents().operations if operator == b'rg']
    assert pytest.approx([195 / 255, 187 / 255, 217 / 255], abs=0.0001) in fill_colors
    assert client.get(base).json == saved_cv
    assert client.get(f'{base}/versions').json == saved_versions


def test_pdf_preview_rejects_missing_cv_and_invalid_content(tmp_path, monkeypatch):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'preview.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    monkeypatch.setattr('backend.app.render_cv_pdf', lambda _: pytest.fail('Dati non validi inviati al renderer PDF'))

    missing = client.post('/api/cvs/1/pdf/preview', json={'content': {'sections': []}})
    assert missing.status_code == 404
    assert missing.json['error']['code'] == 'cv_not_found'

    cv_id = client.post('/api/cvs', json={'title': 'CV di prova'}).json['id']
    preview = f'/api/cvs/{cv_id}/pdf/preview'
    assert client.post(preview).status_code == 415
    assert client.post(preview, json={}).status_code == 400
    invalid = client.post(preview, json={'content': {'sections': [], 'design': {'templateId': 'sconosciuto'}}})
    assert invalid.status_code == 400
    assert invalid.json['error']['code'] == 'invalid_input'


def test_pdf_keeps_custom_columns_font_and_all_text_on_a4_pages(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'pdf.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    created = client.post('/api/cvs', json={'title': 'Titolo elenco'}).json
    base = f"/api/cvs/{created['id']}"
    sections = [{
        'id': f'test-{index}',
        'type': 'education' if index % 2 == 0 else 'projects',
        'title': ('Formazione' if index % 2 == 0 else 'Progetto') + f' {index}',
        'text': '\n'.join(f'Riga {index:02d}-{line:02d} · attività €' for line in range(28)),
    } for index in range(12)]
    assert client.put(f'{base}/content', json={
        'expected_version': 1,
        'content': {
            'document_title': 'Curriculum nuovo',
            'sections': sections,
            'design': {
                'templateId': 'sidebar-studio',
                'colors': {'sidebar': '#c3bbd9'},
                'typography': {'font': 'mono'},
                'page': {'margin': 15, 'asideSide': 'right', 'asideWidth': 36},
            },
        },
    }).status_code == 200

    response = client.get(f'{base}/pdf')
    assert response.status_code == 200
    pages = PdfReader(BytesIO(response.data)).pages
    assert len(pages) > 1
    for page in pages:
        assert float(page.mediabox.width) == pytest.approx(595.28, abs=1)
        assert float(page.mediabox.height) == pytest.approx(841.89, abs=1)

    text = '\n'.join(page.extract_text() for page in pages)
    assert 'Curriculum nuovo' in text and 'Titolo elenco' not in text
    assert text.count('attività €') == 12 * 28
    assert sorted(re.findall(r'Riga (\d\d-\d\d)', text)) == [
        f'{index:02d}-{line:02d}' for index in range(12) for line in range(28)
    ]
    fonts = [reference.get_object() for reference in pages[0]['/Resources']['/Font'].values()]
    assert fonts and all('DejaVuSansMono' in font['/BaseFont'] for font in fonts)
    for font in fonts:
        descriptor = font['/DescendantFonts'][0].get_object()['/FontDescriptor']
        assert '/FontFile2' in descriptor
    fill_colors = [list(map(float, operands)) for operands, operator in pages[0].get_contents().operations if operator == b'rg']
    assert pytest.approx([195 / 255, 187 / 255, 217 / 255], abs=0.0001) in fill_colors

    heading_x = {}

    def capture_heading(text, canvas_matrix, text_matrix, _font, _font_size):
        heading = text.strip().casefold()
        if heading in ('progetto 1', 'formazione 0'):
            heading_x[heading] = canvas_matrix[4] + canvas_matrix[0] * text_matrix[4]

    pages[0].extract_text(visitor_text=capture_heading)
    assert heading_x['progetto 1'] == pytest.approx(42.52, abs=2)
    assert heading_x['formazione 0'] - heading_x['progetto 1'] > 300


def test_pdf_renders_profile_dates_portrait_and_multipage_lists(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'structured.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    created = client.post('/api/cvs', json={'title': 'CV strutturato sintetico'}).json
    base = f"/api/cvs/{created['id']}"
    photo = ('data:image/png;base64,'
             'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    sections = [{
        'id': f'work-{index}',
        'type': 'skills' if index % 2 else 'experience',
        'title': f'Esperienza {index:02d}',
        'subtitle': 'Studio Vela',
        'period': '2022–2025',
        'text': 'Attività principali\n' + '\n'.join(
            f'• Voce {index:02d}-{line:02d} di progettazione e qualità, con attività di ricerca' for line in range(20)
        ),
    } for index in range(10)]
    content = {
        'document_title': 'Giulia Riva',
        'profile': {
            'role': 'Progettista digitale', 'email': 'giulia@example.test', 'location': 'Milano', 'photo': photo,
        },
        'design': {'templateId': 'sidebar-studio'},
        'sections': sections,
    }
    saved = client.put(f'{base}/content', json={'expected_version': 1, 'content': content})
    assert saved.status_code == 200, saved.get_json()

    response = client.get(f'{base}/pdf')
    assert response.status_code == 200
    pages = PdfReader(BytesIO(response.data)).pages
    assert len(pages) > 1
    first_page = pages[0].extract_text()
    assert all(value in first_page for value in ['Giulia Riva', 'Progettista digitale', 'giulia@example.test', 'Studio Vela', '2022–2025'])
    assert has_embedded_image(pages[0])
    assert 'Foto demo' not in first_page
    text = '\n'.join(page.extract_text() for page in pages)
    assert sorted(re.findall(r'Voce (\d\d-\d\d)', text)) == [
        f'{index:02d}-{line:02d}' for index in range(10) for line in range(20)
    ]


def test_pdf_renders_demo_portrait_for_photo_template_until_removed(tmp_path):
    app = create_app({'TESTING': True, 'DATABASE': tmp_path / 'portrait.sqlite3', 'LLM_MODE': 'mock'})
    client = app.test_client()
    created = client.post('/api/cvs', json={'title': 'CV di prova', 'from_example': True}).json
    base = f"/api/cvs/{created['id']}"
    content = {**created['content'], 'design': {'templateId': 'modern-milano'}}
    assert client.put(f'{base}/content', json={'expected_version': 1, 'content': content}).status_code == 200

    response = client.get(f'{base}/pdf')
    assert response.status_code == 200
    page = PdfReader(BytesIO(response.data)).pages[0]
    assert has_embedded_image(page)
    assert 'Foto demo' in page.extract_text()
    assert 'photo' not in client.get(base).json['content'].get('profile', {})

    without_photo = {**content, 'profile': {**content.get('profile', {}), 'photo': ''}}
    assert client.put(f'{base}/content', json={'expected_version': 2, 'content': without_photo}).status_code == 200
    response = client.get(f'{base}/pdf')
    assert response.status_code == 200
    page = PdfReader(BytesIO(response.data)).pages[0]
    assert not has_embedded_image(page)
    assert 'Foto demo' not in page.extract_text()
