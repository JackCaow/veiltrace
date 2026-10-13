import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { decodeRGBA } from '../dist/core/index.js'

const output = path.resolve('results'),
  port = 18765 + (process.pid % 1000)
await fs.mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Demo server timeout')), 10_000)
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
let browser
const report = {
  protocol: 'veiltrace-spectral-ts-v1',
  runtime: 'Chromium browser',
  platform: process.platform,
  cameraTested: false,
  syntheticDataOnly: true,
  rows: [],
  negatives: [],
  rendererErrors: [],
  lifecycle: {},
}
const id = '123456abcdef'
try {
  await ready
  browser = await chromium.launch(
    process.env.VEILTRACE_BROWSER_CHANNEL ? { channel: process.env.VEILTRACE_BROWSER_CHANNEL } : {},
  )
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (error) => report.rendererErrors.push(error.message))
  await page.goto(`http://127.0.0.1:${port}`)
  const waitLayers = async () => {
    await page.waitForFunction(() =>
      document.querySelector('#state').textContent.startsWith('Ready'),
    )
    await page.evaluate(async () => {
      const layers = [...document.querySelectorAll('[data-veiltrace]')]
      await Promise.all(
        layers.map((layer) => {
          const image = new Image()
          image.src = layer.style.backgroundImage.slice(5, -2)
          return image.decode()
        }),
      )
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
  }
  const capture = () => page.locator('#stage').screenshot({ animations: 'disabled' })
  report.mountEffects = []
  for (const surface of ['dark', 'light', 'flat-dark', 'flat-light']) {
    await page.selectOption('#surface', surface)
    await waitLayers()
    await page.evaluate(() => window.veiltraceLab.overlay.dispose())
    const native = await capture(),
      nativePixels = PNG.sync.read(native)
    await fs.writeFile(path.join(output, `${surface}-unmounted.png`), native)
    await page.evaluate(() => window.veiltraceLab.update())
    await waitLayers()
    await page.evaluate(() => window.veiltraceLab.overlay.setEnabled(false))
    await waitLayers()
    const original = await capture(),
      clean = PNG.sync.read(original)
    await fs.writeFile(path.join(output, `${surface}-original.png`), original)
    const mountMax = [0, 0, 0]
    for (let i = 0; i < clean.data.length; i += 4)
      for (let c = 0; c < 3; c++)
        mountMax[c] = Math.max(mountMax[c], Math.abs(clean.data[i + c] - nativePixels.data[i + c]))
    report.mountEffects.push({
      surface,
      maxChannelChange: mountMax,
      baseline: 'unmounted versus mounted with neutral layers; no carrier in either',
    })
    report.negatives.push({ surface, accepted: decodeRGBA(clean) !== null })
    for (const channel of ['blue', 'gray'])
      for (const amplitude of [0.75, 1, 2]) {
        await page.selectOption('#channel', channel)
        await page.selectOption('#amplitude', String(amplitude))
        await waitLayers()
        await page.evaluate(() => window.veiltraceLab.overlay.setEnabled(true))
        const marked = await capture(),
          pixels = PNG.sync.read(marked),
          maxima = [0, 0, 0]
        let squared = 0,
          changed = 0
        for (let i = 0; i < pixels.data.length; i += 4)
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(pixels.data[i + c] - clean.data[i + c])
            maxima[c] = Math.max(maxima[c], delta)
            squared += delta * delta
            if (delta) changed++
          }
        // Chromium can change text antialiasing when blend layers create compositing
        // surfaces. Record actual deltas; the core residual bound is not a DOM bound.
        const filename = `${surface}-${channel}-${amplitude}.png`
        await fs.writeFile(path.join(output, filename), marked)
        assert.ok(
          Math.max(...maxima) <= Math.ceil(amplitude) + 2,
          `${surface}/${channel}/${amplitude}: unexpected compositor delta: ${maxima}`,
        )
        const checks = []
        const attacks = [
          ['png', async () => marked],
          ['jpeg85', async () => sharp(marked).jpeg({ quality: 85 }).toBuffer()],
          [
            'crop',
            async () =>
              sharp(marked)
                .extract({ left: 37, top: 53, width: 640, height: 480 })
                .png()
                .toBuffer(),
          ],
          [
            'resize75',
            async () =>
              sharp(marked)
                .resize(Math.round(pixels.width * 0.75))
                .png()
                .toBuffer(),
          ],
        ]
        for (const [attack, transform] of attacks) {
          const input = await transform(),
            { data, info } = await sharp(input)
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })
          const start = performance.now(),
            result = decodeRGBA({ data, width: info.width, height: info.height }, { channel })
          checks.push({
            attack,
            recovered: result?.recordId === id,
            result,
            milliseconds: Math.round(performance.now() - start),
          })
        }
        const mse = squared / (pixels.width * pixels.height * 3)
        report.rows.push({
          surface,
          channel,
          amplitude,
          maxChannelChange: maxima,
          changedChannelSamples: changed,
          psnr: mse === 0 ? null : 10 * Math.log10(255 ** 2 / mse),
          filename,
          checks,
        })
        console.log(
          `${surface}/${channel}/${amplitude}: ${checks.map((c) => `${c.attack}=${c.recovered ? 'PASS' : 'MISS'}`).join(' ')} Δ=${maxima}`,
        )
      }
  }
  await page.evaluate(() => {
    const overlay = window.veiltraceLab.overlay
    overlay.update({ recordId: 'abcdef123456' })
    if (document.querySelectorAll('[data-veiltrace]').length !== 2)
      throw new Error('Duplicate layers')
    overlay.dispose()
    overlay.dispose()
    if (document.querySelectorAll('[data-veiltrace]').length) throw new Error('Layers leaked')
    if (document.querySelector('#stage').style.willChange !== '')
      throw new Error('Compositing hint leaked')
    window.veiltraceLab.update()
    try {
      window.veiltraceLab.overlay.update({ recordId: 'invalid' })
    } catch {}
    if (document.querySelectorAll('[data-veiltrace]').length)
      throw new Error('Old identity retained after failure')
  })
  report.lifecycle = {
    updateDoesNotDuplicateLayers: true,
    idempotentDispose: true,
    failureClearsOldRecord: true,
  }
  assert.deepEqual(report.rendererErrors, [])
  assert.ok(
    report.negatives.every((n) => !n.accepted),
    'Unmarked screenshot was accepted',
  )
  const defaults = report.rows.filter((row) => row.channel === 'blue' && row.amplitude === 1)
  assert.equal(defaults.length, 4)
  assert.ok(
    defaults.every((row) =>
      row.checks
        .filter((check) => ['png', 'crop'].includes(check.attack))
        .every((check) => check.recovered),
    ),
    'Default native PNG/crop fixture regression',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2))
