import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findDuplicates, hashFile } from '../../src/engine/duplicates'
import type { DuplicateProgress } from '../../src/shared/types'
import { treeFromPaths } from '../helpers/treeFixture'

const MB = 1_000_000
let dir: string

function bytes(size: number, seed: number): Buffer {
  const b = Buffer.alloc(size)
  for (let i = 0; i < size; i++) b[i] = (i * 31 + seed) & 0xff
  return b
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sa-dupes-'))
  const a = bytes(1.5 * MB, 1)
  writeFileSync(join(dir, 'a.bin'), a)
  writeFileSync(join(dir, 'b.bin'), a)
  const c = Buffer.from(a)
  c[c.length - 1] ^= 0xff // same size and head, different tail
  writeFileSync(join(dir, 'c.bin'), c)
  writeFileSync(join(dir, 'd.bin'), bytes(2 * MB, 2))
  writeFileSync(join(dir, 'small1.bin'), bytes(1000, 3))
  writeFileSync(join(dir, 'small2.bin'), bytes(1000, 3))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function tree() {
  return treeFromPaths(dir, {
    'a.bin': { size: 1.5 * MB },
    'b.bin': { size: 1.5 * MB },
    'c.bin': { size: 1.5 * MB },
    'd.bin': { size: 2 * MB },
    'small1.bin': { size: 1000 },
    'small2.bin': { size: 1000 },
    'ghost.bin': { size: 1.5 * MB }, // in the tree but deleted from disk: skipped
  })
}

describe('findDuplicates', () => {
  it('confirms duplicates by full content and reports wasted space', async () => {
    const progress: DuplicateProgress[] = []
    const res = await findDuplicates(tree(), { onProgress: (p) => progress.push(p) })
    expect(res.cancelled).toBe(false)
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].items.map((r) => r.name).sort()).toEqual(['a.bin', 'b.bin'])
    expect(res.groups[0].wasted).toBe(1.5 * MB)
    expect(res.wasted).toBe(1.5 * MB)
    expect(progress.at(-1)).toEqual({ phase: 'done', done: 4, total: 4 })
  })

  it('respects minSize', async () => {
    const res = await findDuplicates(tree(), { minSize: 500 })
    expect(res.groups.map((g) => g.items.length)).toEqual([2, 2])
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const res = await findDuplicates(tree(), { signal: controller.signal })
    expect(res).toEqual({ groups: [], wasted: 0, cancelled: true })
  })

  it('skips removed entries', async () => {
    const t = tree()
    t.remove(t.lookup(join(dir, 'b.bin'))!)
    expect((await findDuplicates(t)).groups).toHaveLength(0)
  })
})

describe('hashFile', () => {
  it('hashes a prefix or the whole file and returns null when unreadable', async () => {
    const whole = await hashFile(join(dir, 'a.bin'))
    const head = await hashFile(join(dir, 'a.bin'), 64 * 1024)
    expect(whole).toMatch(/^[0-9a-f]{64}$/)
    expect(head).not.toBe(whole)
    expect(await hashFile(join(dir, 'c.bin'), 64 * 1024)).toBe(head)
    expect(await hashFile(join(dir, 'missing.bin'))).toBeNull()
  })
})
