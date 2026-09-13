import { describe, expect, it } from 'vitest'
import { trashPaths, type TrashDeps } from '../../src/main/trash'

const ctx = { appPath: '/Applications/Space Analyser.app', scanRoot: '/', home: '/Users/me' }

function fakeDeps(existing: string[], failing: string[] = []) {
  const trashed: string[] = []
  const deps: TrashDeps = {
    exists: async (p) => existing.includes(p),
    trashItem: async (p) => {
      if (failing.includes(p)) throw new Error('Permission denied')
      trashed.push(p)
    },
  }
  return { deps, trashed }
}

describe('trashPaths', () => {
  it('trashes existing items and reports missing and failed ones', async () => {
    const { deps, trashed } = fakeDeps(['/Users/me/a', '/Users/me/b'], ['/Users/me/b'])
    const res = await trashPaths(
      [
        { id: 1, path: '/Users/me/a' },
        { id: 2, path: '/Users/me/b' },
        { id: 3, path: '/Users/me/c' },
      ],
      ctx,
      deps,
    )
    expect(trashed).toEqual(['/Users/me/a'])
    expect(res).toEqual({
      trashed: [1],
      missing: [3],
      failed: [{ id: 2, path: '/Users/me/b', message: 'Permission denied' }],
      rejected: [],
    })
  })

  it('trashes nothing when any path is protected', async () => {
    const { deps, trashed } = fakeDeps(['/Users/me/a', '/System/Library'])
    const res = await trashPaths(
      [
        { id: 1, path: '/Users/me/a' },
        { id: 2, path: '/System/Library' },
      ],
      ctx,
      deps,
    )
    expect(trashed).toEqual([])
    expect(res.trashed).toEqual([])
    expect(res.rejected).toEqual([{ path: '/System/Library', reason: '/System is a protected system location' }])
  })
})
