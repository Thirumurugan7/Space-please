// Types that cross a process boundary (engine worker ⇄ main ⇄ renderer). Times are unix seconds.

export type KindName = 'file' | 'dir' | 'symlink' | 'other'

export type FileType = 'folder' | 'app' | 'video' | 'image' | 'audio' | 'archive' | 'document' | 'code' | 'other'

export interface Row {
  id: number
  name: string
  path: string
  kind: KindName
  type: FileType
  size: number
  items: number
  mtime: number
}

export type SortKey = 'name' | 'size' | 'items' | 'mtime'

export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

export interface Page {
  rows: Row[]
  total: number
}

export interface SearchQuery {
  text: string
  types: FileType[]
  minSize: number | null
  maxSize: number | null
  modifiedAfter: number | null
  modifiedBefore: number | null
  kind: 'any' | 'files' | 'folders'
}

export interface SunburstNode {
  id: number | null
  name: string
  size: number
  kind: KindName
  children?: SunburstNode[]
}

export interface Crumb {
  id: number
  name: string
}

export type ScanStatus = 'empty' | 'scanning' | 'ready' | 'error'

export interface ScanState {
  status: ScanStatus
  root: string | null
  scannedAt: number | null
  incomplete: boolean
  entries: number
  errors: number
  totalSize: number
  message: string | null
}

export interface ScanProgress {
  entries: number
  bytes: number
  path: string
}

export type CleanupCategoryId = 'large' | 'downloads' | 'caches' | 'developer' | 'trash'

export interface CleanupCategory {
  id: CleanupCategoryId
  title: string
  description: string
  total: number
  count: number
  items: Row[]
}

export interface DuplicateGroup {
  size: number
  hash: string
  wasted: number
  items: Row[]
}

export interface DuplicateProgress {
  phase: 'hashing' | 'done' | 'cancelled'
  done: number
  total: number
}

export interface DuplicatesResult {
  groups: DuplicateGroup[]
  wasted: number
  cancelled: boolean
}

export interface TrashResult {
  trashed: number[]
  missing: number[]
  failed: { id: number; path: string; message: string }[]
  rejected: { path: string; reason: string }[]
}

/** How careful the user should be before acting on a suggestion. */
export type SuggestionSafety = 'safe' | 'review' | 'your-call'

export interface ReportSuggestion {
  id: CleanupCategoryId
  title: string
  advice: string
  safety: SuggestionSafety
  total: number
  count: number
  items: Row[]
}

export interface ReportFileList {
  total: number
  count: number
  items: Row[]
}

export interface ReportOptions {
  largeThreshold: number
  /** Files not modified for at least this many days are stale. */
  staleDays: number
  /** Files modified within this many days are recent. */
  recentDays: number
}

export interface SpaceReport {
  /** Sum of all suggestions, counting overlapping items once. */
  reclaimable: number
  /** Non-empty suggestions, biggest first. */
  suggestions: ReportSuggestion[]
  /** Folder the stale/recent lists cover: home when it was scanned, otherwise the scan root. */
  scope: string
  stale: ReportFileList
  recent: ReportFileList
}

export interface DiskInfo {
  total: number
  free: number
  used: number
}

export type FdaStatus = 'granted' | 'denied' | 'unknown'

export type EngineEvent =
  | { type: 'state'; state: ScanState }
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'duplicates'; progress: DuplicateProgress }
