import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { Notice } from './common.jsx'

export function useCvPdf(cv, draft, enabled) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const id = cv.id
  // La revisione salvata include il titolo e la data per intercettare anche una rinomina.
  const revision = JSON.stringify([id, cv.version_number, cv.updated_at, cv.title])
  const snapshot = useMemo(() => ({ id, revision, draft }), [id, revision, draft])
  const latestSnapshot = useRef(snapshot)

  useLayoutEffect(() => { latestSnapshot.current = snapshot }, [snapshot])

  useEffect(() => {
    if (!enabled) {
      setResult(null)
      return
    }
    // Cattura il documento all'apertura o all'aggiornamento, senza rigenerarlo mentre cambia la bozza.
    const requested = latestSnapshot.current
    const controller = new AbortController()
    const signal = controller.signal
    let url
    setResult({ snapshot: requested, attempt, loading: true })
    const request = requested.draft
      ? api.previewPdf(requested.id, requested.draft, signal)
      : api.pdf(requested.id, signal)
    request.then(({ blob, version }) => {
      if (signal.aborted || latestSnapshot.current !== requested) return
      url = URL.createObjectURL(blob)
      setResult({ snapshot: requested, attempt, url, version })
    }).catch((error) => {
      if (!signal.aborted && latestSnapshot.current === requested) {
        setResult({ snapshot: requested, attempt, error: error.message })
      }
    })
    // Anteprima e download condividono questo URL e la sua durata.
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [enabled, revision, attempt])

  const response = enabled && result?.attempt === attempt ? result : null
  const stale = Boolean(response && response.snapshot !== snapshot)
  return {
    ...(stale ? null : response),
    stale,
    loading: enabled && !stale && (!response || Boolean(response.loading)),
    refresh: () => setAttempt((value) => value + 1),
  }
}

export function pdfFilename(title, draft) {
  const name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').trim().replace(/[. ]+$/, '')
  return `${name || 'Curriculum'}${draft ? ' - bozza' : ''}.pdf`
}

export default function PdfPreview({ pdf, filename, draft }) {
  const inline = navigator.pdfViewerEnabled !== false
  return (
      <div className="pdf-stage" aria-busy={pdf.loading}>
        {pdf.stale && <p className="pdf-placeholder" role="status">Anteprima da aggiornare. Il documento è cambiato.</p>}
        {pdf.error && <div className="pdf-placeholder">
          <Notice kind="error">Impossibile caricare il PDF. {pdf.error}</Notice>
        </div>}
        {pdf.loading && <p className="pdf-placeholder" role="status">Generazione del PDF…</p>}
        {pdf.url && inline && <iframe className="pdf-frame" title={draft ? 'PDF della bozza' : 'PDF della versione salvata'}
          src={`${pdf.url}#toolbar=0&navpanes=0&view=FitH`} />}
        {pdf.url && !inline && <div className="pdf-placeholder">
          <p>L’anteprima integrata non è disponibile in questo browser.</p>
          <a className="button" href={pdf.url} download={filename}>Scarica il documento</a>
        </div>}
      </div>
  )
}
