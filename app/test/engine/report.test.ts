import { describe, expect, it } from 'vitest'
import { spaceReport } from '../../src/engine/report'
import { NOW, treeFromPaths } from '../helpers/treeFixture'

const HOME = '/Users/me'
const DAY = 86400
const MB = 1_000_000
const options = { home: HOME, now: NOW, largeThreshold: 1e9, staleDays: 365, recentDays: 7 }

function sample() {
  return treeFromPaths('/', {
    'Users/me/Downloads/old-installer.dmg': { size: 2000 * MB, mtime: NOW - 200 * DAY },
    'Users/me/Library/Caches/com.example/blob': { size: 300 * MB },
    'Users/me/Library/Caches/Homebrew/pkg.tar.gz': { size: 250 * MB },
    'Users/me/Library/Application Support/Old/data.db': { size: 50 * MB, mtime: NOW - 800 * DAY },
    'Users/me/Movies/holiday.mov': { size: 40 * MB, mtime: NOW - 400 * DAY },
    'Users/me/Movies/new-clip.mov': { size: 5 * MB, mtime: NOW - 2 * DAY },
    'Users/me/Documents/tiny-old.txt': { size: 1000, mtime: NOW - 900 * DAY },
    'Users/me/Documents/small-new.txt': { size: 1000, mtime: NOW - DAY },
    'Users/me/.Trash/gone.iso': { size: 700 * MB, mtime: NOW - 500 * DAY },
    'Users/me/Applications/Tool.app/Contents/MacOS/tool': { size: 30 * MB, mtime: NOW - 600 * DAY },
    'Applications/Big.app/Contents/Resources/asset.bin': { size: 90 * MB, mtime: NOW - 700 * DAY },
    'Library/Old/system.bin': { size: 60 * MB, mtime: NOW - 700 * DAY },
  })
}

const names = (list: { items: { name: string }[] }) => list.items.map((r) => r.name)

describe('spaceReport', () => {
  it('ranks non-empty suggestions biggest first with safety and advice', () => {
    const report = spaceReport(sample(), options)
    expect(report.suggestions.map((s) => s.id)).toEqual(['large', 'downloads', 'trash', 'caches', 'developer'])
    expect(Object.fromEntries(report.suggestions.map((s) => [s.id, s.safety]))).toEqual({
      large: 'your-call',
      downloads: 'review',
      trash: 'safe',
      caches: 'safe',
      developer: 'safe',
    })
    expect(report.suggestions.every((s) => s.advice.length > 0)).toBe(true)
  })

  it('counts items that appear in several suggestions only once', () => {
    // dmg is both a large file and an old download; Homebrew is both a cache and developer junk.
    expect(spaceReport(sample(), options).reclaimable).toBe(2000 * MB + 300 * MB + 250 * MB + 700 * MB)
  })

  it('lists stale files in the home folder, including ~/Library, biggest first', () => {
    const { scope, stale } = spaceReport(sample(), options)
    expect(scope).toBe(HOME)
    expect(names(stale)).toEqual(['data.db', 'holiday.mov'])
    expect(stale.total).toBe(90 * MB)
    expect(stale.count).toBe(2)
  })

  it('leaves out the Trash, app bundle internals, small files and files outside home', () => {
    const all = [...names(spaceReport(sample(), { ...options, staleDays: 1 }).stale)]
    expect(all).not.toContain('gone.iso')
    expect(all).not.toContain('tool')
    expect(all).not.toContain('tiny-old.txt')
    expect(all).not.toContain('asset.bin')
    expect(all).not.toContain('system.bin')
  })

  it('lists recently modified files of 1 MB or more', () => {
    expect(names(spaceReport(sample(), options).recent)).toEqual(['blob', 'pkg.tar.gz', 'new-clip.mov'])
  })

  it('honours the stale age option', () => {
    expect(names(spaceReport(sample(), { ...options, staleDays: 730 }).stale)).toEqual(['data.db'])
  })

  it('caps returned rows but keeps full totals', () => {
    const report = spaceReport(sample(), { ...options, maxItems: 1 })
    expect(report.stale.items).toHaveLength(1)
    expect(report.stale.count).toBe(2)
    expect(report.stale.total).toBe(90 * MB)
    expect(report.recent.items).toHaveLength(1)
  })

  it('falls back to the scan root when the home folder was not scanned', () => {
    const tree = treeFromPaths('/Volumes/Ext', { 'old.bin': { size: 20 * MB, mtime: NOW - 400 * DAY } })
    const report = spaceReport(tree, options)
    expect(report.scope).toBe('/Volumes/Ext')
    expect(names(report.stale)).toEqual(['old.bin'])
    expect(report.suggestions.filter((s) => s.id !== 'large')).toEqual([])
    expect(report.reclaimable).toBe(0)
  })

  it('drops removed entries', () => {
    const tree = sample()
    tree.remove(tree.lookup('/Users/me/Movies/holiday.mov')!)
    tree.remove(tree.lookup('/Users/me/.Trash')!)
    const report = spaceReport(tree, options)
    expect(names(report.stale)).toEqual(['data.db'])
    expect(report.suggestions.map((s) => s.id)).not.toContain('trash')
  })
})
