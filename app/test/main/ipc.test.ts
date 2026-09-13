import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS as C } from '../../src/shared/api'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] as string[] }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
  dialog: { showOpenDialog },
  shell: { trashItem: vi.fn(), showItemInFolder: vi.fn(), openPath: vi.fn(), openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
  BrowserWindow: class {},
}))

const { registerIpc } = await import('../../src/main/ipc')

function baseDeps(overrides: Partial<Parameters<typeof registerIpc>[0]> = {}) {
  return {
    engine: {} as never,
    home: '/Users/me',
    appPath: '/Applications/Space Analyser.app',
    window: () => null,
    env: {},
    isPackaged: false,
    ...overrides,
  }
}

describe('registerIpc dialog:chooseFolder', () => {
  beforeEach(() => {
    handlers.clear()
    showOpenDialog.mockClear()
  })

  it('honours SA_E2E_CHOOSE_FOLDER in development', async () => {
    registerIpc(baseDeps({ env: { SA_E2E_CHOOSE_FOLDER: '/tmp/e2e-fixture' }, isPackaged: false }))
    const handler = handlers.get(C.dialogChooseFolder)!
    await expect(handler()).resolves.toBe('/tmp/e2e-fixture')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('ignores SA_E2E_CHOOSE_FOLDER in a packaged build and falls back to the real dialog', async () => {
    registerIpc(baseDeps({ env: { SA_E2E_CHOOSE_FOLDER: '/tmp/e2e-fixture' }, isPackaged: true }))
    const handler = handlers.get(C.dialogChooseFolder)!
    await expect(handler()).resolves.toBeNull()
    expect(showOpenDialog).toHaveBeenCalled()
  })
})
