import DocumentPanel from './document/DocumentPanel.jsx'
import DraftRecovery from './document/DraftRecovery.jsx'
import ReviewView from './views/ReviewView.jsx'
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Notice } from './components/common.jsx'
import { changeDraft, redoDraft, sameContent, undoDraft } from './document/draft.mjs'
import CvListView from './views/CvListView.jsx'
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
      {cv ? <SelectedCv key={cv.id} cv={cv} setCv={setCv} limits={config.limits} mode={config.llm_mode} configured={config.llm_configured} onClose={() => setCv(null)} />
        : config && <CvListView limits={config.limits} onOpen={openCv} onRemove={() => {}} />}
    </main>
  </>
}

function SelectedCv({ cv, setCv, limits, mode, configured, onClose }) {
  const [pane, setPane] = useState('edit')
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [error, setError] = useState(null)
  const content = draft?.content ?? cv.content
  const dirty = !sameContent(content, cv.content)
  const stale = dirty && draft.baseVersion !== cv.version_number

  function useCurrentCv(current) {
    setCv(current)
    setDraft(previous => previous && previous.baseVersion !== current.version_number
      && sameContent(previous.content, current.content) ? null : previous)
  }

  function recover(nextContent) {
    setDraft(changeDraft(null, cv, nextContent))
    setError(null)
    setShowRecovery(false)
  }

  useEffect(() => {
    if (!dirty) return
    function confirmLeave(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmLeave)
    return () => window.removeEventListener('beforeunload', confirmLeave)
  }, [dirty])

  function discard() {
    if (!window.confirm('Scartare le modifiche non salvate al documento?')) return
    setDraft(null)
    setError(null)
  }
  async function runDocumentChange(request, discardDraft = true) {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      const saved = await request()
      useCurrentCv(saved)
      if (discardDraft) setDraft(null)
      return true
    } catch (failure) {
      if (failure.status === 409) {
        try { useCurrentCv(await api.cv(cv.id)) }
        catch (reloadError) { setError(reloadError); return false }
      }
      setError(failure)
      return false
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (dirty && !stale) void runDocumentChange(() => api.save(cv.id, content, draft.baseVersion))
  }

  async function restore(number) {
    const confirmation = dirty
      ? 'Le modifiche non salvate saranno scartate. Ripristinare la versione ' + number + '?'
      : 'Creare una nuova versione a partire dalla versione ' + number + '?'
    if (window.confirm(confirmation) && await runDocumentChange(() => api.restore(cv.id, number, cv.version_number))) {
      setShowHistory(false)
    }
  }

  const notice = <>
    {error && <Notice kind="error">
      {error.message}{' '}
      {error.status === 409 && <button type="button" className="button button-small" disabled={busy}
        onClick={() => void runDocumentChange(() => api.cv(cv.id), false)}>Ricarica CV</button>}
    </Notice>}
    {stale && <Notice kind="error">
      Il documento è passato dalla versione {draft.baseVersion} alla {cv.version_number} durante la modifica.{' '}
      <button type="button" className="button button-small" disabled={busy}
        onClick={() => { setShowHistory(false); setShowRecovery(true) }}>Confronta e recupera</button>
    </Notice>}
  </>

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
    <DocumentPanel cv={cv} mode={pane} onMode={setPane} content={content} limits={limits}
      busy={busy} dirty={dirty} stale={stale} onChange={(next, group) => setDraft(previous => changeDraft(previous, cv, next, group))}
      onSave={save} onDiscard={discard}
      canUndo={Boolean(draft?.past.length)} canRedo={Boolean(draft?.future.length)}
      onUndo={() => setDraft(undoDraft)} onRedo={() => setDraft(redoDraft)} />
    <ReviewView key={cv.id} cv={cv} limits={limits} mode={mode} configured={configured} documentBusy={busy}
      onReviewSaved={useCurrentCv} />
    {showHistory && <WorkspaceDialog title="Cronologia" wide busy={busy} notice={notice} onClose={() => setShowHistory(false)}>
      <HistoryView cv={cv} busy={busy} onRestore={restore} />
    </WorkspaceDialog>}
    {showRecovery && stale && <WorkspaceDialog title="Recupera la bozza" wide busy={busy} onClose={() => setShowRecovery(false)}>
      <DraftRecovery key={cv.version_number} draft={draft} cv={cv} busy={busy} onRecover={recover} />
    </WorkspaceDialog>}
  </section>
}
