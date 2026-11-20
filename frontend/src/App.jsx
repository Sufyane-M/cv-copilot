import PdfPreview, { useCvPdf, pdfFilename } from './components/PdfPreview.jsx'
import ReviewView from './views/ReviewView.jsx'
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Notice } from './components/common.jsx'
import CvListView from './views/CvListView.jsx'
import ManualEditor from './views/ManualEditor.jsx'
import HistoryView from './views/HistoryView.jsx'
import WorkspaceDialog from './components/WorkspaceDialog.jsx'
import TemplateGallery from './document/TemplateGallery.jsx'
import { getTemplate } from './document/CvDocument.mjs'
import { applyTemplate } from './document/templateSample.mjs'
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
  const [content, setContent] = useState(cv.content)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [error, setError] = useState(null)
  const dirty = JSON.stringify(content) !== JSON.stringify(cv.content)
  const pdf = useCvPdf(cv, dirty ? content : null, pane === 'pdf')
  const filename = pdfFilename(cv.title, dirty)
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
    <div className="actions">
      <button type="button" className="button" aria-pressed={pane === 'edit'} onClick={() => setPane('edit')}>Modifica</button>
      <button type="button" className="button" aria-pressed={pane === 'pdf'} onClick={() => setPane('pdf')}>Anteprima PDF</button>
      <button type="button" className="button" disabled={busy} aria-expanded={showTemplates}
        onClick={() => setShowTemplates(true)}>Template</button>
      <button type="submit" form="cv-content-form" className="button button-primary" disabled={busy || !dirty || !valid}>
        {busy ? 'Salvataggio…' : 'Salva'}
      </button>
      {dirty && pane === 'edit' && <span className="muted small">Modifiche non salvate</span>}
      {pane === 'pdf' && <>
        <button type="button" className="button" onClick={pdf.refresh}>Aggiorna anteprima</button>
        {pdf.url && <a className="button" href={pdf.url} download={filename}>Scarica PDF</a>}
        <span className="muted small">{dirty ? 'Bozza non salvata' : 'Versione salvata'}</span>
      </>}
    </div>
    {pane === 'pdf' && <PdfPreview pdf={pdf} filename={filename} draft={dirty} />}
    <form id="cv-content-form" hidden={pane !== 'edit'} onSubmit={save}>
      <ManualEditor content={content} limits={limits} onChange={setContent} busy={busy} />
    </form>
    <ReviewView key={cv.id} cv={cv} limits={limits} mode={mode} configured={configured} documentBusy={busy || dirty}
      onReviewSaved={current => { setCv(current); setContent(current.content) }} />
    {showTemplates && <TemplateGallery selectedId={getTemplate(content.design?.templateId).id}
      empty={content.sections.length === 0} onClose={() => setShowTemplates(false)}
      onSelect={(template, portrait) => {
        setContent(applyTemplate(content, template, portrait))
        setPane('pdf')
        pdf.refresh()
        setShowTemplates(false)
      }} />}
    {showHistory && <WorkspaceDialog title="Cronologia" wide busy={busy} notice={notice} onClose={() => setShowHistory(false)}>
      <HistoryView cv={cv} busy={busy} onRestore={restore} />
    </WorkspaceDialog>}
  </section>
}
