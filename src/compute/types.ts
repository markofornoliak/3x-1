export const OP_EVEN = 0 as const
export const OP_ODD = 1 as const
export type OperationCode = typeof OP_EVEN | typeof OP_ODD

export interface GeometryBuffers {
  y: Float64Array
  levels: Uint32Array[]
  tree: Float64Array
  size: number
}

export interface ComputedTrajectory {
  start: string
  values: string[]
  operations: Uint8Array
  peak: string
  peakStep: number
  reachedOne: boolean
  truncated: boolean
  totalSteps: number
  continuationToken: string
  continuationAvailable: boolean
  geometry: GeometryBuffers
}

export interface ContinuationPatch {
  start: string
  appendedValues: string[]
  appendedOperations: Uint8Array
  peak: string
  peakStep: number
  reachedOne: boolean
  truncated: boolean
  totalSteps: number
  continuationToken: string
  continuationAvailable: boolean
  geometry: GeometryBuffers
}

export interface SharedTail {
  a: number
  b: number
  value: string
  stepA: number
  stepB: number
  verifiedValues: number
  complete: boolean
}

export interface ComputeProgress {
  index: number
  start: string
  steps: number
  current: string
  peak: string
  phase: 'compute' | 'continue'
}

export type WorkerRequest =
  | { type: 'compute'; requestId: string; sessionId: string; starts: string[]; maxSteps: number }
  | { type: 'continue'; requestId: string; sessionId: string; index: number; additionalSteps: number }
  | { type: 'cancel'; requestId: string; targetRequestId: string }
  | { type: 'export'; requestId: string; sessionId: string; format: 'json' | 'csv' }

export type WorkerResponse =
  | { type: 'progress'; requestId: string; sessionId: string; progress: ComputeProgress }
  | { type: 'series'; requestId: string; sessionId: string; index: number; trajectory: ComputedTrajectory }
  | { type: 'done'; requestId: string; sessionId: string; sharedTails: SharedTail[] }
  | { type: 'continued'; requestId: string; sessionId: string; index: number; patch: ContinuationPatch; sharedTails: SharedTail[] }
  | { type: 'exported'; requestId: string; sessionId: string; format: 'json' | 'csv'; blob: Blob }
  | { type: 'cancelled'; requestId: string; sessionId: string }
  | { type: 'error'; requestId: string; sessionId: string; message: string }
