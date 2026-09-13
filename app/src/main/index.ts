import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'

void app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
})

app.on('window-all-closed', () => app.quit())
