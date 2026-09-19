import { describe, expect, it } from 'vitest'
import { createTrajectoryState, extendTrajectory, serializeContinuation, serializeInitial } from './core'

describe('asynchronous Collatz computation', () => {
  it('preserves exact integers beyond Number.MAX_SAFE_INTEGER', async () => {
    const state = createTrajectoryState(9007199254740993n)
    await extendTrajectory(state, 1, { index: 0, startLabel: state.start.toString(), phase: 'compute', shouldCancel: () => false, yieldControl: async () => undefined })
    expect(state.values[1]).toBe(27021597764222980n)
  })

  it('cancels during bounded incremental work instead of only hiding the result', async () => {
    const state = createTrajectoryState(837799n)
    let yields = 0
    const status = await extendTrajectory(state, 10_000, {
      index: 0,
      startLabel: state.start.toString(),
      phase: 'compute',
      shouldCancel: () => yields >= 1,
      yieldControl: async () => { yields += 1 },
    })
    expect(status).toBe('cancelled')
    expect(state.operations.length).toBeGreaterThan(0)
    expect(state.operations.length).toBeLessThan(10_000)
  })

  it('continues from existing state without recomputing prior steps', async () => {
    const state = createTrajectoryState(27n)
    await extendTrajectory(state, 20, { index: 0, startLabel: '27', phase: 'compute', shouldCancel: () => false, yieldControl: async () => undefined })
    const first = serializeInitial(state, 's:0', true)
    const beforeValues = state.values.length
    const beforeOperations = state.operations.length
    await extendTrajectory(state, 20, { index: 0, startLabel: '27', phase: 'continue', shouldCancel: () => false, yieldControl: async () => undefined })
    const patch = serializeContinuation(state, beforeValues, beforeOperations, 's:0', true)
    expect(first.totalSteps).toBe(20)
    expect(patch.totalSteps).toBe(40)
    expect(patch.appendedValues).toHaveLength(20)
    expect(patch.appendedOperations).toHaveLength(20)
    expect(first.values.at(-1)).not.toBe(patch.appendedValues.at(-1))
  })

  it('distinguishes complete and truncated semantics', async () => {
    const complete = createTrajectoryState(8n)
    await extendTrajectory(complete, 10_000, { index: 0, startLabel: '8', phase: 'compute', shouldCancel: () => false, yieldControl: async () => undefined })
    expect(serializeInitial(complete, 'a', false).reachedOne).toBe(true)

    const truncated = createTrajectoryState(27n)
    await extendTrajectory(truncated, 3, { index: 0, startLabel: '27', phase: 'compute', shouldCancel: () => false, yieldControl: async () => undefined })
    const result = serializeInitial(truncated, 'b', true)
    expect(result.reachedOne).toBe(false)
    expect(result.truncated).toBe(true)
    expect(result.totalSteps).toBe(3)
  })
})
