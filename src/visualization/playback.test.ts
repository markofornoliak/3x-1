import { describe, expect, it } from 'vitest'
import { advanceProgress, clampStep, progressForStep, stepForProgress } from './playback'

describe('timeline playback math', () => {
  it('scrubs and clamps exact step positions', () => {
    expect(clampStep(151, 100)).toBe(100)
    expect(progressForStep(25, 100)).toBe(.25)
    expect(stepForProgress(.251, 100)).toBe(25)
  })

  it('advances independently of React frame state and respects speed', () => {
    const slow = advanceProgress(.2, 16, 1, 1000)
    const fast = advanceProgress(.2, 16, 4, 1000)
    expect(fast).toBeGreaterThan(slow)
    expect(advanceProgress(.99, 100_000, 4, 1000)).toBe(1)
  })
})
