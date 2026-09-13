import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Row } from '../../shared/types'
import { ConfirmDialog, type ConfirmRequest } from '../components/ConfirmDialog'
import { Toasts, type Toast } from '../components/Toasts'
import { formatBytes, plural } from './format'

const LARGE_BYTES = 10_000_000_000
const LARGE_COUNT = 500

export interface Actions {
  /** Confirms, trashes, reports, and resolves to the ids that left the tree. */
  trash(rows: Row[]): Promise<number[]>
  reveal(row: Row): void
  open(row: Row): void
  copyPaths(rows: Row[]): void
  confirm(request: ConfirmRequest): Promise<boolean>
  toast(text: string, kind?: Toast['kind']): void
}

const ActionsContext = createContext<Actions | null>(null)

export function useActions(): Actions {
  const value = useContext(ActionsContext)
  if (!value) throw new Error('useActions must be used inside ActionsProvider')
  return value
}

export function ActionsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pending, setPending] = useState<{ request: ConfirmRequest; resolve(ok: boolean): void } | null>(null)
  const nextToast = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = nextToast.current++
      setToasts((list) => [...list.slice(-4), { id, kind, text }])
      setTimeout(() => dismiss(id), kind === 'error' ? 10_000 : 6_000)
    },
    [dismiss],
  )

  const confirm = useCallback(
    (request: ConfirmRequest) => new Promise<boolean>((resolve) => setPending({ request, resolve })),
    [],
  )

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const actions = useMemo<Actions>(() => {
    const trash = async (rows: Row[]): Promise<number[]> => {
      if (rows.length === 0) return []
      const total = rows.reduce((sum, r) => sum + r.size, 0)
      const subject = rows.length === 1 ? `"${rows[0].name}"` : plural(rows.length, 'item')
      const ok = await confirm({
        title: `Move ${subject} to the Trash?`,
        body: `${formatBytes(total)} will be moved to the Trash. You can put items back from the Trash in Finder.`,
        confirmLabel: 'Move to Trash',
        danger: true,
      })
      if (!ok) return []
      if (total > LARGE_BYTES || rows.length > LARGE_COUNT) {
        const sure = await confirm({
          title: 'This is a large removal',
          body: `You are about to move ${plural(rows.length, 'item')} totalling ${formatBytes(total)} to the Trash. Are you sure?`,
          confirmLabel: 'Yes, Move to Trash',
          danger: true,
        })
        if (!sure) return []
      }

      const res = await window.sa.actions.trash(rows.map((r) => r.id))
      if (res.rejected.length > 0) {
        const first = res.rejected[0]
        toast(`Nothing was moved. ${first.reason}: ${first.path}`, 'error')
        return []
      }
      if (res.trashed.length > 0) {
        const trashed = new Set(res.trashed)
        const size = rows.filter((r) => trashed.has(r.id)).reduce((sum, r) => sum + r.size, 0)
        toast(`Moved ${plural(res.trashed.length, 'item')} (${formatBytes(size)}) to the Trash`)
      }
      if (res.missing.length > 0) {
        toast(`${plural(res.missing.length, 'item')} no longer existed and ${res.missing.length === 1 ? 'was' : 'were'} removed from the list`)
      }
      for (const f of res.failed) toast(`Could not move ${f.path} to the Trash: ${f.message}`, 'error')
      return [...res.trashed, ...res.missing]
    }

    return {
      trash,
      confirm,
      toast,
      reveal: (row) => void window.sa.actions.reveal(row.id),
      open: (row) => {
        void window.sa.actions.open(row.id).then((error) => {
          if (error) toast(error, 'error')
        })
      },
      copyPaths: (rows) => {
        void window.sa.actions.copyPaths(rows.map((r) => r.id)).then(() => toast(`Copied ${plural(rows.length, 'path')}`))
      },
    }
  }, [confirm, toast])

  return (
    <ActionsContext.Provider value={actions}>
      {children}
      {pending && <ConfirmDialog request={pending.request} onConfirm={() => settle(true)} onCancel={() => settle(false)} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </ActionsContext.Provider>
  )
}
