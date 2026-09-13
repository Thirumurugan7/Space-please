import { useEffect, useRef } from 'react'
import type { Row } from '../../shared/types'
import { useActions } from '../lib/actions'

export interface MenuState {
  x: number
  y: number
  rows: Row[]
}

interface Props {
  menu: MenuState | null
  onClose(): void
  onRemoved(ids: number[]): void
}

export function ContextMenu({ menu, onClose, onRemoved }: Props) {
  const actions = useActions()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [menu, onClose])

  if (!menu) return null
  const single = menu.rows.length === 1 ? menu.rows[0] : null
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const left = Math.min(menu.x, window.innerWidth - 220)
  const top = Math.min(menu.y, window.innerHeight - 180)

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left, top }}>
      {single && (
        <>
          <button type="button" role="menuitem" onClick={run(() => actions.open(single))}>
            Open
          </button>
          <button type="button" role="menuitem" onClick={run(() => actions.reveal(single))}>
            Reveal in Finder
          </button>
        </>
      )}
      <button type="button" role="menuitem" onClick={run(() => actions.copyPaths(menu.rows))}>
        {single ? 'Copy Path' : `Copy ${menu.rows.length} Paths`}
      </button>
      <div className="menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="danger-text"
        onClick={run(() => {
          void actions.trash(menu.rows).then(onRemoved)
        })}
      >
        Move to Trash
      </button>
    </div>
  )
}
