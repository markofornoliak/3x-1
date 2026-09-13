import { memo, useMemo } from 'react'
import type { CollatzTrajectory } from '../math/collatz'
import { formatInteger } from '../math/collatz'
import type { CameraState } from '../camera/useCamera'
import type { GraphLayout } from '../visualization/layout'

interface Props {
  trajectory: CollatzTrajectory
  layout: GraphLayout
  visibleIndex: number
  phase: 'operation' | 'transition' | 'idle'
  camera: CameraState
  complete: boolean
  viewport: { width: number; height: number }
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const rawDx = x2 - x1
  const rawDy = y2 - y1
  const rawLen = Math.max(1, Math.hypot(rawDx, rawDy))
  const ux = rawDx / rawLen
  const uy = rawDy / rawLen
  const startX = x1 + ux * 25
  const startY = y1 + uy * 25
  const endX = x2 - ux * 28
  const endY = y2 - uy * 28
  const dx = endX - startX
  const dy = endY - startY
  const len = Math.max(1, Math.hypot(dx, dy))
  const nx = -dy / len
  const ny = dx / len
  const bend = Math.min(16, len * 0.08)
  const c1x = startX + dx * 0.38 + nx * bend
  const c1y = startY + dy * 0.38 + ny * bend
  const c2x = startX + dx * 0.68 + nx * bend
  const c2y = startY + dy * 0.68 + ny * bend
  return `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`
}

function GraphViewImpl({ trajectory, layout, visibleIndex, phase, camera, complete, viewport }: Props) {
  const activeNode = layout.nodes[Math.min(visibleIndex, layout.nodes.length - 1)]
  const activeStep = trajectory.steps[visibleIndex]
  const activeOperation = activeStep?.operation
  const transform = useMemo(
    () => `translate(${viewport.width / 2} ${viewport.height / 2}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`,
    [camera, viewport.height, viewport.width],
  )

  const cycle = useMemo(() => {
    if (!complete) return null
    let i4 = -1
    let i1 = -1
    for (let i = trajectory.values.length - 1; i >= 0; i -= 1) {
      if (i1 < 0 && trajectory.values[i] === 1n) i1 = i
      if (i4 < 0 && trajectory.values[i] === 4n) i4 = i
      if (i1 >= 0 && i4 >= 0) break
    }
    if (i4 < 0 || i1 < 0) return null
    const a = layout.nodes[i1]
    const b = layout.nodes[i4]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2 - Math.max(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.52)
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
  }, [complete, layout.nodes, trajectory.values])

  return (
    <svg className="graph" role="img" aria-label={`Collatz trajectory for ${trajectory.start.toString()}`}>
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L7,3.5 L0,7 z" fill="currentColor" />
        </marker>
      </defs>
      <g className="world" transform={transform}>
        {layout.edges.slice(0, visibleIndex).map((edge, index) => {
          const from = layout.nodes[edge.from]
          const to = layout.nodes[edge.to]
          const newest = index === visibleIndex - 1
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(from.x, from.y, to.x, to.y)}
              className={`edge ${newest ? 'edge--new' : ''}`}
              markerEnd="url(#arrow)"
            />
          )
        })}
        {cycle && <path d={cycle} className="cycle-edge" markerEnd="url(#arrow)" />}

        {layout.nodes.slice(0, visibleIndex + 1).map((node, index) => {
          const isActive = index === visibleIndex && !complete
          const operation = trajectory.steps[index]?.operation
          const accent = operation === '3n+1' ? 'odd' : operation === 'n/2' ? 'even' : 'neutral'
          return (
            <g key={`${index}-${node.value}`} className={`node node--${accent} ${isActive ? 'node--active' : ''} ${index === visibleIndex ? 'node--latest' : ''}`} transform={`translate(${node.x} ${node.y})`}>
              <circle r="22" />
              <text textAnchor="middle" dominantBaseline="central">{formatInteger(node.value, 8)}</text>
            </g>
          )
        })}

        {!complete && activeNode && activeOperation && (
          <g className={`operation operation--${activeOperation === '3n+1' ? 'odd' : 'even'} operation--${phase}`} transform={`translate(${activeNode.x + 42} ${activeNode.y - 34})`}>
            <text>{activeOperation === '3n+1' ? '×3 + 1' : '÷2'}</text>
          </g>
        )}
      </g>
    </svg>
  )
}

export const GraphView = memo(GraphViewImpl)
