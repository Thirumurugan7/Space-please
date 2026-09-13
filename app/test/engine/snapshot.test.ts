import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSnapshot, saveSnapshot } from '../../src/engine/snapshot'
import { treeFromPaths } from '../helpers/treeFixture'

let dir: string
let file: string
const info = { root: '/r', scannedAt: 1_700_000_123, incomplete: false, errors: 4 }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sa-snap-'))
  file = join(dir, 'snapshot.bin')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const sample = () => treeFromPaths('/r', { 'docs/a.pdf': { size: 100 }, 'café/😀.txt': { size: 7 }, 'gone/x': { size: 9 } })

describe('snapshot', () => {
  it('round-trips the tree and metadata, keeping removals', async () => {
    const tree = sample()
    tree.remove(tree.lookup('/r/gone')!)
    await saveSnapshot(file, tree, info)
    expect(existsSync(`${file}.tmp`)).toBe(false)

    const loaded = await loadSnapshot(file)
    expect(loaded).not.toBeNull()
    expect(loaded!.info).toEqual(info)
    const t = loaded!.tree
    expect(t.total[0]).toBe(107)
    expect(t.path(t.lookup('/r/café/😀.txt')!)).toBe('/r/café/😀.txt')
    expect(t.lookup('/r/gone')).toBeNull()
  })

  it('returns null for a missing file', async () => {
    expect(await loadSnapshot(join(dir, 'nope.bin'))).toBeNull()
  })

  it('discards truncated, foreign and wrong-version files', async () => {
    await saveSnapshot(file, sample(), info)
    const good = readFileSync(file)

    writeFileSync(file, good.subarray(0, good.length - 1))
    expect(await loadSnapshot(file)).toBeNull()
    expect(existsSync(file)).toBe(false)

    writeFileSync(file, Buffer.from('not a snapshot at all'))
    expect(await loadSnapshot(file)).toBeNull()
    expect(existsSync(file)).toBe(false)

    writeFileSync(file, Buffer.from(good.toString('latin1').replace('"version":1', '"version":9'), 'latin1'))
    expect(await loadSnapshot(file)).toBeNull()
    expect(existsSync(file)).toBe(false)
  })
})
