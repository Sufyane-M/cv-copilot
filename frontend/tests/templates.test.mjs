import assert from 'node:assert/strict'
import test from 'node:test'
import { getTemplate } from '../src/document/CvDocument.mjs'
import { applyTemplate, templateSample } from '../src/document/templateSample.mjs'

test('un template su un curriculum esistente cambia lo stile e conserva i dati', () => {
  const first = templateSample(getTemplate('sidebar-studio'))
  first.design.blocks[first.sections[0].id] = { width: 72 }
  const updated = applyTemplate(first, getTemplate('editorial-rivista'))

  assert.equal(updated.design.templateId, 'editorial-rivista')
  assert.deepEqual(updated.design.blocks, {})
  assert.equal(updated.document_title, first.document_title)
  assert.deepEqual(updated.profile, first.profile)
  assert.deepEqual(updated.sections, first.sections)
  assert.equal(first.design.blocks[first.sections[0].id].width, 72)
})

test('un curriculum senza sezioni carica una bozza dimostrativa con il template', () => {
  const template = getTemplate('modern-milano')
  const photo = 'data:image/jpeg;base64,esempio'
  const updated = applyTemplate({ sections: [], document_title: 'Titolo personale' }, template, photo)

  assert.equal(updated.document_title, 'Titolo personale')
  assert.equal(updated.design.templateId, template.id)
  assert.equal(updated.profile.photo, photo)
  assert.ok(updated.sections.length >= 3)
})
