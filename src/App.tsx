import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, WheelEvent } from 'react'
import { ArrowDown, Info, X } from 'lucide-react'
import { buildTrajectory, parsePositiveInteger, type CollatzTrajectory } from './math/collatz'
import { buildLayout, type GraphLayout } from './visualization/layout'
import { useCamera } from './camera/useCamera'
import { GraphView } from './components/GraphView'
import { Controls } from './components/Controls'
import { Stats } from './components/Stats'
import { useMediaQuery } from './hooks/useMediaQuery'

interface Run { trajectory: CollatzTrajectory; layout: GraphLayout }
type Phase = 'operation' | 'transition' | 'idle'

function randomStart() {
  return BigInt(2 + Math.floor(Math.random() * 99_998))
}

function readUrlNumber() {
  const raw = new URLSearchParams(window.location.search).get('n')
  if (!raw) return null
  const parsed = parsePositiveInteger(raw)
  return parsed.ok ? parsed.value : null
}

export default function App() {
  const initialUrlNumber = useRef<bigint | null>(null)
  if (initialUrlNumber.current === null && typeof window !== 'undefined') initialUrlNumber.current = readUrlNumber()

  const [mode, setMode] = useState<'intro' | 'visualization'>(() => initialUrlNumber.current ? 'visualization' : 'intro')
  const [input, setInput] = useState(() => initialUrlNumber.current?.toString() ?? '27')
  const [error, setError] = useState('')
  const [run, setRun] = useState<Run | null>(() => initialUrlNumber.current ? makeRun(initialUrlNumber.current) : null)
  const [visibleIndex, setVisibleIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('operation')
  const [playing, setPlaying] = useState(() => Boolean(initialUrlNumber.current))
  const [speed, setSpeed] = useState(1)
  const [clean, setClean] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { camera, follow, fit, panBy, zoomBy, setTarget } = useCamera(viewport, reducedMotion)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinch = useRef<{ distance: number; cx: number; cy: number } | null>(null)

  const complete = Boolean(run && visibleIndex >= run.layout.nodes.length - 1)

  const startRun = useCallback((value: bigint, historyMode: 'push' | 'replace' | 'none' = 'push') => {
    const nextRun = makeRun(value)
    setRun(nextRun)
    setInput(value.toString())
    setError('')
    setMode('visualization')
    setVisibleIndex(0)
    setPhase(nextRun.trajectory.steps.length ? 'operation' : 'idle')
    setPlaying(nextRun.trajectory.steps.length > 0)
    setClean(false)
    setTarget({ x: nextRun.layout.nodes[0].x, y: nextRun.layout.nodes[0].y, scale: 1.08 }, true)
    if (historyMode !== 'none') {
      const url = new URL(window.location.href)
      url.searchParams.set('n', value.toString())
      window.history[historyMode === 'replace' ? 'replaceState' : 'pushState']({}, '', url)
    }
  }, [setTarget])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onPop = () => {
      const value = readUrlNumber()
      if (value) startRun(value, 'none')
      else {
        setMode('intro')
        setPlaying(false)
        setRun(null)
        setInput('27')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [startRun])

  useEffect(() => {
    if (!run || !playing || complete) return
    const base = reducedMotion ? 240 : 920
    const delay = base / speed
    if (phase === 'operation') {
      const timer = window.setTimeout(() => setPhase('transition'), delay * 0.36)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'transition') {
      const timer = window.setTimeout(() => {
        setVisibleIndex((index) => Math.min(index + 1, run.layout.nodes.length - 1))
        setPhase('operation')
      }, delay * 0.64)
      return () => window.clearTimeout(timer)
    }
  }, [complete, phase, playing, reducedMotion, run, speed])

  useEffect(() => {
    if (!run) return
    if (complete) {
      setPlaying(false)
      setPhase('idle')
      const timer = window.setTimeout(() => fit(run.layout.nodes, viewport.width < 640 ? 48 : 100), reducedMotion ? 80 : 680)
      return () => window.clearTimeout(timer)
    }
    const node = run.layout.nodes[visibleIndex]
    const previous = run.layout.nodes[Math.max(0, visibleIndex - 1)]
    follow(node, previous)
  }, [complete, fit, follow, reducedMotion, run, viewport.width, visibleIndex])

  const currentPeak = useMemo(() => {
    if (!run) return 1n
    let peak = run.trajectory.values[0]
    for (let i = 1; i <= visibleIndex; i += 1) if (run.trajectory.values[i] > peak) peak = run.trajectory.values[i]
    return peak
  }, [run, visibleIndex])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parsePositiveInteger(input)
    if (!parsed.ok) { setError(parsed.error); return }
    startRun(parsed.value)
  }

  const newNumber = () => {
    setPlaying(false)
    setMode('intro')
    setClean(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('n')
    window.history.pushState({}, '', url)
    window.setTimeout(() => document.querySelector<HTMLInputElement>('#start-number')?.focus(), 0)
  }

  const randomize = () => startRun(randomStart())
  const step = () => {
    if (!run || complete) return
    setPlaying(false)
    setVisibleIndex((index) => Math.min(index + 1, run.layout.nodes.length - 1))
    setPhase('operation')
  }
  const togglePlay = () => {
    if (!run) return
    if (complete) {
      setVisibleIndex(0); setPhase('operation'); setPlaying(true)
    } else setPlaying((value) => !value)
  }
  const restart = () => {
    if (!run) return
    setPlaying(false); setVisibleIndex(0); setPhase('operation')
    setTarget({ x: run.layout.nodes[0].x, y: run.layout.nodes[0].y, scale: 1.08 })
  }
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
      else await document.exitFullscreen()
    } catch { /* Fullscreen can be unavailable in embedded browsers. */ }
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const old = pointers.current.get(event.pointerId)
    if (!old) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const values = [...pointers.current.values()]
    if (values.length === 1) {
      panBy(event.clientX - old.x, event.clientY - old.y)
      lastPinch.current = null
    } else if (values.length >= 2) {
      const [a, b] = values
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      if (lastPinch.current) {
        panBy(cx - lastPinch.current.cx, cy - lastPinch.current.cy)
        zoomBy(distance / Math.max(1, lastPinch.current.distance))
      }
      lastPinch.current = { distance, cx, cy }
    }
  }
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) lastPinch.current = null
  }
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomBy(Math.exp(-event.deltaY * 0.0012))
  }

  if (mode === 'intro') {
    return (
      <main className="intro-page">
        <section className="intro-hero">
          <div className="brand-mark" aria-label="3x plus 1">3X + 1</div>
          <button className="about-button" onClick={() => setAboutOpen(true)}><Info size={15} /> About</button>
          <div className="intro-content">
            <p className="eyebrow">The Collatz conjecture</p>
            <h1>Choose a number.<br />Watch where it goes.</h1>
            <form className="start-form" onSubmit={submit} noValidate>
              <label htmlFor="start-number">Starting integer</label>
              <div className={`number-field ${error ? 'has-error' : ''}`}>
                <input id="start-number" value={input} onChange={(e) => { setInput(e.target.value); setError('') }} inputMode="numeric" pattern="[0-9]*" autoComplete="off" spellCheck={false} aria-describedby={error ? 'input-error' : 'rule-note'} />
                <button type="submit">Explore <span aria-hidden>→</span></button>
              </div>
              {error ? <p className="input-error" id="input-error" role="alert">{error}</p> : <p className="rule-note" id="rule-note"><span className="odd-rule">odd → 3n + 1</span><span className="even-rule">even → n ÷ 2</span></p>}
              <button className="random-link" type="button" onClick={randomize}>Try a random number</button>
            </form>
          </div>
          <a className="discover-link" href="#the-problem">Why it matters <ArrowDown size={14} /></a>
        </section>
        <section className="editorial" id="the-problem">
          <p className="eyebrow">One rule. Infinite complexity.</p>
          <h2>Simple enough to explain in seconds.<br />Still unproved.</h2>
          <div className="editorial-grid">
            <p>Start with any positive integer. If it is even, divide it by two. If it is odd, multiply it by three and add one. Then repeat.</p>
            <p>Every starting value tested so far eventually reaches 1. No proof is known that this happens for every positive integer. Some trajectories climb dramatically before returning.</p>
          </div>
          <div className="rule-display"><span>n even</span><strong>n ÷ 2</strong><span>n odd</span><strong>3n + 1</strong></div>
        </section>
        {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
      </main>
    )
  }

  if (!run) return null
  const current = run.trajectory.values[Math.min(visibleIndex, run.trajectory.values.length - 1)]

  return (
    <main className={`visualization-shell ${clean ? 'is-clean' : ''}`}>
      <div
        ref={stageRef}
        className="stage"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
        onDoubleClick={() => fit(run.layout.nodes.slice(0, visibleIndex + 1))}
        aria-label="Interactive Collatz graph. Drag to pan, scroll or pinch to zoom."
      >
        <GraphView trajectory={run.trajectory} layout={run.layout} visibleIndex={visibleIndex} phase={phase} camera={camera} complete={complete && run.trajectory.reachedOne} viewport={viewport} />
      </div>
      <header className="viz-header ui-layer">
        <button className="wordmark" onClick={newNumber} aria-label="Return to start">3X + 1</button>
        <button className="text-button" onClick={() => setAboutOpen(true)}><Info size={14} /> About</button>
      </header>
      <div className="stats-wrap ui-layer"><Stats start={run.trajectory.start} current={current} steps={visibleIndex} peak={currentPeak} /></div>
      {run.trajectory.truncated && complete && <div className="limit-note ui-layer">Display paused after 10,000 exact steps. Choose Step/Restart or try a smaller start.</div>}
      {!clean && <Controls playing={playing} complete={complete} speed={speed} onTogglePlay={togglePlay} onStep={step} onRestart={restart} onNewNumber={newNumber} onRandom={randomize} onSpeed={setSpeed} onFit={() => fit(run.layout.nodes.slice(0, visibleIndex + 1))} onFullscreen={enterFullscreen} onClean={() => setClean(true)} />}
      {clean && <button className="restore-ui" onClick={() => setClean(false)}>Show controls</button>}
      <div className="gesture-hint ui-layer">drag to pan · scroll / pinch to zoom</div>
      <div className="sr-only" aria-live="polite">Step {visibleIndex}. Current value {current.toString()}.</div>
      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </main>
  )
}

function makeRun(value: bigint): Run {
  const trajectory = buildTrajectory(value)
  return { trajectory, layout: buildLayout(trajectory) }
}

function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <p className="eyebrow">About the problem</p>
        <h2 id="about-title">A tiny rule with an enormous question behind it.</h2>
        <p>For a positive integer <em>n</em>: divide by two when it is even; otherwise compute 3n + 1. Repeat.</p>
        <p>All values tested computationally eventually enter 4 → 2 → 1, but a general proof remains unknown. A trajectory can wander upward for many steps before descending, which is part of what makes the problem so deceptive.</p>
        <p className="about-note">This visualization calculates every displayed step exactly with JavaScript BigInt. It does not claim to prove the conjecture.</p>
      </section>
    </div>
  )
}
