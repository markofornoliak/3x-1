import { describe, expect, it } from 'vitest'
import { buildTrajectory } from '../math/collatz'
import { fitCamera, logValue, nearest, prepare, project, simplify, unproject, zoomAt } from './geometry'
describe('instrument geometry', () => {
  it('projects huge integers without overflow and keeps exact source data', () => {
    expect(logValue(1n)).toBe(0)
    expect(logValue(2n ** 1600n)).toBe(1600)
    const t = buildTrajectory(9007199254740993n)
    expect(prepare(t).data.values[0]).toBe('9007199254740993')
  })
  it('retains endpoints and bucket extrema at every resolution', () => {
    const y = Float64Array.from({ length: 100001 }, (_, i) => i === 54321 ? 1000000 : Math.sin(i) * 100)
    for (const bucket of [8, 32, 128, 512, 2048]) {
      const lod = simplify(y, bucket)
      expect(lod[0]).toBe(0); expect(lod[lod.length - 1]).toBe(y.length - 1); expect([...lod]).toContain(54321)
      let cursor = 0
      for (let i = 0; i < y.length; i += bucket) {
        const section = y.slice(i, i + bucket), retained: number[] = []
        while (cursor < lod.length && lod[cursor] < i + bucket) retained.push(y[lod[cursor++]])
        expect(Math.max(...retained)).toBe(Math.max(...section)); expect(Math.min(...retained)).toBe(Math.min(...section))
      }
    }
  })
  it('camera transforms invert and zoom preserves the anchor', () => {
    const c = { x: -10, y: 30, sx: 5, sy: 9 }, p = { x: 55, y: 74 }
    const world = unproject(p, c)
    expect(project(world, c).x).toBeCloseTo(p.x)
    expect(project(world, zoomAt(c, p, 2.7)).x).toBeCloseTo(p.x)
    expect(project(world, zoomAt(c, p, 2.7)).y).toBeCloseTo(p.y)
  })
  it('normalizes comparisons to a shared scale and fits peaks/endpoints', () => {
    const series = [27n, 97n].map(n => prepare(buildTrajectory(n))), c = fitCamera(series, 1200, 800)
    for (const s of series) for (const step of [0, s.peakStep, s.y.length - 1]) {
      const p = project({ x: step, y: s.y[step] }, c)
      expect(p.x).toBeGreaterThanOrEqual(69); expect(p.x).toBeLessThanOrEqual(1147)
      expect(p.y).toBeGreaterThanOrEqual(169); expect(p.y).toBeLessThanOrEqual(669)
    }
  })
  it('indexed nearest matches exhaustive lookup at multiple zooms and reveal limits', () => {
    const s = prepare(buildTrajectory(837799n))
    for (const scale of [.02, 2, 30]) {
      const c = { x: -2, y: 36, sx: scale, sy: scale * 3 }
      for (let i = 0; i < 100; i++) {
        const p = { x: i * 3.71, y: i * 1.39 }, limit = 300
        let distance = 24 ** 2, expected: number | null = null
        s.y.forEach((y, step) => { if (step > limit) return; const q = project({ x: step, y }, c); const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < distance) { distance = d; expected = step } })
        const actual = nearest(s, c, p, limit)
        if (expected === null) expect(actual).toBeNull()
        else { expect(actual).not.toBeNull(); const q = project({ x: actual!, y: s.y[actual!] }, c); expect((p.x - q.x) ** 2 + (p.y - q.y) ** 2).toBeCloseTo(distance) }
      }
    }
  })
})

it('preprocesses 200,000 points once and bounds overview geometry', () => {
  const values = Array.from({ length: 200000 }, (_, i) => BigInt(1 + (i * 7919) % 1000000))
  const started = performance.now()
  const s = prepare({ start: values[0], values, steps: [], peak: values.reduce((a, b) => a > b ? a : b), reachedOne: false, truncated: true })
  const elapsed = performance.now() - started
  const c = fitCamera([s], 1366, 768)
  let level = 0
  while (level + 1 < s.levels.length && (8 * 4 ** level) * c.sx < 2) level++
  expect(s.levels[level].length).toBeLessThan(1366 * 8)
  const startLookup = performance.now()
  for (let i = 0; i < 1000; i++) nearest(s, c, { x: (i * 79) % 1366, y: 190 + (i * 37) % 450 })
  console.info(`200k-point preprocessing: ${elapsed.toFixed(1)}ms; overview vertices: ${s.levels[level].length}; 1000 indexed queries: ${(performance.now() - startLookup).toFixed(1)}ms`)
})
