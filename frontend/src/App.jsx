import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Notice } from './components/common.jsx'
import CvListView from './views/CvListView.jsx'

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
      {cv && <button className="button" type="button" onClick={() => setCv(null)}>I miei CV</button>}
    </header>
    <main className="page-shell">
      {error && <Notice kind="error">{error}</Notice>}
      {loading && <Notice>Caricamento del curriculum…</Notice>}
      {cv ? <SelectedCv cv={cv} setCv={setCv} limits={config.limits} />
        : config && <CvListView limits={config.limits} onOpen={openCv} onRemove={() => {}} />}
    </main>
  </>
}

function SelectedCv({ cv }) {
  return <section className="selected-cv">
    <h1>{cv.title}</h1>
    <p>Versione {cv.version_number}</p>
    {cv.content.sections.map(section => <article key={section.id}>
      <h2>{section.title}</h2>
      <p>{section.text}</p>
    </article>)}
  </section>
}
