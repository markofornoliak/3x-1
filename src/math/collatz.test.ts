import { describe, expect, it } from 'vitest'
import { buildTrajectory, collatzStep, parsePositiveInteger } from './collatz'

describe('Collatz engine', () => {
  it('applies each rule exactly with BigInt', () => {
    expect(collatzStep(7n).next).toBe(22n)
    expect(collatzStep(7n).operation).toBe('3n+1')
    expect(collatzStep(22n).next).toBe(11n)
    expect(collatzStep(22n).operation).toBe('n/2')
  })

  it.each([
    [1n, 0, 1n],
    [2n, 1, 2n],
    [3n, 7, 16n],
    [7n, 16, 52n],
    [8n, 3, 8n],
    [12n, 9, 16n],
    [19n, 20, 88n],
    [27n, 111, 9232n],
    [31n, 106, 9232n],
    [97n, 118, 9232n],
  ])('computes n=%s correctly', (start, expectedSteps, expectedPeak) => {
    const result = buildTrajectory(start)
    expect(result.reachedOne).toBe(true)
    expect(result.steps).toHaveLength(expectedSteps)
    expect(result.peak).toBe(expectedPeak)
    expect(result.values.at(-1)).toBe(1n)
  })

  it.each([
    [7n, [7n, 22n, 11n, 34n, 17n, 52n, 26n]],
    [27n, [27n, 82n, 41n, 124n, 62n, 31n, 94n]],
    [31n, [31n, 94n, 47n, 142n, 71n, 214n, 107n]],
    [97n, [97n, 292n, 146n, 73n, 220n, 110n, 55n]],
  ])('preserves the exact opening sequence for n=%s', (start, expected) => {
    expect(buildTrajectory(start).values.slice(0, expected.length)).toEqual(expected)
  })

  it('preserves integers beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9007199254740993n
    const step = collatzStep(huge)
    expect(step.next).toBe(27021597764222980n)
  })

  it('validates positive integer input', () => {
    expect(parsePositiveInteger('27')).toEqual({ ok: true, value: 27n })
    for (const bad of ['', '0', '-2', '3.5', 'abc', '1e6']) {
      expect(parsePositiveInteger(bad).ok).toBe(false)
    }
  })
})
