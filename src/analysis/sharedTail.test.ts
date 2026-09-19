import { describe, expect, it } from 'vitest'
import { buildTrajectory } from '../math/collatz'
import { findSharedTail } from './sharedTail'

describe('shared-tail detection', () => {
  it('reports exact merge values and distinct step numbers', () => {
    const a = buildTrajectory(27n)
    const b = buildTrajectory(31n)
    const tail = findSharedTail(a, b, 0, 1)
    expect(tail).not.toBeNull()
    expect(tail?.value).toBe('31')
    expect(tail?.stepA).toBe(5)
    expect(tail?.stepB).toBe(0)
    expect(tail?.complete).toBe(true)
  })

  it('does not imply completion for merely computed common tails', () => {
    const a = { values: [7n, 22n, 11n], reachedOne: false }
    const b = { values: [11n], reachedOne: false }
    const tail = findSharedTail(a, b, 0, 1)
    expect(tail?.value).toBe('11')
    expect(tail?.verifiedValues).toBe(1)
    expect(tail?.complete).toBe(false)
  })
})
