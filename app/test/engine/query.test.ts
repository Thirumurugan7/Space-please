import { describe, expect, it } from 'vitest'
import { SearchCache, breadcrumb, childrenPage, emptyQuery, searchIds, sunburst } from '../../src/engine/query'
import type { SearchQuery } from '../../src/shared/types'
import { NOW, treeFromPaths } from '../helpers/treeFixture'

function sample() {
  return treeFromPaths('/r', {
    'docs/a.pdf': { size: 100, mtime: NOW - 400 * 86400 },
    'docs/B.txt': { size: 50 },
    'docs/École.txt': { size: 10 },
    'videos/Movie.MOV': { size: 5000 },
    'videos/clip.mp4': { size: 3000 },
    'node_modules/x.js': { size: 1 },
    'empty/': {},
  })
}

const q = (over: Partial<SearchQuery>): SearchQuery => ({ ...emptyQuery(), ...over })
const names = (t: ReturnType<typeof sample>, ids: Iterable<number>) => Array.from(ids, (id) => t.name(id)).sort()

describe('childrenPage', () => {
  it('sorts by size descending and pages', () => {
    const t = sample()
    const page = childrenPage(t, 0, { key: 'size', dir: 'desc' }, 0, 2)
    expect(page.total).toBe(4)
    expect(page.rows.map((r) => r.name)).toEqual(['videos', 'docs'])
    expect(childrenPage(t, 0, { key: 'size', dir: 'desc' }, 2, 10).rows.map((r) => r.name)).toEqual(['node_modules', 'empty'])
  })

  it('sorts by name case-insensitively', () => {
    const t = sample()
    const docs = t.lookup('/r/docs')!
    const rows = childrenPage(t, docs, { key: 'name', dir: 'asc' }, 0, 10).rows
    expect(rows.map((r) => r.name)).toEqual(['a.pdf', 'B.txt', 'École.txt'])
  })

  it('hides removed children and returns nothing for a removed directory', () => {
    const t = sample()
    const videos = t.lookup('/r/videos')!
    t.remove(t.lookup('/r/videos/clip.mp4')!)
    expect(childrenPage(t, videos, { key: 'size', dir: 'desc' }, 0, 10).total).toBe(1)
    t.remove(videos)
    expect(childrenPage(t, videos, { key: 'size', dir: 'desc' }, 0, 10)).toEqual({ rows: [], total: 0 })
  })
})

describe('searchIds', () => {
  it('matches names case-insensitively, including non-ASCII', () => {
    const t = sample()
    expect(names(t, searchIds(t, q({ text: 'MOV' })))).toEqual(['Movie.MOV'])
    expect(names(t, searchIds(t, q({ text: 'éCOLE' })))).toEqual(['École.txt'])
    expect(names(t, searchIds(t, q({ text: '  .txt ' })))).toEqual(['B.txt', 'École.txt'])
    expect(searchIds(t, q({ text: 'zzz' })).length).toBe(0)
  })

  it('never returns the root and counts one hit per name', () => {
    const t = treeFromPaths('/aaa', { 'aaaa.txt': {} })
    expect(names(t, searchIds(t, q({ text: 'a' })))).toEqual(['aaaa.txt'])
  })

  it('filters by type, kind, size and modified date', () => {
    const t = sample()
    expect(names(t, searchIds(t, q({ types: ['video'] })))).toEqual(['Movie.MOV', 'clip.mp4'])
    expect(names(t, searchIds(t, q({ minSize: 3000 })))).toEqual(['Movie.MOV', 'clip.mp4', 'videos'])
    expect(names(t, searchIds(t, q({ minSize: 3000, kind: 'files' })))).toEqual(['Movie.MOV', 'clip.mp4'])
    expect(names(t, searchIds(t, q({ kind: 'folders', maxSize: 0 })))).toEqual(['empty'])
    expect(names(t, searchIds(t, q({ modifiedBefore: NOW - 365 * 86400 })))).toEqual(['a.pdf'])
    expect(names(t, searchIds(t, q({ text: 'a', modifiedAfter: NOW - 86400 }))).includes('a.pdf')).toBe(false)
  })
})

describe('SearchCache', () => {
  it('pages sorted results and drops removed rows after invalidate', () => {
    const t = sample()
    const cache = new SearchCache(t)
    const sort = { key: 'size', dir: 'desc' } as const
    const first = cache.page(q({ kind: 'files' }), sort, 0, 2)
    expect(first.total).toBe(6)
    expect(first.rows.map((r) => r.name)).toEqual(['Movie.MOV', 'clip.mp4'])
    t.remove(t.lookup('/r/videos/Movie.MOV')!)
    cache.invalidate()
    const after = cache.page(q({ kind: 'files' }), sort, 0, 2)
    expect(after.total).toBe(5)
    expect(after.rows[0].name).toBe('clip.mp4')
  })
})

describe('sunburst', () => {
  it('nests children by size and merges slices below the threshold', () => {
    const t = sample()
    const node = sunburst(t, 0, 4, 0.05)!
    expect(node.size).toBe(8161)
    expect(node.children!.map((c) => c.name)).toEqual(['videos', 'Smaller items'])
    expect(node.children![1]).toEqual({ id: null, name: 'Smaller items', size: 161, kind: 'other' })
    expect(node.children![0].children!.map((c) => c.name)).toEqual(['Movie.MOV', 'clip.mp4'])
  })

  it('stops at the depth limit and returns null for missing ids', () => {
    const t = sample()
    expect(sunburst(t, 0, 0)!.children).toBeUndefined()
    expect(sunburst(t, 9999)).toBeNull()
  })
})

describe('breadcrumb', () => {
  it('lists ancestors from the root', () => {
    const t = sample()
    const movie = t.lookup('/r/videos/Movie.MOV')!
    expect(breadcrumb(t, movie).map((c) => c.name)).toEqual(['/r', 'videos', 'Movie.MOV'])
    expect(breadcrumb(t, 0)).toEqual([{ id: 0, name: '/r' }])
  })
})
