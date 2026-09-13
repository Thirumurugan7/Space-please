import { Kind } from '../shared/protocol'
import type { Crumb, Page, SearchQuery, Sort, SunburstNode } from '../shared/types'
import { TYPE_CODES } from './fileTypes'
import type { Tree } from './tree'

export function compareIds(tree: Tree, sort: Sort): (a: number, b: number) => number {
  const sign = sort.dir === 'asc' ? 1 : -1
  switch (sort.key) {
    case 'size':
      return (a, b) => sign * (tree.total[a] - tree.total[b]) || a - b
    case 'items':
      return (a, b) => sign * (tree.items[a] - tree.items[b]) || a - b
    case 'mtime':
      return (a, b) => sign * (tree.mtime[a] - tree.mtime[b]) || a - b
    case 'name':
      return (a, b) => sign * compareZeroTerminated(tree.lower, tree.lowerStart[a], tree.lowerStart[b]) || a - b
  }
}

function compareZeroTerminated(buf: Buffer, a: number, b: number): number {
  for (;;) {
    const x = buf[a++]
    const y = buf[b++]
    if (x !== y) return x - y
    if (x === 0) return 0
  }
}

export function childrenPage(tree: Tree, dirId: number, sort: Sort, offset: number, limit: number): Page {
  if (!tree.isPresent(dirId)) return { rows: [], total: 0 }
  const ids = Array.from(tree.children(dirId)).filter((id) => tree.isPresent(id))
  ids.sort(compareIds(tree, sort))
  return { rows: ids.slice(offset, offset + limit).map((id) => tree.row(id)), total: ids.length }
}

export function emptyQuery(): SearchQuery {
  return { text: '', types: [], minSize: null, maxSize: null, modifiedAfter: null, modifiedBefore: null, kind: 'any' }
}

/** Largest id whose name starts at or before `offset` in the lowercase buffer. */
function idAtOffset(lowerStart: Uint32Array, count: number, offset: number): number {
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lowerStart[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function searchIds(tree: Tree, q: SearchQuery): Uint32Array {
  const allowedTypes = new Uint8Array(TYPE_CODES.length)
  for (const t of q.types) allowedTypes[TYPE_CODES.indexOf(t)] = 1
  const filterTypes = q.types.length > 0
  const out: number[] = []

  const accept = (id: number): void => {
    if (id === 0 || !tree.isPresent(id)) return
    const kind = tree.kind[id]
    if (q.kind === 'files' && kind !== Kind.File) return
    if (q.kind === 'folders' && kind !== Kind.Dir) return
    if (filterTypes && allowedTypes[tree.typeCode[id]] === 0) return
    const size = tree.total[id]
    if (q.minSize !== null && size < q.minSize) return
    if (q.maxSize !== null && size > q.maxSize) return
    const mtime = tree.mtime[id]
    if (q.modifiedAfter !== null && mtime < q.modifiedAfter) return
    if (q.modifiedBefore !== null && mtime > q.modifiedBefore) return
    out.push(id)
  }

  const needle = Buffer.from(q.text.replace(/\0/g, '').trim().normalize('NFC').toLowerCase())
  if (needle.length === 0) {
    for (let id = 1; id < tree.count; id++) accept(id)
  } else {
    let at = 0
    while ((at = tree.lower.indexOf(needle, at)) !== -1) {
      const id = idAtOffset(tree.lowerStart, tree.count, at)
      accept(id)
      at = tree.lowerStart[id + 1]
    }
  }
  return Uint32Array.from(out)
}

/** Caches the sorted id list of the last query so paging through results is cheap. */
export class SearchCache {
  private key = ''
  private ids: Uint32Array | null = null
  private readonly tree: Tree

  constructor(tree: Tree) {
    this.tree = tree
  }

  page(q: SearchQuery, sort: Sort, offset: number, limit: number): Page {
    const key = JSON.stringify([q, sort])
    if (key !== this.key || this.ids === null) {
      const ids = searchIds(this.tree, q)
      ids.sort(compareIds(this.tree, sort))
      this.ids = ids
      this.key = key
    }
    const rows = Array.from(this.ids.subarray(offset, offset + limit))
      .filter((id) => this.tree.isPresent(id))
      .map((id) => this.tree.row(id))
    return { rows, total: this.ids.length }
  }

  invalidate(): void {
    this.key = ''
    this.ids = null
  }
}

export function sunburst(tree: Tree, id: number, depth = 4, minFraction = 0.005): SunburstNode | null {
  if (!tree.isPresent(id)) return null
  const threshold = tree.total[id] * minFraction

  const build = (n: number, level: number): SunburstNode => {
    const node: SunburstNode = { id: n, name: tree.displayName(n), size: tree.total[n], kind: tree.kindName(n) }
    if (level >= depth || tree.kind[n] !== Kind.Dir) return node
    const children: SunburstNode[] = []
    let other = 0
    for (const c of tree.children(n)) {
      if (!tree.isPresent(c) || tree.total[c] <= 0) continue
      if (tree.total[c] < threshold) other += tree.total[c]
      else children.push(build(c, level + 1))
    }
    children.sort((a, b) => b.size - a.size)
    if (other > 0) children.push({ id: null, name: 'Smaller items', size: other, kind: 'other' })
    if (children.length > 0) node.children = children
    return node
  }

  return build(id, 0)
}

export function breadcrumb(tree: Tree, id: number): Crumb[] {
  if (!tree.isPresent(id)) return []
  const crumbs: Crumb[] = []
  let cur = id
  for (;;) {
    crumbs.push({ id: cur, name: tree.displayName(cur) })
    if (cur === 0) break
    cur = tree.parent[cur]
  }
  return crumbs.reverse()
}
