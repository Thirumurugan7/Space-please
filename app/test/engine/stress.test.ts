import { describe, expect, it } from 'vitest'
import { SearchCache, emptyQuery, searchIds } from '../../src/engine/query'
import { TreeBuilder } from '../../src/engine/tree'
import { Kind, ROOT_PARENT } from '../../src/shared/protocol'

// 1M entries: 1,000 directories x 999 files. Thresholds are generous multiples of the
// measured 5.8M-entry timings so the test is stable on a loaded machine.
describe('1M-entry stress', () => {
  it('ingests, indexes and searches within budget', () => {
    let t0 = performance.now()
    const b = new TreeBuilder()
    b.add(0, ROOT_PARENT, Kind.Dir, 0, 0, 0, Buffer.from('/'))
    let id = 1
    for (let d = 0; d < 1000; d++) {
      const dir = id++
      b.add(dir, 0, Kind.Dir, 0, 0, 0, Buffer.from(`Folder ${d}`))
      for (let f = 0; f < 999; f++) {
        b.add(id++, dir, Kind.File, 0, 4096 * ((f % 50) + 1), 1_700_000_000 + f, Buffer.from(`file_${d}_${f}.dat`))
      }
    }
    const tree = b.build()
    const buildMs = performance.now() - t0
    expect(tree.count).toBe(1_000_001)
    expect(buildMs).toBeLessThan(3000)

    t0 = performance.now()
    const hits = searchIds(tree, { ...emptyQuery(), text: 'file_998_12.' })
    const typicalMs = performance.now() - t0
    expect(hits.length).toBe(1)
    expect(typicalMs).toBeLessThan(200)

    t0 = performance.now()
    const many = searchIds(tree, { ...emptyQuery(), text: 'e' })
    const singleCharMs = performance.now() - t0
    expect(many.length).toBe(1_000_000)
    expect(singleCharMs).toBeLessThan(500)

    t0 = performance.now()
    const page = new SearchCache(tree).page(emptyQuery(), { key: 'size', dir: 'desc' }, 0, 100)
    const listAllMs = performance.now() - t0
    expect(page.total).toBe(1_000_000)
    expect(listAllMs).toBeLessThan(3000)
  })
})
