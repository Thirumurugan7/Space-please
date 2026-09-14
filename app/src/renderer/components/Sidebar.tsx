import { useEffect, useState } from 'react'
import type { DiskInfo, FdaStatus, ScanProgress, ScanState } from '../../shared/types'
import { useActions } from '../lib/actions'
import { formatBytes, formatCount, nowSeconds, plural, relativeTime } from '../lib/format'
import { FdaBanner } from './FdaBanner'
import { Icon, type IconName } from './Icon'

interface Props {
  state: ScanState | null
  progress: ScanProgress | null
}

export function Sidebar({ state, progress }: Props) {
  const actions = useActions()
  const [home, setHome] = useState<string | null>(null)
  const [fda, setFda] = useState<FdaStatus>('unknown')
  const [disk, setDisk] = useState<DiskInfo | null>(null)

  useEffect(() => {
    void window.sa.system.home().then(setHome)
    void window.sa.system.fda().then(setFda)
  }, [])

  useEffect(() => {
    void window.sa.system.disk().then(setDisk)
  }, [state])

  const scanning = state?.status === 'scanning'

  const start = async (root: string) => {
    if (state?.status === 'ready') {
      const ok = await actions.confirm({
        title: 'Replace the current results?',
        body: `Scanning ${root} replaces the results for ${state.root}.`,
        confirmLabel: 'Scan',
      })
      if (!ok) return
    }
    await window.sa.scan.start(root)
  }

  const choose = async () => {
    const path = await window.sa.dialog.chooseFolder()
    if (path) await start(path)
  }

  const targets: { label: string; path: string | null; icon: IconName }[] = [
    { label: 'Macintosh HD', path: '/', icon: 'drive' },
    { label: 'Home', path: home, icon: 'home' },
  ]
  const usedShare = disk && disk.total > 0 ? disk.used / disk.total : 0

  return (
    <aside className="sidebar">
      <div className="titlebar-space" />
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span>Space Analyser</span>
      </div>

      <nav className="targets" aria-label="Scan targets">
        <div className="section-label">Scan</div>
        {targets.map((t) => (
          <button
            key={t.label}
            type="button"
            className={`target${state?.root === t.path ? ' active' : ''}`}
            disabled={scanning || !t.path}
            onClick={() => t.path && void start(t.path)}
          >
            <Icon name={t.icon} size={17} className="target-icon" />
            <span className="target-text">
              <span className="target-label">{t.label}</span>
              <span className="target-path">{t.path}</span>
            </span>
          </button>
        ))}
        <button type="button" className="target" disabled={scanning} onClick={() => void choose()}>
          <Icon name="folder" size={17} className="target-icon" />
          <span className="target-text">
            <span className="target-label">Choose folder…</span>
          </span>
        </button>
      </nav>

      <section className="scan-status" data-testid="scan-status" aria-live="polite">
        {scanning ? (
          <>
            <div className="progress-bar indeterminate" />
            <div className="status-figure">{formatCount(progress?.entries ?? 0)} items</div>
            <div className="muted">{formatBytes(progress?.bytes ?? 0)} found</div>
            <div className="progress-path" title={progress?.path}>
              <bdi>{progress?.path}</bdi>
            </div>
            <button type="button" className="button" onClick={() => void window.sa.scan.cancel()}>
              Cancel Scan
            </button>
          </>
        ) : state?.status === 'ready' ? (
          <>
            <div className="status-root" title={state.root ?? ''}>
              {state.root === '/' ? 'Macintosh HD' : (state.root?.split('/').filter(Boolean).pop() ?? state.root)}
            </div>
            <div className="status-figure">{plural(state.entries, 'item')}</div>
            <div className="muted">
              {formatBytes(state.totalSize)} scanned {relativeTime(state.scannedAt ?? nowSeconds(), nowSeconds())}
              {state.incomplete ? ', incomplete' : ''}
            </div>
            {state.errors > 0 && <div className="muted">{plural(state.errors, 'item')} couldn't be read</div>}
            {state.message && <div className="error-text">{state.message}</div>}
            <button type="button" className="button" onClick={() => state.root && void start(state.root)}>
              Rescan
            </button>
          </>
        ) : state?.status === 'error' ? (
          <div className="error-text">{state.message}</div>
        ) : (
          <div className="muted">Pick a place to scan.</div>
        )}
      </section>

      <div className="sidebar-spacer" />

      {fda === 'denied' && <FdaBanner />}

      {disk && (
        <div className="disk-meter" aria-label="Disk usage">
          <div className="disk-meter-row">
            <span>Macintosh HD</span>
            <span className="muted">{formatBytes(disk.free)} free</span>
          </div>
          <div className="disk-meter-track">
            <span className="disk-meter-fill" style={{ width: `${usedShare * 100}%` }} />
          </div>
        </div>
      )}
    </aside>
  )
}
