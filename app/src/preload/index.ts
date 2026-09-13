import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('sa', {})
