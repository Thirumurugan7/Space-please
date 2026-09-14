import { FLAG_HARDLINK_DUPLICATE, Kind, ROOT_PARENT } from '../shared/protocol'
import type { CleanupCategoryId, ReportFileList, ReportSuggestion, SpaceReport, SuggestionSafety } from '../shared/types'
import { cleanupCategories } from './cleanup'
import { TYPE_CODES } from './fileTypes'
import type { Tree } from './tree'

export const STALE_MIN_SIZE = 10_000_000
export const RECENT_MIN_SIZE = 1_000_000

const DAY = 86400
const APP_CODE = TYPE_CODES.indexOf('app')

const GUIDANCE: Record<CleanupCategoryId, { safety: SuggestionSafety; advice: string }> = {
  caches: { safety: 'safe', advice: 'Apps rebuild caches when they need them. Quit an app before removing its cache.' },
  developer: { safety: 'safe', advice: 'Build products and package caches are recreated on the next build or install.' },
  trash: { safety: 'safe', advice: 'Already deleted. Empty the Trash in Finder to get this space back.' },
  downloads: { safety: 'review', advice: 'Installers and archives untouched for 90 days. Check nothing is still needed.' },
  large: { safety: 'your-call', advice: 'Big individual files. Delete what you no longer need or move it to external storage.' },
}

export interface SpaceReportOptions {
  home: string
  /** Unix seconds. */
  now: number
  largeThreshold: number
  staleDays: number
  recentDays: number
  /** Maximum rows per list; totals always cover everything. */
  maxItems?: number
}

export function spaceReport(tree: Tree, opts: SpaceReportOptions): SpaceReport {
  const max = opts.maxItems ?? 200
  const categories = cleanupCategories(tree, {
    home: opts.home,
    now: opts.now,
    largeThreshold: opts.largeThreshold,
    maxItems: Number.MAX_SAFE_INTEGER,
  })

  const suggestions: ReportSuggestion[] = categories
    .filter((c) => c.count > 0)
    .map((c) => ({ id: c.id, title: c.title, ...GUIDANCE[c.id], total: c.total, count: c.count, items: c.items.slice(0, max) }))
    .sort((a, b) => b.total - a.total)

  const candidates = new Set<number>()
  for (const c of categories) for (const row of c.items) candidates.add(row.id)
  let reclaimable = 0
  for (const id of candidates) if (!hasAncestorIn(tree, id, candidates)) reclaimable += tree.total[id]

  const scopeId = tree.lookup(opts.home) ?? 0
  const trashId = tree.lookup(`${opts.home}/.Trash`)
  // Ids are assigned parent-first, so one forward pass decides membership for every descendant.
  const inScope = new Uint8Array(tree.count)
  inScope[scopeId] = 1
  const staleBefore = opts.now - opts.staleDays * DAY
  const recentAfter = opts.now - opts.recentDays * DAY
  const stale: number[] = []
  const recent: number[] = []

  for (let id = scopeId + 1; id < tree.count; id++) {
    const p = tree.parent[id]
    if (p >= id || inScope[p] !== 1 || id === trashId || tree.typeCode[id] === APP_CODE) continue
    inScope[id] = 1
    if (tree.kind[id] !== Kind.File || !tree.isPresent(id)) continue
    if ((tree.flags[id] & FLAG_HARDLINK_DUPLICATE) !== 0) continue
    const size = tree.size[id]
    const mtime = tree.mtime[id]
    if (size >= STALE_MIN_SIZE && mtime < staleBefore) stale.push(id)
    if (size >= RECENT_MIN_SIZE && mtime >= recentAfter) recent.push(id)
  }

  return {
    reclaimable,
    suggestions,
    scope: tree.path(scopeId),
    stale: fileList(tree, stale, max),
    recent: fileList(tree, recent, max),
  }
}

function hasAncestorIn(tree: Tree, id: number, ids: Set<number>): boolean {
  for (let p = tree.parent[id]; p !== ROOT_PARENT && p < tree.count; p = tree.parent[p]) {
    if (ids.has(p)) return true
  }
  return false
}

function fileList(tree: Tree, ids: number[], max: number): ReportFileList {
  ids.sort((a, b) => tree.size[b] - tree.size[a] || a - b)
  let total = 0
  for (const id of ids) total += tree.size[id]
  return { total, count: ids.length, items: ids.slice(0, max).map((id) => tree.row(id)) }
}
