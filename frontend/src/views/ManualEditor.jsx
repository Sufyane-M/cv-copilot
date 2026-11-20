import { createSection, sectionTypes } from '../components/common.jsx'

export default function ManualEditor({ content, limits, onChange, busy }) {
  const { sections } = content

  function update(id, field, value) {
    onChange({ ...content, sections: sections.map(section => section.id === id ? { ...section, [field]: value } : section) })
  }

  function move(index, direction) {
    const reordered = [...sections]
    const target = index + direction
    reordered[index] = sections[target]
    reordered[target] = sections[index]
    onChange({ ...content, sections: reordered })
  }

  function removeSection(id) {
    const updated = { ...content, sections: sections.filter(section => section.id !== id) }
    if (Object.hasOwn(content.design?.blocks ?? {}, id)) {
      const blocks = { ...content.design.blocks }
      delete blocks[id]
      updated.design = { ...content.design, blocks }
    }
    onChange(updated)
  }

  return <fieldset className="manual-editor" disabled={busy}>
    <legend>Sezioni del documento</legend>
    <label>Titolo del documento
      <input maxLength={limits.title} value={content.document_title ?? ''} placeholder="Usa il titolo dell’archivio"
        onChange={event => {
          const { document_title, ...rest } = content
          onChange(event.target.value ? { ...rest, document_title: event.target.value } : rest)
        }} />
    </label>
    {sections.map((section, index) => <fieldset className="manual-section" key={section.id}>
      <legend>{section.title || 'Sezione ' + (index + 1)}</legend>
      <div className="manual-fields">
        <label>Titolo sezione<input required maxLength={limits.section_title} value={section.title}
          onChange={event => update(section.id, 'title', event.target.value)} /></label>
        <label>Tipo<select value={section.type} onChange={event => update(section.id, 'type', event.target.value)}>
          {Object.entries(sectionTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select></label>
        <label>Sottotitolo<input maxLength={limits.section_subtitle} value={section.subtitle ?? ''}
          onChange={event => update(section.id, 'subtitle', event.target.value)} /></label>
        <label>Periodo<input maxLength={limits.section_period} value={section.period ?? ''}
          onChange={event => update(section.id, 'period', event.target.value)} /></label>
      </div>
      <label>Testo<textarea rows={4} maxLength={limits.section_text} value={section.text}
        onChange={event => update(section.id, 'text', event.target.value)} /></label>
      <div className="actions">
        <button type="button" className="button button-small" disabled={index === 0} onClick={() => move(index, -1)}>Sposta su</button>
        <button type="button" className="button button-small" disabled={index === sections.length - 1} onClick={() => move(index, 1)}>Sposta giù</button>
        <button type="button" className="button button-small button-danger"
          onClick={() => removeSection(section.id)}>Rimuovi sezione</button>
      </div>
    </fieldset>)}
    <div><button type="button" className="button" disabled={sections.length >= limits.sections}
      onClick={() => onChange({ ...content, sections: [...sections, createSection()] })}>Aggiungi sezione</button></div>
  </fieldset>
}
