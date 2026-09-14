import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, TOUR_STORAGE_KEY, markTourComplete, shouldShowTour, stepAfter, type KeyValueStore } from '../../src/renderer/lib/tour'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('TOUR_STEPS', () => {
  it('opens with a centred welcome and ends by pointing at the replay button', () => {
    expect(TOUR_STEPS[0]).toMatchObject({ id: 'welcome', target: null, placement: 'center' })
    expect(TOUR_STEPS.at(-1)).toMatchObject({ target: 'tour-button' })
  })

  it('has unique ids, and every anchored step names a target', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length)
    for (const step of TOUR_STEPS) {
      expect(step.placement === 'center' ? step.target : typeof step.target).toBe(step.placement === 'center' ? null : 'string')
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })

  it('covers every tab and the scan controls', () => {
    const targets = TOUR_STEPS.map((s) => s.target)
    for (const t of ['scan-targets', 'scan-status', 'tab-overview', 'tab-search', 'tab-cleanup', 'tab-report']) {
      expect(targets).toContain(t)
    }
  })
})

describe('stepAfter', () => {
  it('moves forward and closes after the last step', () => {
    expect(stepAfter(0, 'next', 3)).toBe(1)
    expect(stepAfter(2, 'next', 3)).toBeNull()
  })

  it('moves back but never below the first step', () => {
    expect(stepAfter(2, 'back', 3)).toBe(1)
    expect(stepAfter(0, 'back', 3)).toBe(0)
  })
})

describe('tour storage', () => {
  it('shows the tour until it is marked complete', () => {
    const store = memoryStore()
    expect(shouldShowTour(store)).toBe(true)
    markTourComplete(store)
    expect(store.data.get(TOUR_STORAGE_KEY)).toBe('done')
    expect(shouldShowTour(store)).toBe(false)
  })

  it('shows the tour when storage is missing or unreadable, without throwing', () => {
    expect(shouldShowTour(null)).toBe(true)
    expect(shouldShowTour(brokenStore)).toBe(true)
    expect(() => markTourComplete(brokenStore)).not.toThrow()
  })
})
