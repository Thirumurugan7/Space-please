import { Kind } from '../shared/protocol'
import type { CleanupCategory, CleanupCategoryId, Row } from '../shared/types'
import type { Tree } from './tree'

export const DEFAULT_LARGE_THRESHOLD = 1_000_000_000
const OLD_DOWNLOAD_SECONDS = 90 * 86400
const NODE_MODULES = Buffer.from('node_modules')

export interface CleanupOptions {
  home: string
  /** Unix seconds. */
  now: number
  largeThreshold: number
  /** Maximum rows returned per category; totals always cover everything. */
  maxItems?: number
}

export function developerPaths(home: string): string[] {
  return [
    `${home}/Library/Developer/Xcode/DerivedData`,
    `${home}/Library/Developer/Xcode/Archives`,
    `${home}/Library/Developer/CoreSimulator/Caches`,
    `${home}/.gradle/caches`,
    `${home}/.npm/_cacache`,
    `${home}/Library/Caches/Homebrew`,
  ]
}

export function cleanupCategories(tree: Tree, opts: CleanupOptions): CleanupCategory[] {
  const max = opts.maxItems ?? 500
  const category = (id: CleanupCategoryId, title: string, description: string, ids: number[]): CleanupCategory => {
    const live = ids.filter((i) => tree.isPresent(i) && tree.total[i] > 0)
    live.sort((a, b) => tree.total[b] - tree.total[a] || a - b)
    const total = live.reduce((sum, i) => sum + tree.total[i], 0)
    const items: Row[] = live.slice(0, max).map((i) => tree.row(i))
    return { id, title, description, total, count: live.length, items }
  }
  const childrenOf = (path: string): number[] => {
    const id = tree.lookup(path)
    return id === null ? [] : Array.from(tree.children(id))
  }

  const large: number[] = []
  for (let id = 1; id < tree.count; id++) {
    if (tree.kind[id] === Kind.File && tree.total[id] >= opts.largeThreshold && tree.isPresent(id)) large.push(id)
  }

  const cutoff = opts.now - OLD_DOWNLOAD_SECONDS
  const downloads = childrenOf(`${opts.home}/Downloads`).filter((id) => tree.mtime[id] < cutoff)

  const developer = developerPaths(opts.home)
    .map((p) => tree.lookup(p))
    .filter((id): id is number => id !== null)
  developer.push(...outermostNodeModules(tree))

  const trash = tree.lookup(`${opts.home}/.Trash`)

  return [
    category('large', 'Large files', 'Individual files above the size threshold.', large),
    category('downloads', 'Old downloads', 'Items in Downloads not modified for 90 days.', downloads),
    category('caches', 'Caches', 'App caches in ~/Library/Caches. Apps rebuild them when needed.', childrenOf(`${opts.home}/Library/Caches`)),
    category('developer', 'Developer junk', 'Xcode build data, simulator caches, package caches and node_modules folders.', developer),
    category('trash', 'Trash', 'Items already in the Trash. Empty it from Finder.', trash === null ? [] : [trash]),
  ]
}

function isNodeModules(tree: Tree, id: number): boolean {
  const start = tree.lowerStart[id]
  return tree.lowerStart[id + 1] - start === NODE_MODULES.length + 1 &&
    tree.lower.compare(NODE_MODULES, 0, NODE_MODULES.length, start, start + NODE_MODULES.length) === 0
}

function outermostNodeModules(tree: Tree): number[] {
  const out: number[] = []
  for (let id = 1; id < tree.count; id++) {
    if (tree.kind[id] !== Kind.Dir || !tree.isPresent(id) || !isNodeModules(tree, id)) continue
    let nested = false
    for (let p = tree.parent[id]; p !== 0 && p < tree.count; p = tree.parent[p]) {
      if (isNodeModules(tree, p)) {
        nested = true
        break
      }
    }
    if (!nested) out.push(id)
  }
  return out
}
