import type { ComputedTrajectory, ComputeProgress, ContinuationPatch, SharedTail, WorkerRequest, WorkerResponse } from './types'

interface MessageEventLike<T> { data: T }
export interface WorkerLike {
  postMessage(message: WorkerRequest): void
  addEventListener(type: 'message', listener: (event: MessageEventLike<WorkerResponse>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEventLike<WorkerResponse>) => void): void
  terminate?: () => void
}

export interface ComputeHandlers {
  onProgress?: (progress: ComputeProgress) => void
  onSeries?: (index: number, trajectory: ComputedTrajectory) => void
}

export class ComputationCancelledError extends Error {
  constructor() { super('Computation cancelled.'); this.name = 'ComputationCancelledError' }
}

type Pending =
  | { kind: 'compute'; sessionId: string; handlers: ComputeHandlers; results: ComputedTrajectory[]; resolve: (value: { trajectories: ComputedTrajectory[]; sharedTails: SharedTail[] }) => void; reject: (error: Error) => void }
  | { kind: 'continue'; sessionId: string; handlers: ComputeHandlers; resolve: (value: { index: number; patch: ContinuationPatch; sharedTails: SharedTail[] }) => void; reject: (error: Error) => void }
  | { kind: 'export'; sessionId: string; resolve: (value: Blob) => void; reject: (error: Error) => void }

let sequence = 0
function requestId(prefix: string) { sequence += 1; return `${prefix}-${Date.now()}-${sequence}` }

export class ComputeClient {
  private pending = new Map<string, Pending>()
  private activeCalculations = new Set<string>()
  private onMessage = (event: MessageEventLike<WorkerResponse>) => this.handle(event.data)

  constructor(private worker: WorkerLike = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike) {
    worker.addEventListener('message', this.onMessage)
  }

  compute(sessionId: string, starts: string[], handlers: ComputeHandlers = {}) {
    this.cancelActive()
    const id = sessionId
    this.activeCalculations.add(id)
    return new Promise<{ trajectories: ComputedTrajectory[]; sharedTails: SharedTail[] }>((resolve, reject) => {
      this.pending.set(id, { kind: 'compute', sessionId, handlers, results: [], resolve, reject })
      this.worker.postMessage({ type: 'compute', requestId: id, sessionId, starts, maxSteps: 10_000 })
    })
  }

  continue(sessionId: string, index: number, handlers: ComputeHandlers = {}) {
    const id = requestId('continue')
    this.activeCalculations.add(id)
    return new Promise<{ index: number; patch: ContinuationPatch; sharedTails: SharedTail[] }>((resolve, reject) => {
      this.pending.set(id, { kind: 'continue', sessionId, handlers, resolve, reject })
      this.worker.postMessage({ type: 'continue', requestId: id, sessionId, index, additionalSteps: 10_000 })
    })
  }

  export(sessionId: string, format: 'json' | 'csv') {
    const id = requestId('export')
    return new Promise<Blob>((resolve, reject) => {
      this.pending.set(id, { kind: 'export', sessionId, resolve, reject })
      this.worker.postMessage({ type: 'export', requestId: id, sessionId, format })
    })
  }

  cancelActive() {
    for (const id of [...this.activeCalculations]) this.cancel(id)
  }

  private cancel(id: string) {
    const pending = this.pending.get(id)
    if (!pending) {
      this.activeCalculations.delete(id)
      return
    }
    this.worker.postMessage({ type: 'cancel', requestId: requestId('cancel'), targetRequestId: id })
    pending.reject(new ComputationCancelledError())
    this.pending.delete(id)
    this.activeCalculations.delete(id)
  }

  private complete(id: string) {
    this.pending.delete(id)
    this.activeCalculations.delete(id)
  }

  private handle(message: WorkerResponse) {
    const pending = this.pending.get(message.requestId)
    if (!pending) return

    if (message.type === 'progress') {
      if (pending.kind === 'compute' || pending.kind === 'continue') pending.handlers.onProgress?.(message.progress)
      return
    }
    if (message.type === 'series' && pending.kind === 'compute') {
      pending.results[message.index] = message.trajectory
      pending.handlers.onSeries?.(message.index, message.trajectory)
      return
    }
    if (message.type === 'done' && pending.kind === 'compute') {
      this.complete(message.requestId)
      pending.resolve({ trajectories: pending.results.filter(Boolean), sharedTails: message.sharedTails })
      return
    }
    if (message.type === 'continued' && pending.kind === 'continue') {
      this.complete(message.requestId)
      pending.resolve({ index: message.index, patch: message.patch, sharedTails: message.sharedTails })
      return
    }
    if (message.type === 'exported' && pending.kind === 'export') {
      this.pending.delete(message.requestId)
      pending.resolve(message.blob)
      return
    }
    if (message.type === 'cancelled') {
      this.complete(message.requestId)
      pending.reject(new ComputationCancelledError())
      return
    }
    if (message.type === 'error') {
      this.complete(message.requestId)
      pending.reject(new Error(message.message))
    }
  }

  destroy() {
    this.cancelActive()
    for (const pending of this.pending.values()) pending.reject(new ComputationCancelledError())
    this.pending.clear()
    this.worker.removeEventListener('message', this.onMessage)
    this.worker.terminate?.()
  }
}
