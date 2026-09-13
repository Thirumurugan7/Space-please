import { describe, expect, it } from 'vitest'
import { clickRow, emptySelection, nextSort, selectForContextMenu, selectedSize, withoutIds } from '../../src/renderer/lib/selection'
import type { Row } from '../../src/shared/types'

const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i, name: `r${i}`, path: `/r${i}`, kind: 'file', type: 'other', size: (i + 1) * 10, items: 0, mtime: 0,
}))
const rowAt = (i: number) => rows[i]
const ids = (s: ReturnType<typeof emptySelection>) => [...s.rows.keys()].sort()
const plain = { shift: false, meta: false }

describe('clickRow', () => {
  it('replaces the selection on a plain click', () => {
    const s = clickRow(clickRow(emptySelection(), 1, rows[1], plain, rowAt), 3, rows[3], plain, rowAt)
    expect(ids(s)).toEqual([103])
    expect(s.anchor).toBe(3)
  })

  it('toggles with Cmd', () => {
    let s = clickRow(emptySelection(), 1, rows[1], plain, rowAt)
    s = clickRow(s, 4, rows[4], { shift: false, meta: true }, rowAt)
    expect(ids(s)).toEqual([101, 104])
    s = clickRow(s, 1, rows[1], { shift: false, meta: true }, rowAt)
    expect(ids(s)).toEqual([104])
  })

  it('selects a range from the anchor with Shift, skipping unloaded rows', () => {
    let s = clickRow(emptySelection(), 4, rows[4], plain, rowAt)
    s = clickRow(s, 1, rows[1], { shift: true, meta: false }, (i) => (i === 2 ? undefined : rows[i]))
    expect(ids(s)).toEqual([101, 103, 104])
    expect(s.anchor).toBe(4)
  })

  it('adds a range with Cmd+Shift', () => {
    let s = clickRow(emptySelection(), 0, rows[0], plain, rowAt)
    s = clickRow(s, 5, rows[5], { shift: false, meta: true }, rowAt)
    s = clickRow(s, 3, rows[3], { shift: true, meta: true }, rowAt)
    expect(ids(s)).toEqual([100, 103, 104, 105])
  })
})

describe('selection helpers', () => {
  it('keeps the selection when right-clicking a selected row', () => {
    const s = clickRow(clickRow(emptySelection(), 0, rows[0], plain, rowAt), 1, rows[1], { shift: false, meta: true }, rowAt)
    expect(selectForContextMenu(s, 1, rows[1])).toBe(s)
    expect(ids(selectForContextMenu(s, 2, rows[2]))).toEqual([102])
  })

  it('removes ids and sums sizes', () => {
    let s = clickRow(emptySelection(), 0, rows[0], plain, rowAt)
    s = clickRow(s, 2, rows[2], { shift: true, meta: false }, rowAt)
    expect(selectedSize(s)).toBe(60)
    const after = withoutIds(s, [101, 999])
    expect(ids(after)).toEqual([100, 102])
    expect(withoutIds(after, [999])).toBe(after)
    expect(withoutIds(after, [100, 102]).anchor).toBeNull()
  })
})

describe('nextSort', () => {
  it('flips the active column and picks sensible defaults for new ones', () => {
    expect(nextSort({ key: 'size', dir: 'desc' }, 'size')).toEqual({ key: 'size', dir: 'asc' })
    expect(nextSort({ key: 'size', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(undefined, 'mtime')).toEqual({ key: 'mtime', dir: 'desc' })
  })
})
