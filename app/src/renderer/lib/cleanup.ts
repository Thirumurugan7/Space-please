import type { DuplicatesResult, Row } from '../../shared/types'

/** Drops removed files from duplicate groups; groups with fewer than two copies disappear. */
export function pruneDuplicates(result: DuplicatesResult, removed: Set<number>): DuplicatesResult {
  const groups = result.groups
    .map((g) => {
      const items = g.items.filter((r) => !removed.has(r.id))
      return { ...g, items, wasted: g.size * Math.max(0, items.length - 1) }
    })
    .filter((g) => g.items.length > 1)
  return { ...result, groups, wasted: groups.reduce((n, g) => n + g.wasted, 0) }
}

/** Every copy except the newest (or oldest) one. */
export function allButOne(items: Row[], keep: 'newest' | 'oldest'): Row[] {
  if (items.length < 2) return []
  const sorted = [...items].sort((a, b) => a.mtime - b.mtime || a.id - b.id)
  const kept = keep === 'newest' ? sorted[sorted.length - 1] : sorted[0]
  return items.filter((r) => r !== kept)
}
