import { Fragment, useCallback, useEffect, useState } from 'react'
import type { Crumb, DiskInfo, Row, ScanState, Sort, SunburstNode } from '../../shared/types'
import { ActionBar } from '../components/ActionBar'
import { ContextMenu, type MenuState } from '../components/ContextMenu'
import { NameCell } from '../components/NameCell'
import { Sunburst } from '../components/Sunburst'
import { VirtualTable, type Column } from '../components/VirtualTable'
import { useActions } from '../lib/actions'
import { formatBytes, formatCount, formatDate } from '../lib/format'
import { emptySelection, withoutIds } from '../lib/selection'

interface Props {
  state: ScanState
  revision: number
}

export function OverviewTab({ state, revision }: Props) {
  const actions = useActions()
  const [dirId, setDirId] = useState(0)
  const [sort, setSort] = useState<Sort>({ key: 'size', dir: 'desc' })
  const [selection, setSelection] = useState(emptySelection)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [chart, setChart] = useState<SunburstNode | null>(null)
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const scanKey = `${state.root}:${state.scannedAt}`

  useEffect(() => {
    setDirId(0)
    setSelection(emptySelection())
  }, [scanKey])

  useEffect(() => {
    let live = true
    void Promise.all([window.sa.tree.sunburst(dirId), window.sa.tree.breadcrumb(dirId)]).then(([node, path]) => {
      if (!live) return
      if (!node && dirId !== 0) {
        setDirId(0)
        return
      }
      setChart(node)
      setCrumbs(path)
    })
    return () => {
      live = false
    }
  }, [dirId, revision])

  useEffect(() => {
    void window.sa.system.disk().then(setDisk)
  }, [revision])

  const navigate = (id: number) => {
    setDirId(id)
    setSelection(emptySelection())
  }
  const fetchPage = useCallback((offset: number, limit: number) => window.sa.tree.children(dirId, sort, offset, limit), [dirId, sort])
  const closeMenu = useCallback(() => setMenu(null), [])
  const removed = (ids: number[]) => setSelection((s) => withoutIds(s, ids))
  const parentSize = chart?.size ?? 0

  const columns: Column[] = [
    { id: 'name', label: 'Name', width: 'minmax(200px, 1fr)', sortKey: 'name', render: (r) => <NameCell row={r} /> },
    { id: 'size', label: 'Size', width: '90px', sortKey: 'size', align: 'right', render: (r) => formatBytes(r.size) },
    { id: 'share', label: '% of Folder', width: '110px', render: (r) => <ShareBar fraction={parentSize > 0 ? r.size / parentSize : 0} /> },
    { id: 'items', label: 'Items', width: '80px', sortKey: 'items', align: 'right', render: (r) => (r.kind === 'dir' ? formatCount(r.items) : '—') },
    { id: 'mtime', label: 'Modified', width: '110px', sortKey: 'mtime', render: (r) => formatDate(r.mtime) },
  ]

  const activate = (row: Row) => {
    if (row.kind === 'dir') navigate(row.id)
    else actions.open(row)
  }

  return (
    <div className="overview">
      <div className="stats">
        <Stat label="Disk used" value={disk ? formatBytes(disk.used) : '—'} detail={disk ? `of ${formatBytes(disk.total)}` : ''} />
        <Stat label="Available" value={disk ? formatBytes(disk.free) : '—'} />
        <Stat label="Scanned" value={formatBytes(state.totalSize)} detail={state.root ?? ''} />
        <Stat label="Items" value={formatCount(state.entries)} />
        <Stat label="Skipped" value={formatCount(state.errors)} detail="unreadable" />
      </div>

      <nav className="breadcrumb" aria-label="Folder path">
        {crumbs.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <button type="button" className="crumb" disabled={i === crumbs.length - 1} onClick={() => navigate(c.id)}>
              {c.name}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className="overview-body">
        <div className="chart-panel">
          {chart && chart.size > 0 ? (
            <Sunburst
              data={chart}
              onOpen={(node) => node.id !== null && node.kind === 'dir' && navigate(node.id)}
              onUp={() => crumbs.length > 1 && navigate(crumbs[crumbs.length - 2].id)}
            />
          ) : (
            <p className="muted">Nothing takes up space here.</p>
          )}
          <p className="muted chart-hint">Click a ring to open a folder · click the centre to go up</p>
        </div>
        <div className="table-panel">
          <VirtualTable
            label="Folder contents"
            queryKey={`${scanKey}:${dirId}:${sort.key}:${sort.dir}`}
            revision={revision}
            fetchPage={fetchPage}
            columns={columns}
            sort={sort}
            onSortChange={setSort}
            selection={selection}
            onSelectionChange={setSelection}
            onActivate={activate}
            onContextMenu={(e, rows) => setMenu({ x: e.clientX, y: e.clientY, rows })}
            emptyText="This folder is empty."
          />
          <ActionBar selection={selection} onRemoved={removed} onClear={() => setSelection(emptySelection())} />
        </div>
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} onRemoved={removed} />
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? (
        <div className="stat-detail" title={detail}>
          {detail}
        </div>
      ) : null}
    </div>
  )
}

function ShareBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <span className="share">
      <span className="share-track">
        <span className="share-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="share-text">{pct >= 1 || pct === 0 ? Math.round(pct) : '<1'}%</span>
    </span>
  )
}
