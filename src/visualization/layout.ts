import type { CollatzStep, CollatzTrajectory } from '../math/collatz'

export interface Point { x: number; y: number }
export interface LayoutNode extends Point { value: bigint; index: number }
export interface LayoutEdge { from: number; to: number; operation: CollatzStep['operation'] }
export interface GraphLayout { nodes: LayoutNode[]; edges: LayoutEdge[] }

const CELL = 72
const BASE_LENGTH = 142
const MIN_DISTANCE = 76

function hash(value: bigint, step: number) {
  const mask = (1n << 32n) - 1n
  const mixed = Number((value ^ (BigInt(step) * 2654435761n)) & mask)
  return (mixed / 0xffffffff) * 2 - 1
}

function key(x: number, y: number) {
  return `${Math.round(x / CELL)},${Math.round(y / CELL)}`
}

function isClear(candidate: Point, buckets: Map<string, Point[]>) {
  const gx = Math.round(candidate.x / CELL)
  const gy = Math.round(candidate.y / CELL)
  for (let x = gx - 1; x <= gx + 1; x += 1) {
    for (let y = gy - 1; y <= gy + 1; y += 1) {
      for (const point of buckets.get(`${x},${y}`) ?? []) {
        if (Math.hypot(candidate.x - point.x, candidate.y - point.y) < MIN_DISTANCE) return false
      }
    }
  }
  return true
}

export function buildLayout(trajectory: CollatzTrajectory): GraphLayout {
  const nodes: LayoutNode[] = [{ value: trajectory.start, index: 0, x: 0, y: 0 }]
  const edges: LayoutEdge[] = []
  const buckets = new Map<string, Point[]>([[key(0, 0), [{ x: 0, y: 0 }]]])
  let heading = -0.1

  trajectory.steps.forEach((step, index) => {
    const previous = nodes[nodes.length - 1]
    const odd = step.operation === '3n+1'
    const jitter = hash(step.current, index) * 0.20
    const desiredTurn = odd ? -0.72 : 0.64
    const memory = index > 0 && trajectory.steps[index - 1].operation === step.operation ? 0.18 : 0
    heading = heading * 0.28 + desiredTurn + jitter + (odd ? -memory : memory)

    const digits = step.next.toString().length
    const length = BASE_LENGTH + Math.min(34, digits * 1.8)
    let candidate: Point = { x: previous.x + Math.cos(heading) * length, y: previous.y + Math.sin(heading) * length }

    for (let attempt = 0; attempt < 11 && !isClear(candidate, buckets); attempt += 1) {
      const direction = attempt % 2 === 0 ? 1 : -1
      const spread = Math.ceil((attempt + 1) / 2) * 0.20 * direction
      const angle = heading + spread
      candidate = { x: previous.x + Math.cos(angle) * (length + attempt * 5), y: previous.y + Math.sin(angle) * (length + attempt * 5) }
    }

    const node: LayoutNode = { ...candidate, value: step.next, index: index + 1 }
    nodes.push(node)
    edges.push({ from: index, to: index + 1, operation: step.operation })
    const bucketKey = key(node.x, node.y)
    const list = buckets.get(bucketKey) ?? []
    list.push(node)
    buckets.set(bucketKey, list)
  })

  return { nodes, edges }
}

export function boundsOf(nodes: LayoutNode[]) {
  if (!nodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x)
    minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y)
  }
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}
