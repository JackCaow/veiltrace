import { PNG } from 'pngjs'
import { embedRGBA, decodeRGBA, type Options, type Detection } from '../core/index.js'
function readPNG(input: Uint8Array) {
  if (input.byteLength > 16 * 1024 * 1024) throw new Error('PNG exceeds prototype limits')
  const buffer = Buffer.from(input),
    signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.readUInt32BE(12) !== 0x49484452
  )
    throw new Error('Invalid PNG')
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20)
  if (!width || !height || width * height > 16_000_000 || buffer.length > 16 * 1024 * 1024)
    throw new Error('PNG exceeds prototype limits')
  // pngjs permits later IHDR chunks to replace the dimensions used for allocation.
  // Validate the complete container before delegating any decompression to it.
  let offset = 8,
    hasData = false,
    ended = false,
    paletteEntries = 0,
    hasTransparency = false,
    hasGamma = false
  const colorType = buffer[25],
    depth = buffer[24]
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error('Invalid PNG chunk structure')
    const length = buffer.readUInt32BE(offset),
      type = buffer.readUInt32BE(offset + 4)
    if (length > buffer.length - offset - 12) throw new Error('Invalid PNG chunk structure')
    if (type === 0x49484452 && offset !== 8) throw new Error('Duplicate PNG IHDR')
    if (type === 0x504c5445) {
      // pngjs creates a JS array per palette entry and accumulates repeated PLTE.
      if (
        paletteEntries ||
        hasData ||
        length === 0 ||
        length > 768 ||
        length % 3 ||
        colorType === 0 ||
        colorType === 4 ||
        (colorType === 3 && length / 3 > 2 ** depth)
      ) {
        throw new Error('Invalid PNG palette structure')
      }
      paletteEntries = length / 3
    }
    if (type === 0x74524e53) {
      const validLength =
        colorType === 0
          ? length === 2
          : colorType === 2
            ? length === 6
            : colorType === 3 && length > 0 && length <= paletteEntries
      if (hasTransparency || hasData || !validLength)
        throw new Error('Invalid PNG transparency structure')
      hasTransparency = true
    }
    if (type === 0x67414d41) {
      if (hasGamma || hasData || paletteEntries || length !== 4)
        throw new Error('Invalid PNG gamma structure')
      hasGamma = true
    }
    if (type === 0x49444154) hasData = true
    offset += length + 12
    if (type === 0x49454e44) {
      if (length !== 0 || offset !== buffer.length || !hasData)
        throw new Error('Invalid PNG end structure')
      ended = true
      break
    }
  }
  if (!ended) throw new Error('Missing PNG IEND')
  // pngjs's interlaced sync path uses unbounded zlib.inflateSync. This adapter
  // deliberately accepts only the dimension-bounded non-interlaced path.
  if (buffer[28] !== 0) throw new Error('Interlaced PNG is not supported by this adapter')
  return PNG.sync.read(buffer)
}
export function embedPNG(input: Uint8Array, recordId: string, options: Options = {}): Buffer {
  const marked = embedRGBA(readPNG(input), recordId, options)
  return PNG.sync.write({ ...marked, data: Buffer.from(marked.data) } as PNG)
}
export function decodePNG(input: Uint8Array, options: Options = {}): Detection | null {
  return decodeRGBA(readPNG(input), options)
}
