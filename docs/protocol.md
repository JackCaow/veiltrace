# Spectral TypeScript v1

Protocol ID: `veiltrace-spectral-ts-v1`. This is an experimental protocol, not an
interoperability standard. Alpha releases may require explicitly versioned changes.

1. Encode a 48-bit ID (12 lowercase hex characters) and a 32-bit CRC of the protocol,
   public namespace, and ID. Bytes and bits use big-endian ordering.
2. Encode 80 bits as twenty Hamming(7,4) words (140 signs). Add 24 known pilot signs.
3. Select 164 integer frequency pairs in an annulus of 22–46 cycles per 256 pixels.
   FNV-1a and a deterministic PRNG provide public frequency permutation/phases.
   Hermitian symmetry produces a real periodic field via a radix-2 inverse FFT.
4. Apply smooth `tanh` saturation relative to RMS, subtract the mean and normalize
   the peak to the requested amplitude. This increases carrier energy retained
   after 8-bit quantization without introducing hard cell boundaries.
5. Offline embedding adds the field to blue (or all RGB channels), rounds and
   clips. Browser embedding uses quantized positive and negative opaque PNG
   layers, with `plus-lighter` and `difference` blending. At channel zero,
   difference reflects negative values rather than clipping. Browser compositing
   can introduce additional rounding and antialiasing differences.
6. Decode the blue opponent signal `B - (R + G)/2` (or mean RGB), fold samples
   modulo 256 and FFT. Pilot phase correlation proposes integer tile offsets.
   Test up to 16 candidates above the default 0.85 pilot threshold. Correct
   Hamming words and accept only if CRC matches. Otherwise return `null`.

The pilot score is a correlation, not calibrated confidence. Hamming corrections
do not prove the payload is genuine. The CRC can be recomputed by any sender.
Detection explicitly returns `authenticated: false`.

Public API limits: opaque RGBA, at most 16 million pixels; PNG input at most 16 MiB;
the Node PNG adapter accepts non-interlaced files only.
amplitude 0.5–4 channel levels. Browser uses a `256 / devicePixelRatio` CSS-pixel
tile, updated on window resize, to target 256 **physical** pixels. Core uses a
256 **image** pixel tile. Capture at native device resolution. Fractional display
scaling, transformed hosts and subsequent resampling require separate validation.
There is no automatic image-scale, rotation, camera-perspective or key search.
