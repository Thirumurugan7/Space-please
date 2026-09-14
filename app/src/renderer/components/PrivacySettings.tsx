import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface Props {
  onClose(): void
}

/**
 * Small privacy panel with the "Share anonymous usage stats" switch. It states plainly what is and
 * isn't sent, so the setting is honest and easy to find without shouting about it in the main UI.
 */
export function PrivacySettings({ onClose }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [active, setActive] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    void window.sa.telemetry.state().then((s) => {
      setEnabled(s.enabled)
      setActive(s.active)
    })
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = async () => {
    if (enabled === null) return
    const next = !enabled
    setEnabled(next)
    const state = await window.sa.telemetry.setEnabled(next)
    setEnabled(state.enabled)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-icon" aria-hidden>
            <Icon name="shield" size={18} />
          </span>
          <h2 id="settings-title">Privacy</h2>
        </div>

        <label className="switch-row">
          <span className="switch-text">
            <span className="switch-label">Share anonymous usage stats</span>
            <span className="switch-sub">
              Helps improve Space-please by sending anonymous usage, like scans run and features used. It never includes your file
              names, paths or search text. Turn it off any time.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled === true}
            className={`switch${enabled ? ' on' : ''}`}
            disabled={enabled === null || !active}
            onClick={() => void toggle()}
          >
            <span className="switch-knob" />
          </button>
        </label>

        {!active && <p className="muted settings-note">Usage stats are off in this build.</p>}

        <div className="modal-actions">
          <button type="button" ref={closeRef} className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
