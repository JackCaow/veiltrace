# VeilTrace

An experimental TypeScript screen watermark SDK for Electron and web apps.
It embeds an opaque tracing record in a subtle, repeating spectral carrier and
attempts to recover that record from digital screenshots without the original image.

**Research alpha.** Default blue-channel marks recover from our synthetic dark
and light workspace PNG captures and crops at native scale. JPEG and resizing
can erase the signal. Phone-camera recovery and human imperceptibility are not
validated. A recovered record is a hint, **not authenticated evidence**.

## Electron integration

No Python, model download, native addon, or extra runtime process. Three ESM entry points:

| Entry               | Use                                             | Runtime dependency              |
| ------------------- | ----------------------------------------------- | ------------------------------- |
| `veiltrace`         | Raw RGBA encoder/decoder and carrier generation | None                            |
| `veiltrace/browser` | DOM overlay in Electron Renderer or browser     | Canvas and Chromium blend modes |
| `veiltrace/node`    | PNG encoder/decoder in Node or Electron Main    | `pngjs` (JavaScript)            |

The package is not published to npm yet. Clone this repository and install a local tarball:

```sh
git clone https://github.com/JackCaow/veiltrace.git
cd veiltrace
npm ci
npm test
npm pack
# In your Electron project (substitute the actual tarball path):
npm install /path/to/veiltrace/veiltrace-0.1.0-alpha.1.tgz
```

Renderer, with `nodeIntegration: false` and `contextIsolation: true`:

```ts
import { ScreenOverlay } from 'veiltrace/browser'

// Obtain a fresh, opaque 48-bit record from your own application backend.
// Keep the record-to-user/session mapping on the server.
const watermark = new ScreenOverlay({
  target: document.getElementById('app')!,
  recordId: '123456abcdef', // demo only; do not hard-code this in production
  namespace: 'your-app-v1', // public synchronization parameter, not a secret
  amplitude: 1,
  channel: 'blue',
})

watermark.update({ recordId: 'abcdef123456', namespace: 'your-app-v1' })
// On logout, route teardown, or session replacement:
watermark.dispose()
```

Node or Electron Main, preferably in a worker rather than blocking the UI:

```ts
import { readFile } from 'node:fs/promises'
import { decodePNG } from 'veiltrace/node'

const result = decodePNG(await readFile('screenshot.png'), {
  namespace: 'your-app-v1',
  channel: 'blue',
})
// null means no accepted record. Do not guess a user on failure.
console.log(result?.recordId, result?.authenticated) // false, even when recovered
```

See [Electron lifecycle, CSP, workers and DPR](docs/electron.md).
The [standalone Electron example](examples/electron/main.cjs) uses the local visual
lab, with an isolated profile and secure renderer preferences.

## Visual lab and verification

```sh
npm run demo              # http://127.0.0.1:8765
npm run benchmark         # results/index.html and results/checks.json
npm run typecheck
```

The visual lab generates fictional enterprise workspace content. Uploaded images
are decoded locally in a Web Worker; the server only serves static assets. Compare
ON/OFF at 100% zoom. Evaluate visual quality on your actual displays before use.
Use `VEILTRACE_BROWSER_CHANNEL=chrome npm run benchmark` to test installed Chrome,
or run `npx playwright install chromium` first.

The benchmark retains successes **and misses** for four surfaces, two channels,
three amplitudes, PNG, JPEG85, crop and 75% resize. It requires default blue/1 native
PNG and crop fixture recovery, plus runtime/lifecycle/negative checks. A successful
command does not mean all recovery attempts passed. Pixel differences and PSNR
are measurements, not a perceptual guarantee.

## Limits and threat model

- Native-scale digital screenshots only. Browser tiles follow device pixel ratio
  to keep a 256-physical-pixel period. Caller must account for later image resizing.
- A minimum dimension below 256 returns `null`. Content, crop size, clipping and
  compression affect recovery; arbitrary app pages are not validated.
- Public patterns can be removed, forged or replayed. CRC32 detects accidental
  corruption, not malicious modification. Namespace is not a key.
- Only use random opaque IDs. Never embed names, email addresses, access tokens or
  server secrets. Resolve IDs against access-controlled server records.
- The DOM overlay cannot protect exports, separate native surfaces, webviews,
  developer tools, or a modified client. Each BrowserWindow needs its own overlay.
- Overlay blend modes create a stacking context and can affect compositing/text
  antialiasing. The core residual bound is **not** a guarantee on every final DOM
  pixel. At black/white limits CSS blending differs from offline RGBA addition.
  OFF retains neutral layers to stabilize toggles; `dispose()` removes them.
  Benchmark `mountEffects` records unmounted-to-neutral changes separately.
- Use a rectangular viewport host. Rounded hosts are rejected in this alpha due
  to Chromium clip-boundary artifacts; nested rounded content is allowed.
- No phone-camera, HDR, rotation, perspective, adversarial-removal, production
  false-positive-rate, or cross-platform Electron acceptance claim.

Protocol details: [docs/protocol.md](docs/protocol.md).
Measurement scope: [docs/validation.md](docs/validation.md).
Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. Original implementation; no third-party watermark model weights or
proprietary application assets are included. Dependencies retain their licenses.
