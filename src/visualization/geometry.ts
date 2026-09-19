import type { CollatzTrajectory } from '../math/collatz'
import { OP_ODD, type ComputedTrajectory } from '../compute/types'
import { buildGeometry, logBigInt, simplify } from './preprocess'

export interface Camera { x: number; y: number; sx: number; sy: number }
export interface Point { x: number; y: number }
export interface Series {
  data: ComputedTrajectory
  y: Float64Array
  levels: Uint32Array[]
  peakStep: number
  tree: Float64Array
  size: number
}

export { logBigInt as logValue, simplify }

export function hydrateSeries(data: ComputedTrajectory): Series {
  return {
    data,
    y: data.geometry.y,
    levels: data.geometry.levels,
    peakStep: data.peakStep,
    tree: data.geometry.tree,
    size: data.geometry.size,
  }
}

// Test/reference adapter. Production computation arrives preprocessed from the worker.
export function prepare(data: CollatzTrajectory): Series {
  const geometry = buildGeometry(data.values)
  const computed: ComputedTrajectory = {
    start: data.start.toString(),
    values: data.values.map(String),
    operations: Uint8Array.from(data.steps.map((step) => step.operation === '3n+1' ? OP_ODD : 0)),
    peak: data.peak.toString(),
    peakStep: data.values.indexOf(data.peak),
    reachedOne: data.reachedOne,
    truncated: data.truncated,
    totalSteps: data.steps.length,
    continuationToken: 'test',
    continuationAvailable: false,
    geometry,
  }
  return hydrateSeries(computed)
}

export function project(p: Point, c: Camera): Point {
  return { x: (p.x - c.x) * c.sx, y: (c.y - p.y) * c.sy }
}

export function unproject(p: Point, c: Camera): Point {
  return { x: p.x / c.sx + c.x, y: c.y - p.y / c.sy }
}

export function zoomAt(c: Camera, p: Point, factor: number): Camera {
  const world = unproject(p, c)
  const f = Math.max(.0001 / c.sx, Math.min(1000 / c.sx, factor))
  return {
    sx: c.sx * f,
    sy: c.sy * f,
    x: world.x - p.x / (c.sx * f),
    y: world.y + p.y / (c.sy * f),
  }
}

export function fitCamera(series: Series[], width: number, height: number): Camera {
  const maxStep = Math.max(1, ...series.map((item) => item.y.length - 1))
  const peak = Math.max(1, ...series.map((item) => item.y[item.peakStep] ?? 1))
  const left = width < 600 ? 30 : 70
  const right = width < 600 ? 24 : 54
  const top = height < 550 ? 132 : 170
  const bottom = height < 550 ? 120 : 132
  const sx = Math.max(1, width - left - right) / maxStep
  const sy = Math.max(30, height - top - bottom) / peak
  return { x: -left / sx, y: peak + top / sy, sx, sy }
}

export function nearest(s: Series, c: Camera, p: Point, limit = Infinity, radius = 24): number | null {
  let best = radius * radius
  let index: number | null = null
  const worldX = unproject(p, c).x

  function visit(node: number, lo: number, hi: number) {
    if (lo > limit || lo >= s.y.length) return
    const boundedHi = Math.min(hi, limit, s.y.length - 1)
    const a = project({ x: lo, y: s.tree[node] }, c)
    const b = project({ x: boundedHi, y: s.tree[2 * s.size + node] }, c)
    const dx = Math.max(a.x - p.x, 0, p.x - b.x)
    const dy = Math.max(b.y - p.y, 0, p.y - a.y)
    if (dx * dx + dy * dy > best) return
    if (lo === hi) {
      const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2
      if (d <= best) { best = d; index = lo }
      return
    }
    const mid = (lo + hi) >>> 1
    if (worldX <= mid) {
      visit(node * 2, lo, mid)
      visit(node * 2 + 1, mid + 1, hi)
    } else {
      visit(node * 2 + 1, mid + 1, hi)
      visit(node * 2, lo, mid)
    }
  }

  visit(1, 0, s.size - 1)
  return index
}

export function lowerBound(a: Uint32Array, value: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (a[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}