const rows = report.rows
  .map(
    (row) =>
      `<figure><figcaption>${row.surface} · ${row.channel} · ${row.amplitude}/255 · carrier Δ ${row.maxChannelChange.join('/')} · ${row.checks.map((c) => `${c.attack}:${c.recovered ? 'PASS' : 'MISS'}`).join(' ')}</figcaption><img src="${row.surface}-unmounted.png" alt="SDK unmounted"><img src="${row.surface}-original.png" alt="SDK mounted; neutral layers; carrier off"><img src="${row.filename}" alt="Carrier enabled"></figure>`,
  )
  .join('')
await fs.writeFile(
  path.join(output, 'index.html'),
  `<meta charset="utf-8"><title>VeilTrace benchmark</title><style>body{background:#14171d;color:#eee;font:14px sans-serif}img{width:32%;vertical-align:top}figure{margin:24px 0}figcaption{margin-bottom:12px}pre{white-space:pre-wrap}</style><h1>Unmounted / neutral off / carrier on · browser captures</h1><p>Synthetic data. Carrier deltas compare ON with neutral OFF layers. Mounting effects are measured separately in mountEffects; inspect the unmounted image too. Pixel checks do not prove imperceptibility. Camera not tested. MISS results are retained.</p>${rows}<pre>${JSON.stringify(report, null, 2)}</pre>`,
)
console.log(`Report: ${path.join(output, 'index.html')}`)
