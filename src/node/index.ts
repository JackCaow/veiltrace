import { PNG } from 'pngjs'
import { embedRGBA, decodeRGBA, type Options, type Detection } from '../core/index.js'
function readPNG(input: Uint8Array) {
  const buffer = Buffer.from(input),
    signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('Invalid PNG')
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20)
  if (!width || !height || width * height > 16_000_000 || buffer.length > 16 * 1024 * 1024)
    throw new Error('PNG exceeds prototype limits')
  return PNG.sync.read(buffer)
}
export function embedPNG(input: Uint8Array, recordId: string, options: Options = {}): Buffer {
  const marked = embedRGBA(readPNG(input), recordId, options)
  return PNG.sync.write({ ...marked, data: Buffer.from(marked.data) } as PNG)
}
export function decodePNG(input: Uint8Array, options: Options = {}): Detection | null {
  return decodeRGBA(readPNG(input), options)
}
