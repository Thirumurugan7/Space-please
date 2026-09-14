export type TourPlacement = 'right' | 'bottom' | 'center'

export interface TourStep {
  id: string
  /** Matches a `data-tour` attribute in the UI; null shows the step as a centred card. */
  target: string | null
  title: string
  body: string
  placement: TourPlacement
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    placement: 'center',
    title: 'Welcome to Space-please',
    body: 'Space-please maps everything on your Mac, shows what is using space and helps you clear it safely. This tour takes about a minute.',
  },
  {
    id: 'choose',
    target: 'scan-targets',
    placement: 'right',
    title: 'Choose what to scan',
    body: 'Scan the whole disk with Macintosh HD, just your Home folder, or pick any folder. A full-disk scan usually finishes in under a minute.',
  },
  {
    id: 'status',
    target: 'scan-status',
    placement: 'right',
    title: 'Follow the scan',
    body: 'Items are counted live while the scan runs, and you can cancel at any time. Afterwards the totals appear here, with Rescan to refresh. Your last scan opens instantly next time.',
  },
  {
    id: 'full-disk-access',
    target: null,
    placement: 'center',
    title: 'Allow Full Disk Access for complete results',
    body: 'macOS protects folders such as Mail and Messages. Open System Settings, go to Privacy & Security, then Full Disk Access, turn on Space-please and rescan. Without it those folders are skipped.',
  },
  {
    id: 'overview',
    target: 'tab-overview',
    placement: 'bottom',
    title: 'Overview',
    body: 'See how full your disk is and explore the sunburst: click a ring to open a folder and click the centre to go back up. The table lists what is inside, biggest first.',
  },
  {
    id: 'search',
    target: 'tab-search',
    placement: 'bottom',
    title: 'Search',
    body: 'Find any file by name instantly, then narrow the results by type, size, date, or files and folders.',
  },
  {
    id: 'cleanup',
    target: 'tab-cleanup',
    placement: 'bottom',
    title: 'Cleanup',
    body: 'Ready-made suggestions: large files, old downloads, caches, developer junk, the Trash and duplicate files. Tick what you no longer need.',
  },
  {
    id: 'report',
    target: 'tab-report',
    placement: 'bottom',
    title: 'Report',
    body: 'Your space-saving summary: how much you could free, suggestions rated by safety, files untouched for years and what was added recently.',
  },
  {
    id: 'trash',
    target: null,
    placement: 'center',
    title: 'Delete with confidence',
    body: 'Right-click any item to open it, reveal it in Finder, copy its path or move it to the Trash. Items only ever go to the Trash, so you can put them back, and system folders are protected.',
  },
  {
    id: 'replay',
    target: 'tour-button',
    placement: 'right',
    title: 'You are all set',
    body: 'Replay this tour from here whenever you like. Start by choosing what to scan.',
  },
]

export const TOUR_STORAGE_KEY = 'space-please.tour-complete.v1'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** True until the tour has been finished or skipped once. Unreadable storage shows the tour. */
export function shouldShowTour(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(TOUR_STORAGE_KEY) !== 'done'
  } catch {
    return true
  }
}

export function markTourComplete(store: KeyValueStore | null): void {
  try {
    store?.setItem(TOUR_STORAGE_KEY, 'done')
  } catch {
    // Storage may be unavailable; the tour will simply show again next launch.
  }
}

/** Index of the step to show after `direction`, or null when the tour should close. */
export function stepAfter(index: number, direction: 'next' | 'back', count = TOUR_STEPS.length): number | null {
  if (direction === 'back') return Math.max(0, index - 1)
  return index + 1 < count ? index + 1 : null
}
