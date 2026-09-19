export interface PlaybackState {
  step: number
  maxStep: number
  progress: number
  playing: boolean
}

export function clampStep(step: number, maxStep: number) {
  if (!Number.isFinite(step)) return 0
  return Math.max(0, Math.min(Math.max(0, Math.floor(maxStep)), Math.floor(step)))
}

export function progressForStep(step: number, maxStep: number) {
  return maxStep <= 0 ? 1 : clampStep(step, maxStep) / maxStep
}

export function stepForProgress(progress: number, maxStep: number) {
  if (!Number.isFinite(progress)) return 0
  return clampStep(Math.round(Math.max(0, Math.min(1, progress)) * Math.max(0, maxStep)), maxStep)
}

export function advanceProgress(progress: number, dt: number, speed: number, maxStep: number) {
  const duration = Math.min(30_000, Math.max(4_000, Math.max(1, maxStep) * 65))
  return Math.min(1, Math.max(0, progress) + Math.max(0, dt) * Math.max(0, speed) / duration)
}
