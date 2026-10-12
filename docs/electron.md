# Integrating with Electron

## Package and lifecycle

Build and `npm pack` this repository, then install the tarball into your Electron
project. Import `veiltrace/browser` in renderer code bundled by Vite/electron-vite.
The browser entry imports only the core; it does not import `pngjs`, Node or Python.
Import `veiltrace/node` only in Main, a utility process, or a Node worker. This
package is ESM; CommonJS Main code can use `await import('veiltrace/node')`.

For Vue, create `ScreenOverlay` in `onMounted` and call `dispose` in
`onBeforeUnmount`. Use a stable, viewport-sized host around the app. Do not attach
to scrolling content if you require a stationary screen carrier. Create a new
overlay in each window and issue a fresh opaque record when changing session or
tenant. `update` takes complete options; omitted options reset to defaults.
Invalid updates dispose the old layers before throwing, so stale identity is not
retained. Removing a host requires disposing its overlay.

`ScreenOverlay` may set `position: relative` and `isolation: isolate`. It restores
its own inline changes on disposal, unless application code replaced those values.
Review stacking contexts and modal/teleport placement in the actual application.
Overlay layers have `pointer-events: none`, `aria-hidden`, and no mouse handlers.
It does not cover native video surfaces, separate BrowserViews/webviews or other
windows. It is not tamper-resistant.

## CSP and security

Keep `nodeIntegration: false`, `contextIsolation: true`, and the sandbox enabled.
No IPC bridge is needed for drawing the overlay. Pass only an opaque backend-issued
record through an existing narrowly scoped bridge. Do not pass signing keys.
Canvas-generated images need `img-src data:`; dynamically set styles must be
permitted by the host's style policy. Validate CSP in the actual app rather than
relaxing its entire policy. A decoder Worker also needs the appropriate `worker-src`.

## Decoding

The core decoder is synchronous. Run it in a Web Worker in Renderer or a Node
worker for Main. Apply a pixel limit and deadline for untrusted inputs. Match the
embedding namespace and channel. PNG is the only format handled by the Node
adapter; decode other image formats to opaque RGBA separately.

The overlay uses `256 / devicePixelRatio` CSS pixels per tile, so at DPR 2 it draws
a 128 CSS-pixel tile spanning 256 physical pixels. A window resize updates the
tile size. Decode the native-resolution screenshot directly. Do not downsample
to CSS resolution first. Capture with `scale: 'device'` in Playwright tests.
Arbitrary image scaling is not recovered automatically. Fractional DPR, browser
zoom, display transitions, CSS transforms and screenshot-tool resampling still
need acceptance on your exact display setup. DPR 1 in Chrome and DPR 2 in macOS
Electron have bounded synthetic evidence; other combinations are unverified.

## Runnable example

```sh
# Terminal 1, repository root
npm ci
npm run demo
# Terminal 2, using Electron already installed in your application
/path/to/your/app/node_modules/.bin/electron examples/electron/main.cjs
```

The example loads the local lab and uses a temporary profile. It does not patch
an installed app, reuse an account profile, or create a Python service. For
production, bundle the renderer entry with your application's existing build.

For an automated macOS check with a locally installed Electron executable:

```sh
ELECTRON_BINARY=/path/to/Electron.app/Contents/MacOS/Electron npm run verify:electron
```

This checks a real Chromium renderer, screenshot decoding, and lifecycle cleanup;
it is not platform acceptance for Windows/Linux or phone capture.
