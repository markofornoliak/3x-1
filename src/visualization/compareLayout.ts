import { formatInteger, type CollatzTrajectory } from '../math/collatz'

export type CompareScale = 'linear' | 'log'

export interface ComparePoint {
  x: number
  y: number
  value: bigint
  step: number
  important: boolean
  globalPeak: boolean
}

export interface CompareSeriesLayout {
  start: bigint
  points: ComparePoint[]
  peakIndex: number
}

export interface CompareTick {
  value: bigint
  y: number
  label: string
}

export interface CompareLayout {
  scale: CompareScale
  series: CompareSeriesLayout[]
  maxStep: number
  maxValue: bigint
  axisMax: bigint
  plotHeight: number
  plotWidth: number
  xTicks: number[]
  yTicks: CompareTick[]
}

export interface CameraTarget { x: number; y: number; scale: number }
export interface CompareViewport { width: number; height: number }

export const COMPARE_STEP_X = 42
export const COMPARE_PLOT_HEIGHT = 600

function approximateRatio(value: bigint, maximum: bigint) {
  if (value <= 0n) return 0
  if (value >= maximum) return 1

  const valueText = value.toString()
  const maxText = maximum.toString()
  const exponentDelta = valueText.length - maxText.length
  if (exponentDelta < -20) return 0

  const valueHeadText = valueText.slice(0, 15)
  const maxHeadText = maxText.slice(0, 15)
  const valueHead = Number(valueHeadText) / (10 ** (valueHeadText.length - 1))
  const maxHead = Number(maxHeadText) / (10 ** (maxHeadText.length - 1))
  return Math.min(1, Math.max(0, (valueHead / maxHead) * (10 ** exponentDelta)))
}

function log10BigInt(value: bigint) {
  const text = value.toString()
  const headText = text.slice(0, 15)
  const head = Number(headText) / (10 ** (headText.length - 1))
  return text.length - 1 + Math.log10(head)
}

function niceLinearAxis(maximum: bigint) {
  if (maximum <= 5n) return { step: 1n, maximum: 5n }
  const rawStep = (maximum + 4n) / 5n
  const text = rawStep.toString()
  const magnitude = 10n ** BigInt(text.length - 1)
  const headText = text.slice(0, Math.min(3, text.length))
  const normalized = Number(headText) / (10 ** (headText.length - 1))
  const factor = normalized <= 1 ? 1n : normalized <= 2 ? 2n : normalized <= 5 ? 5n : 10n
  const step = factor * magnitude
  const axisMaximum = ((maximum + step - 1n) / step) * step
  return { step, maximum: axisMaximum }
}

function buildLinearTicks(maximum: bigint) {
  const axis = niceLinearAxis(maximum)
  const ticks: bigint[] = []
  for (let value = 0n; value <= axis.maximum; value += axis.step) ticks.push(value)
  return { ...axis, ticks }
}

function buildLogTicks(maximum: bigint) {
  const topExponent = Math.max(1, maximum.toString().length - 1 + (maximum.toString()[0] === '1' && /^10*$/.test(maximum.toString()) ? 0 : 1))
  const stride = Math.max(1, Math.ceil(topExponent / 5))
  const exponents: number[] = [0]
  for (let exponent = stride; exponent < topExponent; exponent += stride) exponents.push(exponent)
  if (exponents.at(-1) !== topExponent) exponents.push(topExponent)
  const axisMaximum = 10n ** BigInt(topExponent)
  return { axisMaximum, topExponent, ticks: exponents.map((exponent) => 10n ** BigInt(exponent)) }
}

function buildXTicks(maxStep: number) {
  if (maxStep <= 0) return [0]
  const raw = Math.max(1, maxStep / 6)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = Math.max(1, Math.round(factor * magnitude))
  const ticks: number[] = []
  for (let value = 0; value <= maxStep; value += step) ticks.push(value)
  if (ticks.at(-1) !== maxStep) ticks.push(maxStep)
  return ticks
}

function importantPeakIndices(trajectory: CollatzTrajectory) {
  const candidates: number[] = []
  const values = trajectory.values
  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] > values[index - 1] && values[index] > values[index + 1]) candidates.push(index)
  }
  candidates.sort((a, b) => values[a] === values[b] ? a - b : values[a] > values[b] ? -1 : 1)
  return new Set(candidates.slice(0, 3))
}

