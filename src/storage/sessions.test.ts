import { describe, expect, it } from 'vitest'
import { readSessions, validateSavedExploration, writeSessions, type SavedExploration } from './sessions'

class MemoryStorage {
  value: string | null = null
  failWrites = false
  getItem() { return this.value }
  setItem(_key: string, value: string) { if (this.failWrites) throw new Error('quota'); this.value = value }
}

const valid: SavedExploration = {
  version: 2,
  id: 'one',
  name: '27 and 31',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  selection: { kind: 'compare', values: ['27', '31'] },
  visibility: [true, false],
  selectedStart: '31',
  camera: { x: 1, y: 2, sx: 3, sy: 4 },
  playback: { step: 5, speed: 2 },
}

describe('saved exploration schema', () => {
  it('validates versioned sessions and rejects malformed payloads', () => {
    expect(validateSavedExploration(valid)).toEqual(valid)
    expect(validateSavedExploration({ ...valid, selection: { kind: 'single', values: ['0'] } })).toBeNull()
    expect(validateSavedExploration({ ...valid, camera: { x: NaN, y: 2, sx: 3, sy: 4 } })).toBeNull()
  })

  it('migrates the prior compact schema', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify([{ version: 1, id: 'legacy', name: 'Legacy', values: ['27'], createdAt: valid.createdAt, updatedAt: valid.updatedAt }])
    const result = readSessions(storage)
    expect(result.sessions[0].version).toBe(2)
    expect(result.sessions[0].selection).toEqual({ kind: 'single', values: ['27'] })
  })

  it('reports quota or unavailable storage failures without throwing', () => {
    const storage = new MemoryStorage()
    storage.failWrites = true
    expect(writeSessions([valid], storage)).toMatch(/could not be saved/i)
    expect(readSessions(null).warning).toMatch(/unavailable/i)
  })
})
