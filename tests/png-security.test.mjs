import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { decodePNG, embedPNG } from '../dist/node/index.js'

function chunk(type, data) {
  const name = Buffer.from(type),
    size = Buffer.alloc(4),
    sum = Buffer.alloc(4)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  size.writeUInt32BE(data.length)
  sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([size, name, data, sum])
}
function header(width, height, interlace = 0, colorType = 0, depth = 8) {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width)
  data.writeUInt32BE(height, 4)
  data[8] = depth
  data[9] = colorType
  data[12] = interlace
  return chunk('IHDR', data)
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
function png(headers, pixels) {
  return Buffer.concat([
    signature,
    ...headers,
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function beforeDecoder(run) {
  const read = PNG.sync.read
  let calls = 0
  // Observe the real decoder, without replacing its behavior for accepted inputs.
  PNG.sync.read = (...args) => {
    calls++
    return read(...args)
  }
  try {
    run()
    assert.equal(calls, 0, 'Rejected input reached PNG decompression')
  } finally {
    PNG.sync.read = read
  }
}

test('duplicate IHDR cannot replace the allocation dimensions in the production decoder', () => {
  const width = 4001,
    height = 4000
  const input = png([header(1, 1), header(width, height)], Buffer.alloc((width + 1) * height))
  assert.ok(input.length < 16 * 1024 * 1024)
  beforeDecoder(() => {
    assert.throws(() => decodePNG(input), /Duplicate PNG IHDR/)
    assert.throws(() => embedPNG(input, '123456abcdef'), /Duplicate PNG IHDR/)
  })
})
test('interlaced PNG is rejected before the unbounded inflate path, including a small compressed bomb', () => {
  const bomb = png([header(1, 1, 1)], Buffer.alloc(8 * 1024 * 1024))
  assert.ok(bomb.length < 10_000)
  // A valid 1x1 Adam7 grayscale image also fails explicitly, rather than claiming support.
  const valid = png([header(1, 1, 1)], Buffer.from([0, 23]))
  assert.equal(PNG.sync.read(valid).data[0], 23)
  beforeDecoder(() => {
    assert.throws(() => decodePNG(bomb), /Interlaced PNG is not supported/)
    assert.throws(() => decodePNG(valid), /Interlaced PNG is not supported/)
  })
})
test('PNG chunk bounds and end structure are checked before decoding; valid grayscale still works', () => {
  const valid = png([header(1, 1)], Buffer.from([0, 23]))
  assert.equal(decodePNG(valid), null)
  const missingEnd = valid.subarray(0, valid.length - 12)
  const truncated = valid.subarray(0, valid.length - 2)
  const trailing = Buffer.concat([valid, header(9000, 9000)])
  const excessiveLength = Buffer.from(valid)
  excessiveLength.writeUInt32BE(0xffffffff, 33)
  beforeDecoder(() => {
    for (const input of [missingEnd, truncated, trailing, excessiveLength])
      assert.throws(() => decodePNG(input), /PNG (chunk|end|IEND)/)
  })
})

test('palette allocation amplification and repeated palettes are rejected before parsing', () => {
  const rgba = header(1, 1, 0, 6),
    pixels = Buffer.from([0, 23, 24, 25, 255])
  const valid = png([rgba, chunk('PLTE', Buffer.from([23, 24, 25]))], pixels)
  assert.equal(decodePNG(valid), null)
  const indexed = png(
    [header(1, 1, 0, 3), chunk('PLTE', Buffer.from([23, 24, 25]))],
    Buffer.from([0, 0]),
  )
  assert.equal(decodePNG(indexed), null)
  beforeDecoder(() => {
    const invalid = [
      png([header(1, 1), chunk('PLTE', Buffer.alloc(65536 * 3))], Buffer.from([0, 1])),
      png([rgba, chunk('PLTE', Buffer.alloc(65536 * 3))], pixels),
      png([rgba, chunk('PLTE', Buffer.alloc(3)), chunk('PLTE', Buffer.alloc(3))], pixels),
      png([rgba, chunk('PLTE', Buffer.alloc(0))], pixels),
      png([rgba, chunk('PLTE', Buffer.alloc(4))], pixels),
      png([header(1, 1, 0, 3, 1), chunk('PLTE', Buffer.alloc(9))], Buffer.from([0, 0])),
    ]
    for (const input of invalid) assert.throws(() => decodePNG(input), /PNG palette structure/)
  })
})
test('metadata lengths and duplicates are checked while valid gamma and transparency still decode', () => {
  const gamma = Buffer.alloc(4)
  gamma.writeUInt32BE(45455)
  const valid = png(
    [header(1, 1), chunk('gAMA', gamma), chunk('tRNS', Buffer.from([0, 99]))],
    Buffer.from([0, 23]),
  )
  assert.equal(decodePNG(valid), null)
  beforeDecoder(() => {
    for (const chunks of [
      [chunk('gAMA', Buffer.alloc(3))],
      [chunk('gAMA', gamma), chunk('gAMA', gamma)],
      [chunk('tRNS', Buffer.alloc(3))],
      [chunk('tRNS', Buffer.from([0, 99])), chunk('tRNS', Buffer.from([0, 99]))],
    ])
      assert.throws(
        () => decodePNG(png([header(1, 1), ...chunks], Buffer.from([0, 23]))),
        /PNG (gamma|transparency) structure/,
      )
  })
})
