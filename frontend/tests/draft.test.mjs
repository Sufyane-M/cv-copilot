import assert from 'node:assert/strict'
import test from 'node:test'
import { changeDraft, compareSavedTexts, copyStyle, onlyStyleChanged, recoverDraftText, redoDraft, undoDraft } from '../src/document/draft.mjs'

const section = { id: 'progetto', type: 'projects', title: 'Progetto', text: 'Testo originale' }
const cv = { version_number: 4, content: { sections: [section] } }

test('raggruppa la digitazione e conserva Undo/Redo nella bozza', () => {
  const first = { sections: [{ ...section, text: 'Prima parola' }] }
  const last = { sections: [{ ...section, text: 'Prima parola\nSeconda riga' }] }
  const started = changeDraft(null, cv, first, 'progetto:text')
  const edited = changeDraft(started, cv, last, 'progetto:text')
  assert.equal(edited.baseVersion, 4)
  assert.equal(edited.past.length, 1)
  const back = undoDraft(edited)
  assert.deepEqual(back.content, cv.content)
  assert.deepEqual(redoDraft(back).content, last)
  assert.deepEqual(changeDraft(back, cv, first).future, [])
})

test('riapplica solo lo stile a testo aggiornato dopo un conflitto', () => {
  const design = { templateId: 'sidebar-studio', blocks: { progetto: { width: 73 }, tolta: { width: 80 } } }
  const draft = changeDraft(null, cv, { ...cv.content, design })
  assert.equal(onlyStyleChanged(draft), true)
  const newer = { sections: [{ ...section, text: 'Testo aggiornato' }] }
  const rebased = copyStyle(newer, design)
  assert.deepEqual(rebased.sections, newer.sections)
  assert.deepEqual(rebased.design.blocks, { progetto: { width: 73 } })
  assert.equal(onlyStyleChanged(changeDraft(draft, cv, { ...newer, design })), false)
})

test('recupera testo manuale e grafica insieme a una sezione aggiornata dall’AI', () => {
  const experience = { id: 'work', type: 'experience', title: 'Esperienza', text: 'Esperienza originale' }
  const design = { templateId: 'sidebar-studio', typography: { font: 'mono' }, colors: { accent: '#614077' } }
  const initial = { ...cv, content: { sections: [section, experience] } }
  const manual = { ...section, text: 'Testo manuale del progetto' }
  const draft = changeDraft(null, initial, { sections: [manual, experience], design })
  const updated = { ...experience, text: 'Esperienza approvata' }
  const latest = { sections: [section, updated] }
  const changes = compareSavedTexts(draft, latest)

  assert.equal(changes[0].conflict, false)
  assert.deepEqual(recoverDraftText(draft, changes), { sections: [manual, updated], design })
  assert.equal(draft.content.sections[1].text, experience.text)
  assert.deepEqual(latest.sections, [section, updated])
})

test('richiede una scelta quando la stessa sezione ha due testi diversi', () => {
  const design = { templateId: 'classic-roma', typography: { font: 'serif' } }
  const manual = { ...section, text: 'Testo scritto a mano' }
  const saved = { ...section, text: 'Testo approvato' }
  const draft = changeDraft(null, cv, { sections: [manual], design })
  const changes = compareSavedTexts(draft, { sections: [saved] })

  assert.equal(changes[0].conflict, true)
  assert.equal(recoverDraftText(draft, changes), null)
  assert.deepEqual(recoverDraftText(draft, changes, { progetto: 'saved' }), { sections: [saved], design })
  assert.deepEqual(recoverDraftText(draft, changes, { progetto: 'draft' }), draft.content)
  assert.equal(compareSavedTexts(draft, { sections: [saved], design }), null)
})

test('la rimozione locale di una sezione aggiornata richiede conferma', () => {
  const draft = changeDraft(null, cv, { sections: [] })
  const saved = { ...section, text: 'Nuovo testo salvato' }
  const changes = compareSavedTexts(draft, { sections: [saved] })
  assert.equal(recoverDraftText(draft, changes), null)
  assert.deepEqual(recoverDraftText(draft, changes, { progetto: 'draft' }), { sections: [] })
  assert.deepEqual(recoverDraftText(draft, changes, { progetto: 'saved' }), { sections: [saved] })
})
