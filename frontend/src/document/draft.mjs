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
