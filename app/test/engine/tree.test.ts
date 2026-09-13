import { describe, expect, it } from 'vitest'
import { FLAG_DELETED, Tree, TreeBuilder } from '../../src/engine/tree'
import { Kind, ROOT_PARENT } from '../../src/shared/protocol'
import { treeFromPaths } from '../helpers/treeFixture'

const enc = (s: string) => Buffer.from(s)

function sample(): Tree {
  return treeFromPaths('/Users/me', {
    'docs/a.pdf': { size: 100 },
    'docs/B.txt': { size: 50 },
    'videos/Movie.MOV': { size: 5000 },
    'empty/': {},
  })
}

describe('TreeBuilder + Tree', () => {
  it('rolls up sizes and descendant counts to every ancestor', () => {
    const t = sample()
    expect(t.total[0]).toBe(5150)
    expect(t.items[0]).toBe(6)
    const docs = t.lookup('/Users/me/docs')!
    expect(t.total[docs]).toBe(150)
    expect(t.items[docs]).toBe(2)
  })

  it('accepts entries in any arrival order', () => {
    const b = new TreeBuilder(2)
    b.add(3, 2, Kind.File, 0, 30, 0, enc('c.bin'))
    b.add(2, 1, Kind.Dir, 0, 0, 0, enc('inner'))
    b.add(0, ROOT_PARENT, Kind.Dir, 0, 0, 0, enc('/r'))
    b.add(1, 0, Kind.Dir, 0, 0, 0, enc('outer'))
    const t = b.build()
    expect(t.total[0]).toBe(30)
    expect(t.path(3)).toBe('/r/outer/inner/c.bin')
  })

  it('grows past its initial capacity', () => {
    const b = new TreeBuilder(4)
    b.add(0, ROOT_PARENT, Kind.Dir, 0, 0, 0, enc('/'))
    for (let id = 1; id <= 10_000; id++) b.add(id, 0, Kind.File, 0, 1, 0, enc(`f${id}`))
    const t = b.build()
    expect(t.count).toBe(10_001)
    expect(t.total[0]).toBe(10_000)
    expect(t.name(10_000)).toBe('f10000')
  })

  it('leaves ids without an ENTRY frame out of every index', () => {
    const b = new TreeBuilder(4)
    b.add(0, ROOT_PARENT, Kind.Dir, 0, 0, 0, enc('/r'))
    b.add(2, 0, Kind.File, 0, 7, 0, enc('x'))
    const t = b.build()
    expect(t.isPresent(1)).toBe(false)
    expect(Array.from(t.children(0))).toEqual([2])
    expect(t.total[0]).toBe(7)
  })

  it('builds paths and lookups for "/" and nested roots', () => {
    const t = sample()
    const movie = t.lookup('/Users/me/videos/Movie.MOV')!
    expect(t.path(movie)).toBe('/Users/me/videos/Movie.MOV')
    expect(t.lookup('/Users/me/')).toBe(0)
    expect(t.lookup('/Users/other')).toBeNull()
    expect(t.lookup('/Users/me/nope')).toBeNull()

    const slash = treeFromPaths('/', { 'Applications/Safari.app/': {} })
    const safari = slash.lookup('/Applications/Safari.app')!
    expect(slash.path(safari)).toBe('/Applications/Safari.app')
    expect(slash.row(safari).type).toBe('app')
  })

  it('lists direct children', () => {
    const t = sample()
    const names = Array.from(t.children(0)).map((id) => t.name(id))
    expect(names.sort()).toEqual(['docs', 'empty', 'videos'])
  })

  it('builds rows with type, size and item counts', () => {
    const t = sample()
    const movie = t.lookup('/Users/me/videos/Movie.MOV')!
    expect(t.row(movie)).toEqual({
      id: movie, name: 'Movie.MOV', path: '/Users/me/videos/Movie.MOV', kind: 'file', type: 'video',
      size: 5000, items: 0, mtime: 1_700_000_000,
    })
    expect(t.row(0).name).toBe('/Users/me')
  })

  it('lowercases ASCII and non-ASCII names into the search buffer', () => {
    const t = treeFromPaths('/r', { 'ÉCOLE.TXT': {}, 'café.md': {}, 'ABC': {} })
    const text = t.lower.toString('utf8')
    expect(text).toContain('\0école.txt\0')
    expect(text).toContain('\0café.md\0')
    expect(text).toContain('\0abc\0')
    expect(t.lowerStart[t.count]).toBe(t.lower.length)
  })

  it('removes a subtree and subtracts it from ancestors', () => {
    const t = sample()
    const docs = t.lookup('/Users/me/docs')!
    const pdf = t.lookup('/Users/me/docs/a.pdf')!
    expect(t.remove(docs)).toEqual({ size: 150, items: 3 })
    expect(t.total[0]).toBe(5000)
    expect(t.items[0]).toBe(3)
    expect(t.isPresent(docs)).toBe(false)
    expect(t.isPresent(pdf)).toBe(false)
    expect(t.lookup('/Users/me/docs')).toBeNull()
    expect(t.remove(docs)).toBeNull()
    expect(t.remove(0)).toBeNull()
  })

  it('round-trips through columns, keeping deleted entries deleted', () => {
    const t = sample()
    const docs = t.lookup('/Users/me/docs')!
    t.remove(docs)
    const copy = new Tree(t.columns())
    expect(copy.total[0]).toBe(5000)
    expect(copy.items[0]).toBe(3)
    expect(copy.flags[docs] & FLAG_DELETED).toBe(FLAG_DELETED)
    expect(Array.from(copy.children(0)).map((id) => copy.name(id)).sort()).toEqual(['empty', 'videos'])
  })

  it('throws when the root entry is missing', () => {
    const b = new TreeBuilder(4)
    b.add(1, 0, Kind.File, 0, 1, 0, enc('orphan'))
    expect(() => b.build()).toThrow('tree has no root entry')
  })
})
