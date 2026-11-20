import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixtureId = resolve(root, 'tests/visual-editor-fixture.jsx').replaceAll('\\', '/')
const channel = process.env.CV_TEST_BROWSER ?? (existsSync(chromium.executablePath()) ? 'chromium' : 'chrome')
const fixture = `
  import { useState } from 'react'
  import { createRoot } from 'react-dom/client'
  import VisualEditor from '/src/document/VisualEditor.jsx'
  import DocumentPanel from '/src/document/DocumentPanel.jsx'
  import { changeDraft, undoDraft, redoDraft } from '/src/document/draft.mjs'
  import '/src/styles.css'

  const cv = { id: 7, title: 'CV sintetico', version_number: 1, content: { sections: [
    { id: 'profile', type: 'summary', title: 'Profilo', text: 'Testo sintetico' },
    { id: 'work', type: 'experience', title: 'Esperienze', text: 'Progetto di esempio' },
  ] } }
  const query = new URLSearchParams(location.search)
  const templateId = query.get('template')
  if (templateId) cv.content.design = { templateId }
  const limits = { title: 100, sections: 16, section_title: 100, section_text: 2000 }

  function Fixture() {
    const [draft, setDraft] = useState(null)
    const [inspectorOpen, setInspectorOpen] = useState(false)
    const [mode, setMode] = useState('edit')
    const content = draft?.content ?? cv.content
    const onChange = (next, group) => setDraft((current) => changeDraft(current, cv, next, group))
    if (query.has('pdf')) return <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <button onClick={() => onChange({ ...content, sections: [
        { ...content.sections[0], text: 'Modifica concorrente più recente' }, content.sections[1],
      ] })}>Cambia bozza in attesa</button>
      <DocumentPanel cv={cv} mode={mode} onMode={setMode} content={content} limits={limits}
        dirty={Boolean(draft)} onChange={onChange} />
    </main>
    return <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxWidth: '900px' }}>
      <div><button onClick={() => setDraft(undoDraft)}>Annulla</button><button onClick={() => setDraft(redoDraft)}>Ripeti</button></div>
      <VisualEditor title={cv.title} content={content} limits={limits} onChange={onChange}
        inspectorOpen={inspectorOpen} onShowInspector={() => setInspectorOpen(true)} onCloseInspector={() => setInspectorOpen(false)} />
    </main>
  }

  createRoot(document.getElementById('root')).render(<Fixture />)
`

async function openFixture(page, templateId, previewHandler) {
  const bundle = await build({ root, logLevel: 'error',
    plugins: [{
      name: 'test-visual-editor',
      resolveId: (id) => id.replaceAll('\\', '/') === fixtureId ? fixtureId : null,
      load: (id) => id === fixtureId ? fixture : null,
    }],
    build: { write: false, rollupOptions: { input: fixtureId } },
  })
  const types = { js: 'text/javascript', css: 'text/css', ttf: 'font/ttf', html: 'text/html' }
  const assets = new Map(bundle.output.map((item) => [item.fileName, item.type === 'asset' ? Buffer.from(item.source) : item.code]))
  const styles = bundle.output.filter((item) => item.fileName.endsWith('.css')).map((item) => `<link rel="stylesheet" href="/${item.fileName}">`)
  const script = bundle.output.find((item) => item.type === 'chunk' && item.isEntry)
  assets.set('index.html', `<!doctype html><meta charset="utf-8">${styles.join('')}<div id="root"></div><script type="module" src="/${script.fileName}"></script>`)
  await page.route('http://127.0.0.1:28471/**', (route) => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html'
    return route.fulfill({ status: assets.has(file) ? 200 : 404, body: assets.get(file) ?? '', contentType: types[file.split('.').at(-1)] })
  })
  const url = new URL('http://127.0.0.1:28471/')
  if (templateId) url.searchParams.set('template', templateId)
  if (previewHandler) {
    url.searchParams.set('pdf', '1')
    await page.route('**/api/cvs/7/pdf/preview', previewHandler)
  }
  await page.goto(url.href)
}

