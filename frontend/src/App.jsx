import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Notice } from './components/common.jsx'
import CvListView from './views/CvListView.jsx'
import ManualEditor from './views/ManualEditor.jsx'

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
  const [error, setError] = useState('')
  const dirty = JSON.stringify(content) !== JSON.stringify(cv.content)
  const valid = content.sections.every(section => section.title.trim())
    && (content.document_title === undefined || Boolean(content.document_title.trim()))

  async function save(event) {
    event.preventDefault()
    if (busy || !dirty || !valid) return
    setBusy(true)
    setError('')
    try {
      const saved = await api.save(cv.id, content, cv.version_number)
      setCv(saved)
      setContent(saved.content)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="selected-cv">
    <div className="editor-header">
      <div><h1>{cv.title}</h1><p className="muted">Versione {cv.version_number}</p></div>
      <button type="button" className="button" disabled={busy} onClick={() => {
        if (!dirty || window.confirm('Scartare le modifiche non salvate?')) onClose()
      }}>I miei CV</button>
    </div>
    {error && <Notice kind="error">{error}</Notice>}
    <form onSubmit={save}>
      <ManualEditor content={content} limits={limits} onChange={setContent} busy={busy} />
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={busy || !dirty || !valid}>
          {busy ? 'Salvataggio…' : 'Salva'}
        </button>
        {dirty && <span className="muted small">Modifiche non salvate</span>}
      </div>
    </form>
  </section>
}
