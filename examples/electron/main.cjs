const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veiltrace-electron-'))
app.setPath('userData', profile)
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1440,
    height: 1100,
    title: 'VeilTrace Electron Lab',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  window.loadURL(process.env.VEILTRACE_DEMO_URL || 'http://127.0.0.1:8765')
})
app.on('window-all-closed', () => app.quit())
app.on('quit', () => {
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch {
    /* Best effort for locked browser files. */
  }
})
