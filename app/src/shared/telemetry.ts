// Shared telemetry contract: the one place the collector URL, the event allowlist and the
// prop/event sanitizers live, so main, preload and tests agree. Everything here is pure and
// process-agnostic; the actual sending happens in main/telemetry.ts.

/** Where anonymous usage events are sent. Kept in ONE place per the collector contract. */
export const INSIGHTS_URL = 'https://space-please-insights.vercel.app'
export const COLLECT_ENDPOINT = `${INSIGHTS_URL}/api/collect`

/** Events the renderer is allowed to report. Main drops anything not on this list. */
export const RENDERER_EVENTS = [
  'tab_view',
  'search',
  'filter_use',
  'cleanup_expand',
  'duplicates_scan',
  'reveal',
  'open_file',
  'copy_paths',
  'tour_start',
  'tour_complete',
  'tour_skip',
  'error',
] as const

/** Events only the main process emits (scan lifecycle, app lifecycle, trash, telemetry state). */
export const MAIN_EVENTS = [
  'app_open',
  'app_quit',
  'scan_start',
  'scan_complete',
  'scan_error',
  'trash',
  'telemetry_disabled',
  'error',
] as const

export const ALL_EVENTS = [...new Set([...RENDERER_EVENTS, ...MAIN_EVENTS])]

export type RendererEventName = (typeof RENDERER_EVENTS)[number]

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export interface TelemetryEvent {
  name: string
  ts?: number
  path?: string
  referrer?: string
  props?: Record<string, string | number | boolean>
}

export interface TelemetryPayload {
  source: 'app'
  anon_id: string
  session_id?: string
  app_version?: string
  os_version?: string
  arch?: string
  locale?: string
  events: TelemetryEvent[]
}

/** True when a string looks like a filesystem path or URL we must never transmit. */
export function looksLikePath(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    /^[a-z]+:/i.test(value) || // scheme like file:, http:
    /~|\$HOME|%USERPROFILE%/i.test(value)
  )
}

/**
 * Keep only safe prop values: finite numbers, booleans and short enum-like strings. Strings that
 * look like paths, or are too long, are dropped entirely — never truncated and sent.
 */
export function sanitizeProps(props: unknown): Record<string, string | number | boolean> | undefined {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined
  const out: Record<string, string | number | boolean> = {}
  let count = 0
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (count >= 20) break
    if (key.length === 0 || key.length > 40) continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
      out[key] = value
    } else if (typeof value === 'boolean') {
      out[key] = value
    } else if (typeof value === 'string') {
      if (value.length === 0 || value.length > 120 || looksLikePath(value)) continue
      out[key] = value
    } else {
      continue
    }
    count++
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Validate and clean one event. Returns null if the name is not allowed or malformed, so callers
 * can safely map an untrusted renderer message to a wire event.
 */
export function sanitizeEvent(input: unknown, allowed: readonly string[]): TelemetryEvent | null {
  if (!input || typeof input !== 'object') return null
  const { name, ts, props } = input as Record<string, unknown>
  if (typeof name !== 'string' || !EVENT_NAME_RE.test(name) || !allowed.includes(name)) return null
  const event: TelemetryEvent = { name }
  if (typeof ts === 'number' && Number.isFinite(ts)) event.ts = ts
  const clean = sanitizeProps(props)
  if (clean) event.props = clean
  return event
}

export function isValidAnonId(value: string): boolean {
  return ID_RE.test(value)
}

/** Scrub anything path-like or overlong from a free-text error message before it leaves the machine. */
export function scrubMessage(message: unknown): string {
  if (typeof message !== 'string') return 'unknown'
  const firstLine = message.split('\n')[0]
  const scrubbed = firstLine
    .replace(/\b\w+:\/\/\S+/g, '<url>') // urls first, before the path rule can eat their //host/path
    .replace(/[A-Za-z]:\\[^\s]*/g, '<path>')
    .replace(/(?:\/[^\s/]+)+\/?/g, '<path>')
  return scrubbed.slice(0, 120) || 'unknown'
}
