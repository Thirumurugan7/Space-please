import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Telemetry, telemetryActive, type Fetcher } from '../../src/main/telemetry'

let dir: string
const sent: unknown[] = []

function makeFetch(ok = true): Fetcher {
  return vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok }
  })
}

function make(active: boolean, fetch: Fetcher = makeFetch()) {
  // No-op interval so the periodic flush never fires on its own during tests.
  return new Telemetry({ userDataDir: dir, env: { app_version: '1.1.0', arch: 'arm64' }, fetch, active, setInterval: () => ({}) })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sa-tel-'))
  sent.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('telemetryActive', () => {
  it('is off in tests and dev, on when packaged, and honours SA_TELEMETRY', () => {
    expect(telemetryActive({ env: { SA_USER_DATA: '/x' }, isPackaged: true })).toBe(false)
    expect(telemetryActive({ env: { VITEST: '1' }, isPackaged: true })).toBe(false)
    expect(telemetryActive({ env: {}, isPackaged: false })).toBe(false)
    expect(telemetryActive({ env: {}, isPackaged: true })).toBe(true)
    expect(telemetryActive({ env: { SA_TELEMETRY: '1', VITEST: '1' }, isPackaged: false })).toBe(true)
    expect(telemetryActive({ env: { SA_TELEMETRY: '0' }, isPackaged: true })).toBe(false)
  })
})

describe('Telemetry config', () => {
  it('creates a persistent install id and marks the first launch', () => {
    const t = make(true)
    expect(t.isFirstLaunch()).toBe(true)
    expect(existsSync(join(dir, 'telemetry.json'))).toBe(true)
    const id = JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8')).installId as string
    expect(id).toMatch(/^[0-9a-f]{32}$/)

    const again = make(true)
    expect(again.isFirstLaunch()).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8')).installId).toBe(id)
  })

  it('defaults enabled to true', () => {
    expect(make(true).isEnabled()).toBe(true)
  })
})

describe('enabled / disabled behaviour', () => {
  it('queues and flushes events when active and enabled', async () => {
    const t = make(true)
    t.track('scan_complete', { files: 5, bytes: 100, path: '/secret' })
    await t.flush()
    expect(sent).toHaveLength(1)
    const payload = sent[0] as { source: string; anon_id: string; events: { name: string; props?: Record<string, unknown> }[] }
    expect(payload.source).toBe('app')
    expect(payload.anon_id).toMatch(/^[0-9a-f]{32}$/)
    expect(payload.events[0].name).toBe('scan_complete')
    expect(payload.events[0].props).toEqual({ files: 5, bytes: 100 }) // path stripped
  })

  it('sends nothing when telemetry is inactive for the build', async () => {
    const t = make(false)
    t.track('app_open', { first_launch: true })
    await t.flush()
    expect(sent).toHaveLength(0)
  })

  it('validates renderer events against the allowlist', async () => {
    const t = make(true)
    t.trackFromRenderer({ name: 'tab_view', props: { tab: 'cleanup' } })
    t.trackFromRenderer({ name: 'rm_rf', props: {} })
    t.trackFromRenderer({ name: 'app_quit' }) // allowed name, fine from either side
    await t.flush()
    const names = (sent[0] as { events: { name: string }[] }).events.map((e) => e.name)
    expect(names).toEqual(['tab_view', 'app_quit'])
  })

  it('stops sending after opt-out and emits one final telemetry_disabled', async () => {
    const t = make(true)
    t.setEnabled(false)
    await Promise.resolve()
    expect(t.isEnabled()).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8')).enabled).toBe(false)
    const names = sent.flatMap((p) => (p as { events: { name: string }[] }).events.map((e) => e.name))
    expect(names).toContain('telemetry_disabled')

    sent.length = 0
    t.track('scan_start', { target: 'disk' })
    t.trackFromRenderer({ name: 'tab_view', props: { tab: 'search' } })
    await t.flush()
    expect(sent).toHaveLength(0)
  })

  it('re-enabling resumes sending and persists', async () => {
    const t = make(true)
    t.setEnabled(false)
    t.setEnabled(true)
    expect(JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8')).enabled).toBe(true)
    sent.length = 0
    t.track('scan_start', { target: 'home' })
    await t.flush()
    expect(sent).toHaveLength(1)
  })

  it('flushes at the queue threshold without waiting for the timer', async () => {
    const t = make(true)
    for (let i = 0; i < 20; i++) t.track('scan_start', { target: 'folder' })
    await Promise.resolve()
    await Promise.resolve()
    expect(sent.length).toBeGreaterThanOrEqual(1)
  })

  it('never throws when the network fails', async () => {
    const failing: Fetcher = vi.fn(async () => {
      throw new Error('offline')
    })
    const t = make(true, failing)
    t.track('app_open', { first_launch: false })
    await expect(t.flush()).resolves.toBeUndefined()
  })
})
