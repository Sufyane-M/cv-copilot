import { useState } from 'react'

export const sectionTypes = {
  summary: 'Profilo',
  experience: 'Esperienza',
  education: 'Formazione',
  skills: 'Competenze',
  projects: 'Progetti',
  other: 'Altro',
}

export function createSection(type = 'other') {
  return { id: crypto.randomUUID(), type, title: type === 'other' ? 'Nuova sezione' : sectionTypes[type], text: '' }
}

const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function DateTime({ value }) {
  return <time dateTime={value}>{dateFormatter.format(new Date(value))}</time>
}

export function Notice({ children, kind = 'info' }) {
  if (!children) return null
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function RenameForm({ initialTitle, maxLength, disabled, onRename, onCancel, titleValue, onTitleChange }) {
  const [localTitle, setLocalTitle] = useState(initialTitle)
  const title = titleValue ?? localTitle
  const setTitle = onTitleChange ?? setLocalTitle
  return (
    <form className="rename-form" onSubmit={(event) => {
      event.preventDefault()
      onRename(title.trim())
    }}>
      <label>
        Titolo del CV
        <input value={title} maxLength={maxLength} onChange={(event) => setTitle(event.target.value)} required disabled={disabled} />
      </label>
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={disabled || !title.trim() || title.trim() === initialTitle}>
          Salva titolo
        </button>
        {onCancel && <button type="button" className="button" disabled={disabled} onClick={onCancel}>Annulla</button>}
      </div>
    </form>
  )
}
