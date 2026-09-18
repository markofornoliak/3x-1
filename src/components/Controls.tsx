import { Expand, EyeOff, Focus, Pause, Play, RotateCcw, Shuffle, SkipForward, SquarePen } from 'lucide-react'

interface Props {
  playing: boolean
  complete: boolean
  speed: number
  onTogglePlay: () => void
  onStep: () => void
  onRestart: () => void
  onNewNumber: () => void
  onRandom: () => void
  onSpeed: (speed: number) => void
  onFit: () => void
  onFullscreen: () => void
  onClean: () => void
  newNumberLabel?: string
  randomLabel?: string
}

const speeds = [0.5, 1, 2, 4]

export function Controls({ playing, complete, speed, onTogglePlay, onStep, onRestart, onNewNumber, onRandom, onSpeed, onFit, onFullscreen, onClean, newNumberLabel = 'Choose a new number', randomLabel = 'Random number' }: Props) {
  return (
    <div className="controls" aria-label="Visualization controls">
      <div className="control-cluster control-cluster--primary">
        <button className="icon-button icon-button--primary" onClick={onTogglePlay} aria-label={playing ? 'Pause' : complete ? 'Replay' : 'Play'}>
          {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="icon-button" onClick={onStep} disabled={complete} aria-label="Step"><SkipForward size={17} /></button>
        <button className="icon-button" onClick={onRestart} aria-label="Restart"><RotateCcw size={17} /></button>
      </div>
      <div className="control-divider" />
      <div className="control-cluster speed-cluster" role="group" aria-label="Playback speed">
        {speeds.map((item) => <button key={item} className={`speed-button ${speed === item ? 'is-active' : ''}`} onClick={() => onSpeed(item)}>{item}×</button>)}
      </div>
      <div className="control-divider control-divider--optional" />
      <div className="control-cluster control-cluster--secondary">
        <button className="icon-button" onClick={onNewNumber} aria-label={newNumberLabel} title={newNumberLabel}><SquarePen size={17} /></button>
        <button className="icon-button" onClick={onRandom} aria-label={randomLabel} title={randomLabel}><Shuffle size={17} /></button>
        <button className="icon-button optional-control" onClick={onFit} aria-label="Fit graph" title="Fit graph"><Focus size={17} /></button>
        <button className="icon-button optional-control" onClick={onClean} aria-label="Clean presentation mode" title="Clean view"><EyeOff size={17} /></button>
        <button className="icon-button optional-control" onClick={onFullscreen} aria-label="Fullscreen" title="Fullscreen"><Expand size={17} /></button>
      </div>
    </div>
  )
}
