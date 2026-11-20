import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CvDocument, { resolveDesign } from './src/document/CvDocument.mjs'

const documentCss = new URL('./src/document/document.css', import.meta.url)
const demoImage = new URL('./src/document/demo-portrait.jpg', import.meta.url)
const demoPortrait = `data:image/jpeg;base64,${readFileSync(demoImage).toString('base64')}`

function embeddedStyles() {
  // La stampa parte da un documento in memoria. Gli stessi font della pagina entrano nel suo CSS.
  return readFileSync(documentCss, 'utf8').replace(/url\('([^']+\.ttf)'\)/g, (_, path) => {
    const font = readFileSync(new URL(path, documentCss)).toString('base64')
    return `url('data:font/ttf;base64,${font}')`
  })
}

export function renderDocumentHtml(cv) {
  const { colors, page } = resolveDesign(cv.content.design)
  const title = renderToStaticMarkup(createElement('title', null, cv.content.document_title ?? cv.title))
  const document = renderToStaticMarkup(createElement(CvDocument, { title: cv.title, content: cv.content, demoPortrait }))
  return `<!doctype html><html lang="it"><meta charset="utf-8">${title}<style>
    body { margin: 0; }
    @page { size: A4; margin: ${page.margin}mm; background: ${colors.background}; }
    ${embeddedStyles()}
    </style><body>${document}</body></html>`
}

async function launchBrowser() {
  const options = { headless: true, timeout: 8000 }
  if (existsSync(chromium.executablePath())) return chromium.launch({ ...options, channel: 'chromium' })
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ ...options, channel })
    } catch (error) {
      if (!error.message.includes("Executable doesn't exist")) throw error
    }
  }
  throw new Error('Chromium non disponibile. Esegui npm exec playwright install chromium dalla cartella frontend.')
}

export async function generatePdf(cv) {
  const html = renderDocumentHtml(cv)
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ offline: true })
    await page.setContent(html, { timeout: 12000 })
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true })
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cv = JSON.parse(readFileSync(0, 'utf8'))
    process.stdout.write(await generatePdf(cv))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
