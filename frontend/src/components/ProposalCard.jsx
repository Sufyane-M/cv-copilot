import { Fragment, useState } from 'react'
import { diffWordsWithSpace } from 'diff'

const statusLabels = {
  pending: 'Da approvare',
  accepted: 'Accettata',
  rejected: 'Rifiutata',
  obsolete: 'Obsoleta',
}

function TextDiff({ before, after }) {
  return (
    <div className="proposal-diff">
      <p className="proposal-legend"><del>Rimozione</del> <ins>Aggiunta</ins></p>
      <p className="chat-text">
        {diffWordsWithSpace(before, after).map((part, index) => {
          if (part.added) return <ins key={index}><span className="sr-only">Aggiunta </span>{part.value}</ins>
          if (part.removed) return <del key={index}><span className="sr-only">Rimozione </span>{part.value}</del>
          return <Fragment key={index}>{part.value}</Fragment>
        })}
      </p>
    </div>
  )
}

function ProposalComparison({ proposal }) {
  const [sideBySide, setSideBySide] = useState(false)

  return (
    <>
      <p className="proposal-reason chat-text">{proposal.reason}</p>
      <div className="proposal-modes" role="group" aria-label="Modalità di confronto">
        <button type="button" aria-pressed={!sideBySide} onClick={() => setSideBySide(false)}>Differenze</button>
        <button type="button" aria-pressed={sideBySide} onClick={() => setSideBySide(true)}>Prima / Dopo</button>
      </div>
      {sideBySide ? (
        <div className="proposal-before-after">
          <div><h4>Prima</h4><p className="chat-text">{proposal.old_text || 'Testo vuoto'}</p></div>
          <div><h4>Dopo</h4><p className="chat-text">{proposal.new_text}</p></div>
        </div>
      ) : <TextDiff before={proposal.old_text} after={proposal.new_text} />}
    </>
  )
}

export default function ProposalCard({ proposal, reply, disabled, onResolve }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const pending = proposal.status === 'pending'
  const status = pending && proposal.obsolete ? 'obsolete' : proposal.status

  if (!pending) {
    return (
      <details className="proposal-card proposal-resolved" onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>
          <span className="proposal-section">{proposal.section_title}</span>
          <span className={`proposal-status proposal-status-${status}`}>
            <span>{statusLabels[status]}</span>
            {status === 'accepted' && <span> · v{proposal.applied_version_number}</span>}
          </span>
          <span className="proposal-disclosure" aria-hidden="true" />
        </summary>
        {detailsOpen && (
          <div className="proposal-details">
            <p className="chat-text">{reply}</p>
            <ProposalComparison proposal={proposal} />
          </div>
        )}
      </details>
    )
  }

  return (
    <article className="proposal-card proposal-active">
      <header className="proposal-heading">
        <h3>{proposal.section_title}</h3>
        <span className={`proposal-status proposal-status-${status}`}>{statusLabels[status]}</span>
      </header>
      <ProposalComparison proposal={proposal} />
      {status === 'obsolete' && (
        <p className="proposal-obsolete">Il CV è cambiato. Chiedi una nuova revisione per poterla applicare.</p>
      )}
      <div className="proposal-actions">
        <button type="button" className="button button-small button-primary" disabled={disabled || status === 'obsolete'}
          onClick={() => onResolve(proposal.id, 'accept')}>Accetta</button>
        <button type="button" className="button button-small" disabled={disabled}
          onClick={() => onResolve(proposal.id, 'reject')}>Rifiuta</button>
      </div>
    </article>
  )
}
