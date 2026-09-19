import type { GeometryBuffers } from '../compute/types'

export function logBigInt(value: bigint): number {
  const bits = value.toString(2).length
  const shift = Math.max(0, bits - 53)
  return Math.log2(Number(value >> BigInt(shift))) + shift
}

export function simplify(y: Float64Array, bucket: number): Uint32Array {
  if (!y.length) return new Uint32Array()
  const points = new Set<number>([0, y.length - 1])
  for (let i = 0; i < y.length; i += bucket) {
    let min = i
    let max = i
    const end = Math.min(i + bucket, y.length)
    for (let j = i + 1; j < end; j += 1) {
      if (y[j] < y[min]) min = j
      if (y[j] > y[max]) max = j
    }
    points.add(i)
    points.add(min)
    points.add(max)
    points.add(end - 1)
  }
  return Uint32Array.from([...points].sort((a, b) => a - b))
}

export function buildGeometry(values: readonly bigint[]): GeometryBuffers {
  const y = Float64Array.from(values, logBigInt)
  const levels: Uint32Array[] = [Uint32Array.from(y, (_, index) => index)]
  for (let bucket = 8; bucket < y.length * 2; bucket *= 4) levels.push(simplify(y, bucket))

  let size = 1
  while (size < Math.max(1, y.length)) size *= 2
  const tree = new Float64Array(size * 4)
  tree.fill(Infinity, 0, size * 2)
  tree.fill(-Infinity, size * 2)

  for (let index = 0; index < y.length; index += 1) {
    tree[size + index] = y[index]
    tree[3 * size + index] = y[index]
  }
  for (let node = size - 1; node > 0; node -= 1) {
    tree[node] = Math.min(tree[node * 2], tree[node * 2 + 1])
    tree[2 * size + node] = Math.max(tree[2 * size + node * 2], tree[2 * size + node * 2 + 1])
  }
  return { y, levels, tree, size }
}
