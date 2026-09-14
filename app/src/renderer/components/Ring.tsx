import { useId, type ReactNode } from 'react'

interface Props {
  /** 0–1 share of the ring to fill. */
  fraction: number
  label: string
  size?: number
  stroke?: number
  children?: ReactNode
}

/** Aurora-gradient progress ring with free-form centre content. */
export function Ring({ fraction, label, size = 168, stroke = 14, children }: Props) {
  const gradientId = `ring-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(1, fraction)) * circumference
  const centre = size / 2

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--aurora-a)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--aurora-b)' }} />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={centre} cy={centre} r={radius} strokeWidth={stroke} fill="none" />
        {filled > 0 && (
          <circle
            className="ring-value"
            cx={centre}
            cy={centre}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        )}
      </svg>
      <div className="ring-centre">{children}</div>
    </div>
  )
}
