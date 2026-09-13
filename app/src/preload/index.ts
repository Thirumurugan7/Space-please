import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS as C, type SaApi } from '../shared/api'
import type { EngineEvent } from '../shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: SaApi = {
  scan: {
    start: (root) => invoke(C.scanStart, root),
    cancel: () => invoke(C.scanCancel),
    state: () => invoke(C.scanState),
  },
  tree: {
    children: (dirId, sort, offset, limit) => invoke(C.treeChildren, dirId, sort, offset, limit),
    search: (query, sort, offset, limit) => invoke(C.treeSearch, query, sort, offset, limit),
    sunburst: (id) => invoke(C.treeSunburst, id),
    breadcrumb: (id) => invoke(C.treeBreadcrumb, id),
  },
  cleanup: {
    categories: (largeThreshold) => invoke(C.cleanupCategories, largeThreshold),
    findDuplicates: () => invoke(C.cleanupDuplicates),
    cancelDuplicates: () => invoke(C.cleanupCancelDuplicates),
  },
  actions: {
    trash: (ids) => invoke(C.actionsTrash, ids),
    reveal: (id) => invoke(C.actionsReveal, id),
    open: (id) => invoke(C.actionsOpen, id),
    copyPaths: (ids) => invoke(C.actionsCopyPaths, ids),
  },
  system: {
    disk: () => invoke(C.systemDisk),
    fda: () => invoke(C.systemFda),
    openFdaSettings: () => invoke(C.systemOpenFdaSettings),
    home: () => invoke(C.systemHome),
  },
  dialog: {
    chooseFolder: () => invoke(C.dialogChooseFolder),
  },
  onEvent: (listener) => {
    const handler = (_: unknown, event: EngineEvent) => listener(event)
    ipcRenderer.on(C.engineEvent, handler)
    return () => {
      ipcRenderer.removeListener(C.engineEvent, handler)
    }
  },
}

contextBridge.exposeInMainWorld('sa', api)
