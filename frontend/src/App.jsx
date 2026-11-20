import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Notice } from './components/common.jsx'
import CvListView from './views/CvListView.jsx'
import ManualEditor from './views/ManualEditor.jsx'
import HistoryView from './views/HistoryView.jsx'
import WorkspaceDialog from './components/WorkspaceDialog.jsx'
import './history.css'

export default function App() {
  const [config, setConfig] = useState(null)
  const [cv, setCv] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.config(controller.signal).then(setConfig).catch(failure => {
      if (failure.name !== 'AbortError') setError(failure.message)
    })
    return () => controller.abort()
  }, [])

  async function openCv(id) {
    setLoading(true)
    setError('')
    try { setCv(await api.cv(id)) }
    catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }

  return <>
    <header className="page-header">
      <strong>CV Copilot</strong>
    </header>
    <main className="page-shell">
      {error && <Notice kind="error">{error}</Notice>}
      {loading && <Notice>Caricamento del curriculum…</Notice>}
      {cv ? <SelectedCv key={cv.id} cv={cv} setCv={setCv} limits={config.limits} onClose={() => setCv(null)} />
        : config && <CvListView limits={config.limits} onOpen={openCv} onRemove={() => {}} />}
    </main>
  </>
}

function SelectedCv({ cv, setCv, limits, onClose }) {
  const [content, setContent] = useState(cv.content)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(null)
  const dirty = JSON.stringify(content) !== JSON.stringify(cv.content)
  const valid = content.sections.every(section => section.title.trim())
    && (content.document_title === undefined || Boolean(content.document_title.trim()))

  async function runDocumentChange(request) {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      const saved = await request()
      setCv(saved)
      setContent(saved.content)
      return true
    } catch (failure) {
      setError(failure)
      return false
    } finally {
      setBusy(false)
    }
  }

  function save(event) {
    event.preventDefault()
    if (dirty && valid) void runDocumentChange(() => api.save(cv.id, content, cv.version_number))
  }

  async function restore(number) {
    const confirmation = dirty
      ? 'Le modifiche non salvate saranno scartate. Ripristinare la versione ' + number + '?'
      : 'Creare una nuova versione a partire dalla versione ' + number + '?'
    if (window.confirm(confirmation) && await runDocumentChange(() => api.restore(cv.id, number, cv.version_number))) {
      setShowHistory(false)
    }
  }

  const notice = error && <Notice kind="error">
    {error.message}{' '}
    {error.code === 'version_conflict' && <button type="button" className="button button-small" disabled={busy}
      onClick={() => {
        if (!dirty || window.confirm('Scartare le modifiche non salvate e ricaricare il CV?')) {
          void runDocumentChange(() => api.cv(cv.id))
        }
      }}>Ricarica CV</button>}
  </Notice>

  return <section className="selected-cv">
    <div className="editor-header">
      <div><h1>{cv.title}</h1><p className="muted">Versione {cv.version_number}</p></div>
      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={() => setShowHistory(true)}>Cronologia</button>
        <button type="button" className="button" disabled={busy} onClick={() => {
          if (!dirty || window.confirm('Scartare le modifiche non salvate?')) onClose()
        }}>I miei CV</button>
      </div>
    </div>
    {!showHistory && notice}
    <form onSubmit={save}>
      <ManualEditor content={content} limits={limits} onChange={setContent} busy={busy} />
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={busy || !dirty || !valid}>
          {busy ? 'Salvataggio…' : 'Salva'}
        </button>
        {dirty && <span className="muted small">Modifiche non salvate</span>}
      </div>
    </form>
    {showHistory && <WorkspaceDialog title="Cronologia" wide busy={busy} notice={notice} onClose={() => setShowHistory(false)}>
      <HistoryView cv={cv} busy={busy} onRestore={restore} />
    </WorkspaceDialog>}
  </section>
}
