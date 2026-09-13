import { describe, expect, it } from 'vitest'
import { cleanupCategories } from '../../src/engine/cleanup'
import { NOW, treeFromPaths } from '../helpers/treeFixture'

const HOME = '/Users/me'

function sample() {
  return treeFromPaths('/', {
    'Users/me/Movies/big.mov': { size: 2_000_000_000 },
    'Users/me/Movies/huge.mkv': { size: 3_000_000_000 },
    'Users/me/Movies/small.mov': { size: 1000 },
    'Users/me/Downloads/old.zip': { size: 400, mtime: NOW - 100 * 86400 },
    'Users/me/Downloads/new.zip': { size: 500, mtime: NOW - 86400 },
    'Users/me/Library/Caches/com.app/blob': { size: 300 },
    'Users/me/Library/Caches/Homebrew/pkg.tar.gz': { size: 250 },
    'Users/me/Library/Developer/Xcode/DerivedData/Proj/build.o': { size: 700 },
    'Users/me/code/web/node_modules/react/index.js': { size: 60 },
    'Users/me/code/web/node_modules/react/node_modules/x/i.js': { size: 5 },
    'Users/me/.Trash/old.txt': { size: 20 },
  })
}

const byId = (cats: ReturnType<typeof cleanupCategories>) => Object.fromEntries(cats.map((c) => [c.id, c]))

describe('cleanupCategories', () => {
  it('returns every category in a fixed order', () => {
    const cats = cleanupCategories(sample(), { home: HOME, now: NOW, largeThreshold: 1e9 })
    expect(cats.map((c) => c.id)).toEqual(['large', 'downloads', 'caches', 'developer', 'trash'])
  })

  it('finds large files above the threshold, biggest first', () => {
    const { large } = byId(cleanupCategories(sample(), { home: HOME, now: NOW, largeThreshold: 1e9 }))
    expect(large.items.map((r) => r.name)).toEqual(['huge.mkv', 'big.mov'])
    expect(large.total).toBe(5_000_000_000)
    expect(large.count).toBe(2)
  })

  it('finds downloads untouched for 90 days', () => {
    const { downloads } = byId(cleanupCategories(sample(), { home: HOME, now: NOW, largeThreshold: 1e9 }))
    expect(downloads.items.map((r) => r.name)).toEqual(['old.zip'])
  })

  it('lists cache folders and developer junk, using only outermost node_modules', () => {
    const { caches, developer } = byId(cleanupCategories(sample(), { home: HOME, now: NOW, largeThreshold: 1e9 }))
    expect(caches.items.map((r) => r.name)).toEqual(['com.app', 'Homebrew'])
    expect(developer.items.map((r) => r.path)).toEqual([
      '/Users/me/Library/Developer/Xcode/DerivedData',
      '/Users/me/Library/Caches/Homebrew',
      '/Users/me/code/web/node_modules',
    ])
    expect(developer.total).toBe(700 + 250 + 65)
  })

  it('reports the Trash as one item', () => {
    const { trash } = byId(cleanupCategories(sample(), { home: HOME, now: NOW, largeThreshold: 1e9 }))
    expect(trash.items.map((r) => r.path)).toEqual(['/Users/me/.Trash'])
    expect(trash.total).toBe(20)
  })

  it('caps returned rows but keeps full totals, and skips removed entries', () => {
    const tree = sample()
    const capped = byId(cleanupCategories(tree, { home: HOME, now: NOW, largeThreshold: 1000, maxItems: 1 }))
    expect(capped.large.items).toHaveLength(1)
    expect(capped.large.count).toBe(3)
    tree.remove(tree.lookup('/Users/me/Movies/huge.mkv')!)
    const after = byId(cleanupCategories(tree, { home: HOME, now: NOW, largeThreshold: 1e9 }))
    expect(after.large.items.map((r) => r.name)).toEqual(['big.mov'])
  })

  it('returns empty categories when the home folder is outside the scan', () => {
    const tree = treeFromPaths('/Volumes/Other', { 'a.bin': { size: 5 } })
    const cats = cleanupCategories(tree, { home: HOME, now: NOW, largeThreshold: 1 })
    expect(cats.filter((c) => c.id !== 'large').every((c) => c.count === 0)).toBe(true)
  })
})
