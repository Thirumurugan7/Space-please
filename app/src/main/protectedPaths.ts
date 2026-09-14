export interface GuardContext {
  /** Path of the running .app bundle (or the Electron binary in development). */
  appPath: string
  scanRoot: string | null
  home: string
}

const PROTECTED_PREFIXES = ['/System', '/usr', '/bin', '/sbin', '/Library/Apple']

const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/** Returns why a path must not be trashed, or null when trashing is allowed. */
export function protectionReason(path: string, ctx: GuardContext): string | null {
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (!p.startsWith('/')) return 'Only absolute paths can be trashed'
  if (p === '/') return 'The disk root cannot be trashed'
  for (const prefix of PROTECTED_PREFIXES) {
    if (within(p, prefix)) return `${prefix} is a protected system location`
  }
  const scanRoot = ctx.scanRoot !== null && ctx.scanRoot.length > 1 ? ctx.scanRoot.replace(/\/+$/, '') : ctx.scanRoot
  if (scanRoot !== null && p === scanRoot) return 'The scanned folder itself cannot be trashed'
  if (within(ctx.home, p)) return 'Your home folder cannot be trashed'
  if (within(p, ctx.appPath) || within(ctx.appPath, p)) return 'Space-please cannot trash itself'
  return null
}

/** `/Applications/Space-please.app/Contents/MacOS/Space-please` → `/Applications/Space-please.app`. */
export function bundlePath(exePath: string): string {
  const i = exePath.indexOf('.app/')
  return i < 0 ? exePath : exePath.slice(0, i + 4)
}
