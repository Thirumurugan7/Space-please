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

export function Sunburst({ data, onOpen, onUp }: Props) {
  const [hover, setHover] = useState<SunburstNode | null>(null)

  const { root, slices } = useMemo(() => {
    const h = hierarchy(data)
      .sum((d) => (d.children ? 0 : d.size))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const root = partition<SunburstNode>().size([2 * Math.PI, RADIUS])(h)
    const slices = root.descendants().filter((d) => d.depth > 0 && d.x1 - d.x0 > 0.003)
    return { root, slices }
  }, [data])

  const path = useMemo(
    () =>
      arc<Node>()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle(0.003)
        .innerRadius((d) => d.y0)
        .outerRadius((d) => d.y1 - 1),
    [],
  )

  const topLevel = root.children ?? []
  const colour = (d: Node): string => {
    if (d.data.id === null) return 'var(--slice-other)'
    let top: Node = d
    while (top.depth > 1 && top.parent) top = top.parent
    const hue = (topLevel.indexOf(top) * 47 + 210) % 360
    return `hsl(${hue} 62% ${Math.min(42 + d.depth * 8, 80)}%)`
  }

  const shown = hover ?? data
  const centreRadius = root.y1

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
      <circle r={centreRadius} className="sunburst-centre" onClick={onUp} />
      <text className="sunburst-name" y={-6} textAnchor="middle">
        {truncate(shown.name.split('/').pop() || shown.name, 22)}
      </text>
      <text className="sunburst-size" y={16} textAnchor="middle">
        {formatBytes(shown.size)}
      </text>
    </svg>
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
