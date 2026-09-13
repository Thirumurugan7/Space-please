import { useEffect, useState } from 'react'
import type { CleanupCategory, CleanupCategoryId, DuplicateProgress, DuplicatesResult, Row, ScanState } from '../../shared/types'
import { NameCell, parentPath } from '../components/NameCell'
import { useActions } from '../lib/actions'
import { allButOne, pruneDuplicates } from '../lib/cleanup'
import { formatBytes, formatDate, plural } from '../lib/format'

interface Props {
  state: ScanState
  revision: number
}

const THRESHOLDS = [
  { label: '100 MB', value: 100_000_000 },
  { label: '500 MB', value: 500_000_000 },
  { label: '1 GB', value: 1_000_000_000 },
  { label: '5 GB', value: 5_000_000_000 },
]

type Expanded = CleanupCategoryId | 'duplicates' | null

export function CleanupTab({ state, revision }: Props) {
  const actions = useActions()
  const [threshold, setThreshold] = useState(1_000_000_000)
  const [categories, setCategories] = useState<CleanupCategory[] | null>(null)
  const [expanded, setExpanded] = useState<Expanded>(null)
  const [checked, setChecked] = useState<Map<number, Row>>(new Map())
  const [dupes, setDupes] = useState<DuplicatesResult | null>(null)
  const [dupeProgress, setDupeProgress] = useState<DuplicateProgress | null>(null)
  const [finding, setFinding] = useState(false)
  const scanKey = `${state.root}:${state.scannedAt}`

  useEffect(() => {
    let live = true
    void window.sa.cleanup.categories(threshold).then((c) => live && setCategories(c))
    return () => {
      live = false
    }
  }, [threshold, revision])

  useEffect(
    () =>
      window.sa.onEvent((e) => {
        if (e.type === 'duplicates') setDupeProgress(e.progress)
      }),
    [],
  )

  useEffect(() => {
    setChecked(new Map())
    setDupes(null)
    setDupeProgress(null)
  }, [scanKey])

  const toggle = (row: Row) =>
    setChecked((m) => {
      const next = new Map(m)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row)
      return next
    })

  const checkAll = (rows: Row[]) =>
    setChecked((m) => {
      const next = new Map(m)
      for (const r of rows) next.set(r.id, r)
      return next
    })

  const dropIds = (ids: number[]) => {
    if (ids.length === 0) return
    const gone = new Set(ids)
    setChecked((m) => new Map([...m].filter(([id]) => !gone.has(id))))
    setDupes((d) => (d ? pruneDuplicates(d, gone) : d))
  }

  const findDupes = async () => {
    setFinding(true)
    setDupes(null)
    try {
      setDupes(await window.sa.cleanup.findDuplicates())
    } finally {
      setFinding(false)
    }
  }

  const checkedRows = [...checked.values()]
  const checkedSize = checkedRows.reduce((n, r) => n + r.size, 0)

  return (
    <div className="cleanup">
      <div className="cleanup-header">
        <h2>Cleanup suggestions</h2>
        <label className="inline-label">
          Large files over
          <select aria-label="Large file threshold" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
            {THRESHOLDS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {checkedRows.length > 0 && (
        <div className="action-bar sticky" role="toolbar" aria-label="Checked items">
          <span className="action-bar-summary">
            {plural(checkedRows.length, 'item')} checked · {formatBytes(checkedSize)}
          </span>
          <div className="action-bar-buttons">
            <button type="button" className="button danger" onClick={() => void actions.trash(checkedRows).then(dropIds)}>
              Move to Trash
            </button>
            <button type="button" className="button ghost" onClick={() => setChecked(new Map())}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="cards">
        {categories === null && <p className="muted">Looking for things to clean up…</p>}
        {categories?.map((cat) => (
          <section key={cat.id} className="card">
            <button
              type="button"
              className="card-header"
              aria-expanded={expanded === cat.id}
              onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
            >
              <div>
                <h3>{cat.title}</h3>
                <p className="muted">{cat.description}</p>
              </div>
              <div className="card-total">
                <strong>{formatBytes(cat.total)}</strong>
                <span className="muted">{plural(cat.count, 'item')}</span>
              </div>
            </button>
            {expanded === cat.id && (
              <div className="card-body">
                {cat.items.length === 0 ? (
                  <p className="muted">Nothing found.</p>
                ) : cat.id === 'trash' ? (
                  <ItemList rows={cat.items} checked={checked} onToggle={null} onOpenLabel="Open Trash" />
                ) : (
                  <>
                    <div className="card-tools">
                      <button type="button" className="button ghost" onClick={() => checkAll(cat.items)}>
                        Check all shown
                      </button>
                      {cat.count > cat.items.length && (
                        <span className="muted">Showing the largest {cat.items.length} of {cat.count}</span>
                      )}
                    </div>
                    <ItemList rows={cat.items} checked={checked} onToggle={toggle} />
                  </>
                )}
              </div>
            )}
          </section>
        ))}

        <section className="card">
          <div className="card-header static">
            <div>
              <h3>Duplicate files</h3>
              <p className="muted">Files of 1 MB or more with identical contents.</p>
            </div>
            <div className="card-total">
              {dupes ? (
                <>
                  <strong>{formatBytes(dupes.wasted)}</strong>
                  <span className="muted">{plural(dupes.groups.length, 'group')}</span>
                </>
              ) : finding ? (
                <button type="button" className="button" onClick={() => void window.sa.cleanup.cancelDuplicates()}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="button primary" onClick={() => void findDupes()}>
                  Find Duplicates
                </button>
              )}
            </div>
          </div>
          {finding && dupeProgress && (
            <div className="card-body">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${dupeProgress.total ? (dupeProgress.done / dupeProgress.total) * 100 : 0}%` }} />
              </div>
              <p className="muted">
                Comparing {dupeProgress.done} of {plural(dupeProgress.total, 'candidate file')}…
              </p>
            </div>
          )}
          {dupes && (
            <div className="card-body">
              {dupes.cancelled && <p className="muted">Search was cancelled; results are partial.</p>}
              {dupes.groups.length === 0 && <p className="muted">No duplicates found.</p>}
              {dupes.groups.map((g) => (
                <div key={g.hash} className="dupe-group">
                  <div className="dupe-header">
                    <span>
                      {g.items.length} copies · {formatBytes(g.size)} each · <strong>{formatBytes(g.wasted)} wasted</strong>
                    </span>
                    <span className="dupe-tools">
                      <button type="button" className="button ghost" onClick={() => checkAll(allButOne(g.items, 'newest'))}>
                        Keep Newest
                      </button>
                      <button type="button" className="button ghost" onClick={() => checkAll(allButOne(g.items, 'oldest'))}>
                        Keep Oldest
                      </button>
                    </span>
                  </div>
                  <ItemList rows={g.items} checked={checked} onToggle={toggle} />
                </div>
              ))}
              <button type="button" className="button ghost" onClick={() => void findDupes()}>
                Search Again
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

interface ItemListProps {
  rows: Row[]
  checked: Map<number, Row>
  onToggle: ((row: Row) => void) | null
  onOpenLabel?: string
}

function ItemList({ rows, checked, onToggle, onOpenLabel }: ItemListProps) {
  const actions = useActions()
  return (
    <ul className="item-list">
      {rows.map((r) => (
        <li key={r.id} className="item">
          {onToggle ? (
            <input type="checkbox" aria-label={`Select ${r.name}`} checked={checked.has(r.id)} onChange={() => onToggle(r)} />
          ) : (
            <span className="checkbox-space" />
          )}
          <NameCell row={r} />
          <span className="path-text" title={r.path}>
            {parentPath(r.path)}
          </span>
          <span className="muted">{formatDate(r.mtime)}</span>
          <span className="item-size">{formatBytes(r.size)}</span>
          <button type="button" className="button ghost" onClick={() => (onOpenLabel ? actions.open(r) : actions.reveal(r))}>
            {onOpenLabel ?? 'Reveal'}
          </button>
        </li>
      ))}
    </ul>
  )
}
