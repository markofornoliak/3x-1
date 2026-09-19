import { OP_EVEN, OP_ODD, type ComputedTrajectory, type ContinuationPatch, type ComputeProgress } from './types'
import { buildGeometry } from '../visualization/preprocess'

export const DEFAULT_MAX_STEPS = 10_000
export const MAX_CONTINUE_STEPS = 10_000
export const ABSOLUTE_MAX_STEPS_PER_TRAJECTORY = 200_000
export const MAX_SESSION_VALUES = 600_006
export const YIELD_EVERY = 256

export interface TrajectoryState {
  start: bigint
  current: bigint
  values: bigint[]
  operations: number[]
  peak: bigint
  peakStep: number
  reachedOne: boolean
}

export interface RunOptions {
  index: number
  startLabel: string
  phase: 'compute' | 'continue'
  shouldCancel: () => boolean
  onProgress?: (progress: ComputeProgress) => void
  yieldControl?: () => Promise<void>
}

export function createTrajectoryState(start: bigint): TrajectoryState {
  if (start <= 0n) throw new RangeError('Start must be positive.')
  return {
    start,
    current: start,
    values: [start],
    operations: [],
    peak: start,
    peakStep: 0,
    reachedOne: start === 1n,
  }
}

export async function extendTrajectory(state: TrajectoryState, additionalSteps: number, options: RunOptions): Promise<'complete' | 'truncated' | 'cancelled'> {
  if (!Number.isSafeInteger(additionalSteps) || additionalSteps < 0) throw new RangeError('additionalSteps must be a non-negative safe integer.')
  const target = Math.min(ABSOLUTE_MAX_STEPS_PER_TRAJECTORY, state.operations.length + additionalSteps)
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

  while (!state.reachedOne && state.operations.length < target) {
    if (options.shouldCancel()) return 'cancelled'
    const odd = state.current % 2n !== 0n
    const next = odd ? state.current * 3n + 1n : state.current / 2n
    state.operations.push(odd ? OP_ODD : OP_EVEN)
    state.current = next
    state.values.push(next)
    if (next > state.peak) {
      state.peak = next
      state.peakStep = state.operations.length
    }
    if (next === 1n) state.reachedOne = true

    if (state.operations.length % YIELD_EVERY === 0) {
      options.onProgress?.({
        index: options.index,
        start: options.startLabel,
        steps: state.operations.length,
        current: state.current.toString(),
        peak: state.peak.toString(),
        phase: options.phase,
      })
      await yieldControl()
      if (options.shouldCancel()) return 'cancelled'
    }
  }

  options.onProgress?.({
    index: options.index,
    start: options.startLabel,
    steps: state.operations.length,
    current: state.current.toString(),
    peak: state.peak.toString(),
    phase: options.phase,
  })
  return state.reachedOne ? 'complete' : 'truncated'
}

function geometryTransferable(state: TrajectoryState) {
  return buildGeometry(state.values)
}

export function serializeInitial(state: TrajectoryState, continuationToken: string, continuationAvailable: boolean): ComputedTrajectory {
  return {
    start: state.start.toString(),
    values: state.values.map(String),
    operations: Uint8Array.from(state.operations),
    peak: state.peak.toString(),
    peakStep: state.peakStep,
    reachedOne: state.reachedOne,
    truncated: !state.reachedOne,
    totalSteps: state.operations.length,
    continuationToken,
    continuationAvailable,
    geometry: geometryTransferable(state),
  }
}

export function serializeContinuation(
  state: TrajectoryState,
  previousValuesLength: number,
  previousOperationsLength: number,
  continuationToken: string,
  continuationAvailable: boolean,
): ContinuationPatch {
  return {
    start: state.start.toString(),
    appendedValues: state.values.slice(previousValuesLength).map(String),
    appendedOperations: Uint8Array.from(state.operations.slice(previousOperationsLength)),
    peak: state.peak.toString(),
    peakStep: state.peakStep,
    reachedOne: state.reachedOne,
    truncated: !state.reachedOne,
    totalSteps: state.operations.length,
    continuationToken,
    continuationAvailable,
    geometry: geometryTransferable(state),
  }
}

export function transferablesForGeometry(geometry: { y: Float64Array; levels: Uint32Array[]; tree: Float64Array }): Transferable[] {
  return [geometry.y.buffer, geometry.tree.buffer, ...geometry.levels.map((level) => level.buffer)]
}
