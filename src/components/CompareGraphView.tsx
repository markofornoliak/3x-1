import { memo, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CameraState } from '../camera/useCamera'
import { formatInteger, type CollatzOperation, type CollatzTrajectory } from '../math/collatz'
import { COMPARE_STEP_X, type CompareLayout, type CompareSeriesLayout } from '../visualization/compareLayout'

export const COMPARE_COLORS = ['#F4C45B', '#45DEB0', '#70B9FF', '#B879FF', '#F18C77', '#9CB6C7']

export interface CompareInspection {
  start: bigint
  step: number
  value: bigint
  next?: bigint
  operation?: CollatzOperation
  clientX: number
  clientY: number
}

interface Props {
  trajectories: CollatzTrajectory[]
  layout: CompareLayout
  visibleStep: number
  camera: CameraState
  viewport: { width: number; height: number }
  selectedStart: bigint | null
  onSelect: (start: bigint) => void
  onInspect: (inspection: CompareInspection | null) => void
}

function pathFor(points: CompareSeriesLayout['points'], visibleStep: number) {
  const count = Math.min(points.length, visibleStep + 1)
  if (!count) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < count; index += 1) path += ` L ${points[index].x} ${points[index].y}`
  return path
}

function hoverIndices(series: CompareSeriesLayout, visibleStep: number) {
  const count = Math.min(series.points.length, visibleStep + 1)
  if (count <= 0) return []
  const maxTargets = 700
  const stride = Math.max(1, Math.ceil(count / maxTargets))
  const indices = new Set<number>([0, count - 1])
  for (let index = 0; index < count; index += stride) indices.add(index)
  series.points.slice(0, count).forEach((point, index) => { if (point.important) indices.add(index) })
  return [...indices].sort((a, b) => a - b)
}

interface SeriesProps {
  trajectory: CollatzTrajectory
  series: CompareSeriesLayout
  visibleStep: number
  color: string
  dimmed: boolean
  selected: boolean
  seriesIndex: number
  onSelect: (start: bigint) => void
  onInspect: (inspection: CompareInspection | null) => void
}

