import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Engine } from '../../src/engine/engine'
import { emptyQuery } from '../../src/engine/query'
import type { EngineEvent } from '../../src/shared/types'
import { requireScanner } from '../helpers/scanner'

let scanner: string
let dir: string
let data: string
let root: string

beforeAll(() => {
  scanner = requireScanner()
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sa-engine-'))
  root = join(dir, 'root')
  data = join(dir, 'data')
  mkdirSync(join(root, 'Downloads'), { recursive: true })
  mkdirSync(data)
  writeFileSync(join(root, 'Downloads', 'movie.mov'), Buffer.alloc(50_000))
  writeFileSync(join(root, 'notes.txt'), 'hi')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeEngine(events: EngineEvent[] = []) {
  return new Engine({ scannerPath: scanner, snapshotPath: join(data, 'snapshot.bin'), home: root, saveDelayMs: 10 }, (e) => events.push(e))
}

const sort = { key: 'size', dir: 'desc' } as const

describe('Engine', () => {
  it('starts empty when there is no snapshot', async () => {
    const events: EngineEvent[] = []
    const state = await makeEngine(events).init()
    expect(state.status).toBe('empty')
    expect(events).toEqual([{ type: 'state', state }])
  })

  it('scans, answers queries and saves a snapshot', async () => {
    const events: EngineEvent[] = []
    const engine = makeEngine(events)
    await engine.init()
    const state = await engine.startScan(root)

    expect(events.filter((e) => e.type === 'state').map((e) => e.type === 'state' && e.state.status)).toEqual(['empty', 'scanning', 'ready'])
    expect(state).toMatchObject({ status: 'ready', root, incomplete: false, entries: 4, errors: 0, message: null })
    expect(state.totalSize).toBeGreaterThanOrEqual(50_000)

    expect(engine.children(0, sort, 0, 10).rows.map((r) => r.name)).toEqual(['Downloads', 'notes.txt'])
    expect(engine.searchPage({ ...emptyQuery(), text: 'MOVIE' }, sort, 0, 10).rows.map((r) => r.name)).toEqual(['movie.mov'])
    expect(engine.sunburst(0)!.name).toBe(root)
    expect(engine.breadcrumb(0)).toEqual([{ id: 0, name: root }])
    expect(existsSync(join(data, 'snapshot.bin'))).toBe(true)

    const reloaded = await makeEngine().init()
    expect(reloaded).toMatchObject({ status: 'ready', root, entries: 4, scannedAt: state.scannedAt })
  })

  it('removes entries, updates totals and persists after flush', async () => {
    const engine = makeEngine()
    await engine.init()
    await engine.startScan(root)
    const movie = engine.searchPage({ ...emptyQuery(), text: 'movie' }, sort, 0, 1).rows[0]
    expect(engine.paths([movie.id, 99_999])).toEqual([{ id: movie.id, path: join(root, 'Downloads', 'movie.mov') }])

    const before = engine.getState().totalSize
    const state = engine.remove([movie.id])
    expect(state.totalSize).toBe(before - movie.size)
    expect(state.entries).toBe(3)
    expect(engine.searchPage({ ...emptyQuery(), text: 'movie' }, sort, 0, 1).total).toBe(0)
    await engine.flush()

    const reloaded = makeEngine()
    await reloaded.init()
    expect(reloaded.searchPage({ ...emptyQuery(), text: 'movie' }, sort, 0, 1).total).toBe(0)
  })

  it('offers cleanup categories relative to home', async () => {
    const engine = makeEngine()
    await engine.init()
    expect(engine.cleanup(1)).toEqual([])
    await engine.startScan(root)
    const large = engine.cleanup(10_000).find((c) => c.id === 'large')!
    expect(large.items.map((r) => r.name)).toEqual(['movie.mov'])
  })

  it('does not let a slow init() snapshot load overwrite a scan that started before it resolved', async () => {
    // Produce a real snapshot on disk so a fresh engine's init() has genuine async work to do.
    const seed = makeEngine()
    await seed.init()
    await seed.startScan(root)
    await seed.flush()

    const root2 = join(dir, 'root2')
    mkdirSync(root2, { recursive: true })
    writeFileSync(join(root2, 'other.txt'), 'x')

    const engine = makeEngine()
    const initPromise = engine.init() // intentionally not awaited, as some callers (and old bugs) do
    const state = await engine.startScan(root2)
    await initPromise

    expect(state.root).toBe(root2)
    expect(engine.getState().root).toBe(root2)
    expect(engine.children(0, sort, 0, 10).rows.map((r) => r.name)).toEqual(['other.txt'])
  })

  it('still works when startScan is called without init ever running', async () => {
    const engine = makeEngine()
    const state = await engine.startScan(root)
    expect(state.status).toBe('ready')
    expect(state.root).toBe(root)
  })

  it('enters the error state when the root cannot be scanned', async () => {
    const engine = makeEngine()
    await engine.init()
    const state = await engine.startScan(join(root, 'missing'))
    expect(state.status).toBe('error')
    expect(state.message).toContain('cannot scan')
    expect(engine.children(0, sort, 0, 10)).toEqual({ rows: [], total: 0 })
  })
})
