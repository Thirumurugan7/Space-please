import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FileType, ScanState, SearchQuery, Sort } from '../../shared/types'
import { ActionBar } from '../components/ActionBar'
import { ContextMenu, type MenuState } from '../components/ContextMenu'
import { NameCell, TYPE_LABELS, parentPath } from '../components/NameCell'
import { VirtualTable, type Column } from '../components/VirtualTable'
import { useActions } from '../lib/actions'
import { formatBytes, formatDate, nowSeconds, plural } from '../lib/format'
import { emptySelection, withoutIds } from '../lib/selection'

interface Props {
  state: ScanState
  revision: number
}

type DateFilter = 'any' | 'week' | 'month' | 'year'

const TYPES: FileType[] = ['video', 'image', 'audio', 'archive', 'document', 'code', 'app', 'folder', 'other']
const SIZES = [
  { label: 'Any size', value: '' },
  { label: 'Over 1 MB', value: '1000000' },
  { label: 'Over 100 MB', value: '100000000' },
  { label: 'Over 1 GB', value: '1000000000' },
  { label: 'Over 10 GB', value: '10000000000' },
]
const DATES: { label: string; value: DateFilter }[] = [
  { label: 'Any date', value: 'any' },
  { label: 'Modified in the last 7 days', value: 'week' },
  { label: 'Modified in the last 30 days', value: 'month' },
  { label: 'Not modified for a year', value: 'year' },
]

export function SearchTab({ state, revision }: Props) {
  const actions = useActions()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [types, setTypes] = useState<FileType[]>([])
  const [minSize, setMinSize] = useState('')
  const [date, setDate] = useState<DateFilter>('any')
  const [kind, setKind] = useState<SearchQuery['kind']>('any')
  const [sort, setSort] = useState<Sort>({ key: 'size', dir: 'desc' })
  const [total, setTotal] = useState<number | null>(null)
  const [selection, setSelection] = useState(emptySelection)
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 150)
    return () => clearTimeout(timer)
  }, [text])

  const query = useMemo<SearchQuery>(() => {
    const now = nowSeconds()
    return {
      text: debounced,
      types,
      minSize: minSize ? Number(minSize) : null,
      maxSize: null,
      modifiedAfter: date === 'week' ? now - 7 * 86400 : date === 'month' ? now - 30 * 86400 : null,
      modifiedBefore: date === 'year' ? now - 365 * 86400 : null,
      kind,
    }
  }, [debounced, types, minSize, date, kind])

  const queryKey = JSON.stringify([state.root, state.scannedAt, query, sort])
  useEffect(() => setSelection(emptySelection()), [queryKey])

  const fetchPage = useCallback((offset: number, limit: number) => window.sa.tree.search(query, sort, offset, limit), [query, sort])
  const closeMenu = useCallback(() => setMenu(null), [])
  const removed = (ids: number[]) => setSelection((s) => withoutIds(s, ids))
  const toggleType = (t: FileType) => setTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]))

  const columns: Column[] = [
    { id: 'name', label: 'Name', width: 'minmax(180px, 1fr)', sortKey: 'name', render: (r) => <NameCell row={r} /> },
    {
      id: 'folder',
      label: 'Folder',
      width: 'minmax(160px, 1fr)',
      render: (r) => (
        <span className="path-text" title={r.path}>
          {parentPath(r.path)}
        </span>
      ),
    },
    { id: 'size', label: 'Size', width: '90px', sortKey: 'size', align: 'right', render: (r) => formatBytes(r.size) },
    { id: 'mtime', label: 'Modified', width: '110px', sortKey: 'mtime', render: (r) => formatDate(r.mtime) },
  ]

  return (
    <div className="search">
      <div className="search-bar">
        <input
          type="search"
          className="search-input"
          placeholder="Search all files"
          aria-label="Search all files"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="result-count">{total === null ? '' : plural(total, 'result')}</span>
      </div>
      <div className="filters">
        <div className="chips" role="group" aria-label="File types">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${types.includes(t) ? ' on' : ''}`}
              aria-pressed={types.includes(t)}
              onClick={() => toggleType(t)}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="selects">
          <select aria-label="Minimum size" value={minSize} onChange={(e) => setMinSize(e.target.value)}>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select aria-label="Modified" value={date} onChange={(e) => setDate(e.target.value as DateFilter)}>
            {DATES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as SearchQuery['kind'])}>
            <option value="any">Files and folders</option>
            <option value="files">Files only</option>
            <option value="folders">Folders only</option>
          </select>
        </div>
      </div>
      <div className="table-panel">
        <VirtualTable
          label="Search results"
          queryKey={queryKey}
          revision={revision}
          fetchPage={fetchPage}
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          selection={selection}
          onSelectionChange={setSelection}
          onActivate={(row) => actions.open(row)}
          onContextMenu={(e, rows) => setMenu({ x: e.clientX, y: e.clientY, rows })}
          onTotalChange={setTotal}
          emptyText="No matching files."
        />
        <ActionBar selection={selection} onRemoved={removed} onClear={() => setSelection(emptySelection())} />
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} onRemoved={removed} />
    </div>
  )
}
