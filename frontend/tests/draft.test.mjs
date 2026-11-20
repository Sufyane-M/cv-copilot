import assert from 'node:assert/strict'
import test from 'node:test'
import { changeDraft, redoDraft, undoDraft } from '../src/document/draft.mjs'

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
