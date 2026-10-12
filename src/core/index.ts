import { fft2 } from './fft.js'

export const PROTOCOL = 'veiltrace-spectral-ts-v1'
export const TILE_SIZE = 256
const DATA_BITS = 140 // 48-bit opaque record ID + CRC32, Hamming(7,4).
const PILOTS = 24
const MAX_PIXELS = 16_000_000
export interface Options {
  namespace?: string
  amplitude?: number
  channel?: 'blue' | 'gray'
}
export interface RGBAImage {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}
export interface Pattern {
  residual: Float64Array
  width: number
  height: number
  protocol: string
}
export interface Detection {
  recordId: string
  protocol: string
  integrityChecked: true
  authenticated: false
  pilotScore: number
  correctedBits: number
  offsetX: number
  offsetY: number
}

function config(options: Options) {
  const { namespace = 'public-demo', amplitude = 1, channel = 'blue' } = options
  if (typeof namespace !== 'string' || namespace.length < 1 || namespace.length > 128)
    throw new Error('Invalid namespace')
  if (!Number.isFinite(amplitude) || amplitude < 0.5 || amplitude > 4)
    throw new Error('Amplitude must be 0.5..4 channel levels')
  if (channel !== 'blue' && channel !== 'gray') throw new Error('Unknown channel')
  return { namespace, amplitude, channel }
}

function hash(text: string): number {
  let h = 2166136261
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 16777619)
  return h >>> 0
}
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
interface Carrier {
  x: number
  y: number
  phase: number
}
function carriers(namespace: string): Carrier[] {
  const next = random(hash(`${PROTOCOL}:${namespace}`))
  const points: Carrier[] = []
  for (let y = 1; y < 47; y++)
    for (let x = -46; x <= 46; x++) {
      if (x && x * x + y * y >= 22 ** 2 && x * x + y * y <= 46 ** 2) points.push({ x, y, phase: 0 })
    }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[points[i], points[j]] = [points[j], points[i]]
  }
  return points.slice(0, DATA_BITS + PILOTS).map((p) => ({ ...p, phase: next() * Math.PI * 2 }))
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function checksum(record: Uint8Array, namespace: string): number {
  const prefix = new TextEncoder().encode(`${PROTOCOL}\0${namespace}\0`)
  const bytes = new Uint8Array(prefix.length + record.length)
  bytes.set(prefix)
  bytes.set(record, prefix.length)
  return crc32(bytes)
}
function encode(id: string, namespace: string): number[] {
  if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id))
    throw new Error('Record ID must have 12 lowercase hex digits')
  const bytes = new Uint8Array(10)
  for (let i = 0; i < 6; i++) bytes[i] = parseInt(id.slice(i * 2, i * 2 + 2), 16)
  new DataView(bytes.buffer).setUint32(6, checksum(bytes.subarray(0, 6), namespace))
  const bits = [...bytes].flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1))
  const output: number[] = []
  for (let i = 0; i < bits.length; i += 4) {
    const [a, b, c, d] = bits.slice(i, i + 4)
    output.push(a ^ b ^ d, a ^ c ^ d, a, b ^ c ^ d, b, c, d)
  }
  return output.map((b) => (b ? 1 : -1))
}
function decodeBits(symbols: number[], namespace: string) {
  const bits: number[] = []
  let corrected = 0
  for (let i = 0; i < DATA_BITS; i += 7) {
    const b = [0, ...symbols.slice(i, i + 7).map((s) => (s > 0 ? 1 : 0))]
    const error =
      (b[1] ^ b[3] ^ b[5] ^ b[7]) |
      ((b[2] ^ b[3] ^ b[6] ^ b[7]) << 1) |
      ((b[4] ^ b[5] ^ b[6] ^ b[7]) << 2)
    if (error) {
      b[error] ^= 1
      corrected++
    }
    bits.push(b[3], b[5], b[6], b[7])
  }
  const bytes = Uint8Array.from({ length: 10 }, (_, i) =>
    bits.slice(i * 8, i * 8 + 8).reduce((n, b) => n * 2 + b, 0),
  )
  if (new DataView(bytes.buffer).getUint32(6) !== checksum(bytes.subarray(0, 6), namespace))
    return null
  return {
    recordId: [...bytes.subarray(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    corrected,
  }
}

export function createPattern(recordId: string, options: Options = {}): Pattern {
  const { namespace, amplitude } = config(options),
    points = carriers(namespace)
  const symbols = [...encode(recordId, namespace), ...Array(PILOTS).fill(1)]
  const real = new Float64Array(TILE_SIZE ** 2),
    imag = real.slice()
  points.forEach(({ x, y, phase }, i) => {
    const index = y * TILE_SIZE + ((x + TILE_SIZE) % TILE_SIZE)
    const mirror = (TILE_SIZE - y) * TILE_SIZE + ((TILE_SIZE - x) % TILE_SIZE)
    real[index] = real[mirror] = symbols[i] * Math.cos(phase)
    imag[index] = symbols[i] * Math.sin(phase)
    imag[mirror] = -imag[index]
  })
  fft2(real, imag, TILE_SIZE, true)
  // Smooth saturation uses the small pixel budget across more samples. Peak-only
  // normalization loses most of a sub-two-level carrier during 8-bit rounding.
  let energy = 0
  for (const v of real) energy += v * v
  const rms = Math.sqrt(energy / real.length)
  let mean = 0
  for (let i = 0; i < real.length; i++) {
    real[i] = Math.tanh(real[i] / rms)
    mean += real[i]
  }
  mean /= real.length
  let max = 0
  for (const v of real) max = Math.max(max, Math.abs(v - mean))
  for (let i = 0; i < real.length; i++) real[i] = ((real[i] - mean) * amplitude) / max
  return { residual: real, width: TILE_SIZE, height: TILE_SIZE, protocol: PROTOCOL }
}

export function createLayers(
  recordId: string,
  options: Options = {},
): { positive: RGBAImage; negative: RGBAImage } {
  const pattern = createPattern(recordId, options),
    { channel } = config(options)
  const positive = new Uint8ClampedArray(TILE_SIZE ** 2 * 4),
    negative = positive.slice()
  for (let i = 0; i < pattern.residual.length; i++) {
    const value = Math.round(pattern.residual[i])
    for (const c of channel === 'blue' ? [2] : [0, 1, 2]) {
      positive[i * 4 + c] = Math.max(value, 0)
      negative[i * 4 + c] = Math.max(-value, 0)
    }
    positive[i * 4 + 3] = negative[i * 4 + 3] = 255
  }
  return {
    positive: { data: positive, width: TILE_SIZE, height: TILE_SIZE },
    negative: { data: negative, width: TILE_SIZE, height: TILE_SIZE },
  }
}

function validate(image: RGBAImage) {
  const { width, height, data } = image
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_PIXELS ||
    data.length !== width * height * 4
  )
    throw new Error('Invalid RGBA image or exceeds 16 megapixels')
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) throw new Error('Composite transparency onto an explicit background first')
}
export function embedRGBA(image: RGBAImage, recordId: string, options: Options = {}): RGBAImage {
  validate(image)
  const field = createPattern(recordId, options).residual,
    { channel } = config(options),
    data = new Uint8ClampedArray(image.data)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const value = field[(y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)]
      for (const c of channel === 'blue' ? [2] : [0, 1, 2]) {
        const index = (y * image.width + x) * 4 + c
        data[index] = Math.max(0, Math.min(255, Math.round(data[index] + value)))
      }
    }
  return { data, width: image.width, height: image.height }
}

