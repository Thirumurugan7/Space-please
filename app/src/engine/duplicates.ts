import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { FLAG_HARDLINK_DUPLICATE, Kind } from '../shared/protocol'
import type { DuplicateGroup, DuplicateProgress, DuplicatesResult } from '../shared/types'
import type { Tree } from './tree'

export interface DuplicateOptions {
  minSize?: number
  signal?: AbortSignal
  onProgress?: (p: DuplicateProgress) => void
}

const HEAD_BYTES = 64 * 1024

/** Groups files by exact size, then by a 64 KB head hash, then by full SHA-256. */
export async function findDuplicates(tree: Tree, opts: DuplicateOptions = {}): Promise<DuplicatesResult> {
  const minSize = opts.minSize ?? 1_000_000
  const bySize = new Map<number, number[]>()
  for (let id = 1; id < tree.count; id++) {
    if (tree.kind[id] !== Kind.File || !tree.isPresent(id)) continue
    if ((tree.flags[id] & FLAG_HARDLINK_DUPLICATE) !== 0 || tree.size[id] < minSize) continue
    const list = bySize.get(tree.size[id])
    if (list) list.push(id)
    else bySize.set(tree.size[id], [id])
  }
  const candidates = [...bySize.values()].filter((ids) => ids.length > 1)
  const total = candidates.reduce((n, ids) => n + ids.length, 0)
  let done = 0
  const groups: DuplicateGroup[] = []
  opts.onProgress?.({ phase: 'hashing', done, total })

  for (const ids of candidates) {
    if (opts.signal?.aborted) {
      opts.onProgress?.({ phase: 'cancelled', done, total })
      return result(groups, true)
    }
    for (const sameHead of await splitByHash(tree, ids, HEAD_BYTES)) {
      for (const [hash, same] of await splitByHashWithKeys(tree, sameHead, undefined)) {
        const size = tree.size[same[0]]
        groups.push({ size, hash, wasted: size * (same.length - 1), items: same.map((id) => tree.row(id)) })
      }
    }
    done += ids.length
    opts.onProgress?.({ phase: 'hashing', done, total })
  }
  opts.onProgress?.({ phase: 'done', done, total })
  return result(groups, false)
}

function result(groups: DuplicateGroup[], cancelled: boolean): DuplicatesResult {
  groups.sort((a, b) => b.wasted - a.wasted)
  return { groups, wasted: groups.reduce((n, g) => n + g.wasted, 0), cancelled }
}

async function splitByHash(tree: Tree, ids: number[], limit: number | undefined): Promise<number[][]> {
  return [...(await splitByHashWithKeys(tree, ids, limit)).values()]
}

async function splitByHashWithKeys(tree: Tree, ids: number[], limit: number | undefined): Promise<Map<string, number[]>> {
  const buckets = new Map<string, number[]>()
  for (const id of ids) {
    const hash = await hashFile(tree.path(id), limit)
    if (hash === null) continue
    const list = buckets.get(hash)
    if (list) list.push(id)
    else buckets.set(hash, [id])
  }
  for (const [key, list] of buckets) if (list.length < 2) buckets.delete(key)
  return buckets
}

/** SHA-256 of the first `limit` bytes (or the whole file). Null if unreadable. */
export async function hashFile(path: string, limit?: number): Promise<string | null> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return null
  }
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1 << 20)
    let read = 0
    for (;;) {
      const want = limit === undefined ? buffer.length : Math.min(buffer.length, limit - read)
      if (want <= 0) break
      const { bytesRead } = await handle.read(buffer, 0, want, null)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
      read += bytesRead
    }
    return hash.digest('hex')
  } catch {
    return null
  } finally {
    await handle.close()
  }
}
