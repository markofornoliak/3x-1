import { findSharedTails } from '../analysis/sharedTail'
import { createCsvExport, createJsonExport } from '../export/exportFormats'
import {
  ABSOLUTE_MAX_STEPS_PER_TRAJECTORY,
  DEFAULT_MAX_STEPS,
  MAX_CONTINUE_STEPS,
  MAX_SESSION_VALUES,
  createTrajectoryState,
  extendTrajectory,
  serializeContinuation,
  serializeInitial,
  transferablesForGeometry,
  type TrajectoryState,
} from './core'
import type { WorkerRequest, WorkerResponse } from './types'

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

interface SessionState {
  states: TrajectoryState[]
}

const scope = self as unknown as WorkerScope
const sessions = new Map<string, SessionState>()
const cancelled = new Set<string>()

function post(message: WorkerResponse, transfer?: Transferable[]) {
  scope.postMessage(message, transfer)
}

function sessionValueCount(session: SessionState) {
  return session.states.reduce((sum, state) => sum + state.values.length, 0)
}

function continuationAvailable(session: SessionState, index: number) {
  const state = session.states[index]
  return !state.reachedOne
    && state.operations.length < ABSOLUTE_MAX_STEPS_PER_TRAJECTORY
    && sessionValueCount(session) < MAX_SESSION_VALUES
}

function shared(session: SessionState) {
  return findSharedTails(session.states.map((state) => ({ values: state.values, reachedOne: state.reachedOne })))
}

async function compute(request: Extract<WorkerRequest, { type: 'compute' }>) {
  const starts = request.starts.map((raw) => BigInt(raw))
  if (!starts.length || starts.length > 6 || starts.some((value) => value <= 0n)) throw new Error('Invalid computation request.')
  const maxSteps = Math.min(DEFAULT_MAX_STEPS, Math.max(0, request.maxSteps))
  const session: SessionState = { states: starts.map(createTrajectoryState) }
  sessions.set(request.sessionId, session)

  for (let index = 0; index < session.states.length; index += 1) {
    const state = session.states[index]
    const status = await extendTrajectory(state, maxSteps, {
      index,
      startLabel: state.start.toString(),
      phase: 'compute',
      shouldCancel: () => cancelled.has(request.requestId),
      onProgress: (progress) => post({ type: 'progress', requestId: request.requestId, sessionId: request.sessionId, progress }),
    })
    if (status === 'cancelled') {
      sessions.delete(request.sessionId)
      post({ type: 'cancelled', requestId: request.requestId, sessionId: request.sessionId })
      return
    }
    const trajectory = serializeInitial(state, `${request.sessionId}:${index}`, continuationAvailable(session, index))
    post(
      { type: 'series', requestId: request.requestId, sessionId: request.sessionId, index, trajectory },
      [trajectory.operations.buffer, ...transferablesForGeometry(trajectory.geometry)],
    )
  }
  post({ type: 'done', requestId: request.requestId, sessionId: request.sessionId, sharedTails: shared(session) })
}

async function continueTrajectory(request: Extract<WorkerRequest, { type: 'continue' }>) {
  const session = sessions.get(request.sessionId)
  if (!session) throw new Error('This exploration is no longer available in the computation worker. Reopen it to recompute.')
  const state = session.states[request.index]
  if (!state) throw new Error('Unknown trajectory.')
  if (!continuationAvailable(session, request.index)) throw new Error('The bounded continuation budget has been reached for this exploration.')

  const requested = Math.min(MAX_CONTINUE_STEPS, Math.max(1, request.additionalSteps))
  const remainingForTrajectory = ABSOLUTE_MAX_STEPS_PER_TRAJECTORY - state.operations.length
  const remainingForSession = MAX_SESSION_VALUES - sessionValueCount(session)
  const additional = Math.max(0, Math.min(requested, remainingForTrajectory, remainingForSession))
  if (!additional) throw new Error('The bounded continuation budget has been reached for this exploration.')

  const previousValuesLength = state.values.length
  const previousOperationsLength = state.operations.length
  const status = await extendTrajectory(state, additional, {
    index: request.index,
    startLabel: state.start.toString(),
    phase: 'continue',
    shouldCancel: () => cancelled.has(request.requestId),
    onProgress: (progress) => post({ type: 'progress', requestId: request.requestId, sessionId: request.sessionId, progress }),
  })
  if (status === 'cancelled') {
    post({ type: 'cancelled', requestId: request.requestId, sessionId: request.sessionId })
    return
  }

  const patch = serializeContinuation(
    state,
    previousValuesLength,
    previousOperationsLength,
    `${request.sessionId}:${request.index}`,
    continuationAvailable(session, request.index),
  )
  post(
    { type: 'continued', requestId: request.requestId, sessionId: request.sessionId, index: request.index, patch, sharedTails: shared(session) },
    [patch.appendedOperations.buffer, ...transferablesForGeometry(patch.geometry)],
  )
}

function exportSession(request: Extract<WorkerRequest, { type: 'export' }>) {
  const session = sessions.get(request.sessionId)
  if (!session) throw new Error('This exploration is no longer available for export. Reopen it to recompute.')
  const series = session.states.map((state) => ({
    start: state.start.toString(),
    values: state.values.map(String),
    operations: Uint8Array.from(state.operations),
    peak: state.peak.toString(),
    peakStep: state.peakStep,
    reachedOne: state.reachedOne,
    truncated: !state.reachedOne,
  }))
  const text = request.format === 'json' ? createJsonExport(series) : createCsvExport(series)
  const type = request.format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
  post({ type: 'exported', requestId: request.requestId, sessionId: request.sessionId, format: request.format, blob: new Blob([text], { type }) })
}

async function handle(request: WorkerRequest) {
  if (request.type === 'cancel') {
    cancelled.add(request.targetRequestId)
    return
  }
  try {
    if (request.type === 'compute') await compute(request)
    else if (request.type === 'continue') await continueTrajectory(request)
    else if (request.type === 'export') exportSession(request)
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      sessionId: 'sessionId' in request ? request.sessionId : '',
      message: error instanceof Error ? error.message : 'Computation failed.',
    })
  } finally {
    cancelled.delete(request.requestId)
  }
}

scope.onmessage = (event) => { void handle(event.data) }
