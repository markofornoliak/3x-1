import { formatInteger } from '../math/collatz'

interface Props {
  start: bigint
  current: bigint
  steps: number
  peak: bigint
}

export function Stats({ start, current, steps, peak }: Props) {
  return (
    <dl className="stats" aria-label="Trajectory statistics">
      <div><dt>Start</dt><dd>{formatInteger(start)}</dd></div>
      <div><dt>Current</dt><dd>{formatInteger(current)}</dd></div>
      <div><dt>Steps</dt><dd>{steps}</dd></div>
      <div><dt>Peak</dt><dd>{formatInteger(peak)}</dd></div>
    </dl>
  )
}
