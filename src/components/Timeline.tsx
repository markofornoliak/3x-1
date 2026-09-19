import { FormEvent, useEffect, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

interface Props {
  step: number
  maxStep: number
  playing: boolean
  speed: number
  onTogglePlay: () => void
  onRestart: () => void
  onStep: (step: number) => void
  onSpeed: (speed: number) => void
  onPeak: () => void
  onEnd: () => void
}

const speeds = [0.5, 1, 2, 4]

export function Timeline({ step, maxStep, playing, speed, onTogglePlay, onRestart, onStep, onSpeed, onPeak, onEnd }: Props) {
  const [draft, setDraft] = useState(String(step))
  useEffect(() => setDraft(String(step)), [step])

  const go = (event: FormEvent) => {
    event.preventDefault()
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onStep(parsed)
  }

  return (
    <div className="timeline ui-layer" aria-label="Trajectory timeline">
      <button className="timeline-play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
      </button>
      <button className="timeline-icon" onClick={onRestart} aria-label="Restart"><RotateCcw size={15} /></button>
      <div className="timeline-track">
        <input
          type="range"
          min="0"
          max={Math.max(0, maxStep)}
          value={Math.min(step, maxStep)}
          onChange={(event) => onStep(Number(event.target.value))}
          aria-label="Go directly to trajectory step"
        />
        <div className="timeline-readout"><span>{step.toLocaleString()}</span><span>/ {maxStep.toLocaleString()}</span></div>
      </div>
      <form className="timeline-go" onSubmit={go}>
        <label className="sr-only" htmlFor="timeline-step">Go to step</label>
        <input id="timeline-step" inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit">Go</button>
      </form>
      <button className="timeline-text" onClick={onPeak}>Peak</button>
      <button className="timeline-text" onClick={onEnd}>End</button>
      <div className="timeline-speeds" role="group" aria-label="Playback speed">
        {speeds.map((item) => <button key={item} className={speed === item ? 'is-active' : ''} onClick={() => onSpeed(item)}>{item}×</button>)}
      </div>
    </div>
  )
}
