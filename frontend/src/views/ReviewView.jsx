import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import ModelPicker from '../components/ModelPicker.jsx'
import ProposalCard from '../components/ProposalCard.jsx'
import '../chat.css'

const suggestions = [
  'Rendi il testo più chiaro',
  'Rendi il testo più conciso',
  'Metti in risalto le competenze',
]

function ModelAttribution({ message }) {
  if (message.llm_mode === 'mock') return <span className="chat-model-id">Demo</span>
  if (!message.llm_mode) return <span className="chat-model-id">Modello non registrato</span>
  const { actual_model_id: actualId, requested_model_id: requestedId } = message
  return (
    <>
      {(actualId || requestedId) && <span className="chat-model-id">{actualId || requestedId}</span>}
      {actualId && requestedId && actualId !== requestedId && <span className="chat-model-id">Richiesto {requestedId}</span>}
    </>
  )
}

export default function ReviewView({ cv, config, modelCatalog, review, busy, hasDraftSections, onEdit, onSend, onResolve, onReload, onAddFirstSection }) {
  const [chat, setChat] = useState(null)
  const [chatError, setChatError] = useState('')
  const conversation = useRef(null)
  const composer = useRef(null)
  const followLatest = useRef(true)
  const { sections } = cv.content
  const section = sections.find((item) => item.id === review.sectionId)
    ?? sections.find((item) => item.type === 'summary')
    ?? sections[0]
  const messageCount = chat?.messages.length
  const isDemo = config.llm_mode === 'mock'
  const isOpenRouter = config.llm_mode === 'openrouter'
  const modelId = modelCatalog.model?.id
  const readyModel = isDemo || (isOpenRouter && config.llm_configured && modelId)
  const newerCvAvailable = chat !== null && chat.version_number > cv.version_number
  const emptyChatMessage = hasDraftSections ? 'Salva il documento per avviare la revisione.' : 'Il messaggio resta nella chat mentre compili il CV.'
  const proposalActionsDisabled = busy || chat?.version_number !== cv.version_number
  const composerLocked = busy || newerCvAvailable || review.error?.status === 409 || review.sending
  const canSend = Boolean(section && readyModel && !composerLocked && review.message.trim())

  useEffect(() => {
    const controller = new AbortController()
    api.chat(cv.id, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setChat(data)
      setChatError('')
    }).catch((error) => {
      if (!controller.signal.aborted) setChatError(error.message)
    })
    return () => controller.abort()
  }, [cv.id, cv.version_number, review.revision])

  function scrollToLatest() {
    const viewport = conversation.current
    if (followLatest.current && viewport?.clientHeight) viewport.scrollTop = viewport.scrollHeight
  }

  useLayoutEffect(scrollToLatest, [messageCount, review.sending])

  useEffect(() => {
    // Quando su mobile riappare la chat, recupera la coda solo se l'utente la stava seguendo.
    const viewport = conversation.current
    const observer = new ResizeObserver(scrollToLatest)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  function trackScroll(event) {
    const viewport = event.currentTarget
    if (viewport.clientHeight) {
      followLatest.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 56
    }
  }

  function refresh() {
    setChatError('')
    onReload()
  }

  function fillMessage(message) {
    onEdit({ message })
    composer.current?.focus()
  }

  function submit(event) {
    event.preventDefault()
    if (!canSend) return
    followLatest.current = true
    onSend({
      section_id: section.id,
      expected_version: cv.version_number,
      message: review.message.trim(),
      job_posting: review.jobPosting.trim(),
      ...(isOpenRouter ? { model_id: modelId } : {}),
    })
  }

  function handleComposerKey(event) {
    if (section && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      submit(event)
    }
  }

  const proposals = new Map(chat?.proposals.map((proposal) => [proposal.message_id, proposal]))

  return (
    <section className="chat-panel" aria-labelledby="chat-heading">
      <header className="chat-heading">
        <h2 id="chat-heading">Revisione AI</h2>
        {isDemo && (
          <span className="chat-demo" title="La demo applica regole al testo scelto, senza interpretare la domanda o l’annuncio.">
            Demo · risposte simulate
          </span>
        )}
        {isOpenRouter && <span className="chat-demo">OpenRouter</span>}
        {(isDemo || isOpenRouter) && <ModelPicker catalog={modelCatalog} demo={isDemo} configured={config.llm_configured}
          sending={review.sending} requestedId={review.requestedModelId} />}
      </header>

      <div className="chat-conversation" ref={conversation} onScroll={trackScroll}
        tabIndex={0} role="region" aria-label="Conversazione">
        {chatError && (
          <div className="chat-alert" role="alert">
            <span>{chatError}</span>
            <button type="button" className="button button-small" onClick={refresh} disabled={busy}>Ricarica chat</button>
          </div>
        )}
        {!chat && !chatError && <p className="chat-loading" role="status">Caricamento della conversazione…</p>}
        {chat && messageCount === 0 && !review.sending && (
          <div className="chat-empty">
            <h3>{section ? 'Rivedi una sezione del CV' : 'Prepara la tua richiesta'}</h3>
            <p>{!section ? emptyChatMessage : isDemo
              ? 'Prova a chiedere una revisione. La demo applica modifiche predefinite al testo scelto.'
              : 'Chiedi una riscrittura mirata, poi confronta la proposta con il testo attuale.'}</p>
            {section && (
              <div className="chat-suggestions" role="group" aria-label="Esempi di richieste">
                {suggestions.map((message) => (
                  <button key={message} type="button" className="chat-suggestion" onClick={() => fillMessage(message)}>{message}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <ol className="chat-messages">
          {chat?.messages.map((message) => {
            const proposal = proposals.get(message.id)
            const compact = proposal && proposal.status !== 'pending'
            return (
              <li className={`chat-message chat-message-${message.role}`} key={message.id}>
                <div className="chat-author">
                  <strong>{message.role === 'user' ? 'Tu' : 'Copilot'}</strong>
                  {message.role === 'user' && <span>{message.section_title}</span>}
                  {message.role === 'assistant' && <ModelAttribution message={message} />}
                </div>
                {!compact && <p className="chat-text">{message.text}</p>}
                {message.job_posting && (
                  <details className="chat-attachment">
                    <summary>Annuncio allegato</summary>
                    <p className="chat-text">{message.job_posting}</p>
                  </details>
                )}
                {proposal && (
                  <ProposalCard proposal={proposal} reply={message.text} disabled={proposalActionsDisabled} onResolve={onResolve} />
                )}
              </li>
            )
          })}
          {review.sending && (
            <>
              <li className="chat-message chat-message-user">
                <div className="chat-author"><strong>Tu</strong><span>{section?.title}</span></div>
                <p className="chat-text">{review.message}</p>
              </li>
              <li className="chat-generating" role="status">
                <span className="chat-generating-dot" aria-hidden="true" />Preparazione della risposta…
                {review.requestedModelId && <span className="chat-model-id">{review.requestedModelId}</span>}
              </li>
            </>
          )}
        </ol>
      </div>

      <form className="chat-composer" onSubmit={submit} aria-busy={review.sending}>
        {newerCvAvailable && (
          <div className="chat-alert" role="alert">
            <span>Il CV è cambiato. Aggiornalo per continuare.</span>
            <button type="button" className="button button-small" onClick={refresh} disabled={busy}>Ricarica CV e chat</button>
          </div>
        )}
        {review.error && !newerCvAvailable && (
          <div className="chat-alert" role="alert">
            <span>{review.error.message}</span>
            {review.error.status === 409 && (
              <button type="button" className="button button-small" onClick={refresh} disabled={busy}>Ricarica CV e chat</button>
            )}
          </div>
        )}
        {!section ? (
          <div className="chat-composer-options">
            <p id="review-first-section-hint">{hasDraftSections ? 'Salva la bozza per inviare richieste AI.' : 'Per inviare, scrivi e salva la prima sezione.'}</p>
            {!hasDraftSections && <button type="button" className="button button-small" disabled={busy} onClick={onAddFirstSection}>Aggiungi Profilo</button>}
          </div>
        ) : (
          <div className="chat-composer-options">
            <div className="chat-section-picker">
              <label htmlFor="review-section">Sezione</label>
              <select id="review-section" aria-label="Sezione da revisionare" value={section.id}
                onChange={(event) => onEdit({ sectionId: event.target.value })} disabled={composerLocked}>
                {sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
            <details className="chat-job">
              <summary>
                {review.jobPosting.trim() ? 'Annuncio incluso' : 'Annuncio di lavoro'}
                <span className="chat-job-indicator" aria-hidden="true" />
              </summary>
              <div className="chat-job-fields">
                <label htmlFor="review-posting">Testo dell’annuncio</label>
                <textarea id="review-posting" rows={3} maxLength={config.limits.job_posting} value={review.jobPosting}
                  onChange={(event) => onEdit({ jobPosting: event.target.value })} disabled={composerLocked} />
              </div>
            </details>
          </div>
        )}
        <div className="chat-input-row">
          <label className="sr-only" htmlFor="review-message">Messaggio</label>
          <textarea id="review-message" ref={composer} rows={2} maxLength={config.limits.message}
            value={review.sending ? '' : review.message} onChange={(event) => onEdit({ message: event.target.value })}
            placeholder={review.sending ? 'Richiesta in corso…' : 'Scrivi una richiesta…'}
            aria-describedby={section ? 'review-keyboard-hint' : 'review-first-section-hint'}
            onKeyDown={handleComposerKey} readOnly={composerLocked} />
          <button type="submit" className="button button-primary chat-send" disabled={!canSend}>
            {review.error && review.error.status !== 409 ? 'Riprova' : 'Invia'}
            <span aria-hidden="true">↑</span>
          </button>
        </div>
        {section && <p className="chat-keyboard-hint" id="review-keyboard-hint">Invio per inviare · Maiusc+Invio per andare a capo</p>}
      </form>
    </section>
  )
}
