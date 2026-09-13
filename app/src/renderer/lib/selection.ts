import type { Row, Sort, SortKey } from '../../shared/types'

export interface Selection {
  rows: Map<number, Row>
  /** Row index of the last plain or Cmd click, used for Shift ranges. */
  anchor: number | null
}

export interface Modifiers {
  shift: boolean
  meta: boolean
}

export function emptySelection(): Selection {
  return { rows: new Map(), anchor: null }
}

/** Finder-style click: plain replaces, Cmd toggles, Shift selects a range (Cmd+Shift adds a range). */
export function clickRow(sel: Selection, index: number, row: Row, mods: Modifiers, rowAt: (i: number) => Row | undefined): Selection {
  if (mods.shift && sel.anchor !== null) {
    const rows = mods.meta ? new Map(sel.rows) : new Map<number, Row>()
    const from = Math.min(sel.anchor, index)
    const to = Math.max(sel.anchor, index)
    for (let i = from; i <= to; i++) {
      const r = rowAt(i)
      if (r) rows.set(r.id, r)
    }
    return { rows, anchor: sel.anchor }
  }
  if (mods.meta) {
    const rows = new Map(sel.rows)
    if (rows.has(row.id)) rows.delete(row.id)
    else rows.set(row.id, row)
    return { rows, anchor: index }
  }
  return { rows: new Map([[row.id, row]]), anchor: index }
}

/** Right-clicking an unselected row selects just that row; a selected row keeps the selection. */
export function selectForContextMenu(sel: Selection, index: number, row: Row): Selection {
  return sel.rows.has(row.id) ? sel : { rows: new Map([[row.id, row]]), anchor: index }
}

export function withoutIds(sel: Selection, ids: number[]): Selection {
  if (!ids.some((id) => sel.rows.has(id))) return sel
  const rows = new Map(sel.rows)
  for (const id of ids) rows.delete(id)
  return { rows, anchor: rows.size === 0 ? null : sel.anchor }
}

export function selectedSize(sel: Selection): number {
  let total = 0
  for (const row of sel.rows.values()) total += row.size
  return total
}

/** Clicking the active column flips direction; a new column starts A→Z for names, largest/newest first otherwise. */
export function nextSort(current: Sort | undefined, key: SortKey): Sort {
  if (current && current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'name' ? 'asc' : 'desc' }
}
