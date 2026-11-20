import { useState } from 'react'
import WorkspaceDialog from '../components/WorkspaceDialog.jsx'
import CvDocument from './CvDocument.mjs'
import { templateSample } from './templateSample.mjs'
import registry from './templates.json'
import demoPortrait from './demo-portrait.jpg?inline'
import './document.css'
import './gallery.css'

export default function TemplateGallery({ selectedId, empty, onSelect, onClose }) {
  const [filter, setFilter] = useState('')
  const shown = registry.templates.filter((item) => !filter || (filter === 'photo' ? item.portrait : item.family === filter))

  return (
    <WorkspaceDialog title="Template" wide onClose={onClose}>
      <div className="template-gallery">
        <p className="template-intro">{empty
          ? 'Scegli un layout. Ti troverai un CV demo già compilato da personalizzare.'
          : 'Le anteprime mostrano CV dimostrativi. Il layout scelto si applica ai tuoi contenuti.'}</p>
        <div className="template-filters" role="group" aria-label="Filtra i template">
          <button type="button" className="button button-small" aria-pressed={!filter}
            onClick={() => setFilter('')}>Tutti</button>
          <button type="button" className="button button-small" aria-pressed={filter === 'photo'}
            onClick={() => setFilter('photo')}>Con foto</button>
          {Object.entries(registry.families).map(([id, entry]) => (
            <button type="button" className="button button-small" key={id} aria-pressed={filter === id}
              onClick={() => setFilter(id)}>{entry.name}</button>
          ))}
          <span className="muted small" role="status">{shown.length} template</span>
        </div>
        <div className="template-grid">
          {shown.map((item) => {
            const sample = templateSample(item, demoPortrait)
            return (
              <button type="button" className="template-card" key={item.id} data-template-id={item.id}
                aria-pressed={!empty && selectedId === item.id} onClick={() => onSelect(item, demoPortrait)}>
                <div className="template-miniature" aria-hidden="true">
                  <div className="template-paper">
                    <CvDocument title={sample.document_title} content={sample} demoPortrait={demoPortrait} />
                  </div>
                </div>
                <span className="template-card-name">
                  <strong>{item.name}</strong>
                  <span>{item.description || registry.families[item.family].name}</span>
                  <small>{item.design.page.columns === 2 ? 'Due colonne' : 'Una colonna'}{item.portrait && ' · Foto'}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </WorkspaceDialog>
  )
}
