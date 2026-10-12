import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.PORT || 8765)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port')
const assets = new Map([
  ['/', 'web/index.html'],
  ['/style.css', 'web/style.css'],
  ['/app.js', 'web/app.js'],
  ['/decoder-worker.js', 'web/decoder-worker.js'],
])
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    let file = assets.get(url.pathname)
    if (!file && /^\/dist\/(core|browser)\/[a-z-]+\.js$/.test(url.pathname))
      file = url.pathname.slice(1)
    if (!file || request.method !== 'GET') {
      response.writeHead(404)
      response.end()
      return
    }
    const content = await fs.readFile(path.join(root, file)),
      ext = path.extname(file)
    response.writeHead(200, {
      'Content-Type':
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.css'
            ? 'text/css; charset=utf-8'
            : 'text/javascript; charset=utf-8',
      'Content-Length': content.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
})
server.listen(port, '127.0.0.1', () =>
  console.log(`VeilTrace visual lab: http://127.0.0.1:${port}`),
)
process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())
