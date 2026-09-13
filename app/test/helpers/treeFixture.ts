import { Kind, ROOT_PARENT } from '../../src/shared/protocol'
import { TreeBuilder, type Tree } from '../../src/engine/tree'

export const NOW = 1_700_000_000

export interface FileSpec {
  size?: number
  mtime?: number
  flags?: number
}

/**
 * Builds a tree from paths relative to `root`. Keys ending in "/" are directories; parent
 * directories are created automatically, always with smaller ids than their children.
 */
export function treeFromPaths(root: string, entries: Record<string, FileSpec>): Tree {
  const builder = new TreeBuilder(4)
  const ids = new Map<string, number>([['', 0]])
  let next = 1
  builder.add(0, ROOT_PARENT, Kind.Dir, 0, 0, NOW, Buffer.from(root))

  const ensureDir = (rel: string): number => {
    const existing = ids.get(rel)
    if (existing !== undefined) return existing
    const slash = rel.lastIndexOf('/')
    const parent = ensureDir(slash < 0 ? '' : rel.slice(0, slash))
    const id = next++
    ids.set(rel, id)
    builder.add(id, parent, Kind.Dir, 0, 0, NOW, Buffer.from(rel.slice(slash + 1)))
    return id
  }

  for (const [rel, spec] of Object.entries(entries)) {
    if (rel.endsWith('/')) {
      ensureDir(rel.slice(0, -1))
      continue
    }
    const slash = rel.lastIndexOf('/')
    const parent = ensureDir(slash < 0 ? '' : rel.slice(0, slash))
    const id = next++
    ids.set(rel, id)
    builder.add(id, parent, Kind.File, spec.flags ?? 0, spec.size ?? 0, spec.mtime ?? NOW, Buffer.from(rel.slice(slash + 1)))
  }
  return builder.build()
}
