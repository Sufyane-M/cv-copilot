import { sectionTypes } from '../components/common.jsx'
import registry from './templates.json'
import { getTemplate } from './CvDocument.mjs'

const colorLabels = {
  accent: 'Colore principale',
  text: 'Colore del testo',
  title: 'Colore dei titoli',
  background: 'Sfondo pagina',
  sidebar: 'Sfondo sidebar',
  box: 'Sfondo riquadri',
  border: 'Bordi e separatori',
}

const fonts = { sans: 'DejaVu Sans', serif: 'DejaVu Serif', mono: 'DejaVu Sans Mono' }
const alignments = { left: 'Sinistra', center: 'Centro', right: 'Destra' }
const headers = { left: 'Semplice', center: 'Centrata', band: 'Fascia', offset: 'Rientrata' }
const separators = { none: 'Assenti', line: 'Linea', accent: 'Accento' }
const borders = { inherit: 'Da template', none: 'Assente', line: 'Linea', accent: 'Accento' }
const lanes = { auto: 'Automatica', main: 'Principale', aside: 'Laterale' }

function Choice({ label, value, choices, onChange }) {
  return <label className="design-field">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(typeof value === 'number' ? Number(event.target.value) : event.target.value)}>
      {Object.entries(choices).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
    </select>
  </label>
}

function NumberField({ label, value, min, max, step = 1, onChange }) {
  function commit(event) {
    const input = event.currentTarget
    const number = input.valueAsNumber
    if (!Number.isFinite(number)) {
      input.value = value
      return
    }
    const aligned = min + Math.round((number - min) / step) * step
    const next = Number(Math.min(max, Math.max(min, aligned)).toFixed(2))
    input.value = next
    if (next !== value) onChange(next)
  }

  return <label className="design-field design-numeric">
    <span>{label}</span>
    <input key={value} type="number" min={min} max={max} step={step} defaultValue={value}
      onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </label>
}

function ColorField({ label, value, fallback, onChange }) {
  return <div className="design-color">
    <label><span>{label}</span><input type="color" value={value || fallback} onChange={(event) => onChange(event.target.value)} /></label>
    {fallback && <button type="button" className="button button-small" disabled={!value}
      aria-label={`Ripristina ${label.toLowerCase()}`} onClick={() => onChange('')}>Eredita</button>}
  </div>
}

