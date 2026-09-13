import { useEffect, useRef, type ReactNode } from 'react'

export interface ConfirmRequest {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
}

interface Props {
  request: ConfirmRequest
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Destructive actions must not land on Enter by default: focus Cancel instead.
    const target = request.danger ? cancelRef.current : confirmRef.current
    target?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, request.danger])

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{request.title}</h2>
        <div className="modal-body">{request.body}</div>
        <div className="modal-actions">
          <button type="button" ref={cancelRef} className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={request.danger ? 'button danger' : 'button primary'}
            onClick={onConfirm}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
