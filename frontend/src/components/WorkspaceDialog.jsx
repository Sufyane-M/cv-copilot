import { useEffect, useId, useRef } from 'react'

export default function WorkspaceDialog({ title, onClose, children, notice, wide = false, busy = false }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  function cancel(event) {
    // Intercetta Escape per lasciare al workspace la conferma sulle bozze.
    event.preventDefault()
    if (!busy) onClose()
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={`workspace-dialog${wide ? ' workspace-dialog-wide' : ''}`} onCancel={cancel}>
      <div className="dialog-shell">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="button dialog-close" aria-label={`Chiudi ${title.toLowerCase()}`}
            disabled={busy} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {notice && <div className="dialog-notice">{notice}</div>}
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  )
}
