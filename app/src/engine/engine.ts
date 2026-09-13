import type {
  CleanupCategory,
  Crumb,
  DuplicatesResult,
  EngineEvent,
  Page,
  ScanState,
  SearchQuery,
  Sort,
  SunburstNode,
} from '../shared/types'
import { cleanupCategories } from './cleanup'
import { findDuplicates } from './duplicates'
import { SearchCache, breadcrumb, childrenPage, sunburst } from './query'
import { ScanController } from './scanController'
import { loadSnapshot, saveSnapshot } from './snapshot'
import type { Tree } from './tree'

export interface EngineOptions {
  scannerPath: string
  snapshotPath: string
  home: string
  /** Delay before persisting removals, so a burst of trash actions saves once. */
  saveDelayMs?: number
}

const EMPTY: ScanState = {
  status: 'empty', root: null, scannedAt: null, incomplete: false, entries: 0, errors: 0, totalSize: 0, message: null,
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

/** Owns the current tree and answers every query. Runs inside the engine worker. */
export class Engine {
  private readonly opts: EngineOptions
  private readonly emit: (event: EngineEvent) => void
  private readonly scanner: ScanController
  private tree: Tree | null = null
  private search: SearchCache | null = null
  private state: ScanState = EMPTY
  private duplicateAbort: AbortController | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private saving: Promise<void> = Promise.resolve()

  constructor(opts: EngineOptions, emit: (event: EngineEvent) => void) {
    this.opts = opts
    this.emit = emit
    this.scanner = new ScanController(opts.scannerPath)
  }

  async init(): Promise<ScanState> {
    const snapshot = await loadSnapshot(this.opts.snapshotPath)
    if (snapshot) {
      this.setTree(snapshot.tree)
      this.setState({
        ...this.totals(),
        status: 'ready',
        root: snapshot.info.root,
        scannedAt: snapshot.info.scannedAt,
        incomplete: snapshot.info.incomplete,
        errors: snapshot.info.errors,
        message: null,
      })
    } else {
      this.emit({ type: 'state', state: this.state })
    }
    return this.state
  }

  getState(): ScanState {
    return this.state
  }

  async startScan(root: string): Promise<ScanState> {
    if (this.scanner.running) throw new Error('A scan is already running')
    this.cancelDuplicates()
    this.setTree(null)
    this.setState({ ...EMPTY, status: 'scanning', root })

    const outcome = await this.scanner.run(root, (progress) => this.emit({ type: 'progress', progress }))
    const scannedAt = nowSeconds()
    this.setTree(outcome.tree)

    if (!outcome.tree) {
      this.setState({ ...EMPTY, status: 'error', root, errors: outcome.errors, message: outcome.message ?? 'Scan was cancelled before any results arrived' })
      return this.state
    }
    this.setState({
      ...this.totals(),
      status: 'ready',
      root,
      scannedAt,
      incomplete: outcome.incomplete,
      errors: outcome.errors,
      message: outcome.message,
    })
    if (!outcome.incomplete) await this.save()
    return this.state
  }

  cancelScan(): void {
    this.scanner.cancel()
  }

  children(dirId: number, sort: Sort, offset: number, limit: number): Page {
    return this.tree ? childrenPage(this.tree, dirId, sort, offset, limit) : { rows: [], total: 0 }
  }

  searchPage(query: SearchQuery, sort: Sort, offset: number, limit: number): Page {
    return this.search ? this.search.page(query, sort, offset, limit) : { rows: [], total: 0 }
  }

  sunburst(id: number): SunburstNode | null {
    return this.tree ? sunburst(this.tree, id) : null
  }

  breadcrumb(id: number): Crumb[] {
    return this.tree ? breadcrumb(this.tree, id) : []
  }

  cleanup(largeThreshold: number): CleanupCategory[] {
    if (!this.tree) return []
    return cleanupCategories(this.tree, { home: this.opts.home, now: nowSeconds(), largeThreshold })
  }

  async findDuplicates(): Promise<DuplicatesResult> {
    if (!this.tree) return { groups: [], wasted: 0, cancelled: false }
    this.cancelDuplicates()
    const abort = new AbortController()
    this.duplicateAbort = abort
    try {
      return await findDuplicates(this.tree, {
        signal: abort.signal,
        onProgress: (progress) => this.emit({ type: 'duplicates', progress }),
      })
    } finally {
      if (this.duplicateAbort === abort) this.duplicateAbort = null
    }
  }

  cancelDuplicates(): void {
    this.duplicateAbort?.abort()
    this.duplicateAbort = null
  }

  paths(ids: number[]): { id: number; path: string }[] {
    const tree = this.tree
    if (!tree) return []
    return ids.filter((id) => tree.isPresent(id)).map((id) => ({ id, path: tree.path(id) }))
  }

  remove(ids: number[]): ScanState {
    if (!this.tree) return this.state
    let changed = false
    for (const id of ids) changed = this.tree.remove(id) !== null || changed
    if (changed) {
      this.search?.invalidate()
      this.setState({ ...this.state, ...this.totals() })
      this.scheduleSave()
    }
    return this.state
  }

  /** Writes any pending removal to the snapshot. Call before the app quits. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      await this.save()
    }
    await this.saving
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.save()
    }, this.opts.saveDelayMs ?? 3000)
  }

  private save(): Promise<void> {
    const tree = this.tree
    const { root, scannedAt, incomplete, errors } = this.state
    if (!tree || root === null || scannedAt === null) return this.saving
    this.saving = this.saving
      .then(() => saveSnapshot(this.opts.snapshotPath, tree, { root, scannedAt, incomplete, errors }))
      .catch(() => {})
    return this.saving
  }

  private setTree(tree: Tree | null): void {
    this.tree = tree
    this.search = tree ? new SearchCache(tree) : null
  }

  private totals(): Pick<ScanState, 'entries' | 'totalSize'> {
    return this.tree ? { entries: this.tree.items[0] + 1, totalSize: this.tree.total[0] } : { entries: 0, totalSize: 0 }
  }

  private setState(state: ScanState): void {
    this.state = state
    this.emit({ type: 'state', state })
  }
}
