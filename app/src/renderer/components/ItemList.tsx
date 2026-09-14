import type { Row } from '../../shared/types'
import { useActions } from '../lib/actions'
import { formatBytes, formatDate } from '../lib/format'
import { NameCell, parentPath } from './NameCell'

interface Props {
  rows: Row[]
  checked: Map<number, Row>
  /** Null hides the checkboxes. */
  onToggle: ((row: Row) => void) | null
  /** When set, the row button opens the item (e.g. "Open Trash") instead of revealing it. */
  onOpenLabel?: string
}

export function ItemList({ rows, checked, onToggle, onOpenLabel }: Props) {
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
