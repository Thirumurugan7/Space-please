import { describe, expect, it } from 'vitest'
import { ALL_EVENTS, looksLikePath, sanitizeEvent, sanitizeProps, scrubMessage } from '../../src/shared/telemetry'

describe('sanitizeProps', () => {
  it('keeps numbers, booleans and short enum strings', () => {
    expect(sanitizeProps({ files: 12, done: true, tab: 'search' })).toEqual({ files: 12, done: true, tab: 'search' })
  })

  it('drops path-like strings but keeps other props', () => {
    expect(sanitizeProps({ tab: 'overview', path: '/Users/me/Secret.txt' })).toEqual({ tab: 'overview' })
    expect(sanitizeProps({ where: 'C:\\Users\\me' })).toBeUndefined()
    expect(sanitizeProps({ url: 'https://example.com/x' })).toBeUndefined()
  })

  it('drops non-finite numbers, overlong strings and nested objects', () => {
    expect(sanitizeProps({ n: Number.NaN })).toBeUndefined()
    expect(sanitizeProps({ n: Infinity })).toBeUndefined()
    expect(sanitizeProps({ long: 'x'.repeat(121) })).toBeUndefined()
    expect(sanitizeProps({ nested: { a: 1 } })).toBeUndefined()
    expect(sanitizeProps({ list: [1, 2] })).toBeUndefined()
  })

  it('caps the number of keys at 20', () => {
    const input: Record<string, number> = {}
    for (let i = 0; i < 30; i++) input[`k${i}`] = i
    expect(Object.keys(sanitizeProps(input) ?? {})).toHaveLength(20)
  })

  it('returns undefined for non-objects and empties', () => {
    expect(sanitizeProps(null)).toBeUndefined()
    expect(sanitizeProps('x')).toBeUndefined()
    expect(sanitizeProps({})).toBeUndefined()
    expect(sanitizeProps([1, 2])).toBeUndefined()
  })
})

describe('looksLikePath', () => {
  it('flags paths and urls', () => {
    for (const v of ['/etc/hosts', 'C:\\Windows', 'file:///x', '~/Documents', 'a/b']) expect(looksLikePath(v)).toBe(true)
  })
  it('passes plain enum-like values', () => {
    for (const v of ['overview', 'disk', 'video', 'high-1']) expect(looksLikePath(v)).toBe(false)
  })
})

describe('sanitizeEvent (allowlist)', () => {
  it('accepts an allowed event and cleans its props', () => {
    const e = sanitizeEvent({ name: 'tab_view', props: { tab: 'search', path: '/x/y' } }, ALL_EVENTS)
    expect(e).toEqual({ name: 'tab_view', props: { tab: 'search' } })
  })

  it('rejects events not on the allowlist', () => {
    expect(sanitizeEvent({ name: 'steal_data' }, ALL_EVENTS)).toBeNull()
    expect(sanitizeEvent({ name: 'pageview' }, ALL_EVENTS)).toBeNull() // site-only event
  })

  it('rejects malformed names and non-objects', () => {
    expect(sanitizeEvent({ name: 'Tab_View' }, ALL_EVENTS)).toBeNull()
    expect(sanitizeEvent({ name: '' }, ALL_EVENTS)).toBeNull()
    expect(sanitizeEvent(null, ALL_EVENTS)).toBeNull()
    expect(sanitizeEvent({ name: 42 }, ALL_EVENTS)).toBeNull()
  })

  it('keeps a valid timestamp and omits props when empty', () => {
    const e = sanitizeEvent({ name: 'reveal', ts: 123, props: { bad: [1] } }, ALL_EVENTS)
    expect(e).toEqual({ name: 'reveal', ts: 123 })
  })
})

describe('scrubMessage', () => {
  it('replaces paths and urls, keeps the shape', () => {
    expect(scrubMessage('Failed to read /Users/me/x.txt')).toBe('Failed to read <path>')
    expect(scrubMessage('fetch https://api.example.com/v1 failed')).toContain('<url>')
  })
  it('takes only the first line and caps length', () => {
    expect(scrubMessage('boom\nstack trace here')).toBe('boom')
    expect(scrubMessage('y'.repeat(200)).length).toBeLessThanOrEqual(120)
    expect(scrubMessage(undefined)).toBe('unknown')
  })
})
