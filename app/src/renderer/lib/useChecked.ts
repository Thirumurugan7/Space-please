import { useCallback, useState } from 'react'
import type { Row } from '../../shared/types'

/** Checkbox selection shared by the Cleanup and Report tabs. */
export function useChecked() {
  const [checked, setChecked] = useState<Map<number, Row>>(new Map())

  const toggle = useCallback(
    (row: Row) =>
      setChecked((m) => {
        const next = new Map(m)
        if (next.has(row.id)) next.delete(row.id)
        else next.set(row.id, row)
        return next
      }),
    [],
  )

  const checkAll = useCallback(
    (rows: Row[]) =>
      setChecked((m) => {
        const next = new Map(m)
        for (const r of rows) next.set(r.id, r)
        return next
      }),
    [],
  )

  const drop = useCallback((ids: number[]) => {
    if (ids.length === 0) return
    const gone = new Set(ids)
    setChecked((m) => new Map([...m].filter(([id]) => !gone.has(id))))
  }, [])

  const clear = useCallback(() => setChecked(new Map()), [])

  return { checked, toggle, checkAll, drop, clear }
}
