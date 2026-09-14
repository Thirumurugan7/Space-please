import { useEffect, useState } from 'react'
import type { ScanProgress, ScanState } from '../shared/types'
import { Sidebar } from './components/Sidebar'
import { ActionsProvider } from './lib/actions'
import { formatBytes, formatCount } from './lib/format'
import { CleanupTab } from './tabs/CleanupTab'
import { OverviewTab } from './tabs/OverviewTab'
import { ReportTab } from './tabs/ReportTab'
import { SearchTab } from './tabs/SearchTab'

type TabId = 'overview' | 'search' | 'cleanup' | 'report'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'search', label: 'Search' },
  { id: 'cleanup', label: 'Cleanup' },
  { id: 'report', label: 'Report' },
]

export function App() {
  const [state, setState] = useState<ScanState | null>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    const off = window.sa.onEvent((event) => {
      if (event.type === 'state') {
        setState(event.state)
        setRevision((r) => r + 1)
        if (event.state.status !== 'scanning') setProgress(null)
      } else if (event.type === 'progress') {
        setProgress(event.progress)
      }
    })
    void window.sa.scan.state().then((s) => setState((current) => current ?? s))
    return off
  }, [])

  const ready = state?.status === 'ready'

  return (
    <ActionsProvider>
      <div className="app">
        <Sidebar state={state} progress={progress} />
        <main className="main">
          <header className="toolbar">
            <div className="tabs" role="tablist" aria-label="Views">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`tab${tab === t.id ? ' active' : ''}`}
                  disabled={!ready}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </header>
          {ready ? (
            <>
              <section className="panel" role="tabpanel" hidden={tab !== 'overview'}>
                <OverviewTab state={state} revision={revision} />
              </section>
              <section className="panel" role="tabpanel" hidden={tab !== 'search'}>
                <SearchTab state={state} revision={revision} />
              </section>
              <section className="panel" role="tabpanel" hidden={tab !== 'cleanup'}>
                <CleanupTab state={state} revision={revision} />
              </section>
              <section className="panel" role="tabpanel" hidden={tab !== 'report'}>
                <ReportTab state={state} revision={revision} />
              </section>
            </>
          ) : (
            <Placeholder state={state} progress={progress} />
          )}
        </main>
      </div>
    </ActionsProvider>
  )
}

function Placeholder({ state, progress }: { state: ScanState | null; progress: ScanProgress | null }) {
  if (state?.status === 'scanning') {
    return (
      <div className="placeholder">
        <div className="spinner" aria-hidden />
        <h1>Scanning {state.root}</h1>
        <p className="big-number">{formatCount(progress?.entries ?? 0)} items</p>
        <p className="muted">{formatBytes(progress?.bytes ?? 0)} found so far</p>
      </div>
    )
  }
  if (state?.status === 'error') {
    return (
      <div className="placeholder">
        <h1>The scan didn't finish</h1>
        <p className="error-text">{state.message}</p>
        <p className="muted">Pick a location in the sidebar to try again.</p>
      </div>
    )
  }
  return (
    <div className="placeholder">
      <h1>See what's filling your Mac</h1>
      <p className="muted">Choose Macintosh HD, your Home folder, or any folder in the sidebar to start a scan.</p>
    </div>
  )
}
