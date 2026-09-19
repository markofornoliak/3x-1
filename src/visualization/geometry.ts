import type { CollatzTrajectory } from '../math/collatz'
export interface Camera { x: number; y: number; sx: number; sy: number }
export interface Point { x: number; y: number }
export interface Series { data: CollatzTrajectory; y: Float64Array; levels: Uint32Array[]; peakStep: number; tree: Float64Array; size: number }
// Only the leading 53 bits enter floating point; the original integer is retained.
export function logValue(value: bigint): number {
  const bits = value.toString(2).length
  const shift = Math.max(0, bits - 53)
  return Math.log2(Number(value >> BigInt(shift))) + shift
}
export function project(p: Point, c: Camera): Point { return { x: (p.x - c.x) * c.sx, y: (c.y - p.y) * c.sy } }
export function unproject(p: Point, c: Camera): Point { return { x: p.x / c.sx + c.x, y: c.y - p.y / c.sy } }
export function zoomAt(c: Camera, p: Point, factor: number): Camera {
  const world = unproject(p, c)
  const f = Math.max(.0001 / c.sx, Math.min(1000 / c.sx, factor))
  return { sx: c.sx * f, sy: c.sy * f, x: world.x - p.x / (c.sx * f), y: world.y + p.y / (c.sy * f) }
}
// Ordered min/max envelopes retain endpoints and extrema in every bucket.
export function simplify(y: Float64Array, bucket: number): Uint32Array {
  const points = new Set<number>([0, y.length - 1])
  for (let i = 0; i < y.length; i += bucket) {
    let min = i, max = i
    for (let j = i + 1; j < Math.min(i + bucket, y.length); j++) {
      if (y[j] < y[min]) min = j
      if (y[j] > y[max]) max = j
    }
    points.add(i); points.add(min); points.add(max); points.add(Math.min(i + bucket - 1, y.length - 1))
  }
  return Uint32Array.from([...points].sort((a, b) => a - b))
}
export function prepare(data: CollatzTrajectory): Series {
  const y = Float64Array.from(data.values, logValue)
  const levels: Uint32Array[] = [Uint32Array.from(y, (_, i) => i)]
  for (let bucket = 8; bucket < y.length * 2; bucket *= 4) levels.push(simplify(y, bucket))
  let size = 1
  while (size < y.length) size *= 2
  const tree = new Float64Array(size * 4)
  tree.fill(Infinity, 0, size * 2); tree.fill(-Infinity, size * 2)
  for (let i = 0; i < y.length; i++) { tree[size + i] = y[i]; tree[3 * size + i] = y[i] }
  for (let i = size - 1; i; i--) { tree[i] = Math.min(tree[i * 2], tree[i * 2 + 1]); tree[2 * size + i] = Math.max(tree[2 * size + i * 2], tree[2 * size + i * 2 + 1]) }
  return { data, y, levels, peakStep: data.values.indexOf(data.peak), tree, size }
}
export function fitCamera(series: Series[], width: number, height: number): Camera {
  const maxStep = Math.max(1, ...series.map(s => s.y.length - 1))
  const peak = Math.max(1, ...series.map(s => s.y[s.peakStep]))
  const left = width < 600 ? 32 : 72, top = height < 550 ? 145 : 190, bottom = 115
  const sx = Math.max(1, width - left * 2) / maxStep, sy = Math.max(30, height - top - bottom) / peak
  return { x: -left / sx, y: peak + top / sy, sx, sy }
}
// Branch-and-bound over x intervals and cached y bounds, exact even at low LOD.
export function nearest(s: Series, c: Camera, p: Point, limit = Infinity, radius = 24): number | null {
  let best = radius * radius, index: number | null = null
  function visit(node: number, lo: number, hi: number) {
    if (lo > limit || lo >= s.y.length) return
    const a = project({ x: lo, y: s.tree[node] }, c), b = project({ x: Math.min(hi, limit, s.y.length - 1), y: s.tree[2 * s.size + node] }, c)
    const dx = Math.max(a.x - p.x, 0, p.x - b.x), dy = Math.max(b.y - p.y, 0, p.y - a.y)
    if (dx * dx + dy * dy > best) return
    if (lo === hi) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d <= best) { best = d; index = lo }; return }
    const mid = (lo + hi) >>> 1
    if (unproject(p, c).x <= mid) { visit(node * 2, lo, mid); visit(node * 2 + 1, mid + 1, hi) }
    else { visit(node * 2 + 1, mid + 1, hi); visit(node * 2, lo, mid) }
  }
  visit(1, 0, s.size - 1)
  return index
}
export function lowerBound(a: Uint32Array, value: number): number {
  let lo = 0, hi = a.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid] < value) lo = mid + 1; else hi = mid }
  return lo
}
