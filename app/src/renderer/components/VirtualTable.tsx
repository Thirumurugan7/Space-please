import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Page, Row, Sort, SortKey } from '../../shared/types'
import { clickRow, nextSort, selectForContextMenu, type Selection } from '../lib/selection'

export interface Column {
  id: string
  label: string
  /** CSS grid track, e.g. "minmax(200px, 1fr)" or "110px". */
  width: string
  sortKey?: SortKey
  align?: 'left' | 'right'
  render(row: Row): ReactNode
}

export interface VirtualTableProps {
  label: string
  /** Changing it clears loaded rows and scrolls to the top. */
  queryKey: string
  /** Changing it reloads rows but keeps the scroll position (e.g. after items are trashed). */
  revision: number
  fetchPage(offset: number, limit: number): Promise<Page>
  columns: Column[]
  sort?: Sort
  onSortChange?(sort: Sort): void
  selection: Selection
  onSelectionChange(selection: Selection): void
  onActivate?(row: Row): void
  onContextMenu?(event: MouseEvent, rows: Row[]): void
  onTotalChange?(total: number): void
  emptyText: string
}

const PAGE_SIZE = 200
const ROW_HEIGHT = 28

export function VirtualTable(props: VirtualTableProps) {
  const { label, queryKey, revision, columns, sort, onSortChange, selection, onSelectionChange, onActivate, onContextMenu, onTotalChange, emptyText } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetchRef = useRef(props.fetchPage)
  fetchRef.current = props.fetchPage
  const pagesRef = useRef(new Map<number, Row[] | null>())
  const generationRef = useRef(0)
  const [total, setTotal] = useState<number | null>(null)
  const [, setLoadedPages] = useState(0)

  const loadPage = useCallback((page: number) => {
    if (pagesRef.current.has(page)) return
    const generation = generationRef.current
    pagesRef.current.set(page, null)
    fetchRef.current(page * PAGE_SIZE, PAGE_SIZE).then(
      (res) => {
        if (generation !== generationRef.current) return
        pagesRef.current.set(page, res.rows)
        setTotal(res.total)
        setLoadedPages((n) => n + 1)
      },
      () => {
        if (generation === generationRef.current) pagesRef.current.delete(page)
      },
    )
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [queryKey])

  useEffect(() => {
    generationRef.current++
    pagesRef.current = new Map()
    loadPage(0)
  }, [queryKey, revision, loadPage])

  useEffect(() => {
    if (total !== null) onTotalChange?.(total)
  }, [total, onTotalChange])

  const virtualizer = useVirtualizer({
    count: total ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  const items = virtualizer.getVirtualItems()
  const firstIndex = items[0]?.index ?? 0
  const lastIndex = items[items.length - 1]?.index ?? 0

  useEffect(() => {
    for (let page = Math.floor(firstIndex / PAGE_SIZE); page <= Math.floor(lastIndex / PAGE_SIZE); page++) loadPage(page)
  }, [firstIndex, lastIndex, queryKey, revision, loadPage])

  const rowAt = (index: number): Row | undefined => pagesRef.current.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE] ?? undefined
  const gridTemplateColumns = columns.map((c) => c.width).join(' ')

  return (
    <div className="vt" role="grid" aria-label={label} aria-rowcount={total ?? 0}>
      <div className="vt-header" role="row" style={{ gridTemplateColumns }}>
        {columns.map((c) => {
          const active = sort && c.sortKey === sort.key
          return (
            <div
              key={c.id}
              role="columnheader"
              className={`vt-cell ${c.align === 'right' ? 'right' : ''}`}
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              {c.sortKey && onSortChange ? (
                <button type="button" className="vt-sort" onClick={() => onSortChange(nextSort(sort, c.sortKey!))}>
                  {c.label}
                  <span className="vt-sort-arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                </button>
              ) : (
                c.label
              )}
            </div>
          )
        })}
      </div>
      <div className="vt-body" ref={scrollRef}>
        {total === 0 && <div className="vt-empty">{emptyText}</div>}
        <div className="vt-spacer" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const row = rowAt(item.index)
            const selected = row ? selection.rows.has(row.id) : false
            return (
              <div
                key={item.key}
                role="row"
                aria-selected={selected}
                className={`vt-row${selected ? ' selected' : ''}${item.index % 2 ? ' odd' : ''}`}
                style={{ gridTemplateColumns, height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                onClick={(e) => {
                  if (row) onSelectionChange(clickRow(selection, item.index, row, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }, rowAt))
                }}
                onDoubleClick={() => row && onActivate?.(row)}
                onContextMenu={(e) => {
                  if (!row) return
                  e.preventDefault()
                  const next = selectForContextMenu(selection, item.index, row)
                  if (next !== selection) onSelectionChange(next)
                  onContextMenu?.(e, [...next.rows.values()])
                }}
              >
                {row ? (
                  columns.map((c) => (
                    <div key={c.id} role="gridcell" className={`vt-cell ${c.align === 'right' ? 'right' : ''}`}>
                      {c.render(row)}
                    </div>
                  ))
                ) : (
                  <div role="gridcell" className="vt-cell muted">
                    Loading…
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
