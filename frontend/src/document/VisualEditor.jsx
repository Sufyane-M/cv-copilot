import { useEffect, useRef, useState } from 'react'
import { createSection, sectionTypes } from '../components/common.jsx'
import CvDocument, { getTemplate, resolveDesign, sectionColumn } from './CvDocument.mjs'
import demoPortrait from './demo-portrait.jpg?inline'
import './document.css'
import './editor.css'

const pixelsPerMillimeter = 96 / 25.4
const a4Width = 210 * pixelsPerMillimeter
const zoomLevels = [45, 60, 75, 90, 100, 125, 150]
async function portraitData(file, byteLimit) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 15 * 1024 * 1024) {
    throw new Error('Scegli un file JPEG o PNG da massimo 15 MB.')
  }
  let image
  try {
    image = await createImageBitmap(file)
  } catch {
    throw new Error('Impossibile leggere la foto. Scegli un altro file.')
  }
  try {
    const scale = Math.min(1, 480 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d', { alpha: false })
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const portrait = canvas.toDataURL('image/jpeg', 0.84)
    if (portrait.split(',')[1].length * 0.75 > byteLimit) {
      throw new Error('La foto è troppo grande. Scegli un’immagine più piccola.')
    }
    return portrait
  } finally {
    image.close()
  }
}

function InlineField({ id, field, value, label, preview, busy, limit, onSelect, onEdit }) {
  const [editing, setEditing] = useState(false)
  const Container = field === 'text' ? 'div' : 'span'
  const showPreview = !editing && Boolean(value.trim()) && preview
  const placeholder = field === 'text' ? 'Aggiungi il testo' : label
  const reservePlaceholder = id === '@profile' || field === 'subtitle' || field === 'period'
  return (
    <Container className="visual-field" data-preview={showPreview ? 'true' : undefined}>
      {showPreview
        ? <div aria-hidden="true">{preview}</div>
        : <span aria-hidden="true" className="visual-field-mirror">{value || (reservePlaceholder ? placeholder : '')}{'\u200b'}</span>}
      <textarea className="visual-field-input" data-field={field} aria-label={label}
        rows={1} value={value} placeholder={placeholder} maxLength={limit} readOnly={busy}
        onFocus={() => { setEditing(true); onSelect(id) }} onBlur={() => setEditing(false)}
        onChange={(event) => onEdit(field === 'text' ? event.target.value : event.target.value.replace(/\r?\n/g, ' '))} />
    </Container>
  )
}

