import { describe, expect, it } from 'vitest'
import { allButOne, pruneDuplicates } from '../../src/renderer/lib/cleanup'
import type { DuplicatesResult, Row } from '../../src/shared/types'

const row = (id: number, mtime: number): Row => ({ id, name: `f${id}`, path: `/f${id}`, kind: 'file', type: 'other', size: 100, items: 0, mtime })

const result: DuplicatesResult = {
  cancelled: false,
  wasted: 300,
  groups: [
    { size: 100, hash: 'a', wasted: 200, items: [row(1, 10), row(2, 30), row(3, 20)] },
    { size: 100, hash: 'b', wasted: 100, items: [row(4, 1), row(5, 2)] },
  ],
}

describe('pruneDuplicates', () => {
  it('removes trashed copies, recomputes waste and drops singleton groups', () => {
    const pruned = pruneDuplicates(result, new Set([1, 4]))
    expect(pruned.groups).toHaveLength(1)
    expect(pruned.groups[0].items.map((r) => r.id)).toEqual([2, 3])
    expect(pruned.groups[0].wasted).toBe(100)
    expect(pruned.wasted).toBe(100)
  })
})

describe('allButOne', () => {
  it('keeps the newest or oldest copy', () => {
    const items = result.groups[0].items
    expect(allButOne(items, 'newest').map((r) => r.id)).toEqual([1, 3])
    expect(allButOne(items, 'oldest').map((r) => r.id)).toEqual([2, 3])
    expect(allButOne([row(9, 0)], 'newest')).toEqual([])
  })
})
