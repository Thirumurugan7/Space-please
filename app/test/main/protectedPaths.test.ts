import { describe, expect, it } from 'vitest'
import { bundlePath, protectionReason } from '../../src/main/protectedPaths'

const ctx = { appPath: '/Applications/Space-please.app', scanRoot: '/', home: '/Users/me' }

describe('protectionReason', () => {
  it.each([
    ['/', 'disk root'],
    ['/System/Library', 'protected system location'],
    ['/usr/local/bin/tool', 'protected system location'],
    ['/bin', 'protected system location'],
    ['/Library/Apple/x', 'protected system location'],
    ['/Users', 'home folder'],
    ['/Users/me', 'home folder'],
    ['/Users/me/', 'home folder'],
    ['/Applications', 'cannot trash itself'],
    ['/Applications/Space-please.app/Contents', 'cannot trash itself'],
    ['relative/path', 'absolute paths'],
  ])('rejects %s', (path, reason) => {
    expect(protectionReason(path, ctx)).toContain(reason)
  })

  it('rejects the scan root', () => {
    expect(protectionReason('/Users/me/Projects', { ...ctx, scanRoot: '/Users/me/Projects' })).toContain('scanned folder')
  })

  it('rejects the scan root even when it carries a trailing slash', () => {
    expect(protectionReason('/Users/me/Projects', { ...ctx, scanRoot: '/Users/me/Projects/' })).toContain('scanned folder')
    expect(protectionReason('/Users/me/Projects/', { ...ctx, scanRoot: '/Users/me/Projects' })).toContain('scanned folder')
  })

  it.each(['/Users/me/Downloads/big.dmg', '/Users/me/Library/Caches/com.app', '/Applications/Other.app', '/usrlocal', '/Systemic'])(
    'allows %s',
    (path) => {
      expect(protectionReason(path, ctx)).toBeNull()
    },
  )
})

describe('bundlePath', () => {
  it('extracts the .app bundle from an executable path', () => {
    expect(bundlePath('/Applications/Space-please.app/Contents/MacOS/Space-please')).toBe('/Applications/Space-please.app')
    expect(bundlePath('/repo/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')).toBe(
      '/repo/app/node_modules/electron/dist/Electron.app',
    )
    expect(bundlePath('/usr/local/bin/node')).toBe('/usr/local/bin/node')
  })
})