test('l’anteprima non presenta una risposta precedente come PDF della bozza corrente', { timeout: 40000 }, async () => {
  const browser = await chromium.launch({ channel, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
    await page.addInitScript(() => {
      const original = URL.createObjectURL
      window.previewPdfCount = 0
      URL.createObjectURL = (blob) => {
        if (blob.type === 'application/pdf') window.previewPdfCount += 1
        return original.call(URL, blob)
      }
    })
    const payloads = []
    let releaseFirst
    const firstWaiting = new Promise((resolve) => { releaseFirst = resolve })
    let releaseReopened
    const reopenedWaiting = new Promise((resolve) => { releaseReopened = resolve })
    const pdf = Buffer.from('%PDF-1.4\n% bozza di prova\n%%EOF')
    await openFixture(page, undefined, async (route) => {
      payloads.push(route.request().postDataJSON())
      assert.equal(route.request().method(), 'POST')
      if (payloads.length === 1) await firstWaiting
      if (payloads.length === 3) await reopenedWaiting
      await route.fulfill({ contentType: 'application/pdf', body: pdf })
    })
    const text = page.getByRole('textbox', { name: 'Testo della sezione Profilo' })
    await text.fill('Prima bozza modificata')
    assert.equal(payloads.length, 0)
    const endpoint = '/api/cvs/7/pdf/preview'
    await Promise.all([
      page.waitForRequest((request) => request.url().endsWith(endpoint)),
      page.getByRole('button', { name: 'Anteprima PDF', exact: true }).click(),
    ])
    await page.getByText('Generazione del PDF…', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Cambia bozza in attesa' }).click()
    await page.getByText('Anteprima da aggiornare. Il documento è cambiato.', { exact: true }).waitFor()
    const olderResponse = page.waitForResponse((response) => response.url().endsWith(endpoint))
    releaseFirst()
    await (await olderResponse).finished()
    assert.equal(await page.locator('iframe.pdf-frame').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Scarica bozza PDF' }).isDisabled(), true)

    await page.getByRole('button', { name: 'Aggiorna anteprima' }).click()
    const download = page.getByRole('link', { name: 'Scarica bozza PDF' })
    await download.waitFor()
    assert.equal(payloads.length, 2)
    assert.equal(payloads[0].content.sections[0].text, 'Prima bozza modificata')
    assert.equal(payloads[1].content.sections[0].text, 'Modifica concorrente più recente')
    assert.equal(await page.evaluate(() => window.previewPdfCount), 1)
    assert.equal(await download.getAttribute('download'), 'CV sintetico - bozza.pdf')
    const url = await download.getAttribute('href')
    const bytes = await page.evaluate(async (href) => Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer())), url)
    assert.deepEqual(Buffer.from(bytes), pdf)
    if (await page.evaluate(() => navigator.pdfViewerEnabled !== false)) {
      const iframe = page.getByTitle('PDF della bozza')
      assert.equal((await iframe.getAttribute('src')).split('#')[0], url)
    }
    await page.getByRole('button', { name: 'Modifica', exact: true }).click()
    assert.equal(await text.inputValue(), 'Modifica concorrente più recente')
    await page.getByRole('button', { name: 'Anteprima PDF', exact: true }).click()
    await page.getByText('Generazione del PDF…', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Scarica bozza PDF' }).isDisabled(), true)
    releaseReopened()
    await download.waitFor()
    assert.notEqual(await download.getAttribute('href'), url)
  } finally {
    await browser.close()
  }
})

async function drag(page, handle, dx, dy) {
  const { x, y, width, height } = await handle.boundingBox()
  const targetX = x + width / 2
  const targetY = y + height / 2
  await page.mouse.move(targetX, targetY)
  await page.mouse.down()
  await page.mouse.move(targetX + dx, targetY + dy, { steps: 8 })
  await page.mouse.up()
}

test('modifica inline, ridimensiona con un singolo Undo e adatta la pagina su mobile', { timeout: 40000 }, async () => {
  const browser = await chromium.launch({ channel, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 850 } })
    await openFixture(page)
    const title = page.getByRole('textbox', { name: 'Titolo del documento' })
    await title.fill('Curriculum sintetico')
    assert.equal(await title.inputValue(), 'Curriculum sintetico')
    const text = page.getByRole('textbox', { name: 'Testo della sezione Profilo' })
    const profileHeading = page.locator('[data-section-id="profile"] .cv-section-heading')
    const headingHeight = (await profileHeading.boundingBox()).height
    await text.focus()
    const details = page.getByRole('button', { name: 'Dettagli sezione', exact: true })
    assert.equal(await details.getAttribute('aria-expanded'), 'false')
    assert.equal((await profileHeading.boundingBox()).height, headingHeight)
    await details.click()
    assert.equal(await page.getByRole('textbox', { name: 'Periodo della sezione Profilo' }).isVisible(), true)
    await details.click()
    assert.equal((await profileHeading.boundingBox()).height, headingHeight)
    const multiline = `Prima riga con accenti ed €\n${'Testo distribuito su più righe. '.repeat(12)}\nUltima riga.\n`
    await text.fill(multiline)
    await text.press('End')
    await text.press('a')
    assert.equal(await text.inputValue(), `${multiline}a`)
    const selected = page.locator('[data-section-id="profile"][data-selected="true"]')
    await selected.waitFor()
    assert.equal(await text.evaluate((input) => input.scrollHeight <= input.clientHeight + 2), true)

    const before = await selected.boundingBox()
    await drag(page, page.getByRole('button', { name: 'Ridimensiona larghezza' }), -170, 0)
    const narrowed = await selected.boundingBox()
    assert.ok(narrowed.width < before.width - 100)
    assert.equal(await text.evaluate((input) => input.scrollHeight <= input.clientHeight + 2), true)
    await page.getByRole('button', { name: 'Annulla' }).click()
    assert.equal((await selected.boundingBox()).width, before.width)
    await page.getByRole('button', { name: 'Ripeti' }).click()
    assert.equal((await selected.boundingBox()).width, narrowed.width)
    await drag(page, page.getByRole('button', { name: 'Ridimensiona altezza' }), 0, 120)
    assert.ok((await selected.boundingBox()).height > narrowed.height + 80)

    await page.getByRole('button', { name: 'Stile riquadro' }).click()
    const width = page.getByRole('spinbutton', { name: 'Larghezza (%)' })
    await width.fill('75')
    await width.press('Tab')
    assert.equal(await selected.evaluate((box) => box.style.getPropertyValue('--cv-block-width')), '75%')
    await page.getByText('Tipografia', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Famiglia del font' }).selectOption('serif')
    const paper = page.locator('.cv-page')
    assert.equal(await paper.evaluate((box) => box.style.getPropertyValue('--cv-font')), 'CV Serif')
    await page.getByText('Colori', { exact: true }).click()
    await page.getByLabel('Colore principale').fill('#5955d1')
    assert.equal(await paper.evaluate((box) => box.style.getPropertyValue('--cv-accent')), '#5955d1')
    await page.getByRole('button', { name: 'Sposta giù' }).click()
    assert.deepEqual(await page.locator('[data-section-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.sectionId)), ['work', 'profile'])
    assert.equal(await text.inputValue(), `${multiline}a`)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('.visual-paper').getBoundingClientRect().width < 390)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true)
    assert.equal(await page.getByRole('complementary', { name: 'Personalizzazione documento' }).isVisible(), true)
    await page.getByRole('button', { name: 'Chiudi personalizzazione' }).click()
    await page.getByRole('combobox', { name: 'Aggiungi sezione' }).selectOption('skills')
    assert.equal(await page.getByRole('textbox', { name: 'Titolo della sezione Competenze', exact: true }).inputValue(), 'Competenze')

    await page.getByRole('button', { name: 'Dati personali' }).click()
    const role = page.getByRole('textbox', { name: 'Ruolo professionale' })
    await role.fill('Consulente di esempio')
    await page.locator('input[type=file]').setInputFiles(resolve(root, 'src/document/demo-portrait.jpg'))
    const photo = page.locator('.cv-profile-photo')
    await photo.waitFor()
    assert.match(await photo.getAttribute('src'), /^data:image\/jpeg;base64,/)
    assert.equal(await role.inputValue(), 'Consulente di esempio')
    await page.getByRole('button', { name: 'Rimuovi foto' }).click()
    assert.equal(await photo.count(), 0)
  } finally {
    await browser.close()
  }
})

test('mostra il ritratto di esempio e apre il selettore per sostituirlo con una foto propria', { timeout: 40000 }, async () => {
  const browser = await chromium.launch({ channel, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 850 } })
    await openFixture(page, 'modern-milano')
    const photo = page.locator('.cv-profile-photo')
    const upload = page.getByRole('button', { name: 'Carica la tua foto', exact: true })
    const change = page.getByRole('button', { name: 'Cambia foto', exact: true })
    await photo.waitFor({ timeout: 10000 })
    assert.equal(await upload.isVisible(), true)
    const sample = await photo.getAttribute('src')

    const [photoChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), photo.click()])
    await photoChooser.setFiles([])
    const replacement = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 28
      canvas.height = 36
      const context = canvas.getContext('2d')
      context.fillStyle = '#375a8b'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    const [uploadChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), upload.click()])
    await uploadChooser.setFiles({ name: 'mia-foto.png', mimeType: 'image/png', buffer: Buffer.from(replacement, 'base64') })
    await change.waitFor({ timeout: 10000 })
    const uploaded = await photo.getAttribute('src')
    assert.match(uploaded, /^data:image\/jpeg;base64,/)
    assert.notEqual(uploaded, sample)
    assert.equal(await photo.evaluate(async (image) => {
      await image.decode()
      return image.naturalWidth
    }), 28)

    await page.getByRole('button', { name: 'Dati personali' }).click()
    await page.getByRole('button', { name: 'Rimuovi foto' }).click()
    assert.equal(await photo.count(), 0)
    await page.getByRole('button', { name: 'Dati personali' }).click()
    assert.equal(await page.locator('.visual-portrait').count(), 0)
    assert.equal(await upload.isVisible(), true)
  } finally {
    await browser.close()
  }
})
