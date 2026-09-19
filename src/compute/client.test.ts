import { describe, expect, it } from 'vitest'
import { ComputationCancelledError, ComputeClient, type WorkerLike } from './client'
import type { WorkerRequest, WorkerResponse } from './types'

class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = []
  listeners = new Set<(event: { data: WorkerResponse }) => void>()
  postMessage(message: WorkerRequest) { this.sent.push(message) }
  addEventListener(_type: 'message', listener: (event: { data: WorkerResponse }) => void) { this.listeners.add(listener) }
  removeEventListener(_type: 'message', listener: (event: { data: WorkerResponse }) => void) { this.listeners.delete(listener) }
  emit(data: WorkerResponse) { for (const listener of this.listeners) listener({ data }) }
}

describe('ComputeClient stale-result protection', () => {
  it('cancels the prior request and ignores its stale result', async () => {
    const worker = new FakeWorker()
    const client = new ComputeClient(worker)
    let staleSeries = 0
    const first = client.compute('old', ['27'], { onSeries: () => { staleSeries += 1 } })
    const second = client.compute('new', ['31'])
    await expect(first).rejects.toBeInstanceOf(ComputationCancelledError)
    expect(worker.sent.some((message) => message.type === 'cancel' && message.targetRequestId === 'old')).toBe(true)

    worker.emit({ type: 'done', requestId: 'old', sessionId: 'old', sharedTails: [] })
    worker.emit({ type: 'done', requestId: 'new', sessionId: 'new', sharedTails: [] })
    await expect(second).resolves.toEqual({ trajectories: [], sharedTails: [] })
    expect(staleSeries).toBe(0)
    client.destroy()
  })
})