export default function VisualEditor({
  title, content, limits, busy, onChange, requestedSectionId, onPhotoProcessing,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [zoom, setZoom] = useState('fit')
  const [fit, setFit] = useState(100)
  const [showProfileFields, setShowProfileFields] = useState(false)
  const [sectionDetailsId, setSectionDetailsId] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const canvas = useRef(null)
  const photoInput = useRef(null)
  const photoRequest = useRef(0)
  const latestContent = useRef(content)
  const design = resolveDesign(content.design)
  const savedPhoto = content.profile?.photo
  // L'assenza del campo usa il ritratto del template. Una stringa vuota indica una rimozione esplicita.
  const demoOnly = savedPhoto === undefined && Boolean(getTemplate(design.templateId).portrait)
  const hasOwnPhoto = Boolean(savedPhoto && savedPhoto !== demoPortrait)
  const selected = content.sections.find((section) => section.id === selectedId)
  const showSectionDetails = Boolean(selected && sectionDetailsId === selected.id)
  const lane = selected ? sectionColumn(selected, design) : null
  const neighbors = content.sections.filter((section) => sectionColumn(section, design) === lane)
  const laneIndex = neighbors.findIndex((section) => section.id === selectedId)
  const effectiveZoom = zoom === 'fit' ? fit : Number(zoom)

  useEffect(() => { latestContent.current = content }, [content])
  useEffect(() => () => { photoRequest.current += 1 }, [])

  useEffect(() => {
    const stage = canvas.current
    function fitPage() {
      const available = stage.clientWidth - 32
      if (available > 0) setFit(Math.min(100, Math.floor(available / a4Width * 100)))
    }
    fitPage()
    const observer = new ResizeObserver(fitPage)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  function focusSection(id, field) {
    setSelectedId(id)
    requestAnimationFrame(() => {
      const section = canvas.current?.querySelector(`[data-section-id="${CSS.escape(id)}"]`)
      section?.querySelector(`[data-field="${field}"]`)?.focus()
    })
  }

  useEffect(() => {
    if (requestedSectionId) focusSection(requestedSectionId, 'text')
  }, [requestedSectionId])

  function addSection(type) {
    const section = createSection(type)
    onChange({ ...content, sections: [...content.sections, section] })
    focusSection(section.id, 'title')
  }

  function updateField({ id, field }, value) {
    let updated
    if (field === 'document_title') updated = { ...content, document_title: value }
    else if (id === '@profile') updated = { ...content, profile: { ...content.profile, [field]: value } }
    else updated = { ...content, sections: content.sections.map((section) =>
      section.id === id ? { ...section, [field]: value } : section) }
    onChange(updated, `field:${id}:${field}`)
  }

  function renderField(field) {
    const limit = field.field === 'document_title' ? limits.title
      : limits[`${field.id === '@profile' ? 'profile' : 'section'}_${field.field}`]
    return <InlineField {...field} busy={busy} limit={limit} onSelect={setSelectedId}
      onEdit={(value) => updateField(field, value)} />
  }

  function openPortrait() {
    setSelectedId('@profile')
    photoInput.current?.click()
  }

  async function changePortrait(event) {
    const [file] = event.target.files
    event.target.value = ''
    if (!file) return
    const request = ++photoRequest.current
    setPhotoError('')
    onPhotoProcessing?.(true)
    try {
      const photo = await portraitData(file, limits.profile_photo_bytes ?? 262144)
      if (request !== photoRequest.current) return
      const current = latestContent.current
      onChange({ ...current, profile: { ...current.profile, photo } })
    } catch (error) {
      if (request === photoRequest.current) setPhotoError(error.message || 'Impossibile leggere la foto.')
    } finally {
      if (request === photoRequest.current) onPhotoProcessing?.(false)
    }
  }

  function moveSection(offset) {
    const target = neighbors[laneIndex + offset]
    if (!target) return
    const sections = [...content.sections]
    const from = sections.indexOf(selected)
    const to = sections.indexOf(target)
    sections[from] = target
    sections[to] = selected
    onChange({ ...content, sections })
  }

  function removeSection() {
    const blocks = { ...design.blocks }
    delete blocks[selectedId]
    const sections = content.sections.filter(section => section.id !== selectedId)
    onChange({ ...content, sections, design: { ...design, blocks } })
    setSelectedId(null)
  }

  return (
    <div className="visual-editor">
      <div className="visual-utilities">
        <label className="visual-add-section">
          <span className="sr-only">Aggiungi sezione</span>
          <select value="" disabled={busy || content.sections.length >= limits.sections}
            onChange={(event) => addSection(event.target.value)}>
            <option value="" disabled>+ Aggiungi sezione</option>
            {Object.entries(sectionTypes).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="button button-small" aria-expanded={showProfileFields} disabled={busy}
          onClick={() => {
            setShowProfileFields(!showProfileFields)
            setSelectedId(showProfileFields ? null : '@profile')
          }}>Dati personali</button>
        <button type="button" className="button button-small visual-photo-action" disabled={busy} onClick={openPortrait}>
          {hasOwnPhoto ? 'Cambia foto' : 'Carica la tua foto'}
        </button>
        <span className="visual-selection-label" aria-live="polite">
          {selected?.title || (selectedId === '@title' ? 'Titolo del documento' : selectedId === '@profile' ? 'Intestazione' : 'A4')}
        </span>
        <label className="visual-zoom">
          <span>Zoom</span>
          <select value={zoom} onChange={(event) => setZoom(event.target.value)}>
            <option value="fit">Adatta ({fit}%)</option>
            {zoomLevels.map((level) => <option key={level} value={level}>{level}%</option>)}
          </select>
        </label>
      </div>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png" aria-label="Foto del profilo" onChange={changePortrait} hidden />
      {(demoOnly || savedPhoto === demoPortrait) && <p className="visual-photo-hint">Foto di esempio. Carica la tua per sostituirla.</p>}
      {showProfileFields && (savedPhoto || demoOnly) && <div className="visual-context" role="group" aria-label="Comandi foto del profilo">
        <button type="button" className="button button-small" disabled={busy} onClick={() => {
          photoRequest.current += 1
          onPhotoProcessing?.(false)
          setPhotoError('')
          updateField({ id: '@profile', field: 'photo' }, '')
        }}>Rimuovi foto</button>
      </div>}
      {photoError && <p className="visual-photo-error" role="alert">{photoError}</p>}
      {selected && <div className="visual-context" role="group" aria-label="Azioni sul riquadro selezionato">
        {(!selected.subtitle || !selected.period || showSectionDetails) && (
          <button type="button" className="button button-small" aria-expanded={showSectionDetails}
            onClick={() => setSectionDetailsId(showSectionDetails ? null : selected.id)} disabled={busy}>Dettagli sezione</button>
        )}
        <button type="button" className="button button-small" title="Sposta su" aria-label="Sposta su"
          onClick={() => moveSection(-1)} disabled={busy || laneIndex === 0}>↑</button>
        <button type="button" className="button button-small" title="Sposta giù" aria-label="Sposta giù"
          onClick={() => moveSection(1)} disabled={busy || laneIndex === neighbors.length - 1}>↓</button>
        <label className="visual-section-type">
          <span className="sr-only">Tipo di sezione</span>
          <select value={selected.type} disabled={busy} onChange={event => {
            const type = event.target.value
            onChange({ ...content, sections: content.sections.map(section => section.id === selected.id ? { ...section, type } : section) })
          }}>
            {Object.entries(sectionTypes).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="button button-small" onClick={removeSection} disabled={busy}>Elimina sezione</button>
      </div>}
      <div className="visual-body">
        <div className="visual-canvas" ref={canvas} aria-label="Documento A4 modificabile"
          onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
          <div className="visual-paper" style={{ zoom: effectiveZoom / 100 }}>
            <CvDocument title={title} content={content} selectedId={selected?.id ?? (selectedId?.startsWith('@') ? selectedId : null)}
              onSelect={setSelectedId} renderField={renderField}
              showProfileFields={showProfileFields} showSectionDetails={showSectionDetails} demoPortrait={demoPortrait}
              renderPortrait={({ src, alt, isDemo }) => {
                const label = isDemo || !src ? 'Carica la tua foto del profilo' : 'Cambia foto del profilo'
                return <button className="visual-portrait" type="button" disabled={busy} aria-label={label}
                  title={label} onClick={openPortrait}>
                  {src ? <img className="cv-profile-photo" src={src} alt={alt} /> : 'Aggiungi foto'}
                </button>
              }} />
          </div>
        </div>
      </div>
    </div>
  )
}
