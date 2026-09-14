import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { TOUR_STEPS, stepAfter } from '../lib/tour'

interface Props {
  onClose(): void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8
const GAP = 16
const CARD_WIDTH = 360
const CARD_HEIGHT_ESTIMATE = 250

/** Step-by-step first-run walkthrough that spotlights real parts of the UI. */
export function Tour({ onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1

  const measure = useCallback(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
    if (!el || step.placement === 'center') {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  useEffect(() => {
    primaryRef.current?.focus()
  }, [index])

  const go = useCallback(
    (direction: 'next' | 'back') => {
      const next = stepAfter(index, direction)
      if (next === null) onClose()
      else setIndex(next)
    },
    [index, onClose],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go('next')
      else if (e.key === 'ArrowLeft') go('back')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  let cardStyle: CSSProperties | undefined
  if (box) {
    const maxTop = window.innerHeight - CARD_HEIGHT_ESTIMATE - GAP
    const maxLeft = window.innerWidth - CARD_WIDTH - GAP
    cardStyle =
      step.placement === 'right'
        ? { top: Math.max(GAP, Math.min(box.top, maxTop)), left: Math.min(box.left + box.width + GAP, maxLeft) }
        : {
            top: Math.min(box.top + box.height + GAP, maxTop),
            left: Math.max(GAP, Math.min(box.left + box.width / 2 - CARD_WIDTH / 2, maxLeft)),
          }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      {box ? <div className="tour-spotlight" style={box} /> : <div className="tour-scrim" />}
      <div className={`tour-card${box ? '' : ' centred'}`} style={cardStyle} key={step.id}>
        {index === 0 && <div className="tour-mark" aria-hidden />}
        <p className="tour-count">
          {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2>{step.title}</h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} className={i === index ? 'on' : i < index ? 'done' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {!last ? (
            <button type="button" className="button ghost" onClick={onClose}>
              Skip tour
            </button>
          ) : (
            <span />
          )}
          <div className="tour-actions-main">
            {index > 0 && (
              <button type="button" className="button" onClick={() => go('back')}>
                Back
              </button>
            )}
            <button type="button" ref={primaryRef} className="button primary" onClick={() => go('next')}>
              {index === 0 ? 'Start the tour' : last ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
