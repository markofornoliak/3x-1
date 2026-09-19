import type { SharedTail } from '../compute/types'

export interface ExactSequence {
  values: readonly bigint[]
  reachedOne: boolean
}

export function findSharedTail(a: ExactSequence, b: ExactSequence, aIndex: number, bIndex: number): SharedTail | null {
  const positions = new Map<bigint, number>()
  for (let index = 0; index < b.values.length; index += 1) {
    if (!positions.has(b.values[index])) positions.set(b.values[index], index)
  }

  let best: { stepA: number; stepB: number; score: number } | null = null
  for (let stepA = 0; stepA < a.values.length; stepA += 1) {
    const stepB = positions.get(a.values[stepA])
    if (stepB === undefined) continue
    const overlap = Math.min(a.values.length - stepA, b.values.length - stepB)
    let identical = true
    for (let offset = 0; offset < overlap; offset += 1) {
      if (a.values[stepA + offset] !== b.values[stepB + offset]) {
        identical = false
        break
      }
    }
    if (!identical) continue
    const score = stepA + stepB
    if (!best || score < best.score || (score === best.score && Math.max(stepA, stepB) < Math.max(best.stepA, best.stepB))) {
      best = { stepA, stepB, score }
    }
  }

  if (!best) return null
  const verifiedValues = Math.min(a.values.length - best.stepA, b.values.length - best.stepB)
  return {
    a: aIndex,
    b: bIndex,
    value: a.values[best.stepA].toString(),
    stepA: best.stepA,
    stepB: best.stepB,
    verifiedValues,
    complete: a.reachedOne && b.reachedOne,
  }
}

export function findSharedTails(sequences: readonly ExactSequence[]): SharedTail[] {
  const tails: SharedTail[] = []
  for (let a = 0; a < sequences.length; a += 1) {
    for (let b = a + 1; b < sequences.length; b += 1) {
      const tail = findSharedTail(sequences[a], sequences[b], a, b)
      if (tail) tails.push(tail)
    }
  }
  return tails
}
