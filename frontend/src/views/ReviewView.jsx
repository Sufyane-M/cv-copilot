import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Notice } from '../components/common.jsx'

export default function ReviewView({ cv, limits }) {
  const [chat, setChat] = useState(null)
  const [sectionId, setSectionId] = useState('')
  const [message, setMessage] = useState('')
  const [jobPosting, setJobPosting] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const sections = cv.content.sections
  const section = sections.find(item => item.id === sectionId) ?? sections[0]

  useEffect(() => {
    const controller = new AbortController()
    api.chat(cv.id, controller.signal).then(setChat).catch(failure => {
      if (failure.name !== 'AbortError') setError(failure.message)
    })
    return () => controller.abort()
  }, [cv.id, cv.version_number])

  async function submit(event) {
    event.preventDefault()
    if (!section || sending || !message.trim()) return
    setSending(true)
    setError('')
    try {
      const updated = await api.sendReview(cv.id, {
        section_id: section.id,
        expected_version: cv.version_number,
        message: message.trim(),
        job_posting: jobPosting.trim(),
      })
      setChat(updated)
      setMessage('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSending(false)
    }
  }

  return <section className="review-stage" aria-label="Revisione AI">
    <h2>Revisione AI</h2>
    <p className="small muted">Demo · risposte simulate</p>
    {error && <Notice kind="error">{error}</Notice>}
    {chat?.messages.map(item => <article key={item.id}>
      <strong>{item.role === 'user' ? 'Tu' : 'Copilot'}</strong><p>{item.text}</p>
    </article>)}
    {section ? <form onSubmit={submit}>
      <label>Sezione da revisionare
        <select value={section.id} disabled={sending} onChange={event => setSectionId(event.target.value)}>
          {sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <details><summary>Annuncio di lavoro</summary>
        <textarea aria-label="Annuncio di lavoro" value={jobPosting} maxLength={limits.job_posting}
          onChange={event => setJobPosting(event.target.value)} />
      </details>
      <textarea aria-label="Messaggio" value={message} maxLength={limits.message} disabled={sending}
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) void submit(event) }} />
      <button className="button button-primary" type="submit" disabled={sending || !message.trim()}>
        {sending ? 'In elaborazione…' : 'Invia'}
      </button>
    </form> : <p>Aggiungi e salva una sezione per chiedere una revisione.</p>}
  </section>
}
