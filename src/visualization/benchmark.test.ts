import { describe, expect, it } from 'vitest'
import { buildTrajectory } from '../math/collatz'
import { buildGeometry } from './preprocess'
import { fitCamera, hydrateSeries, nearest, zoomAt } from './geometry'
import type { ComputedTrajectory } from '../compute/types'

function synthetic(length: number, seed: number): ComputedTrajectory {
  const values = Array.from({ length }, (_, index) => BigInt(1 + ((index * 7919 + seed * 104729) % 10_000_000)))
  const geometry = buildGeometry(values)
  const peak = values.reduce((a, b) => a > b ? a : b)
  return {
    start: values[0].toString(),
    values: values.map(String),
    operations: new Uint8Array(Math.max(0, length - 1)),
    peak: peak.toString(),
    peakStep: values.indexOf(peak),
    reachedOne: false,
    truncated: true,
    totalSteps: Math.max(0, length - 1),
    continuationToken: 'synthetic',
    continuationAvailable: false,
    geometry,
  }
}

describe('renderer preprocessing benchmarks (synthetic fixtures, not Collatz results)', () => {
  it('profiles one 200,000-point path at overview and deep zoom', () => {
    const started = performance.now()
    const trajectory = synthetic(200_000, 1)
    const preprocessMs = performance.now() - started
    const series = hydrateSeries(trajectory)
    const overview = fitCamera([series], 1440, 900)
    const deep = zoomAt(overview, { x: 720, y: 450 }, 32)

    const overviewStarted = performance.now()
    for (let index = 0; index < 2000; index += 1) nearest(series, overview, { x: (index * 73) % 1440, y: 150 + (index * 41) % 650 })
    const overviewInspectMs = performance.now() - overviewStarted

    const deepStarted = performance.now()
    for (let index = 0; index < 2000; index += 1) nearest(series, deep, { x: (index * 97) % 1440, y: 150 + (index * 29) % 650 })
    const deepInspectMs = performance.now() - deepStarted

    console.info('synthetic 200k: preprocess=' + preprocessMs.toFixed(1) + 'ms, 2000 overview inspections=' + overviewInspectMs.toFixed(1) + 'ms, 2000 deep inspections=' + deepInspectMs.toFixed(1) + 'ms')
    expect(series.y).toHaveLength(200_000)
    expect(series.levels.at(-1)?.length ?? Infinity).toBeLessThan(10_000)
  }, 20_000)

  it('profiles six simultaneous 100,000-point paths and reports geometry memory', () => {
    const started = performance.now()
    const trajectories = Array.from({ length: 6 }, (_, index) => synthetic(100_000, index + 1))
    const elapsed = performance.now() - started
    const bytes = trajectories.reduce((sum, trajectory) => sum
      + trajectory.geometry.y.byteLength
      + trajectory.geometry.tree.byteLength
      + trajectory.geometry.levels.reduce((inner, level) => inner + level.byteLength, 0), 0)
    console.info('synthetic 6x100k: preprocess=' + elapsed.toFixed(1) + 'ms, geometry=' + (bytes / 1024 / 1024).toFixed(1) + 'MiB')
    expect(trajectories).toHaveLength(6)
    expect(bytes).toBeGreaterThan(0)
  }, 30_000)
})

describe('real Collatz calculation benchmark', () => {
  it('times representative exact trajectories separately from synthetic renderer fixtures', () => {
    const starts = [27n, 837799n, 670617279n]
    const started = performance.now()
    const trajectories = starts.map((start) => buildTrajectory(start))
    const elapsed = performance.now() - started
    console.info('real Collatz: ' + starts.join(', ') + ' computed in ' + elapsed.toFixed(2) + 'ms; steps=' + trajectories.map((item) => item.steps.length).join(','))
    expect(trajectories.every((item) => item.values[0] > 0n)).toBe(true)
  })
})
