import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount, plural, relativeTime } from '../../src/renderer/lib/format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [-5, '0 B'],
    [999, '999 B'],
    [1000, '1 KB'],
    [1500, '1.5 KB'],
    [999_999, '1 MB'],
    [1_234_567, '1.2 MB'],
    [12_345_678, '12.3 MB'],
    [99_960_000, '100 MB'],
    [123_456_789, '123 MB'],
    [5e9, '5 GB'],
    [370_410_000_000, '370 GB'],
    [1.5e12, '1.5 TB'],
  ])('%d → %s', (n, text) => {
    expect(formatBytes(n)).toBe(text)
  })
})

describe('formatCount / plural', () => {
  it('groups thousands and pluralises', () => {
    expect(formatCount(5_838_003)).toBe('5,838,003')
    expect(plural(1, 'item')).toBe('1 item')
    expect(plural(2500, 'item')).toBe('2,500 items')
  })
})

describe('relativeTime', () => {
  const now = 1_700_000_000
  it.each([
    [now - 5, 'just now'],
    [now + 50, 'just now'],
    [now - 120, '2 min ago'],
    [now - 3 * 3600, '3 hr ago'],
    [now - 86400, '1 day ago'],
    [now - 10 * 86400, '10 days ago'],
    [now - 65 * 86400, '2 months ago'],
    [now - 800 * 86400, '2 years ago'],
  ])('%d → %s', (t, text) => {
    expect(relativeTime(t, now)).toBe(text)
  })
})
