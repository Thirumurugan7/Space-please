import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ScanController } from '../../src/engine/scanController'
import { requireScanner } from '../helpers/scanner'

let scanner: string
let dir: string

beforeAll(() => {
  scanner = requireScanner()
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sa-scan-ctl-'))
  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'sub', 'a.bin'), Buffer.alloc(10_000))
  writeFileSync(join(dir, 'b.txt'), 'hello')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ScanController', () => {
  it('scans a folder into a tree', async () => {
    const controller = new ScanController(scanner)
    const outcome = await controller.run(dir, () => {})
    expect(outcome.message).toBeNull()
    expect(outcome.incomplete).toBe(false)
    expect(outcome.errors).toBe(0)
    const tree = outcome.tree!
    expect(tree.rootPath).toBe(dir)
    const a = tree.lookup(join(dir, 'sub', 'a.bin'))!
    expect(tree.total[a]).toBeGreaterThanOrEqual(10_000)
    expect(tree.items[0]).toBe(3)
    expect(controller.running).toBe(false)
  })

  it('rejects a second concurrent scan', async () => {
    const controller = new ScanController(scanner)
    const first = controller.run(dir, () => {})
    await expect(controller.run(dir, () => {})).rejects.toThrow('already running')
    await first
  })

  it('reports a root that cannot be scanned', async () => {
    const outcome = await new ScanController(scanner).run(join(dir, 'missing'), () => {})
    expect(outcome.tree).toBeNull()
    expect(outcome.incomplete).toBe(true)
    expect(outcome.message).toContain('cannot scan')
  })

  it('reports a missing scanner binary', async () => {
    const outcome = await new ScanController(join(dir, 'no-such-binary')).run(dir, () => {})
    expect(outcome.tree).toBeNull()
    expect(outcome.message).toContain('Could not start scanner')
  })

  it('marks a cancelled scan incomplete without an error message', async () => {
    const controller = new ScanController(scanner)
    const pending = controller.run('/usr', () => {})
    controller.cancel()
    const outcome = await pending
    expect(outcome.incomplete).toBe(true)
    expect(outcome.message).toBeNull()
  })
})
