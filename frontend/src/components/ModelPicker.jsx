import { useEffect, useState } from 'react'
import { api } from '../api.js'

const lastModelKey = 'cv-copilot:last-model'

export function useModelCatalog(enabled) {
  const [preferredId, setPreferredId] = useState(() => window.localStorage.getItem(lastModelKey) ?? '')
  const [models, setModels] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    api.models(controller.signal).then((catalog) => {
      if (controller.signal.aborted) return
      if (!Array.isArray(catalog.models)) throw new Error('Il catalogo dei modelli non è disponibile.')
      setModels(catalog.models)
      // Manteniamo la preferenza anche se sparisce dal catalogo, così l'utente sceglie esplicitamente.
      setPreferredId((id) => id || catalog.default_model_id || '')
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message)
    })
    return () => controller.abort()
  }, [enabled, revision])

  function reload() {
    setModels(null)
    setError('')
    setRevision((value) => value + 1)
  }

  function select(id) {
    if (!models?.some((model) => model.id === id)) return
    window.localStorage.setItem(lastModelKey, id)
    setPreferredId(id)
  }

  const model = models?.find((item) => item.id === preferredId)
  const unavailable = Boolean(models && preferredId && !model)
  return { models, model, unavailable, error, reload, select }
}

function optionLabel(model) {
  return model.name === model.id ? model.id : `${model.name} (${model.id})`
}

function ModelSetup() {
  return (
    <details className="chat-model-help">
      <summary>Come scegliere un modello</summary>
      <p>Apri <code>backend/.env</code>. Se manca, crealo copiando <code>backend/.env.example</code>.</p>
      <p>Imposta <code>LLM_MODE=openrouter</code> e inserisci la tua chiave in <code>OPENROUTER_API_KEY</code>.</p>
      <p>Riavvia Flask e ricarica la pagina per vedere il selettore <strong>Modello</strong>.</p>
    </details>
  )
}

export default function ModelPicker({ catalog, configured, demo, sending, requestedId }) {
  const [search, setSearch] = useState('')
  const { models, model, unavailable, error, reload, select } = catalog

  if (demo) return <ModelSetup />
  if (!configured) {
    return <>
      <p className="chat-model-note" role="status">Configura la chiave OpenRouter in backend/.env e riavvia Flask.</p>
      <ModelSetup />
    </>
  }
  if (error || models?.length === 0) {
    return (
      <div className="chat-model-note chat-model-error" role="status">
        <span>{error || 'Il catalogo non contiene modelli compatibili.'}</span>
        <button type="button" className="button button-small" onClick={reload}>Riprova catalogo</button>
      </div>
    )
  }
  if (models === null) return <p className="chat-model-note" role="status">Caricamento dei modelli…</p>

  const selectedId = sending ? requestedId : model?.id ?? ''
  const query = search.trim().toLowerCase()
  const visible = models.filter((item) => optionLabel(item).toLowerCase().includes(query))
  const selected = models.find((item) => item.id === selectedId)
  const visibleOptions = selected && !visible.includes(selected) ? [selected, ...visible] : visible

  return (
    <div className="chat-model-picker">
      <div className="chat-model-selector">
        <label htmlFor="review-model">Modello</label>
        <select id="review-model" value={selectedId} disabled={sending}
          title={selected && optionLabel(selected)}
          aria-describedby={unavailable ? 'review-model-unavailable' : undefined}
          onChange={(event) => select(event.target.value)}>
          <option value="" disabled>Scegli un modello</option>
          {selectedId && !selected && <option value={selectedId}>{selectedId}</option>}
          {visibleOptions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}
        </select>
      </div>
      {models.length > 20 && (
        <input type="search" className="chat-model-search" aria-label="Cerca un modello" placeholder="Cerca un modello"
          value={search} disabled={sending} onChange={(event) => setSearch(event.target.value)} />
      )}
      {unavailable && <p className="chat-model-note" id="review-model-unavailable" role="status">
        Il modello precedente non è più disponibile. Scegline un altro.
      </p>}
      {query && visible.length === 0 && <p className="chat-model-note" role="status">Nessun modello corrisponde alla ricerca.</p>}
    </div>
  )
}
