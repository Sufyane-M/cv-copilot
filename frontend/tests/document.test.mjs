import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CvDocument from '../src/document/CvDocument.mjs'

const cv = {
  document_title: 'Giulia Riva',
  profile: { role: 'Progettista digitale', email: 'giulia@example.com', location: 'Milano' },
  sections: [{
    id: 'work', type: 'experience', title: 'Progettazione prodotto',
    subtitle: 'Studio Vela', period: '2022 – oggi',
    text: 'Coordinamento dell’area design.\n\n• Prototipi accessibili\n• Interviste & test\nRisultati condivisi ogni mese.',
  }],
}

test('rende il profilo, l’esperienza datata e gli elenchi come elementi del documento', () => {
  const content = { ...cv, sections: [...cv.sections, { ...cv.sections[0], id: 'other-job', title: 'Tirocinio', text: '' }] }
  const html = renderToStaticMarkup(h(CvDocument, { title: 'Archivio', content }))
  assert.match(html, /<h1[^>]*>Giulia Riva<\/h1>/)
  assert.match(html, /<div class="cv-profile-role">Progettista digitale<\/div>/)
  assert.match(html, /data-contact="email">giulia@example\.com<\/div>/)
  assert.equal(html.match(/class="cv-section-category">Esperienza professionale/g)?.length, 1)
  assert.match(html, /class="cv-section-subtitle">Studio Vela<\/div>/)
  assert.match(html, /class="cv-section-period">2022 – oggi<\/div>/)
  assert.match(html, /<ul class="cv-section-list"><li>Prototipi accessibili<\/li><li>Interviste &amp; test<\/li><\/ul>/)
  assert.match(html, /<p>Risultati condivisi ogni mese\.<\/p>/)
})

test('mantiene gli snapshot senza profilo e scarta le immagini esterne', () => {
  const section = { id: 'profile', type: 'summary', title: 'Profilo', text: 'Prima riga\nSeconda riga' }
  const html = renderToStaticMarkup(h(CvDocument, { title: 'Storico', content: { sections: [section] } }))
  assert.match(html, /class="cv-section-text">Prima riga\nSeconda riga<\/div>/)
  assert.doesNotMatch(html, /cv-profile-role|cv-profile-contacts|data-has-profile|cv-section-period/)

  const htmlWithExternalPhoto = renderToStaticMarkup(h(CvDocument, {
    title: 'Foto esterna', content: { sections: [], profile: { photo: 'https://example.com/foto.png' } },
  }))
  assert.doesNotMatch(htmlWithExternalPhoto, /<img|example\.com|data-portrait/)
})

test('il documento esporta la foto demo del template fino alla sostituzione o alla rimozione', () => {
  const content = { ...cv, design: { templateId: 'modern-milano' } }
  const demoPortrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlL8AAAAASUVORK5CYII='
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const render = (document) => renderToStaticMarkup(h(CvDocument, { title: 'Archivio', content: document, demoPortrait }))

  const htmlWithDemo = render(content)
  assert.match(htmlWithDemo, /data-portrait="right"/)
  assert.match(htmlWithDemo, /<img class="cv-profile-photo"/)
  assert.ok(htmlWithDemo.includes(demoPortrait))
  assert.match(htmlWithDemo, /Foto demo/i)

  const htmlWithPhoto = render({ ...content, profile: { ...content.profile, photo } })
  assert.match(htmlWithPhoto, /data-portrait="right"/)
  assert.ok(htmlWithPhoto.includes(photo))
  assert.doesNotMatch(htmlWithPhoto, /Foto demo/i)
  assert.doesNotMatch(render({ ...content, profile: { ...content.profile, photo: '' } }), /<img|data-portrait|Foto demo/i)
  assert.doesNotMatch(render({ ...content, design: { templateId: 'classic-roma' } }), /<img|data-portrait|Foto demo/i)
})
