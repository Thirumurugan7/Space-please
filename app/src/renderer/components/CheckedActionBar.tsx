import type { Row } from '../../shared/types'
import { useActions } from '../lib/actions'
import { formatBytes, plural } from '../lib/format'

interface Props {
  checked: Map<number, Row>
  onRemoved(ids: number[]): void
  onClear(): void
}

export function CheckedActionBar({ checked, onRemoved, onClear }: Props) {
  const actions = useActions()
  const rows = [...checked.values()]
  if (rows.length === 0) return null
  const size = rows.reduce((n, r) => n + r.size, 0)

  return (
    <div className="action-bar sticky" role="toolbar" aria-label="Checked items">
      <span className="action-bar-summary">
        {plural(rows.length, 'item')} checked · {formatBytes(size)}
      </span>
      <div className="action-bar-buttons">
        <button type="button" className="button danger" onClick={() => void actions.trash(rows).then(onRemoved)}>
          Move to Trash
        </button>
        <button type="button" className="button ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  )
}
