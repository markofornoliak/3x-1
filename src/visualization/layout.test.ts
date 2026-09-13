import { describe, expect, it } from 'vitest'
import { buildTrajectory } from '../math/collatz'
import { buildLayout } from './layout'

describe('trajectory layout', () => {
  it('creates one node per value and one edge per transformation', () => {
    const trajectory = buildTrajectory(27n)
    const graph = buildLayout(trajectory)
    expect(graph.nodes).toHaveLength(112)
    expect(graph.edges).toHaveLength(111)
  })

  it('keeps non-adjacent nodes separated for the stress path', () => {
    const graph = buildLayout(buildTrajectory(27n))
    let min = Infinity
    for (let i = 0; i < graph.nodes.length; i += 1) {
      for (let j = i + 2; j < graph.nodes.length; j += 1) {
        min = Math.min(min, Math.hypot(graph.nodes[i].x - graph.nodes[j].x, graph.nodes[i].y - graph.nodes[j].y))
      }
    }
    expect(min).toBeGreaterThan(45)
  })
})
