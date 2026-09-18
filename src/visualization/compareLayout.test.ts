import { describe, expect, it } from 'vitest'
import { buildTrajectory } from '../math/collatz'
import { buildCompareLayout } from './compareLayout'

describe('comparison layout', () => {
  const trajectories = [7n, 27n, 31n, 97n].map((value) => buildTrajectory(value))

  it('uses a shared step axis and exact trajectory values', () => {
    const layout = buildCompareLayout(trajectories, 'linear')
    expect(layout.maxStep).toBe(118)
    expect(layout.maxValue).toBe(9232n)
    expect(layout.series).toHaveLength(4)
    expect(layout.series[1].points[16].value).toBe(121n)
    expect(layout.series[1].points.at(-1)?.value).toBe(1n)
  })

  it('keeps larger values above smaller values in both scales', () => {
    const linear = buildCompareLayout(trajectories, 'linear')
    const log = buildCompareLayout(trajectories, 'log')
    const lowLinear = linear.series[1].points.find((point) => point.value === 121n)!
    const highLinear = linear.series[1].points.find((point) => point.value === 9232n)!
    const lowLog = log.series[1].points.find((point) => point.value === 121n)!
    const highLog = log.series[1].points.find((point) => point.value === 9232n)!
    expect(highLinear.y).toBeLessThan(lowLinear.y)
    expect(highLog.y).toBeLessThan(lowLog.y)
  })

  it('can derive rendering geometry for very large exact BigInt values without Infinity', () => {
    const huge = buildTrajectory(BigInt(`1${'0'.repeat(300)}`), 4)
    const layout = buildCompareLayout([huge, buildTrajectory(7n)], 'log')
    for (const series of layout.series) {
      for (const point of series.points) {
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
      }
    }
  })
})
