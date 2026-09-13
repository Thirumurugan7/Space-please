import { readdir, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiskInfo, FdaStatus } from '../shared/types'

export const FDA_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

export async function diskInfo(path = '/'): Promise<DiskInfo> {
  const s = await statfs(path)
  const total = s.blocks * s.bsize
  const free = s.bavail * s.bsize
  return { total, free, used: total - free }
}

/** Probes TCC-protected folders: readable → granted, EPERM/EACCES → denied, all missing → unknown. */
export async function fdaStatus(home: string): Promise<FdaStatus> {
  let denied = false
  for (const rel of ['Library/Mail', 'Library/Safari', 'Library/Messages']) {
    try {
      await readdir(join(home, rel))
      return 'granted'
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') denied = true
    }
  }
  return denied ? 'denied' : 'unknown'
}

export interface ScannerLocation {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
  env: Record<string, string | undefined>
}

export function resolveScannerPath(loc: ScannerLocation): string {
  // A test hook: never honoured in a packaged build, where it could point at an arbitrary binary.
  if (!loc.isPackaged && loc.env.SA_SCANNER_PATH) return loc.env.SA_SCANNER_PATH
  return loc.isPackaged
    ? join(loc.resourcesPath, 'bin', 'sa-scan')
    : join(loc.appPath, '..', 'scanner', '.build', 'release', 'sa-scan')
}

/** Workers cannot load scripts from inside app.asar; electron-builder unpacks out/main for us. */
export function unpackedPath(path: string): string {
  return path.replace('/app.asar/', '/app.asar.unpacked/')
}
