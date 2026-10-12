import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { createPattern, embedRGBA, decodeRGBA } from '../dist/core/index.js'
import { embedPNG, decodePNG } from '../dist/node/index.js'
import { fft } from '../dist/core/fft.js'

const id = '123456abcdef'
function flat(width = 1024, height = 768, color = [28, 30, 34]) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data.set(color, i)
    data[i + 3] = 255
  }
  return { width, height, data }
}
function crop(image, left, top, width, height) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    data.set(
      image.data.subarray(
        ((y + top) * image.width + left) * 4,
        ((y + top) * image.width + left + width) * 4,
      ),
      y * width * 4,
    )
  return { data, width, height }
}

test('FFT matches a direct transform and preserves a round trip', () => {
  const source = Float64Array.from([1, 3, -2, 4, 0, 1, 2, -1]),
    r = source.slice(),
    im = new Float64Array(8)
  fft(r, im)
  for (let k = 0; k < 8; k++) {
    let expected = 0
    for (let n = 0; n < 8; n++) expected += source[n] * Math.cos((2 * Math.PI * k * n) / 8)
    assert.ok(Math.abs(r[k] - expected) < 1e-10)
  }
  fft(r, im, true)
  r.forEach((value, i) => assert.ok(Math.abs(value - source[i]) < 1e-10))
})
test('carrier is zero-mean, bounded, deterministic and changes with the record', () => {
  const a = createPattern(id),
    b = createPattern(id),
    c = createPattern('abcdef123456')
  assert.deepEqual(a.residual, b.residual)
  assert.notDeepEqual(a.residual, c.residual)
  assert.ok(Math.abs(a.residual.reduce((sum, n) => sum + n, 0) / a.residual.length) < 1e-10)
  for (const value of a.residual) assert.ok(Math.abs(value) <= 1 + 1e-12)
})
test('default embedding changes only blue by at most one level and leaves input intact', () => {
  const source = flat(),
    before = source.data.slice(),
    marked = embedRGBA(source, id)
  assert.deepEqual(source.data, before)
  let changed = 0
  for (let i = 0; i < source.data.length; i++) {
    const difference = Math.abs(marked.data[i] - source.data[i])
    if (i % 4 === 2) {
      assert.ok(difference <= 1)
      changed += difference
    } else assert.equal(difference, 0)
  }
  assert.ok(changed > 0)
})
test('recovers an integrity-checked hint on flat dark and light backgrounds, not authenticated identity', () => {
  for (const color of [
    [28, 30, 34],
    [240, 242, 246],
  ]) {
    for (const record of [id, '000000000001', 'fedcba987654']) {
      const marked = embedRGBA(flat(1024, 768, color), record)
      const result = decodeRGBA(marked)
      assert.equal(result?.recordId, record)
      assert.equal(result?.authenticated, false)
      assert.equal(result?.integrityChecked, true)
    }
  }
})
test('registers arbitrary digital crop offsets without an original image', () => {
  const marked = embedRGBA(flat(), id)
  const result = decodeRGBA(crop(marked, 37, 53, 640, 480))
  assert.equal(result?.recordId, id)
  assert.equal(result?.offsetX, 219)
  assert.equal(result?.offsetY, 203)
})
test('rejects absent marks, wrong namespace, and a too-small image', () => {
  assert.equal(decodeRGBA(flat()), null)
  assert.equal(decodeRGBA(embedRGBA(flat(), id), { namespace: 'other' }), null)
  assert.equal(decodeRGBA(flat(100, 100)), null)
})
test('random unmarked images are not accepted in the bounded fixture set', () => {
  for (let sample = 1; sample <= 8; sample++) {
    const image = flat(640, 480)
    let seed = sample
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      image.data[i] = seed & 255
      image.data[i + 1] = (seed >>> 8) & 255
      image.data[i + 2] = (seed >>> 16) & 255
    }
    assert.equal(decodeRGBA(image), null)
  }
})
test('PNG adapter preserves record recovery and rejects malformed or oversized headers', () => {
  const image = flat(),
    png = PNG.sync.write({ ...image, data: Buffer.from(image.data) })
  const marked = embedPNG(png, id)
  assert.equal(decodePNG(marked)?.recordId, id)
  assert.throws(() => decodePNG(Buffer.from('not png')))
  const huge = Buffer.from(png)
  huge.writeUInt32BE(200_000, 16)
  assert.throws(() => decodePNG(huge), /limits/)
})
test('invalid options and transparency fail explicitly', () => {
  assert.throws(() => createPattern('a user name'))
  assert.throws(() => createPattern(id, { amplitude: NaN }))
  assert.throws(() => createPattern(id, { namespace: '' }))
  assert.throws(() => decodeRGBA(flat(), {}, NaN))
  const image = flat(256, 256)
  image.data[3] = 0
  assert.throws(() => embedRGBA(image, id), /transparency/)
})
