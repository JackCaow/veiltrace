# Validation scope

Local verification on macOS Apple Silicon, October 12–13, 2026. Synthetic content
only. These results describe the included fixture, not arbitrary office pages.

| Check                                                 | Result                                   |
| ----------------------------------------------------- | ---------------------------------------- |
| Core, FFT, PNG adapter, invalid and malicious inputs  | 14 automated tests passed                |
| Chrome DPR 1, default blue/amplitude 1, four surfaces | 4/4 native PNG records recovered         |
| Same four surfaces, 640×480 crop at offset 37,53      | 4/4 records recovered                    |
| Same four surfaces, JPEG quality 85                   | 0/4 records recovered                    |
| Same four surfaces, 75% resize                        | 0/4 records recovered                    |
| Original unmarked Chrome fixtures                     | 0/4 accepted                             |
| Electron 37.10.0 macOS, DPR 2, default settings       | Dark and light native captures recovered |
| Electron local Worker upload of those PNGs            | Both records recovered                   |
| Electron secure preferences and overlay lifecycle     | Passed                                   |
| Duplicate host and reloaded-module ownership checks   | Chrome and macOS Electron passed         |

PNG regression cases verify that duplicate IHDR, interlaced inflation payloads,
oversized/repeated palettes and malformed chunk/metadata structures are rejected
before calling the production `pngjs` decoder. Valid non-interlaced grayscale,
indexed and RGBA PNG controls remain accepted. The Node adapter now explicitly
rejects Adam7/interlaced input rather than entering its unbounded inflate path.

The final rectangular-host Chrome fixture has default carrier ON/OFF differences
`0/0/1`. Its unmounted-to-neutral mounting differences are recorded separately in
`mountEffects` (macOS fixtures measured `1/1/1`). Electron DPR 2 native ON/OFF
captures measured `0/0/1`, also `0/0/1` over a known empty rail region. This is not a bound
for every renderer, image or display. Initial CSS-resolution downsampling of the
DPR 2 capture both removed the carrier and exposed antialiasing differences up
to ten levels. Native-resolution capture and DPR-aware drawing are required.
Earlier Linux runs exposed glyph compositing changes and rounded-host boundary
differences up to 11 levels even with an edge guard. The SDK now rejects rounded
hosts; those experiments are not claimed as successful visual acceptance. Use a
rectangular viewport host and separately inspect mounting effects on your display.

Run `npm run benchmark` to reproduce all 24 parameter rows and 96 attack attempts,
including misses. It checks default PNG/crop recovery, runtime, lifecycle,
negatives and a small compositor budget, but does not assert universal decoding.
Run `npm run verify:electron`
with `ELECTRON_BINARY` to check actual Electron recovery. Generated reports are
under `results/` and excluded from Git/package distribution.

No human blind study, phone-camera capture, perspective/rotation, HDR, busy real
office content, calibrated false-positive rate, tamper resistance, or Windows/
Linux Electron validation. CI config runs the core on three OSes; that is separate
from real screenshot acceptance. Higher strengths and gray carriers are experimental
comparisons, not automatically recommended production settings.
