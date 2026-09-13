import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diskInfo, fdaStatus, resolveScannerPath, unpackedPath } from '../../src/main/system'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sa-home-'))
})

afterEach(() => {
  try {
    chmodSync(join(home, 'Library', 'Mail'), 0o755)
  } catch {}
  rmSync(home, { recursive: true, force: true })
})

describe('diskInfo', () => {
  it('reports consistent totals for /', async () => {
    const info = await diskInfo('/')
    expect(info.total).toBeGreaterThan(0)
    expect(info.free).toBeGreaterThan(0)
    expect(info.used).toBe(info.total - info.free)
  })
})

describe('fdaStatus', () => {
  it('is unknown when no probe folder exists', async () => {
    expect(await fdaStatus(home)).toBe('unknown')
  })

  it('is granted when a probe folder is readable', async () => {
    mkdirSync(join(home, 'Library', 'Mail'), { recursive: true })
    expect(await fdaStatus(home)).toBe('granted')
  })

  it('is denied when a probe folder is not readable', async () => {
    mkdirSync(join(home, 'Library', 'Mail'), { recursive: true })
    chmodSync(join(home, 'Library', 'Mail'), 0o000)
    expect(await fdaStatus(home)).toBe('denied')
  })
})

describe('resolveScannerPath', () => {
  const base = { resourcesPath: '/App.app/Contents/Resources', appPath: '/repo/app', env: {} }

  it('uses the bundled binary when packaged and the release build in development', () => {
    expect(resolveScannerPath({ ...base, isPackaged: true })).toBe('/App.app/Contents/Resources/bin/sa-scan')
    expect(resolveScannerPath({ ...base, isPackaged: false })).toBe('/repo/scanner/.build/release/sa-scan')
  })

  it('honours SA_SCANNER_PATH', () => {
    expect(resolveScannerPath({ ...base, isPackaged: true, env: { SA_SCANNER_PATH: '/tmp/sa' } })).toBe('/tmp/sa')
  })
})

describe('unpackedPath', () => {
  it('points into app.asar.unpacked', () => {
    expect(unpackedPath('/A.app/Contents/Resources/app.asar/out/main/engine.js')).toBe(
      '/A.app/Contents/Resources/app.asar.unpacked/out/main/engine.js',
    )
    expect(unpackedPath('/repo/app/out/main/engine.js')).toBe('/repo/app/out/main/engine.js')
  })
})