const ComparisonSeries = memo(function ComparisonSeries({ trajectory, series, visibleStep, color, dimmed, selected, seriesIndex, onSelect, onInspect }: SeriesProps) {
  const count = Math.min(series.points.length, visibleStep + 1)
  const path = useMemo(() => pathFor(series.points, visibleStep), [series.points, visibleStep])
  const targets = useMemo(() => hoverIndices(series, visibleStep), [series, visibleStep])
  const peakVisible = series.peakIndex < count
  const last = count ? series.points[count - 1] : null
  const complete = count === series.points.length && trajectory.reachedOne
  const style = { '--trajectory-color': color } as CSSProperties

  const inspect = (index: number, event: { clientX: number; clientY: number }) => {
    const point = series.points[index]
    const step = trajectory.steps[index]
    onInspect({
      start: trajectory.start,
      step: index,
      value: point.value,
      next: step?.next,
      operation: step?.operation,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  return (
    <g className={`compare-series ${dimmed ? 'is-dimmed' : ''} ${selected ? 'is-selected' : ''}`} style={style}>
      <path className="compare-path compare-path-hit" d={path} onClick={() => onSelect(trajectory.start)} />
      <path className="compare-path" d={path} />

      {count > 1 && (
        <line
          className="compare-new-segment"
          x1={series.points[count - 2].x}
          y1={series.points[count - 2].y}
          x2={series.points[count - 1].x}
          y2={series.points[count - 1].y}
        />
      )}

      {series.points.slice(0, count).map((point, index) => {
        if (!point.important && index !== count - 1) return null
        return <circle key={`node-${index}`} className={`compare-node ${point.globalPeak ? 'is-peak' : ''} ${index === count - 1 ? 'is-current' : ''}`} cx={point.x} cy={point.y} r={point.globalPeak ? 5.2 : index === count - 1 ? 4.5 : 3.2} />
      })}

      {targets.map((index) => {
        const point = series.points[index]
        return (
          <circle
            key={`hit-${index}`}
            className="compare-point-hit"
            cx={point.x}
            cy={point.y}
            r="12"
            onPointerEnter={(event: ReactPointerEvent<SVGCircleElement>) => inspect(index, event)}
            onPointerMove={(event: ReactPointerEvent<SVGCircleElement>) => inspect(index, event)}
            onPointerLeave={() => onInspect(null)}
            onPointerDown={(event: ReactPointerEvent<SVGCircleElement>) => event.stopPropagation()}
            onClick={(event: ReactMouseEvent<SVGCircleElement>) => { event.stopPropagation(); onSelect(trajectory.start); inspect(index, event) }}
          />
        )
      })}

      {count > 0 && (
        <text className="compare-value-label compare-start-label" x={series.points[0].x + 9} y={series.points[0].y - 12 - seriesIndex * 13}>{formatInteger(trajectory.start, 8)}</text>
      )}
      {peakVisible && (
        <text className="compare-value-label compare-peak-label" x={series.points[series.peakIndex].x} y={series.points[series.peakIndex].y - 13} textAnchor="middle">{formatInteger(trajectory.peak, 8)}</text>
      )}
      {complete && last && (
        <text className="compare-value-label compare-end-label" x={last.x + 9} y={last.y - 9}>1</text>
      )}
    </g>
  )
})

function CompareGraphViewImpl({ trajectories, layout, visibleStep, camera, viewport, selectedStart, onSelect, onInspect }: Props) {
  const yTicks = useMemo(() => viewport.width < 640 ? layout.yTicks.filter((_, index) => index % 2 === 0 || index === layout.yTicks.length - 1) : layout.yTicks, [layout.yTicks, viewport.width])
  const xTicks = useMemo(() => viewport.width < 640 ? layout.xTicks.filter((_, index) => index % 2 === 0 || index === layout.xTicks.length - 1) : layout.xTicks, [layout.xTicks, viewport.width])
  const transform = useMemo(() => {
    const baseY = viewport.height * (viewport.width < 640 ? 0.76 : 0.78)
    return `translate(${viewport.width / 2} ${baseY}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`
  }, [camera, viewport.height, viewport.width])

  return (
    <svg className="graph comparison-graph" role="img" aria-label={`Comparison of ${trajectories.length} Collatz trajectories`}>
      <g className="comparison-world" transform={transform}>
        <g className="compare-grid" aria-hidden="true">
          {yTicks.map((tick) => (
            <g key={`y-${tick.value.toString()}`}>
              <line x1="0" y1={tick.y} x2={layout.plotWidth} y2={tick.y} />
              <text x="-16" y={tick.y + 4} textAnchor="end">{tick.label}</text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={tick * COMPARE_STEP_X} y1={-layout.plotHeight} x2={tick * COMPARE_STEP_X} y2="0" />
              <text x={tick * COMPARE_STEP_X} y="28" textAnchor="middle">{tick}</text>
            </g>
          ))}
          <line className="compare-axis" x1="0" y1="0" x2={layout.plotWidth + 24} y2="0" />
          <line className="compare-axis" x1="0" y1="0" x2="0" y2={-layout.plotHeight - 20} />
          <text className="compare-axis-title" x="-18" y={-layout.plotHeight - 28}>n</text>
          <text className="compare-axis-title" x={layout.plotWidth + 38} y="31">steps</text>
        </g>

        {layout.series.map((series, index) => {
          const trajectory = trajectories[index]
          const selected = selectedStart === trajectory.start
          return (
            <ComparisonSeries
              key={trajectory.start.toString()}
              trajectory={trajectory}
              series={series}
              visibleStep={visibleStep}
              color={COMPARE_COLORS[index]}
              dimmed={selectedStart !== null && !selected}
              selected={selected}
              seriesIndex={index}
              onSelect={onSelect}
              onInspect={onInspect}
            />
          )
        })}
      </g>
    </svg>
  )
}

export const CompareGraphView = memo(CompareGraphViewImpl)
