const HISTORY_LIMIT = 40

export function sameContent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function changeDraft(draft, cv, content, group = null) {
  const current = draft?.content ?? cv.content
  if (sameContent(content, current)) return draft

  const continuesGroup = group !== null && group === draft?.group
  const past = draft?.past ?? []
  return {
    baseVersion: draft?.baseVersion ?? cv.version_number,
    baseContent: draft?.baseContent ?? cv.content,
    content,
    past: continuesGroup ? past : [...past, current].slice(-HISTORY_LIMIT),
    future: [],
    group,
  }
}

export function undoDraft(draft) {
  if (!draft?.past.length) return draft
  return {
    ...draft,
    content: draft.past.at(-1),
    past: draft.past.slice(0, -1),
    future: [draft.content, ...draft.future],
    group: null,
  }
}

export function redoDraft(draft) {
  if (!draft?.future.length) return draft
  return {
    ...draft,
    content: draft.future[0],
    past: [...draft.past, draft.content],
    future: draft.future.slice(1),
    group: null,
  }
}

export function onlyStyleChanged(draft) {
  if (!draft?.content.design) return false
  return sameContent(draft.content.sections, draft.baseContent.sections)
    && draft.content.document_title === draft.baseContent.document_title
    && sameContent(draft.content.profile, draft.baseContent.profile)
}

export function copyStyle(content, design) {
  const source = design.blocks ?? {}
  const blocks = Object.fromEntries(content.sections
    .filter(({ id }) => Object.hasOwn(source, id))
    .map(({ id }) => [id, source[id]]))
  return { ...content, design: { ...design, blocks } }
}

export function compareSavedTexts(draft, savedContent) {
  const { sections: baseSections, ...baseDocument } = draft.baseContent
  const { sections: savedSections, ...savedDocument } = savedContent
  const withoutText = ({ text, ...section }) => section

  // Il recupero combina il testo salvato solo quando la struttura di partenza è ancora valida.
  if (!sameContent(baseDocument, savedDocument)
    || !sameContent(baseSections.map(withoutText), savedSections.map(withoutText))) return null

  const localSections = new Map(draft.content.sections.map(section => [section.id, section]))
  return savedSections.flatMap((saved, index) => {
    const base = baseSections[index]
    if (saved.text === base.text) return []
    const local = localSections.get(saved.id)
    return [{ saved, local, index, conflict: !local || (local.text !== base.text && local.text !== saved.text) }]
  })
}

export function recoverDraftText(draft, updates, choices = {}) {
  if (updates.some(({ saved, conflict }) => conflict && !['saved', 'draft'].includes(choices[saved.id]))) return null

  const accepted = updates.filter(({ saved, conflict }) => !conflict || choices[saved.id] === 'saved')
  const texts = new Map(accepted.map(({ saved }) => [saved.id, saved.text]))
  const sections = draft.content.sections.map(section => texts.has(section.id)
    ? { ...section, text: texts.get(section.id) } : section)

  for (const { saved, local, index } of accepted) {
    if (!local) sections.splice(Math.min(index, sections.length), 0, saved)
  }
  return { ...draft.content, sections }
}
