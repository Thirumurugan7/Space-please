import type { TrashResult } from '../shared/types'
import { protectionReason, type GuardContext } from './protectedPaths'

export interface TrashDeps {
  trashItem(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

/**
 * Trashes items one by one. If any path is protected nothing is trashed. Items that no longer
 * exist are reported as missing so the caller can drop them from the tree.
 */
export async function trashPaths(items: { id: number; path: string }[], ctx: GuardContext, deps: TrashDeps): Promise<TrashResult> {
  const result: TrashResult = { trashed: [], missing: [], failed: [], rejected: [] }
  for (const item of items) {
    const reason = protectionReason(item.path, ctx)
    if (reason) result.rejected.push({ path: item.path, reason })
  }
  if (result.rejected.length > 0) return result

  for (const item of items) {
    if (!(await deps.exists(item.path))) {
      result.missing.push(item.id)
      continue
    }
    try {
      await deps.trashItem(item.path)
      result.trashed.push(item.id)
    } catch (err) {
      result.failed.push({ id: item.id, path: item.path, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}
