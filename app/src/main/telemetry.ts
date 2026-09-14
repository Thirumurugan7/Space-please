import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALL_EVENTS,
  COLLECT_ENDPOINT,
  MAIN_EVENTS,
  isValidAnonId,
  sanitizeEvent,
  sanitizeProps,
  type TelemetryEvent,
  type TelemetryPayload,
} from '../shared/telemetry'

const FLUSH_INTERVAL_MS = 30_000
const FLUSH_AT_QUEUE = 20
const MAX_QUEUE = 200

export interface TelemetryConfig {
  installId: string
  enabled: boolean
  firstSeen: number
}

export interface TelemetryEnv {
  app_version?: string
  os_version?: string
  arch?: string
  locale?: string
}

/** Minimal shape of Electron's `net` we depend on, so the client is unit-testable without Electron. */
export interface Fetcher {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean }>
}

export interface TelemetryOptions {
  userDataDir: string
  env: TelemetryEnv
  fetch: Fetcher
  /** When false, nothing is ever queued or sent (tests, dev without opt-in). */
  active: boolean
  now?: () => number
  /** Injected in tests so timers don't run for real. */
  setInterval?: (fn: () => void, ms: number) => { unref?: () => void }
}

function newId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Decides whether telemetry should run at all for this launch, from env and packaging.
 * Off in tests and in `electron-vite dev` unless explicitly turned on with SA_TELEMETRY=1.
 */
export function telemetryActive(opts: { env: Record<string, string | undefined>; isPackaged: boolean }): boolean {
  const { env, isPackaged } = opts
  if (env.SA_TELEMETRY === '0') return false
  if (env.SA_TELEMETRY === '1') return true
  // E2E and unit runs set these; never phone home from a test.
  if (env.SA_E2E_CHOOSE_FOLDER || env.SA_USER_DATA || env.VITEST || env.NODE_ENV === 'test') return false
  return isPackaged
}

/**
 * Batches anonymous usage events and sends them to the collector from the main process.
 * All failures are swallowed; nothing here may throw into the app.
 */
export class Telemetry {
  private readonly configPath: string
  private config: TelemetryConfig
  private queue: TelemetryEvent[] = []
  private readonly sessionId = newId()
  private readonly opts: TelemetryOptions
  private readonly now: () => number
  private disabledNotified = false
  private firstLaunch = false

  constructor(opts: TelemetryOptions) {
    this.opts = opts
    this.now = opts.now ?? Date.now
    this.configPath = join(opts.userDataDir, 'telemetry.json')
    this.config = this.load()
    if (this.canSend()) {
      const schedule = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms).unref())
      const handle = schedule(() => void this.flush(), FLUSH_INTERVAL_MS)
      handle?.unref?.()
    }
  }

  private load(): TelemetryConfig {
    try {
      const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<TelemetryConfig>
      if (raw && typeof raw.installId === 'string' && isValidAnonId(raw.installId)) {
        return {
          installId: raw.installId,
          enabled: raw.enabled !== false,
          firstSeen: typeof raw.firstSeen === 'number' ? raw.firstSeen : this.now(),
        }
      }
    } catch {
      // No config yet, or unreadable: start fresh.
    }
    const fresh: TelemetryConfig = { installId: newId(), enabled: true, firstSeen: this.now() }
    this.firstLaunch = true
    this.save(fresh)
    return fresh
  }

  isFirstLaunch(): boolean {
    return this.firstLaunch
  }

  private save(config: TelemetryConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(config))
    } catch {
      // Best effort; a read-only userData just means settings won't persist.
    }
  }

  private canSend(): boolean {
    return this.opts.active && this.config.enabled
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  getState(): { enabled: boolean; active: boolean } {
    return { enabled: this.config.enabled, active: this.opts.active }
  }

  /** Flip the Settings switch. Turning it off fires one final `telemetry_disabled`, then stops. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.config.enabled) return
    if (!enabled && this.opts.active && !this.disabledNotified) {
      this.disabledNotified = true
      // Record the opt-out itself (still allowed at this instant), then flush and go quiet.
      this.queue.push({ name: 'telemetry_disabled', ts: this.now() })
      void this.flush(true)
    }
    this.config = { ...this.config, enabled }
    this.save(this.config)
    if (!enabled) this.queue = []
  }

  /** Queue a main-process event (already trusted, but props are still sanitized). */
  track(name: (typeof MAIN_EVENTS)[number], props?: Record<string, unknown>): void {
    if (!this.canSend()) return
    this.enqueue({ name, ts: this.now(), props: sanitizeProps(props) })
  }

  /** Queue an event that arrived from the renderer; untrusted, so validate against the allowlist. */
  trackFromRenderer(input: unknown): void {
    if (!this.canSend()) return
    const event = sanitizeEvent(input, ALL_EVENTS)
    if (event) this.enqueue(event)
  }

  private enqueue(event: TelemetryEvent): void {
    this.queue.push(event)
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE)
    if (this.queue.length >= FLUSH_AT_QUEUE) void this.flush()
  }

  /** Send whatever is queued. `force` lets a final opt-out event go out even as we disable. */
  async flush(force = false): Promise<void> {
    if (this.queue.length === 0) return
    if (!force && !this.canSend()) return
    const events = this.queue.slice(0, 50)
    this.queue = this.queue.slice(events.length)
    const payload: TelemetryPayload = {
      source: 'app',
      anon_id: this.config.installId,
      session_id: this.sessionId,
      app_version: this.opts.env.app_version,
      os_version: this.opts.env.os_version,
      arch: this.opts.env.arch,
      locale: this.opts.env.locale,
      events,
    }
    try {
      await this.opts.fetch(COLLECT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // Offline or the collector is down: drop this batch rather than retry forever.
    }
  }
}
