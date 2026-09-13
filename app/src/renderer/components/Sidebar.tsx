import { useEffect, useState } from 'react'
import type { FdaStatus, ScanProgress, ScanState } from '../../shared/types'
import { useActions } from '../lib/actions'
import { formatBytes, formatCount, nowSeconds, plural, relativeTime } from '../lib/format'
import { FdaBanner } from './FdaBanner'

interface Props {
  state: ScanState | null
  progress: ScanProgress | null
}

export function Sidebar({ state, progress }: Props) {
  const actions = useActions()
  const [home, setHome] = useState<string | null>(null)
  const [fda, setFda] = useState<FdaStatus>('unknown')

  useEffect(() => {
    void window.sa.system.home().then(setHome)
    void window.sa.system.fda().then(setFda)
  }, [])

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

  const targets = [
    { label: 'Macintosh HD', path: '/' },
    { label: 'Home', path: home },
  ]

  return (
    <aside className="sidebar">
      <div className="titlebar-space" />
      <div className="brand">Space Analyser</div>
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
            <span className="target-label">{t.label}</span>
            <span className="target-path">{t.path}</span>
          </button>
        ))}
        <button type="button" className="target" disabled={scanning} onClick={() => void choose()}>
          <span className="target-label">Choose folder…</span>
        </button>
      </nav>

      <section className="scan-status" data-testid="scan-status" aria-live="polite">
        {scanning ? (
          <>
            <div className="progress-bar indeterminate" />
            <div>
              {formatCount(progress?.entries ?? 0)} items · {formatBytes(progress?.bytes ?? 0)}
            </div>
            <div className="progress-path" title={progress?.path}>
              {progress?.path}
            </div>
            <button type="button" className="button" onClick={() => void window.sa.scan.cancel()}>
              Cancel Scan
            </button>
          </>
        ) : state?.status === 'ready' ? (
          <>
            <div className="status-root" title={state.root ?? ''}>
              {state.root}
            </div>
            <div>
              {plural(state.entries, 'item')} · {formatBytes(state.totalSize)}
            </div>
            <div className="muted">
              Scanned {relativeTime(state.scannedAt ?? nowSeconds(), nowSeconds())}
              {state.incomplete ? ' · incomplete' : ''}
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
          <div className="muted">No scan yet</div>
        )}
      </section>

      {fda === 'denied' && <FdaBanner />}
    </aside>
  )
}
