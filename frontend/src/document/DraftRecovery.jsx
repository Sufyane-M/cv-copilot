import { useState } from 'react'
import { compareSavedTexts, copyStyle, onlyStyleChanged, recoverDraftText } from './draft.mjs'
import { getTemplate } from './CvDocument.mjs'

function DocumentSummary({ title, content }) {
  const template = getTemplate(content.design?.templateId)
  return <section className="recovery-content">
    <h3>{title}</h3>
    <p className="muted small">Template {template.name}</p>
    {content.sections.map(section => <details key={section.id}>
      <summary>{section.title}</summary>
      <p className="document-text">{section.text}</p>
    </details>)}
  </section>
}

export default function DraftRecovery({ draft, cv, busy, onRecover }) {
  const [choices, setChoices] = useState({})
  const updates = compareSavedTexts(draft, cv.content)

  if (updates === null) {
    return <div className="draft-recovery">
      <p>La versione salvata è cambiata anche nella struttura o nelle impostazioni. Puoi confrontare le sezioni e scegliere quale bozza usare al prossimo salvataggio.</p>
      <div className="recovery-pair">
        <DocumentSummary title="Bozza originale" content={draft.content} />
        <DocumentSummary title={`Versione salvata ${cv.version_number}`} content={cv.content} />
      </div>
      <div className="actions">
        {onlyStyleChanged(draft) && <button type="button" className="button button-primary" disabled={busy}
          onClick={() => onRecover(copyStyle(cv.content, draft.content.design))}>Mantieni lo stile della bozza</button>}
        <button type="button" className="button" disabled={busy}
          onClick={() => onRecover(draft.content)}>Usa tutta la bozza</button>
      </div>
      <p className="muted small">Salvare tutta la bozza sostituirà il documento corrente.</p>
    </div>
  }

  const recovered = recoverDraftText(draft, updates, choices)
  const hasConflict = updates.some(update => update.conflict)
  return <div className="draft-recovery">
    <p>{hasConflict ? 'Hai cambiato almeno una sezione aggiornata anche nella versione salvata. Scegli il testo da tenere per ciascun conflitto.'
      : 'Puoi riprendere le modifiche manuali e lo stile della tua bozza insieme ai testi aggiornati.'}</p>
    {updates.map(({ saved, local, conflict }) => <details className="recovery-content" key={saved.id} open={conflict || undefined}>
      <summary>{saved.title}{conflict ? ' · Conflitto' : ' · Testo aggiornato'}</summary>
      <div className="recovery-pair">
        <div><h3>Bozza originale</h3><p className="document-text">{local?.text ?? 'Sezione rimossa nella bozza'}</p></div>
        <div><h3>Versione salvata {cv.version_number}</h3><p className="document-text">{saved.text}</p></div>
      </div>
      {conflict && <fieldset className="recovery-choices">
        <legend>Testo da usare per «{saved.title}»</legend>
        <label><input type="radio" name={`recover-${saved.id}`} checked={choices[saved.id] === 'draft'}
          onChange={() => setChoices(previous => ({ ...previous, [saved.id]: 'draft' }))} />
          {local ? 'Usa il testo della bozza' : 'Mantieni la rimozione'}</label>
        <label><input type="radio" name={`recover-${saved.id}`} checked={choices[saved.id] === 'saved'}
          onChange={() => setChoices(previous => ({ ...previous, [saved.id]: 'saved' }))} /> Usa il testo salvato</label>
      </fieldset>}
    </details>)}
    <div className="actions">
      <button type="button" className="button button-primary" disabled={busy || !recovered}
        onClick={() => onRecover(recovered)}>Recupera modifiche nella bozza</button>
    </div>
    <p className="muted small">Puoi chiudere il confronto per riprendere la bozza originale. Il recupero si salva con il normale pulsante Salva.</p>
  </div>
}
