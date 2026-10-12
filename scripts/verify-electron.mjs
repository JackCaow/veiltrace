import { _electron as electron } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { decodePNG } from '../dist/node/index.js'

const executablePath = process.env.ELECTRON_BINARY
if (!executablePath)
  throw new Error('Set ELECTRON_BINARY to an installed Electron executable (see docs/electron.md).')
const port = 20765 + (process.pid % 1000)
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Demo server timeout')), 10000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes('visual lab:')) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.once('error', (error) => {
    clearTimeout(timer)
    reject(error)
  })
  server.once('exit', (code) => {
    clearTimeout(timer)
    reject(new Error(`Server exited: ${code}`))
  })
})
let app
const report = {
  platform: process.platform,
  electron: '',
  syntheticDataOnly: true,
  rows: [],
  lifecycle: false,
  sandbox: false,
}
try {
  await ready
  app = await electron.launch({
    executablePath,
    args: [path.resolve('examples/electron/main.cjs')],
    env: { ...process.env, VEILTRACE_DEMO_URL: `http://127.0.0.1:${port}` },
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  report.electron = await app.evaluate(() => process.versions.electron)
  report.sandbox = await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration
  })
  assert.equal(report.sandbox, true)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await fs.mkdir('results', { recursive: true })
  for (const surface of ['dark', 'light']) {
    await page.selectOption('#surface', surface)
    await page.waitForFunction(() =>
      document.querySelector('#state').textContent.startsWith('Ready'),
    )
    await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('[data-veiltrace]')].map((layer) => {
          const image = new Image()
          image.src = layer.style.backgroundImage.slice(5, -2)
          return image.decode()
        }),
      )
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const marked = await page.locator('#stage').screenshot({ scale: 'device' })
    console.log(
      'Capture geometry:',
      await page.evaluate(() => ({
        dpr: window.devicePixelRatio,
        rect: document.querySelector('#stage').getBoundingClientRect().toJSON(),
      })),
      PNG.sync.read(marked).width,
    )
    const detected = decodePNG(marked)
    await fs.writeFile(`results/electron-${surface}.png`, marked)
    assert.equal(
      detected?.recordId,
      '123456abcdef',
      `${surface}: actual Electron screenshot recovery failed`,
    )
    await page.evaluate(() => window.veiltraceLab.overlay.setEnabled(false))
    const original = await page.locator('#stage').screenshot({ scale: 'device' })
    await fs.writeFile(`results/electron-${surface}-original.png`, original)
    assert.equal(decodePNG(original), null)
    const clean = PNG.sync.read(original),
      pixels = PNG.sync.read(marked),
      maxima = [0, 0, 0]
    for (let i = 0; i < clean.data.length; i += 4)
      for (let c = 0; c < 3; c++)
        maxima[c] = Math.max(maxima[c], Math.abs(clean.data[i + c] - pixels.data[i + c]))
    // The known empty rail region measures the carrier independently of glyph AA.
    // Keep full-page maxima visible in the report; they are not the core bound.
    const flatMaxima = [0, 0, 0]
    const ratio = await page.evaluate(() => window.devicePixelRatio)
    for (let y = Math.round(500 * ratio); y < Math.round(580 * ratio); y++)
      for (let x = Math.round(40 * ratio); x < Math.round(100 * ratio); x++)
        for (let c = 0; c < 3; c++) {
          const i = (y * clean.width + x) * 4 + c
          flatMaxima[c] = Math.max(flatMaxima[c], Math.abs(clean.data[i] - pixels.data[i]))
        }
    assert.ok(Math.max(...flatMaxima) <= 1, `Flat background pixel budget exceeded: ${flatMaxima}`)
    report.rows.push({
      surface,
      amplitude: 1,
      channel: 'blue',
      maxChannelChange: maxima,
      flatRegionMaxChannelChange: flatMaxima,
      dpr: await page.evaluate(() => window.devicePixelRatio),
      captureScale: 'device',
      detected,
      unmarkedAccepted: false,
    })
    await page.evaluate(() => window.veiltraceLab.overlay.setEnabled(true))
    await page
      .locator('#upload')
      .setInputFiles({ name: 'electron.png', mimeType: 'image/png', buffer: marked })
    await page.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('123456abcdef'),
    )
  }
  await page.evaluate(() => {
    const host = document.querySelector('#stage'),
      before = host.style.position
    const overlay = window.veiltraceLab.overlay
    overlay.dispose()
    overlay.dispose()
    if (host.querySelector('[data-veiltrace]')) throw new Error('Leaked overlay')
    window.veiltraceLab.update()
    if (host.querySelectorAll('[data-veiltrace]').length !== 2) throw new Error('Duplicate overlay')
    if (host.style.position !== before) throw new Error('Host style changed')
  })
  report.lifecycle = true
  assert.deepEqual(errors, [])
} finally {
  await app?.close()
  server.kill('SIGTERM')
}
await fs.writeFile('results/electron-checks.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
