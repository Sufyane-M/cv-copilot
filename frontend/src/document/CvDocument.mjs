import { createElement as h } from 'react'
import registry from './templates.json' with { type: 'json' }

const { defaultTemplate, defaultBlock, families, templates } = registry
const contactFields = {
  email: 'Email',
  phone: 'Telefono',
  location: 'Località',
  website: 'Sito o portfolio',
}

export function getTemplate(id) {
  return templates.find(template => template.id === id) ?? templates.find(template => template.id === defaultTemplate)
}

export function resolveDesign(design) {
  const template = getTemplate(design?.templateId)
  const page = { ...template.design.page, ...design?.page }
  if (!families[template.family].supportsColumns) page.columns = 1
  return {
    templateId: template.id,
    colors: { ...template.design.colors, ...design?.colors },
    typography: { ...template.design.typography, ...design?.typography },
    page,
    blocks: design?.blocks ?? {},
  }
}

export function sectionColumn(section, design) {
  if (design.page.columns === 1) return 'main'
  const explicitColumn = design.blocks[section.id]?.column
  if (explicitColumn === 'aside' || explicitColumn === 'main') return explicitColumn
  return section.type === 'education' || section.type === 'skills' ? 'aside' : 'main'
}

function sheetStyle({ colors, typography, page }) {
  return {
    '--cv-accent': colors.accent,
    '--cv-text': colors.text,
    '--cv-title': colors.title,
    '--cv-background': colors.background,
    '--cv-sidebar': colors.sidebar,
    '--cv-box': colors.box,
    '--cv-border': colors.border,
    '--cv-font': ({ sans: 'CV Sans', serif: 'CV Serif', mono: 'CV Mono' })[typography.font],
    '--cv-title-size': `${typography.titleSize}pt`,
    '--cv-heading-size': `${typography.headingSize}pt`,
    '--cv-text-size': `${typography.textSize}pt`,
    '--cv-weight': typography.weight,
    '--cv-leading': typography.lineHeight,
    '--cv-tracking': `${typography.letterSpacing}pt`,
    '--cv-margin': `${page.margin}mm`,
    '--cv-section-gap': `${page.sectionGap}mm`,
    '--cv-aside-width': `${page.asideWidth}%`,
    '--cv-align': page.align,
  }
}

function fieldValue(renderField, id, field, value, label, tag) {
  return renderField ? renderField({ id, field, value, label, tag }) : value
}

function renderBody(text) {
  if (!/^[ \t]*[•-][ \t]+\S/m.test(text)) return text

  // Le righe testuali rimangono selezionabili e le liste hanno una semantica anche nel PDF.
  const groups = []
  for (const line of text.split(/\r?\n/)) {
    const item = /^[ \t]*[•-][ \t]+(\S.*)$/.exec(line)
    const kind = item ? 'list' : 'text'
    if (groups.at(-1)?.kind !== kind) groups.push({ kind, lines: [] })
    groups.at(-1).lines.push(item ? item[1] : line)
  }
  return groups.map(({ kind, lines }, index) => kind === 'list'
    ? h('ul', { key: index, className: 'cv-section-list' }, lines.map((line, item) => h('li', { key: item }, line)))
    : h('p', { key: index }, lines.join('\n')))
}

function renderSection(section, design, { selectedId, onSelect, renderField, renderControls, showSectionDetails, startsExperience }) {
  const block = { ...defaultBlock, ...design.blocks[section.id] }
  const selected = section.id === selectedId
  const style = {
    '--cv-block-width': `${block.width}%`,
    '--cv-block-height': `${block.minHeight}mm`,
    '--cv-block-padding': `${block.padding}mm`,
    '--cv-padding-limit': `${block.width * 0.18}%`,
    '--cv-block-background': block.background || 'var(--cv-block-base, var(--cv-box))',
    '--cv-block-color': block.color || 'var(--cv-text)',
    '--cv-block-text-size': block.textSize ? `${block.textSize}pt` : 'var(--cv-text-size)',
  }
  const { id, title, text, subtitle = '', period = '' } = section
  const showDetails = selected && renderField && showSectionDetails
  const showCategory = startsExperience && !/^esperienz[ae](?: professional[ei])?$/i.test(title.trim())
  return h('section', {
    key: id,
    className: 'cv-section',
    style,
    'data-section-id': id,
    'data-type': section.type,
    'data-selected': selected || undefined,
    'data-box-border': block.border,
    onClick: onSelect ? () => onSelect(id) : undefined,
  }, [
    h('div', { key: 'heading', className: 'cv-section-heading' }, [
      showCategory && h('p', { key: 'category', className: 'cv-section-category' }, 'Esperienza professionale'),
      h('h2', { key: 'title', className: 'cv-section-title' }, fieldValue(renderField, id, 'title', title, `Titolo della sezione ${title}`, 'h2')),
      (subtitle || period || showDetails) && h('div', { key: 'meta', className: 'cv-section-meta' }, [
        (subtitle || showDetails) && h('div', { key: 'subtitle', className: 'cv-section-subtitle' },
          fieldValue(renderField, id, 'subtitle', subtitle, `Organizzazione o sottotitolo della sezione ${title}`, 'div')),
        (period || showDetails) && h('div', { key: 'period', className: 'cv-section-period' },
          fieldValue(renderField, id, 'period', period, `Periodo della sezione ${title}`, 'div')),
      ]),
    ]),
    h('div', { key: 'text', className: 'cv-section-text' }, renderField
      ? renderField({ id, field: 'text', value: text, label: `Testo della sezione ${title}`, tag: 'div', preview: renderBody(text) })
      : renderBody(text)),
    selected && renderControls ? h('div', { key: 'controls', className: 'cv-editor-tools' }, renderControls(section)) : null,
  ])
}

