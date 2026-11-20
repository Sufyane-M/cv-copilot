import { useState } from 'react'
import PdfPreview, { pdfFilename, useCvPdf } from '../components/PdfPreview.jsx'
import VisualEditor from './VisualEditor.jsx'
import TemplateGallery from './TemplateGallery.jsx'
import { resolveDesign } from './CvDocument.mjs'
import { applyTemplate } from './templateSample.mjs'
import './panel.css'

export default function DocumentPanel({
  cv, mode, onMode, content, limits, busy, dirty, stale, onChange, onSave, onDiscard, canUndo, canRedo, onUndo, onRedo,
}) {
  const [showTemplates, setShowTemplates] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const pdf = useCvPdf(cv, dirty ? content : null, mode === 'pdf')
  const filename = pdfFilename((dirty ? content : cv.content).document_title ?? cv.title, dirty)
  const downloadLabel = dirty ? 'Scarica bozza PDF' : 'Scarica PDF'
  const design = resolveDesign(content.design)
  const valid = (content.document_title === undefined || Boolean(content.document_title.trim()))
    && content.sections.every((section) => section.title.trim())

  function selectTemplate(template, portrait) {
    onChange(applyTemplate(content, template, portrait))
    onMode('edit')
    setShowTemplates(false)
  }

  return (
    <section className="pdf-panel document-panel" aria-label="Documento A4">
      <div className="document-toolbar">
        <div className="document-mode" role="group" aria-label="Modalità documento">
          <button type="button" aria-pressed={mode === 'edit'} onClick={() => onMode('edit')}>Modifica</button>
          <button type="button" aria-pressed={mode === 'pdf'} disabled={processingPhoto} onClick={() => onMode('pdf')}>Anteprima PDF</button>
        </div>
        <div className="document-actions">
          <button type="button" className="button button-small" aria-expanded={showTemplates}
            disabled={busy || processingPhoto} onClick={() => setShowTemplates(!showTemplates)}>Template</button>
          <button type="button" className="button button-small" aria-expanded={mode === 'edit' && inspectorOpen}
            disabled={busy} onClick={() => {
              setInspectorOpen(mode !== 'edit' || !inspectorOpen)
              onMode('edit')
            }}>Personalizza</button>
          <button type="button" className="button button-small button-primary"
            onClick={onSave} disabled={busy || processingPhoto || !dirty || stale || !valid}>Salva</button>
          {pdf.url
            ? <a className="button button-small" href={pdf.url} download={filename}>{downloadLabel}</a>
            : <button type="button" className="button button-small" disabled
              title="Apri un’anteprima aggiornata per scaricare il PDF">{downloadLabel}</button>}
        </div>
      </div>
      <div className="document-status">
        <span className={`current-version${dirty ? ' document-dirty' : ''}`}>
          {dirty ? 'Bozza non salvata' : `Versione salvata · v${pdf.version ?? cv.version_number}`}
        </span>
        <span role="status" className={dirty ? 'document-dirty' : 'muted'}>
          {processingPhoto ? 'Elaborazione della foto…'
            : ''}
          {!valid && ' · Compila i titoli prima di salvare'}
        </span>
        {mode === 'edit' && <div className="document-history-actions">
          <button type="button" className="button button-small" onClick={onUndo} disabled={!canUndo || busy || processingPhoto}>Annulla</button>
          <button type="button" className="button button-small" onClick={onRedo} disabled={!canRedo || busy || processingPhoto}>Ripeti</button>
          {dirty && <button type="button" className="button button-small" disabled={busy || processingPhoto} onClick={onDiscard}>Scarta bozza</button>}
        </div>}
        {mode === 'pdf' && <div className="document-history-actions">
          <button type="button" className="button button-small" disabled={pdf.loading} onClick={pdf.refresh}>Aggiorna anteprima</button>
          {pdf.url && <a className="icon-link" href={pdf.url} target="_blank" rel="noreferrer"
            aria-label="Apri il PDF in una nuova scheda" title="Apri il PDF in una nuova scheda">↗</a>}
        </div>}
      </div>
      {showTemplates && <TemplateGallery selectedId={design.templateId} empty={!content.sections.length} onSelect={selectTemplate}
        onClose={() => setShowTemplates(false)} />}
      {mode === 'edit'
        ? <VisualEditor title={cv.title} content={content} limits={limits} busy={busy} onChange={onChange}
          onPhotoProcessing={setProcessingPhoto}
          inspectorOpen={inspectorOpen} onShowInspector={() => setInspectorOpen(true)}
          onCloseInspector={() => setInspectorOpen(false)} />
        : <PdfPreview pdf={pdf} filename={filename} draft={dirty} />}
    </section>
  )
}
