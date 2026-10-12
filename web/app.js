import { ScreenOverlay } from '/dist/browser/index.js'
const el = (id) => document.getElementById(id)
let enabled = true,
  overlay
const worker = new Worker('/decoder-worker.js', { type: 'module' })
let requestId = 0
function parameters() {
  return {
    recordId: el('record').value,
    amplitude: Number(el('amplitude').value),
    channel: el('channel').value,
    namespace: 'public-demo',
  }
}
function visibility() {
  overlay?.setEnabled(enabled)
  el('toggle').textContent = `Watermark ${enabled ? 'ON' : 'OFF'}`
  el('toggle').setAttribute('aria-pressed', String(enabled))
}
function update() {
  el('stage').dataset.surface = el('surface').value
  try {
    overlay?.dispose()
    overlay = undefined
    overlay = new ScreenOverlay({ target: el('stage'), ...parameters() })
    visibility()
    el('state').textContent =
      `Ready · spectral-ts-v1 · residual budget ${el('amplitude').value}/255 in ${el('channel').value} carrier · compositor may add rounding/antialiasing changes · inspect at 100% zoom`
  } catch (error) {
    el('state').textContent = `Not marked: ${error.message}`
  }
}
for (const id of ['surface', 'amplitude', 'channel', 'record'])
  el(id).addEventListener('change', update)
el('toggle').addEventListener('click', () => {
  enabled = !enabled
  visibility()
})
worker.onmessage = ({ data }) => {
  if (data.id !== requestId) return
  el('result').textContent = JSON.stringify(
    data.error ? { error: data.error } : data.result,
    null,
    2,
  )
}
worker.onerror = () => {
  el('result').textContent = 'Local decoder worker failed.'
}
el('upload').addEventListener('change', async () => {
  const id = ++requestId,
    file = el('upload').files[0]
  if (!file) return
  if (file.size > 16 * 1024 * 1024) {
    el('result').textContent = 'Image exceeds 16 MiB.'
    return
  }
  el('result').textContent = 'Decoding in a local browser Worker…'
  try {
    const bitmap = await createImageBitmap(file)
    if (bitmap.width * bitmap.height > 16_000_000) {
      bitmap.close()
      throw new Error('Image exceeds 16 megapixels.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    worker.postMessage(
      {
        id,
        image: { data: image.data, width: image.width, height: image.height },
        options: parameters(),
      },
      [image.data.buffer],
    )
  } catch (error) {
    if (id === requestId) el('result').textContent = error.message
  }
})
window.veiltraceLab = {
  update,
  parameters,
  get overlay() {
    return overlay
  },
}
update()