function renderContacts(profile, renderField, showProfileFields, inSidebar) {
  const fields = Object.entries(contactFields).filter(([field]) => profile[field] || showProfileFields)
  if (!fields.length) return null
  return h('div', { key: 'contacts', className: 'cv-profile-contacts' }, [
    inSidebar && h('h2', { key: 'title', className: 'cv-contacts-title' }, 'Contatti'),
    ...fields.map(([field, label]) => h('div', { key: field, className: 'cv-profile-contact', 'data-contact': field },
      fieldValue(renderField, '@profile', field, profile[field] ?? '', label, 'div'))),
  ])
}

function renderHeader({ title, profile, contacts, portrait, selectedId, onSelect, renderField, showProfileFields }) {
  return h('header', {
    key: 'heading',
    className: 'cv-document-header',
    'data-selected': selectedId === '@title' || selectedId === '@profile' || undefined,
    onClick: onSelect ? (event) => {
      if (event.currentTarget === event.target) onSelect('@title')
    } : undefined,
  }, [
    h('div', { key: 'identity', className: 'cv-header-main' }, [
      h('h1', { key: 'name', className: 'cv-document-title' },
        fieldValue(renderField, '@title', 'document_title', title, 'Titolo del documento', 'h1')),
      (profile.role || showProfileFields) && h('div', { key: 'role', className: 'cv-profile-role' },
        fieldValue(renderField, '@profile', 'role', profile.role ?? '', 'Ruolo professionale', 'div')),
      contacts,
    ]),
    portrait,
  ])
}

export default function CvDocument({ title, content, selectedId, onSelect, renderField, renderControls, renderPortrait, demoPortrait, showProfileFields = false, showSectionDetails = false }) {
  const design = resolveDesign(content.design)
  const template = getTemplate(design.templateId)
  const documentTitle = content.document_title ?? title
  const profile = content.profile ?? {}
  const twoColumns = design.page.columns === 2
  const asideFirst = twoColumns && design.page.asideSide === 'left'
  const columns = twoColumns ? (asideFirst ? ['aside', 'main'] : ['main', 'aside']) : ['main']
  const fallback = profile.photo === undefined && template.portrait ? demoPortrait : undefined
  const src = /^data:image\/(?:jpeg|png);base64,/i.test(profile.photo ?? '') ? profile.photo : fallback
  const isDemo = Boolean(src && src === demoPortrait)
  const hasPortrait = Boolean(src || (renderPortrait && showProfileFields))
  const portraitPosition = (template.portraitPosition === 'sidebar' && !twoColumns ? 'right' : template.portraitPosition) ?? 'right'
  const portraitInSidebar = hasPortrait && portraitPosition === 'sidebar'
  const contactsInSidebar = twoColumns && template.contactsPosition === 'sidebar'
  const contacts = renderContacts(profile, renderField, showProfileFields, contactsInSidebar)
  const alt = isDemo ? 'Foto di esempio' : `Foto di ${documentTitle}`
  const portrait = hasPortrait ? h('div', { key: 'portrait', className: 'cv-profile-portrait' },
    renderPortrait ? renderPortrait({ src, alt, isDemo }) : h('img', { className: 'cv-profile-photo', src, alt }),
    isDemo && h('span', { className: 'cv-portrait-demo-label' }, 'Foto demo')) : null

  return h('article', {
    className: `cv-page resume-sheet cv-family-${template.family}`,
    style: sheetStyle(design),
    'data-layout': template.layout,
    'data-header': design.page.header,
    'data-separators': design.page.separators,
    'data-columns': design.page.columns,
    'data-aside-first': asideFirst || undefined,
    'data-portrait': hasPortrait ? portraitPosition : undefined,
    'data-portrait-shape': hasPortrait ? template.portrait ?? 'circle' : undefined,
    'data-has-contacts': Boolean(contacts) || undefined,
    'data-has-profile': Boolean(profile.role || contacts || hasPortrait || showProfileFields) || undefined,
  }, [
    renderHeader({
      title: documentTitle, profile, contacts: contactsInSidebar ? null : contacts,
      portrait: portraitInSidebar ? null : portrait, selectedId, onSelect, renderField, showProfileFields,
    }),
    h('div', { key: 'columns', className: 'cv-columns' }, columns.map(column => {
      const sections = content.sections.filter(section => sectionColumn(section, design) === column)
      return h('div', { key: column, className: `cv-column cv-column-${column}` }, [
        column === 'aside' && portraitInSidebar ? portrait : null,
        column === 'aside' && contactsInSidebar ? contacts : null,
        ...sections.map((section, index) => renderSection(section, design, {
          selectedId, onSelect, renderField, renderControls, showSectionDetails,
          startsExperience: section.type === 'experience' && sections[index - 1]?.type !== 'experience',
        })),
      ])
    })),
  ])
}
