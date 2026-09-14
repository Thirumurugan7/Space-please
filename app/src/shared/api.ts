import type {
  CleanupCategory,
  Crumb,
  DiskInfo,
  DuplicatesResult,
  EngineEvent,
  FdaStatus,
  Page,
  ReportOptions,
  ScanState,
  SearchQuery,
  Sort,
  SpaceReport,
  SunburstNode,
  TrashResult,
} from './types'

/** The API the preload script exposes to the renderer as `window.sa`. */
export interface SaApi {
  scan: {
    start(root: string): Promise<void>
    cancel(): Promise<void>
    state(): Promise<ScanState>
  }
  tree: {
    children(dirId: number, sort: Sort, offset: number, limit: number): Promise<Page>
    search(query: SearchQuery, sort: Sort, offset: number, limit: number): Promise<Page>
    sunburst(id: number): Promise<SunburstNode | null>
    breadcrumb(id: number): Promise<Crumb[]>
  }
  cleanup: {
    categories(largeThreshold: number): Promise<CleanupCategory[]>
    findDuplicates(): Promise<DuplicatesResult>
    cancelDuplicates(): Promise<void>
  }
  report: {
    /** Null when there is no scan yet. */
    get(options: ReportOptions): Promise<SpaceReport | null>
  }
  actions: {
    trash(ids: number[]): Promise<TrashResult>
    reveal(id: number): Promise<void>
    /** Resolves to an error message, or "" on success. */
    open(id: number): Promise<string>
    copyPaths(ids: number[]): Promise<void>
  }
  system: {
    disk(): Promise<DiskInfo>
    fda(): Promise<FdaStatus>
    openFdaSettings(): Promise<void>
    home(): Promise<string>
  }
  dialog: {
    chooseFolder(): Promise<string | null>
  }
  onEvent(listener: (event: EngineEvent) => void): () => void
}

/** Channel names, shared by preload and main so they cannot drift. */
export const CHANNELS = {
  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanState: 'scan:state',
  treeChildren: 'tree:children',
  treeSearch: 'tree:search',
  treeSunburst: 'tree:sunburst',
  treeBreadcrumb: 'tree:breadcrumb',
  cleanupCategories: 'cleanup:categories',
  cleanupDuplicates: 'cleanup:duplicates',
  cleanupCancelDuplicates: 'cleanup:cancelDuplicates',
  reportGet: 'report:get',
  actionsTrash: 'actions:trash',
  actionsReveal: 'actions:reveal',
  actionsOpen: 'actions:open',
  actionsCopyPaths: 'actions:copyPaths',
  systemDisk: 'system:disk',
  systemFda: 'system:fda',
  systemOpenFdaSettings: 'system:openFdaSettings',
  systemHome: 'system:home',
  dialogChooseFolder: 'dialog:chooseFolder',
  engineEvent: 'engine:event',
} as const
