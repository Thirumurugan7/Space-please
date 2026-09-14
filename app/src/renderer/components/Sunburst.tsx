import { hierarchy, partition, type HierarchyRectangularNode } from 'd3-hierarchy'
import { arc } from 'd3-shape'
import { useMemo, useState } from 'react'
import type { SunburstNode } from '../../shared/types'
import { formatBytes } from '../lib/format'

type Node = HierarchyRectangularNode<SunburstNode>

interface Props {
  data: SunburstNode
  /** Called for a clicked ring slice. */
  onOpen(node: SunburstNode): void
  /** Called when the centre is clicked. */
  onUp(): void
}

const SIZE = 440
const RADIUS = SIZE / 2
/** The centre disc is larger than one ring so the folder name and size fit inside it. */
const CENTRE_RADIUS = 66

/** Jewel tones, one per top-level folder; deeper rings blend toward the ring's highlight. */
const PALETTE = ['#8B6CFF', '#3FD0F5', '#FF7AB6', '#5EE6B0', '#F7C35F', '#6F8BFF', '#FF9868', '#B98CFF']

export function Sunburst({ data, onOpen, onUp }: Props) {
  const [hover, setHover] = useState<SunburstNode | null>(null)

  const { slices, topLevel, band } = useMemo(() => {
    const h = hierarchy(data)
      .sum((d) => (d.children ? 0 : d.size))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const root = partition<SunburstNode>().size([2 * Math.PI, RADIUS])(h)
    const slices = root.descendants().filter((d) => d.depth > 0 && d.x1 - d.x0 > 0.003)
    return { slices, topLevel: root.children ?? [], band: RADIUS / (root.height + 1) }
  }, [data])

  const path = useMemo(() => {
    // partition() gives every depth (root included) an equal band; remap so depth 0 becomes the
    // centre disc and depths 1+ share the remaining radius.
    const radiusAt = (y: number) => CENTRE_RADIUS + ((y - band) / (RADIUS - band)) * (RADIUS - CENTRE_RADIUS)
    return arc<Node>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle(0.004)
      .padRadius(RADIUS / 2)
      .cornerRadius(3)
      .innerRadius((d) => radiusAt(d.y0) + 2)
      .outerRadius((d) => radiusAt(d.y1) - 1.5)
  }, [band])

  const colour = (d: Node): string => {
    if (d.data.id === null) return 'var(--slice-other)'
    let top: Node = d
    while (top.depth > 1 && top.parent) top = top.parent
    const base = PALETTE[Math.max(0, topLevel.indexOf(top)) % PALETTE.length]
    const blend = Math.min((d.depth - 1) * 16, 56)
    return `color-mix(in oklch, ${base} ${100 - blend}%, var(--slice-tint))`
  }

  const shown = hover ?? data

  return (
    <svg className="sunburst" viewBox={`${-RADIUS} ${-RADIUS} ${SIZE} ${SIZE}`} role="img" aria-label={`Size map of ${data.name}`}>
      <g onMouseLeave={() => setHover(null)}>
        {slices.map((d, i) => (
          <path
            key={`${d.data.id ?? 'other'}-${d.depth}-${i}`}
            d={path(d) ?? undefined}
            fill={colour(d)}
            className={d.data.kind === 'dir' ? 'slice clickable' : 'slice'}
            onMouseEnter={() => setHover(d.data)}
            onClick={() => onOpen(d.data)}
          />
        ))}
      </g>
      <circle r={CENTRE_RADIUS - 2} className="sunburst-centre" onClick={onUp} />
      <text className="sunburst-name" y={-10} textAnchor="middle">
        {truncate(shown.name.split('/').pop() || shown.name, 15)}
      </text>
      <text className="sunburst-size" y={20} textAnchor="middle">
        {formatBytes(shown.size)}
      </text>
    </svg>
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