export default function DesignControls({ design, selected, busy, onChange, onChangeBlock, onChangeType, onReset, onClose }) {
  const { colors, typography, page } = design
  const supportsColumns = registry.families[getTemplate(design.templateId).family].supportsColumns
  const block = selected ? { ...registry.defaultBlock, ...design.blocks[selected.id] } : null
  const defaultStyle = getTemplate(design.templateId).design
  const canReset = Object.keys(design.blocks).length > 0 || Object.keys(defaultStyle).some((group) =>
    Object.entries(defaultStyle[group]).some(([key, value]) => design[group][key] !== value))

  function change(group, key, value) {
    onChange(group, key, value)
  }

  return (
    <aside className="design-inspector" aria-label="Personalizzazione documento">
      <header className="design-inspector-heading">
        <h3>Personalizza</h3>
        <button type="button" className="button button-small" aria-label="Chiudi personalizzazione" onClick={onClose}>×</button>
      </header>
      <fieldset disabled={busy} className="design-controls">
        {block && <details key={selected.id} open>
          <summary>Riquadro</summary>
          <div className="design-group">
            <Choice label="Tipo di sezione" value={selected.type} choices={sectionTypes} onChange={onChangeType} />
            <NumberField label="Larghezza (%)" value={block.width} min={50} max={100} onChange={(value) => onChangeBlock('width', value)} />
            <NumberField label="Altezza minima (mm)" value={block.minHeight} min={0} max={140} onChange={(value) => onChangeBlock('minHeight', value)} />
            <p className="design-note">Il riquadro si estende per ospitare tutto il testo.</p>
            <NumberField label="Spazio interno (mm)" value={block.padding} min={0} max={10} step={0.5} onChange={(value) => onChangeBlock('padding', value)} />
            <ColorField label="Sfondo riquadro" value={block.background} fallback={colors.box} onChange={(value) => onChangeBlock('background', value)} />
            <ColorField label="Testo riquadro" value={block.color} fallback={colors.text} onChange={(value) => onChangeBlock('color', value)} />
            <Choice label="Bordo riquadro" value={block.border} choices={borders} onChange={(value) => onChangeBlock('border', value)} />
            <label className="design-checkbox">
              <input type="checkbox" checked={Boolean(block.textSize)} onChange={(event) => onChangeBlock('textSize', event.target.checked ? typography.textSize : 0)} />
              <span>Dimensione testo personalizzata</span>
            </label>
            {block.textSize > 0 && <NumberField label="Testo riquadro (pt)" value={block.textSize} min={8} max={18} step={0.5} onChange={(value) => onChangeBlock('textSize', value)} />}
            {page.columns === 2 && <Choice label="Colonna del riquadro" value={block.column} choices={lanes} onChange={(value) => onChangeBlock('column', value)} />}
          </div>
        </details>}
        <details open={!selected}>
          <summary>Colori</summary>
          <div className="design-group">
            {Object.entries(colorLabels).filter(([key]) => key !== 'sidebar' || page.columns === 2).map(([key, label]) => (
              <ColorField key={key} label={label} value={colors[key]} onChange={(value) => change('colors', key, value)} />
            ))}
          </div>
        </details>
        <details>
          <summary>Tipografia</summary>
          <div className="design-group">
            <Choice label="Famiglia del font" value={typography.font} choices={fonts} onChange={(value) => change('typography', 'font', value)} />
            <NumberField label="Titolo principale (pt)" value={typography.titleSize} min={18} max={44} step={0.5} onChange={(value) => change('typography', 'titleSize', value)} />
            <NumberField label="Titoli delle sezioni (pt)" value={typography.headingSize} min={9} max={20} step={0.5} onChange={(value) => change('typography', 'headingSize', value)} />
            <NumberField label="Testo (pt)" value={typography.textSize} min={8} max={16} step={0.5} onChange={(value) => change('typography', 'textSize', value)} />
            <Choice label="Peso del testo" value={typography.weight} choices={{ 400: 'Normale', 700: 'Grassetto' }} onChange={(value) => change('typography', 'weight', value)} />
            <NumberField label="Interlinea" value={typography.lineHeight} min={1.1} max={1.8} step={0.05} onChange={(value) => change('typography', 'lineHeight', value)} />
            <NumberField label="Spaziatura caratteri (pt)" value={typography.letterSpacing} min={-0.5} max={1.5} step={0.1} onChange={(value) => change('typography', 'letterSpacing', value)} />
          </div>
        </details>
        <details>
          <summary>Pagina</summary>
          <div className="design-group">
            <NumberField label="Margini (mm)" value={page.margin} min={9} max={24} step={0.5} onChange={(value) => change('page', 'margin', value)} />
            <NumberField label="Spazio fra sezioni (mm)" value={page.sectionGap} min={2} max={12} step={0.5} onChange={(value) => change('page', 'sectionGap', value)} />
            {supportsColumns && <Choice label="Numero di colonne" value={page.columns} choices={{ 1: 'Una', 2: 'Due' }} onChange={(value) => change('page', 'columns', value)} />}
            {page.columns === 2 && <>
              <NumberField label="Larghezza sidebar (%)" value={page.asideWidth} min={25} max={44} onChange={(value) => change('page', 'asideWidth', value)} />
              <Choice label="Posizione sidebar" value={page.asideSide} choices={{ left: 'Sinistra', right: 'Destra' }} onChange={(value) => change('page', 'asideSide', value)} />
            </>}
            <Choice label="Allineamento del testo" value={page.align} choices={alignments} onChange={(value) => change('page', 'align', value)} />
            <Choice label="Intestazione" value={page.header} choices={headers} onChange={(value) => change('page', 'header', value)} />
            <Choice label="Separatori" value={page.separators} choices={separators} onChange={(value) => change('page', 'separators', value)} />
          </div>
        </details>
        <button type="button" className="button button-small design-reset" disabled={!canReset} onClick={onReset}>Ripristina stile del template</button>
      </fieldset>
    </aside>
  )
}
