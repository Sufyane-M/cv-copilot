import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { DateTime, Notice, sectionTypes } from '../components/common.jsx'

const origins = {
  creation: 'Creazione',
  manual: 'Salvataggio manuale',
  restore: 'Ripristino',
}

function VersionContents({ number, label, content, archiveTitle }) {
  return (
    <article className="history-snapshot">
      <h3>Versione {number}<span className="muted"> · {label}</span></h3>
      <p className="small"><strong>{content.document_title ?? archiveTitle}</strong></p>
      {content.sections.length === 0 && <p className="muted">CV vuoto</p>}
      {content.sections.map((section) => (
        <section key={section.id}>
          <h4>{section.title || sectionTypes[section.type]}</h4>
          <p className="document-text">{section.text}</p>
        </section>
      ))}
    </article>
  )
}

export default function HistoryView({ cv, busy, onRestore }) {
  const [versions, setVersions] = useState(null)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [listError, setListError] = useState('')
  const [snapshotError, setSnapshotError] = useState('')
  const [listReload, setListReload] = useState(0)
  const [snapshotReload, setSnapshotReload] = useState(0)
  const selectedNumber = selectedVersion ?? cv.version_number
  const isCurrent = selectedNumber === cv.version_number

  useEffect(() => {
    const controller = new AbortController()
    api.versions(cv.id, controller.signal).then((result) => {
      setVersions(result)
      setListError('')
    }).catch((error) => {
      if (error.name !== 'AbortError') setListError(error.message)
    })
    return () => controller.abort()
  }, [cv.id, cv.version_number, listReload])

  useEffect(() => {
    if (isCurrent) return
    const controller = new AbortController()
    api.version(cv.id, selectedNumber, controller.signal).then(setSnapshot).catch((error) => {
      if (error.name !== 'AbortError') setSnapshotError(error.message)
    })
    return () => controller.abort()
  }, [cv.id, isCurrent, selectedNumber, snapshotReload])

  function selectVersion(number) {
    if (number === selectedNumber) return
    setSnapshot(null)
    setSnapshotError('')
    setSelectedVersion(number === cv.version_number ? null : number)
  }

  const historical = !isCurrent && snapshot?.number === selectedNumber ? snapshot : null

  return (
    <div className="history-view">
      <div className="history-sidebar" aria-label="Versioni disponibili">
        {listError && <Notice kind="error">
          {listError}{' '}
          <button type="button" className="button button-small" onClick={() => {
            setListError('')
            setListReload((value) => value + 1)
          }}>Riprova</button>
        </Notice>}
        {!versions && !listError && <p className="muted" role="status">Caricamento delle versioni…</p>}
        {versions && <ol className="history-versions">
          {versions.map((version) => (
            <li key={version.number}>
              <button type="button" className="history-version" aria-pressed={selectedNumber === version.number}
                aria-current={version.number === cv.version_number ? 'true' : undefined}
                onClick={() => selectVersion(version.number)}>
                <strong>Versione {version.number}</strong>
                {version.number === cv.version_number && <span className="history-current-marker">Corrente</span>}
                <span className="history-version-origin">{origins[version.origin]}
                  {version.restored_from_number && <> · da v{version.restored_from_number}</>}
                </span>
                <span className="muted"><DateTime value={version.created_at} /></span>
              </button>
            </li>
          ))}
        </ol>}
      </div>
      <div className="history-reading">
        {snapshotError && <Notice kind="error">
          {snapshotError}{' '}
          <button type="button" className="button button-small" onClick={() => {
            setSnapshotError('')
            setSnapshotReload((value) => value + 1)
          }}>Riprova</button>
        </Notice>}
        {!isCurrent && !historical && !snapshotError && <p className="muted" role="status">Caricamento della versione…</p>}
        {historical && <div className="history-restore">
          <p className="muted small">Il ripristino crea una nuova versione.</p>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => onRestore(historical.number)}>
            Ripristina
          </button>
        </div>}
        {(isCurrent || historical) && <div className={`history-comparison${historical ? ' history-comparison-pair' : ''}`}>
          {historical && <VersionContents number={historical.number} label="Storica" content={historical.content} archiveTitle={cv.title} />}
          <VersionContents number={cv.version_number} label="Corrente" content={cv.content} archiveTitle={cv.title} />
        </div>}
      </div>
    </div>
  )
}
