import { join } from 'node:path'
import { BrowserWindow, app, net } from 'electron'
import { CHANNELS } from '../shared/api'
import type { EngineEvent } from '../shared/types'
import { EngineClient } from './engineClient'
import { registerIpc } from './ipc'
import { bundlePath } from './protectedPaths'
import { resolveScannerPath, unpackedPath } from './system'
import { Telemetry, telemetryActive } from './telemetry'

if (process.env.SA_USER_DATA) app.setPath('userData', process.env.SA_USER_DATA)

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Space-please',
    titleBarStyle: 'hiddenInset',
    // Transparent background + vibrancy gives the sidebar real macOS frosted glass; the renderer
    // paints its own gradient behind the main content.
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => window.show())
  // Prevent dragging a file/link onto the window (or a renderer-triggered navigation) from
  // loading arbitrary content into a webContents that has window.sa access.
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  window.on('closed', () => {
    win = null
  })
  return window
}

void app.whenReady().then(() => {
  const home = app.getPath('home')

  const telemetry = new Telemetry({
    userDataDir: app.getPath('userData'),
    env: {
      app_version: app.getVersion(),
      os_version: process.getSystemVersion(),
      arch: process.arch,
      locale: app.getLocale(),
    },
    active: telemetryActive({ env: process.env, isPackaged: app.isPackaged }),
    fetch: (url, init) =>
      net.fetch(url, init).then((res) => ({ ok: res.ok })),
  })
  const launchedAt = Date.now()
  telemetry.track('app_open', { first_launch: telemetry.isFirstLaunch() })

  // Watch scan lifecycle for scan_complete / scan_error without the renderer being involved.
  let scanStartedAt = 0
  const onEngineEvent = (event: EngineEvent) => {
    if (event.type === 'state') {
      if (event.state.status === 'scanning') scanStartedAt = Date.now()
      else if (event.state.status === 'ready') {
        telemetry.track('scan_complete', {
          files: event.state.entries,
          bytes: event.state.totalSize,
          duration_ms: scanStartedAt ? Date.now() - scanStartedAt : 0,
          unreadable: event.state.errors,
          incomplete: event.state.incomplete,
        })
      } else if (event.state.status === 'error') {
        telemetry.track('scan_error', {})
      }
    }
    win?.webContents.send(CHANNELS.engineEvent, event)
  }

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
    onEngineEvent,
  )

  registerIpc({
    engine,
    home,
    appPath: bundlePath(app.getPath('exe')),
    window: () => win,
    env: process.env,
    isPackaged: app.isPackaged,
    telemetry,
  })
  win = createWindow()
  void engine.call('init')

  let flushed = false
  app.on('before-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    telemetry.track('app_quit', { session_seconds: Math.round((Date.now() - launchedAt) / 1000) })
    // The worker may have died or hung: never let a stuck/rejected flush() block quitting.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000))
    void Promise.race([Promise.all([engine.call('flush').catch(() => {}), telemetry.flush()]), timeout]).finally(() => {
      flushed = true
      void engine.terminate()
      app.quit()
    })
  })
})

app.on('window-all-closed', () => app.quit())