export function buildCompareLayout(trajectories: CollatzTrajectory[], scale: CompareScale): CompareLayout {
  const maxStep = trajectories.reduce((maximum, trajectory) => Math.max(maximum, trajectory.steps.length), 0)
  const maxValue = trajectories.reduce((maximum, trajectory) => trajectory.peak > maximum ? trajectory.peak : maximum, 1n)
  const xTicks = buildXTicks(maxStep)

  let axisMax: bigint
  let yTicks: CompareTick[]
  let yOf: (value: bigint) => number

  if (scale === 'linear') {
    const axis = buildLinearTicks(maxValue)
    axisMax = axis.maximum
    yOf = (value) => -COMPARE_PLOT_HEIGHT * approximateRatio(value, axisMax)
    yTicks = axis.ticks.map((value) => ({ value, y: yOf(value), label: formatInteger(value, 8) }))
  } else {
    const axis = buildLogTicks(maxValue)
    axisMax = axis.axisMaximum
    yOf = (value) => -COMPARE_PLOT_HEIGHT * (log10BigInt(value) / axis.topExponent)
    yTicks = axis.ticks.map((value) => ({ value, y: yOf(value), label: formatInteger(value, 8) }))
  }

  const series = trajectories.map((trajectory) => {
    let peakIndex = 0
    for (let index = 1; index < trajectory.values.length; index += 1) {
      if (trajectory.values[index] > trajectory.values[peakIndex]) peakIndex = index
    }
    const important = importantPeakIndices(trajectory)
    important.add(peakIndex)
    const points = trajectory.values.map((value, step) => ({
      x: step * COMPARE_STEP_X,
      y: yOf(value),
      value,
      step,
      important: step === 0 || step === trajectory.values.length - 1 || important.has(step),
      globalPeak: step === peakIndex,
    }))
    return { start: trajectory.start, points, peakIndex }
  })

  return {
    scale,
    series,
    maxStep,
    maxValue,
    axisMax,
    plotHeight: COMPARE_PLOT_HEIGHT,
    plotWidth: maxStep * COMPARE_STEP_X,
    xTicks,
    yTicks,
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function compareFitTarget(layout: CompareLayout, viewport: CompareViewport): CameraTarget {
  const width = Math.max(COMPARE_STEP_X * 2, layout.plotWidth)
  const availableWidth = Math.max(180, viewport.width - (viewport.width < 640 ? 54 : 130))
  const availableHeight = Math.max(180, viewport.height * (viewport.width < 640 ? 0.46 : 0.43))
  const scale = clamp(Math.min(availableWidth / (width + 72), availableHeight / (layout.plotHeight + 80)), 0.08, 1.35)
  return { x: width / 2, y: -layout.plotHeight / 2, scale }
}

export function compareStartTarget(layout: CompareLayout, viewport: CompareViewport): CameraTarget {
  const visibleSteps = Math.min(Math.max(12, Math.floor(viewport.width / 52)), Math.max(12, layout.maxStep))
  const width = visibleSteps * COMPARE_STEP_X
  const availableWidth = Math.max(180, viewport.width - (viewport.width < 640 ? 48 : 120))
  const availableHeight = Math.max(180, viewport.height * (viewport.width < 640 ? 0.46 : 0.43))
  const scale = clamp(Math.min(availableWidth / (width + 72), availableHeight / (layout.plotHeight + 80)), 0.16, 1.35)
  return { x: width * 0.42, y: -layout.plotHeight / 2, scale }
}

export function compareFollowTarget(layout: CompareLayout, step: number, viewport: CompareViewport, scale: number): CameraTarget {
  const currentX = Math.min(step, layout.maxStep) * COMPARE_STEP_X
  const safeScale = clamp(scale, 0.08, 4.5)
  const screenBias = viewport.width < 640 ? viewport.width * 0.16 : viewport.width * 0.22
  return {
    x: Math.max(0, currentX - screenBias / safeScale),
    y: -layout.plotHeight / 2,
    scale: safeScale,
  }
}
