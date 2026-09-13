import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'
import { CHANNELS } from '../shared/api'
import { EngineClient } from './engineClient'
import { registerIpc } from './ipc'
import { bundlePath } from './protectedPaths'
import { resolveScannerPath, unpackedPath } from './system'

if (process.env.SA_USER_DATA) app.setPath('userData', process.env.SA_USER_DATA)

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Space Analyser',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f5f5f7',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  window.on('closed', () => {
    win = null
  })
  return window
}

void app.whenReady().then(() => {
  const home = app.getPath('home')
  const engine = new EngineClient(
    unpackedPath(join(__dirname, 'engine.js')),
    {
      scannerPath: resolveScannerPath({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        env: process.env,
      }),
      snapshotPath: join(app.getPath('userData'), 'snapshot.bin'),
      home,
    },
    (event) => win?.webContents.send(CHANNELS.engineEvent, event),
  )

  registerIpc({ engine, home, appPath: bundlePath(app.getPath('exe')), window: () => win, env: process.env })
  win = createWindow()
  void engine.call('init')

  let flushed = false
  app.on('before-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    void engine
      .call('flush')
      .catch(() => {})
      .finally(() => {
        flushed = true
        void engine.terminate()
        app.quit()
      })
  })
})

app.on('window-all-closed', () => app.quit())
