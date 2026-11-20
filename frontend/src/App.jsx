import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { createSection, Notice } from './components/common.jsx'
import { useModelCatalog } from './components/ModelPicker.jsx'
import WorkspaceDialog from './components/WorkspaceDialog.jsx'
import DocumentPanel from './document/DocumentPanel.jsx'
import DraftRecovery from './document/DraftRecovery.jsx'
import { changeDraft, redoDraft, sameContent, undoDraft } from './document/draft.mjs'
import CvListView from './views/CvListView.jsx'
import HistoryView from './views/HistoryView.jsx'
import ReviewView from './views/ReviewView.jsx'
import './secondary.css'

const lastCvKey = 'cv-copilot:last-cv'
const emptyReview = { sectionId: '', message: '', jobPosting: '', sending: false, requestedModelId: '', error: null, revision: 0 }

function savedCvId() {
  const id = Number(window.localStorage.getItem(lastCvKey))
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">CV</span><span>CV Copilot</span></div>
}

export default function App() {
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')
  const [configReload, setConfigReload] = useState(0)
  const [selectedId, setSelectedId] = useState(savedCvId)
  const [reviews, setReviews] = useState({})
  const reviewRequests = useRef(new Set())
  const modelCatalog = useModelCatalog(config?.llm_mode === 'openrouter' && config.llm_configured === true)

  useEffect(() => {
    const controller = new AbortController()
    api.config(controller.signal).then(setConfig).catch((error) => {
      if (!controller.signal.aborted) setConfigError(error.message)
    })
    return () => controller.abort()
  }, [configReload])

  const closeCv = useCallback(() => {
    window.localStorage.removeItem(lastCvKey)
    setSelectedId(null)
  }, [])

  function openCv(id) {
    window.localStorage.setItem(lastCvKey, id)
    setSelectedId(id)
  }

  function updateReview(id, update) {
    setReviews((previous) => {
      const current = previous[id] ?? emptyReview
      return { ...previous, [id]: { ...current, ...update(current) } }
    })
  }

  async function sendReview(id, body) {
    if (reviewRequests.current.has(id)) return
    reviewRequests.current.add(id)
    updateReview(id, () => ({ sending: true, requestedModelId: body.model_id ?? '', error: null }))
    // La richiesta resta legata al CV e al modello scelti all'invio.
    try {
      await api.sendReview(id, body)
      if (reviewRequests.current.has(id)) {
        updateReview(id, (current) => ({ message: '', sending: false, revision: current.revision + 1 }))
      }
    } catch (error) {
      if (reviewRequests.current.has(id)) {
        updateReview(id, () => ({ error, sending: false }))
        if (error.code === 'model_unavailable') modelCatalog.reload()
      }
    } finally {
      reviewRequests.current.delete(id)
    }
  }

  function forgetReview(id) {
    reviewRequests.current.delete(id)
    setReviews((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  }

  return (
    <>
      <a className="skip-link" href="#main">Vai al contenuto</a>
      {config && selectedId !== null ? (
        <CvWorkspace key={selectedId} id={selectedId} config={config} modelCatalog={modelCatalog}
          review={reviews[selectedId] ?? emptyReview}
          onEditReview={(patch) => updateReview(selectedId, () => ({ ...patch, error: null }))}
          onSendReview={(body) => sendReview(selectedId, body)}
          onRefreshReview={() => updateReview(selectedId, (current) => ({ revision: current.revision + 1, error: null }))}
          onClose={closeCv} />
      ) : (
        <>
          <header className="topbar"><div className="topbar-inner">
            <Brand /><span className="local-label">Uso locale · Monoutente</span>
          </div></header>
          <main className="list-page" id="main" tabIndex="-1">
            {configError && <Notice kind="error">
              {configError}{' '}
              <button type="button" className="button button-small" onClick={() => {
                setConfigError('')
                setConfigReload((value) => value + 1)
              }}>Riprova</button>
            </Notice>}
            {!config && !configError && <Notice>Caricamento dell’applicazione…</Notice>}
            {config && <CvListView limits={config.limits} onRemove={forgetReview} onOpen={openCv} />}
          </main>
        </>
      )}
    </>
  )
}

function CvWorkspace({ id, config, modelCatalog, review, onEditReview, onSendReview, onRefreshReview, onClose }) {
  const [cv, setCv] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [mobilePane, setMobilePane] = useState('chat')
  const [documentMode, setDocumentMode] = useState('pdf')
  const [draft, setDraft] = useState(null)
  const [requestedSectionId, setRequestedSectionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [writing, setWriting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [savedVersion, setSavedVersion] = useState(null)
  const writeLock = useRef(false)
  const contentDirty = Boolean(draft && cv && !sameContent(draft.content, cv.content))
  const busy = writing || loading
  const draftHasOldBase = contentDirty && draft.baseVersion !== cv.version_number

  function useCurrentCv(current) {
    setCv(current)
    setDraft((previous) => previous && previous.baseVersion !== current.version_number
      && sameContent(previous.content, previous.baseContent) ? null : previous)
  }

  const loadCv = useCallback(async (signal) => {
    setLoading(true)
    setLoadError('')
    try {
      const current = await api.cv(id, signal)
      if (!signal?.aborted) useCurrentCv(current)
      return current
    } catch (error) {
      if (!signal?.aborted) {
        if (error.status === 404 && signal) onClose()
        else setLoadError(error.message)
      }
      return null
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [id, onClose])

  useEffect(() => {
    const controller = new AbortController()
    void loadCv(controller.signal)
    return () => controller.abort()
  }, [loadCv])

  useEffect(() => {
    if (!contentDirty) return
    function confirmLeave(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmLeave)
    return () => window.removeEventListener('beforeunload', confirmLeave)
  }, [contentDirty])

  function canLeave() {
    return !writeLock.current && (!contentDirty || window.confirm('Ci sono modifiche non salvate. Vuoi scartarle?'))
  }

  function closeDialog() {
    if (writeLock.current) return
    setDialog(null)
  }

  function openDialog(name) {
    setFeedback(null)
    setDialog(name)
  }

  function addFirstSection() {
    const content = draft?.content ?? cv.content
    const profile = content.sections[0] ?? createSection('summary')
    if (content.sections.length === 0) changeContent({ ...content, sections: [profile] })
    setRequestedSectionId(profile.id)
    editDocument()
  }

  function editDocument() {
    setDocumentMode('edit')
    setMobilePane('pdf')
  }

  function changeContent(content, group) {
    setSavedVersion(null)
    setDraft((previous) => {
      const matchesCurrent = previous && previous.baseVersion !== cv.version_number && sameContent(previous.content, cv.content)
      return changeDraft(matchesCurrent ? null : previous, cv, content, group)
    })
  }

  async function reload() {
    if (busy) return
    const current = await loadCv()
    if (current) {
      setFeedback(null)
      onRefreshReview()
    }
  }

  async function runChange(action, { done, refreshChat = false } = {}) {
    if (busy || writeLock.current) return
    writeLock.current = true
    setWriting(true)
    setFeedback(null)
    setLoadError('')
    try {
      const result = await action()
      if (result.content) useCurrentCv(result)
      else await loadCv()
      if (refreshChat) onRefreshReview()
      done?.(result)
    } catch (error) {
      if (error.status === 409) {
        await loadCv()
        onRefreshReview()
      }
      setFeedback({ message: error.message, conflict: error.status === 409 })
    } finally {
      writeLock.current = false
      setWriting(false)
    }
  }

  function saveContent() {
    if (!contentDirty || draftHasOldBase || feedback?.conflict) return
    void runChange(() => api.save(id, draft.content, draft.baseVersion), {
      done: (saved) => {
        setDraft(null)
        setSavedVersion(saved.version_number)
      },
    })
  }

  function discardContent() {
    if (!window.confirm('Scartare le modifiche non salvate al documento?')) return
    setDraft(null)
    setFeedback(null)
  }

  function recoverContent(content) {
    setDraft(changeDraft(null, cv, content))
    setFeedback(null)
    setDialog(null)
  }

  const notice = <>
    {(loadError || feedback) && <Notice kind="error">
      {loadError || feedback.message}{' '}
      {(loadError || feedback?.conflict) && <button type="button" className="button button-small" disabled={busy}
        onClick={reload}>Ricarica CV</button>}
    </Notice>}
    {draftHasOldBase && <Notice kind="error">
      La tua bozza parte dalla versione {draft.baseVersion}. Ora è salvata la versione {cv.version_number}.{' '}
      <button type="button" className="button button-small" disabled={busy} onClick={() => openDialog('recovery')}>
        Confronta e recupera
      </button>
    </Notice>}
  </>

  return (
    <div className="cv-workspace">
      <header className="topbar workspace-topbar"><div className="topbar-inner">
        <div className="header-context">
          <Brand />
          <button type="button" className="button library-button" disabled={writing}
            onClick={() => { if (canLeave()) onClose() }}>I miei CV</button>
          {cv && <h1 className="current-title" title={cv.title}>{cv.title}</h1>}
        </div>
        {cv && <div className="header-actions">
          <button type="button" className="button" disabled={busy} onClick={() => openDialog('history')}>Cronologia</button>
        </div>}
      </div></header>
      <main className="workspace-main" id="main" tabIndex="-1">
        {!cv && loading && <Notice>Caricamento del CV…</Notice>}
        {!dialog && (loadError || feedback || draftHasOldBase) && notice}
        {cv && <>
          <div className="mobile-tabs" aria-label="Pannello di lavoro" role="group">
            <button type="button" aria-pressed={mobilePane === 'chat'} onClick={() => setMobilePane('chat')}>Chat</button>
            <button type="button" aria-pressed={mobilePane === 'pdf'} onClick={() => setMobilePane('pdf')}>Documento</button>
          </div>
          <div className="work-panes" data-mobile-pane={mobilePane}>
            <ReviewView cv={cv} config={config} modelCatalog={modelCatalog} review={review}
              busy={busy} onEdit={onEditReview} onSend={onSendReview}
              hasDraftSections={Boolean(draft?.content.sections.length)}
              onReload={reload} onAddFirstSection={addFirstSection}
              onResolve={(proposalId, decision) => runChange(() => api.resolveProposal(id, proposalId, decision), { refreshChat: true })} />
            <DocumentPanel cv={cv} mode={documentMode} onMode={setDocumentMode}
              content={draft?.content ?? cv.content} limits={config.limits} busy={busy}
              dirty={contentDirty} stale={draftHasOldBase || feedback?.conflict} savedVersion={savedVersion}
              onChange={changeContent} onSave={saveContent} onDiscard={discardContent}
              canUndo={Boolean(draft?.past.length)} canRedo={Boolean(draft?.future.length)}
              onUndo={() => { setSavedVersion(null); setDraft(undoDraft) }} onRedo={() => setDraft(redoDraft)}
              requestedSectionId={requestedSectionId} />
          </div>
        </>}
      </main>
      {dialog === 'history' && <WorkspaceDialog title="Cronologia" onClose={closeDialog} notice={notice} busy={writing} wide>
        <HistoryView cv={cv} busy={busy} onRestore={(number) => {
          if (window.confirm(`Creare una nuova versione a partire dalla versione ${number}?`)) {
            void runChange(() => api.restore(id, number, cv.version_number), { done: () => setDialog(null) })
          }
        }} />
      </WorkspaceDialog>}
      {dialog === 'recovery' && draftHasOldBase && <WorkspaceDialog title="Recupera la bozza" onClose={closeDialog} busy={writing} wide>
        <DraftRecovery key={`${draft.baseVersion}:${cv.version_number}`} draft={draft} cv={cv} busy={busy} onRecover={recoverContent} />
      </WorkspaceDialog>}
    </div>
  )
}