/** Decoder consumes raw pixels in Node or a Web Worker. Caller handles image formats/scaling. */
export function decodeRGBA(
  image: RGBAImage,
  options: Options = {},
  minPilotScore = 0.85,
): Detection | null {
  validate(image)
  const { namespace, channel } = config(options)
  if (!Number.isFinite(minPilotScore) || minPilotScore < 0.5 || minPilotScore > 1)
    throw new Error('Invalid pilot threshold')
  if (Math.min(image.width, image.height) < TILE_SIZE) return null
  const real = new Float64Array(TILE_SIZE ** 2),
    imag = real.slice(),
    counts = new Uint32Array(real.length)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const p = (y * image.width + x) * 4,
        i = (y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)
      real[i] +=
        channel === 'blue'
          ? image.data[p + 2] - (image.data[p] + image.data[p + 1]) / 2
          : (image.data[p] + image.data[p + 1] + image.data[p + 2]) / 3
      counts[i]++
    }
  for (let i = 0; i < real.length; i++) real[i] /= counts[i] || 1
  fft2(real, imag, TILE_SIZE)
  const points = carriers(namespace)
  const observations = points.map(({ x, y, phase }) => {
    const i = y * TILE_SIZE + ((x + TILE_SIZE) % TILE_SIZE)
    return {
      r: real[i] * Math.cos(phase) + imag[i] * Math.sin(phase),
      i: imag[i] * Math.cos(phase) - real[i] * Math.sin(phase),
    }
  })
  const sr = new Float64Array(real.length),
    si = sr.slice()
  points.slice(DATA_BITS).forEach(({ x, y }, j) => {
    const value = observations[DATA_BITS + j],
      length = Math.hypot(value.r, value.i) || 1
    const i = y * TILE_SIZE + ((x + TILE_SIZE) % TILE_SIZE),
      mirror = (TILE_SIZE - y) * TILE_SIZE + ((TILE_SIZE - x) % TILE_SIZE)
    sr[i] = sr[mirror] = value.r / length
    si[i] = value.i / length
    si[mirror] = -si[i]
  })
  fft2(sr, si, TILE_SIZE, true)
  const best: { index: number; score: number }[] = []
  for (let i = 0; i < sr.length; i++) {
    const score = (sr[i] * TILE_SIZE ** 2) / (2 * PILOTS)
    if (score >= minPilotScore && (best.length < 16 || score > best[best.length - 1].score)) {
      best.push({ index: i, score })
      best.sort((a, b) => b.score - a.score)
      best.length = Math.min(best.length, 16)
    }
  }
  for (const { index, score } of best) {
    const offsetY = Math.floor(index / TILE_SIZE),
      offsetX = index % TILE_SIZE
    const symbols = points.slice(0, DATA_BITS).map(({ x, y }, i) => {
      const angle = (2 * Math.PI * (y * offsetY + x * offsetX)) / TILE_SIZE,
        value = observations[i]
      return value.r * Math.cos(angle) - value.i * Math.sin(angle)
    })
    const decoded = decodeBits(symbols, namespace)
    if (decoded)
      return {
        recordId: decoded.recordId,
        protocol: PROTOCOL,
        integrityChecked: true,
        authenticated: false,
        pilotScore: score,
        correctedBits: decoded.corrected,
        offsetX,
        offsetY,
      }
  }
  return null
}
