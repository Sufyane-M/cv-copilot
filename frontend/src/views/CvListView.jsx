import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { DateTime, Notice, RenameForm } from '../components/common.jsx'

const exampleTitle = 'CV di esempio'

export default function CvListView({ limits, onOpen, onRemove }) {
  const [cvs, setCvs] = useState(null)
  const [listError, setListError] = useState('')
  const [reload, setReload] = useState(0)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const newTitleInput = useRef(null)
  const createButton = useRef(null)
  const renameContainer = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    api.cvs(controller.signal).then(setCvs).catch((error) => {
      if (error.name !== 'AbortError') setListError(error.message)
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => { if (creating) newTitleInput.current?.focus() }, [creating])
  useEffect(() => { if (renamingId !== null) renameContainer.current?.querySelector('input')?.focus() }, [renamingId])

  function refresh() {
    setListError('')
    setReload((value) => value + 1)
  }

  async function applyChange(action, onSuccess) {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await action()
      onSuccess(result)
    } catch (error) {
      setFeedback({ kind: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  function createCv(title, fromExample) {
    if (!title.trim()) return
    void applyChange(() => api.create({ title: title.trim(), from_example: fromExample }), (cv) => onOpen(cv.id))
  }

  function renameCv(id, nextTitle) {
    void applyChange(() => api.rename(id, nextTitle), () => {
      setRenamingId(null)
      refresh()
      setFeedback({ kind: 'success', message: 'Titolo aggiornato.' })
    })
  }

  function deleteCv(cv) {
    if (!window.confirm(`Eliminare «${cv.title}» con tutte le versioni e le proposte?`)) return
    void applyChange(() => api.remove(cv.id), () => {
      onRemove(cv.id)
      setRenamingId(null)
      refresh()
      setFeedback({ kind: 'success', message: 'CV eliminato.' })
    })
  }

  return (
    <section className="library" aria-labelledby="library-title">
      <div className="library-heading">
        <div>
          <h1 id="library-title">I miei CV</h1>
          {cvs?.length === 0 && <p className="muted">Crea il tuo primo CV oppure apri un esempio con dati sintetici.</p>}
        </div>
        {!creating && <div className="actions">
          <button ref={createButton} type="button" className="button button-primary" disabled={busy}
            onClick={() => setCreating(true)}>Crea un CV</button>
          <button type="button" className="button" disabled={busy}
            onClick={() => createCv(exampleTitle, true)}>Prova con un esempio</button>
        </div>}
      </div>

      <Notice kind={feedback?.kind}>{feedback?.message}</Notice>
      {creating && <form className="library-form" onSubmit={(event) => {
        event.preventDefault()
        createCv(title, false)
      }}>
        <label>
          Titolo del CV
          <input ref={newTitleInput} value={title} maxLength={limits.title} onChange={(event) => setTitle(event.target.value)}
            placeholder="Es. CV per tirocinio" required disabled={busy} />
        </label>
        <div className="actions">
          <button type="submit" className="button button-primary" disabled={busy || !title.trim()}>Crea CV</button>
          <button type="button" className="button" disabled={busy} onClick={() => {
            setCreating(false)
            requestAnimationFrame(() => createButton.current?.focus())
          }}>Annulla</button>
        </div>
      </form>}
      {listError && <Notice kind="error">
        {listError}{' '}<button type="button" className="button button-small" onClick={refresh}>Riprova</button>
      </Notice>}
      {!cvs && !listError && <p className="muted" role="status">Caricamento dei CV…</p>}
      {cvs?.length > 0 && <ul className="library-documents">
        {cvs.map((cv) => (
          <li key={cv.id} className="library-item">
            <div className="library-item-title">
              <h2>{cv.title}</h2>
              <p className="muted small"><DateTime value={cv.updated_at} /> · Versione {cv.version_number}</p>
            </div>
            {renamingId === cv.id ? (
              <div ref={renameContainer} className="library-rename">
                <RenameForm initialTitle={cv.title} maxLength={limits.title} disabled={busy}
                  onRename={(value) => renameCv(cv.id, value)} onCancel={() => setRenamingId(null)} />
              </div>
            ) : (
              <div className="actions">
                <button type="button" className="button button-small" aria-label={`Apri ${cv.title}`} disabled={busy}
                  onClick={() => onOpen(cv.id)}>Apri</button>
                <button type="button" className="button button-small" aria-label={`Rinomina ${cv.title}`} disabled={busy}
                  onClick={() => { setRenamingId(cv.id); setFeedback(null) }}>Rinomina</button>
                <button type="button" className="button button-small button-danger" aria-label={`Elimina ${cv.title}`} disabled={busy}
                  onClick={() => deleteCv(cv)}>Elimina</button>
              </div>
            )}
          </li>
        ))}
      </ul>}
    </section>
  )
}
