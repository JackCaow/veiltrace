/** Original radix-2 FFT. Core has no Node, DOM, Python or native-module dependency. */
export function fft(real: Float64Array, imag: Float64Array, inverse = false): void {
  const n = real.length
  if (n !== imag.length || n < 2 || (n & (n - 1)) !== 0)
    throw new Error('FFT size must be a power of two')
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length
    const cos = Math.cos(angle),
      sin = Math.sin(angle)
    for (let start = 0; start < n; start += length) {
      let wr = 1,
        wi = 0
      for (let j = 0; j < length / 2; j++) {
        const a = start + j,
          b = a + length / 2
        const tr = real[b] * wr - imag[b] * wi,
          ti = real[b] * wi + imag[b] * wr
        real[b] = real[a] - tr
        imag[b] = imag[a] - ti
        real[a] += tr
        imag[a] += ti
        const next = wr * cos - wi * sin
        wi = wr * sin + wi * cos
        wr = next
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      real[i] /= n
      imag[i] /= n
    }
}

export function fft2(real: Float64Array, imag: Float64Array, n: number, inverse = false): void {
  if (real.length !== n * n || imag.length !== n * n) throw new Error('Invalid 2D FFT input')
  const r = new Float64Array(n),
    im = new Float64Array(n)
  for (let y = 0; y < n; y++) {
    r.set(real.subarray(y * n, (y + 1) * n))
    im.set(imag.subarray(y * n, (y + 1) * n))
    fft(r, im, inverse)
    real.set(r, y * n)
    imag.set(im, y * n)
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      r[y] = real[y * n + x]
      im[y] = imag[y * n + x]
    }
    fft(r, im, inverse)
    for (let y = 0; y < n; y++) {
      real[y * n + x] = r[y]
      imag[y * n + x] = im[y]
    }
  }
}
