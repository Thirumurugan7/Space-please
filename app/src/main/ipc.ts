import { access } from 'node:fs/promises'
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { CHANNELS as C } from '../shared/api'
import type { SearchQuery, Sort, TrashResult } from '../shared/types'
import type { EngineClient } from './engineClient'
import type { GuardContext } from './protectedPaths'
import { FDA_SETTINGS_URL, diskInfo, fdaStatus } from './system'
import { trashPaths } from './trash'

export interface IpcDeps {
  engine: EngineClient
  home: string
  appPath: string
  window(): BrowserWindow | null
  env: Record<string, string | undefined>
  /** Test hooks (like SA_E2E_CHOOSE_FOLDER) are only ever honoured when this is false. */
  isPackaged: boolean
}

export function registerIpc({ engine, home, appPath, window, env, isPackaged }: IpcDeps): void {
  const handle = (channel: string, fn: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (_event, ...args) => fn(...args))
  }
  const onePath = async (id: number) => (await engine.call('paths', [id]))[0]?.path ?? null

  handle(C.scanStart, (root: string) => {
    // Resolves when the scan finishes; the renderer follows progress through engine events.
    void engine.call('startScan', root).catch(() => {})
  })
  handle(C.scanCancel, () => engine.call('cancelScan'))
  handle(C.scanState, () => engine.call('getState'))

  handle(C.treeChildren, (dirId: number, sort: Sort, offset: number, limit: number) => engine.call('children', dirId, sort, offset, limit))
  handle(C.treeSearch, (q: SearchQuery, sort: Sort, offset: number, limit: number) => engine.call('searchPage', q, sort, offset, limit))
  handle(C.treeSunburst, (id: number) => engine.call('sunburst', id))
  handle(C.treeBreadcrumb, (id: number) => engine.call('breadcrumb', id))

  handle(C.cleanupCategories, (threshold: number) => engine.call('cleanup', threshold))
  handle(C.cleanupDuplicates, () => engine.call('findDuplicates'))
  handle(C.cleanupCancelDuplicates, () => engine.call('cancelDuplicates'))

  handle(C.actionsTrash, async (ids: number[]): Promise<TrashResult> => {
    const items = await engine.call('paths', ids)
    const state = await engine.call('getState')
    // Use the tree's own root path (id 0), not the renderer-supplied scan root: that value may
    // carry a trailing slash or otherwise not match what the tree normalised internally.
    const scanRoot = (await engine.call('paths', [0]))[0]?.path ?? state.root
    const ctx: GuardContext = { appPath, scanRoot, home }
    const result = await trashPaths(items, ctx, {
      trashItem: (path) => shell.trashItem(path),
      exists: (path) => access(path).then(() => true, () => false),
    })
    const gone = [...result.trashed, ...result.missing]
    if (gone.length > 0) await engine.call('remove', gone)
    return result
  })
  handle(C.actionsReveal, async (id: number) => {
    const path = await onePath(id)
    if (path) shell.showItemInFolder(path)
  })
  handle(C.actionsOpen, async (id: number) => {
    const path = await onePath(id)
    return path ? shell.openPath(path) : 'This item no longer exists'
  })
  handle(C.actionsCopyPaths, async (ids: number[]) => {
    const items = await engine.call('paths', ids)
    clipboard.writeText(items.map((i) => i.path).join('\n'))
  })

  handle(C.systemDisk, () => diskInfo('/'))
  handle(C.systemFda, () => fdaStatus(home))
  handle(C.systemOpenFdaSettings, () => shell.openExternal(FDA_SETTINGS_URL))
  handle(C.systemHome, () => home)

  handle(C.dialogChooseFolder, async () => {
    if (!isPackaged && env.SA_E2E_CHOOSE_FOLDER) return env.SA_E2E_CHOOSE_FOLDER
    const win = window()
    const options = { title: 'Choose a folder to scan', properties: ['openDirectory' as const] }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
}
