import { useActions } from '../lib/actions'
import { formatBytes, plural } from '../lib/format'
import { selectedSize, type Selection } from '../lib/selection'

interface Props {
  selection: Selection
  onRemoved(ids: number[]): void
  onClear(): void
}

export function ActionBar({ selection, onRemoved, onClear }: Props) {
  const actions = useActions()
  const rows = [...selection.rows.values()]
  if (rows.length === 0) return null
  const single = rows.length === 1 ? rows[0] : null

  return (
    <div className="action-bar" role="toolbar" aria-label="Selection actions">
      <span className="action-bar-summary">
        {plural(rows.length, 'item')} selected · {formatBytes(selectedSize(selection))}
      </span>
      <div className="action-bar-buttons">
        {single && (
          <>
            <button type="button" className="button" onClick={() => actions.open(single)}>
              Open
            </button>
            <button type="button" className="button" onClick={() => actions.reveal(single)}>
              Reveal in Finder
            </button>
          </>
        )}
        <button type="button" className="button" onClick={() => actions.copyPaths(rows)}>
          Copy {single ? 'Path' : 'Paths'}
        </button>
        <button type="button" className="button danger" onClick={() => void actions.trash(rows).then(onRemoved)}>
          Move to Trash
        </button>
        <button type="button" className="button ghost" onClick={onClear}>
          Deselect
        </button>
      </div>
    </div>
  )
}
