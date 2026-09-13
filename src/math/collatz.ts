export type CollatzOperation = '3n+1' | 'n/2'

export interface CollatzStep {
  current: bigint
  next: bigint
  operation: CollatzOperation
  step: number
}

export interface CollatzTrajectory {
  start: bigint
  values: bigint[]
  steps: CollatzStep[]
  peak: bigint
  reachedOne: boolean
  truncated: boolean
}

export const MAX_INPUT_DIGITS = 512
export const DEFAULT_MAX_STEPS = 10_000

export function parsePositiveInteger(raw: string): { ok: true; value: bigint } | { ok: false; error: string } {
  const value = raw.trim()
  if (!value) return { ok: false, error: 'Enter a positive integer.' }
  if (!/^\d+$/.test(value)) return { ok: false, error: 'Use digits only — no decimals or signs.' }
  const normalized = value.replace(/^0+(?=\d)/, '')
  if (normalized === '0') return { ok: false, error: 'The starting value must be greater than zero.' }
  if (normalized.length > MAX_INPUT_DIGITS) {
    return { ok: false, error: `For an interactive run, keep the input under ${MAX_INPUT_DIGITS} digits.` }
  }
  try {
    return { ok: true, value: BigInt(normalized) }
  } catch {
    return { ok: false, error: 'That integer could not be parsed.' }
  }
}

export function collatzStep(current: bigint, step = 1): CollatzStep {
  if (current <= 0n) throw new RangeError('Collatz is defined here for positive integers only.')
  const even = current % 2n === 0n
  return {
    current,
    next: even ? current / 2n : current * 3n + 1n,
    operation: even ? 'n/2' : '3n+1',
    step,
  }
}

export function buildTrajectory(start: bigint, maxSteps = DEFAULT_MAX_STEPS): CollatzTrajectory {
  if (start <= 0n) throw new RangeError('Start must be a positive integer.')
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 0) throw new RangeError('maxSteps must be a non-negative safe integer.')

  const values: bigint[] = [start]
  const steps: CollatzStep[] = []
  let current = start
  let peak = start

  while (current !== 1n && steps.length < maxSteps) {
    const nextStep = collatzStep(current, steps.length + 1)
    steps.push(nextStep)
    current = nextStep.next
    values.push(current)
    if (current > peak) peak = current
  }

  return {
    start,
    values,
    steps,
    peak,
    reachedOne: current === 1n,
    truncated: current !== 1n,
  }
}

export function formatInteger(value: bigint, maxChars = 14): string {
  const raw = value.toString()
  if (raw.length <= maxChars) return raw
  const head = raw.slice(0, 6)
  const exponent = raw.length - 1
  return `${head[0]}.${head.slice(1, 4)}e${exponent}`
}
