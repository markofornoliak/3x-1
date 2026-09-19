import { describe, expect, it } from 'vitest'
import { createCsvExport, createJsonExport } from './exportFormats'

const series = [{
  start: '9007199254740993',
  values: ['9007199254740993', '27021597764222980'],
  operations: Uint8Array.from([1]),
  peak: '27021597764222980',
  peakStep: 1,
  reachedOne: false,
  truncated: true,
}]

describe('exact export formats', () => {
  it('keeps exact integers as decimal strings in JSON and marks truncation', () => {
    const parsed = JSON.parse(createJsonExport(series, '2026-09-19T00:00:00.000Z'))
    expect(parsed.trajectories[0].values[0]).toBe('9007199254740993')
    expect(parsed.trajectories[0].status).toBe('truncated')
    expect(parsed.trajectories[0].operations).toEqual(['3n+1'])
  })

  it('emits exact CSV rows with trajectory identity, step, value and operation', () => {
    const csv = createCsvExport(series)
    expect(csv.split('\n')[0]).toBe('trajectory,start,step,value,operation,status')
    expect(csv).toContain('T1,9007199254740993,0,9007199254740993,3n+1,truncated')
    expect(csv).toContain('T1,9007199254740993,1,27021597764222980,,truncated')
  })
})
