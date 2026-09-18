import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, WheelEvent } from 'react'
import { ArrowDown, Info, X } from 'lucide-react'
import { buildTrajectory, formatInteger, parsePositiveInteger, type CollatzTrajectory } from './math/collatz'
import { buildLayout, type GraphLayout } from './visualization/layout'
import { buildCompareLayout, compareFitTarget, compareFollowTarget, compareStartTarget, type CompareLayout, type CompareScale } from './visualization/compareLayout'
import { useCamera } from './camera/useCamera'
import { GraphView } from './components/GraphView'
import { CompareGraphView, COMPARE_COLORS, type CompareInspection } from './components/CompareGraphView'
import { CompareLegend } from './components/CompareLegend'
import { Controls } from './components/Controls'
import { Stats } from './components/Stats'
import { useMediaQuery } from './hooks/useMediaQuery'
import { applySelectionToUrl, parseComparisonInput, readUrlSelection, type UrlSelection } from './app/urlState'
import './styles/compare.css'

interface SingleRun { trajectory: CollatzTrajectory; layout: GraphLayout }
interface CompareRun { trajectories: CollatzTrajectory[]; layout: CompareLayout }
type Phase = 'operation' | 'transition' | 'idle'
type EntryKind = 'single' | 'compare'
type VisualizationKind = 'single' | 'compare'
type HistoryMode = 'push' | 'replace' | 'none'

function randomStart() {
  return BigInt(2 + Math.floor(Math.random() * 99_998))
}

function randomStarts(count = 4) {
  const values = new Set<bigint>()
  while (values.size < count) values.add(randomStart())
  return [...values]
}

function makeSingleRun(value: bigint): SingleRun {
  const trajectory = buildTrajectory(value)
  return { trajectory, layout: buildLayout(trajectory) }
}

function makeCompareRun(values: bigint[], scale: CompareScale): CompareRun {
  const trajectories = values.map((value) => buildTrajectory(value))
  return { trajectories, layout: buildCompareLayout(trajectories, scale) }
}

function historyUrl(selection: UrlSelection | null, historyMode: HistoryMode) {
  if (historyMode === 'none') return
  const url = applySelectionToUrl(new URL(window.location.href), selection)
  window.history[historyMode === 'replace' ? 'replaceState' : 'pushState']({}, '', url)
}

export default function App() {
  const initialSelection = useRef<UrlSelection | null | undefined>(undefined)
  if (initialSelection.current === undefined && typeof window !== 'undefined') initialSelection.current = readUrlSelection(window.location.search)
  const initial = initialSelection.current ?? null

  const [mode, setMode] = useState<'intro' | 'visualization'>(() => initial ? 'visualization' : 'intro')
  const [entryKind, setEntryKind] = useState<EntryKind>(() => initial?.kind ?? 'single')
  const [visualizationKind, setVisualizationKind] = useState<VisualizationKind>(() => initial?.kind ?? 'single')
  const [singleInput, setSingleInput] = useState(() => initial?.kind === 'single' ? initial.values[0].toString() : '27')
  const [compareInput, setCompareInput] = useState(() => initial?.kind === 'compare' ? initial.values.join(', ') : '7, 27, 31, 97')
  const [error, setError] = useState('')
  const [singleRun, setSingleRun] = useState<SingleRun | null>(() => initial?.kind === 'single' ? makeSingleRun(initial.values[0]) : null)
  const [compareScale, setCompareScale] = useState<CompareScale>('linear')
  const [compareRun, setCompareRun] = useState<CompareRun | null>(() => initial?.kind === 'compare' ? makeCompareRun(initial.values, 'linear') : null)
  const [visibleIndex, setVisibleIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('operation')
  const [playing, setPlaying] = useState(() => Boolean(initial))
  const [speed, setSpeed] = useState(1)
  const [clean, setClean] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [selectedStart, setSelectedStart] = useState<bigint | null>(null)
  const [inspection, setInspection] = useState<CompareInspection | null>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { camera, follow, fit, panBy, zoomBy, setTarget } = useCamera(viewport, reducedMotion)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinch = useRef<{ distance: number; cx: number; cy: number } | null>(null)

  const maxVisibleIndex = visualizationKind === 'single'
    ? Math.max(0, (singleRun?.layout.nodes.length ?? 1) - 1)
    : compareRun?.layout.maxStep ?? 0
  const complete = mode === 'visualization' && visibleIndex >= maxVisibleIndex

  const startSingle = useCallback((value: bigint, historyMode: HistoryMode = 'push') => {
    const nextRun = makeSingleRun(value)
    setSingleRun(nextRun)
    setSingleInput(value.toString())
    setError('')
    setVisualizationKind('single')
    setMode('visualization')
    setVisibleIndex(0)
    setPhase(nextRun.trajectory.steps.length ? 'operation' : 'idle')
    setPlaying(nextRun.trajectory.steps.length > 0)
    setClean(false)
    setSelectedStart(null)
    setInspection(null)
    setTarget({ x: nextRun.layout.nodes[0].x, y: nextRun.layout.nodes[0].y, scale: 1.08 }, true)
    historyUrl({ kind: 'single', values: [value] }, historyMode)
  }, [setTarget])

  const startCompare = useCallback((values: bigint[], historyMode: HistoryMode = 'push', scale: CompareScale = 'linear') => {
    const nextRun = makeCompareRun(values, scale)
    setCompareRun(nextRun)
    setCompareScale(scale)
    setCompareInput(values.map(String).join(', '))
    setError('')
    setVisualizationKind('compare')
    setMode('visualization')
    setVisibleIndex(0)
    setPhase(nextRun.layout.maxStep > 0 ? 'operation' : 'idle')
    setPlaying(nextRun.layout.maxStep > 0)
    setClean(false)
    setSelectedStart(null)
    setInspection(null)
    setTarget(compareStartTarget(nextRun.layout, viewport), true)
    historyUrl({ kind: 'compare', values }, historyMode)
  }, [setTarget, viewport])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onPop = () => {
      const selection = readUrlSelection(window.location.search)
      if (selection?.kind === 'single') startSingle(selection.values[0], 'none')
      else if (selection?.kind === 'compare') startCompare(selection.values, 'none')
      else {
        setMode('intro')
        setPlaying(false)
        setSingleRun(null)
        setCompareRun(null)
        setEntryKind('single')
        setSingleInput('27')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [startCompare, startSingle])

  useEffect(() => {
    if (mode !== 'visualization' || !playing || complete) return
    const base = reducedMotion ? 240 : 920
    const delay = base / speed
    if (phase === 'operation') {
      const timer = window.setTimeout(() => setPhase('transition'), delay * 0.36)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'transition') {
      const timer = window.setTimeout(() => {
        setVisibleIndex((index) => Math.min(index + 1, maxVisibleIndex))
        setPhase('operation')
      }, delay * 0.64)
      return () => window.clearTimeout(timer)
    }
  }, [complete, maxVisibleIndex, mode, phase, playing, reducedMotion, speed])

  useEffect(() => {
    if (mode !== 'visualization') return
    if (visualizationKind === 'single' && singleRun) {
      if (complete) {
        setPlaying(false)
        setPhase('idle')
        const timer = window.setTimeout(() => fit(singleRun.layout.nodes, viewport.width < 640 ? 48 : 100), reducedMotion ? 80 : 680)
        return () => window.clearTimeout(timer)
      }
      const node = singleRun.layout.nodes[visibleIndex]
      const previous = singleRun.layout.nodes[Math.max(0, visibleIndex - 1)]
      follow(node, previous)
      return
    }

    if (visualizationKind === 'compare' && compareRun) {
      if (complete) {
        setPlaying(false)
        setPhase('idle')
        const timer = window.setTimeout(() => setTarget(compareFitTarget(compareRun.layout, viewport)), reducedMotion ? 80 : 540)
        return () => window.clearTimeout(timer)
      }
      const followScale = compareStartTarget(compareRun.layout, viewport).scale
      setTarget(compareFollowTarget(compareRun.layout, visibleIndex, viewport, followScale))
    }
  }, [compareRun, complete, fit, follow, mode, reducedMotion, setTarget, singleRun, viewport, visibleIndex, visualizationKind])

  const currentPeak = useMemo(() => {
    if (!singleRun) return 1n
    let peak = singleRun.trajectory.values[0]
    for (let index = 1; index <= Math.min(visibleIndex, singleRun.trajectory.values.length - 1); index += 1) {
      if (singleRun.trajectory.values[index] > peak) peak = singleRun.trajectory.values[index]
    }
    return peak
  }, [singleRun, visibleIndex])

  const selectedTrajectory = useMemo(() => {
    if (!compareRun || selectedStart === null) return null
    return compareRun.trajectories.find((trajectory) => trajectory.start === selectedStart) ?? null
  }, [compareRun, selectedStart])

  const selectedSnapshot = useMemo(() => {
    if (!selectedTrajectory) return null
    const index = Math.min(visibleIndex, selectedTrajectory.values.length - 1)
    let peak = selectedTrajectory.values[0]
    for (let stepIndex = 1; stepIndex <= index; stepIndex += 1) {
      if (selectedTrajectory.values[stepIndex] > peak) peak = selectedTrajectory.values[stepIndex]
    }
    return { index, current: selectedTrajectory.values[index], peak }
  }, [selectedTrajectory, visibleIndex])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (entryKind === 'single') {
      const parsed = parsePositiveInteger(singleInput)
      if (!parsed.ok) { setError(parsed.error); return }
      startSingle(parsed.value)
      return
    }
    const parsed = parseComparisonInput(compareInput)
    if (!parsed.ok) { setError(parsed.error); return }
    startCompare(parsed.values)
  }

  const newNumber = () => {
    setPlaying(false)
    setMode('intro')
    setEntryKind(visualizationKind)
    setClean(false)
    setInspection(null)
    historyUrl(null, 'push')
    window.setTimeout(() => document.querySelector<HTMLInputElement>('#start-number')?.focus(), 0)
  }

  const randomize = () => {
    if (visualizationKind === 'compare' || (mode === 'intro' && entryKind === 'compare')) startCompare(randomStarts())
    else startSingle(randomStart())
  }

  const step = () => {
    if (complete) return
    setPlaying(false)
    setVisibleIndex((index) => Math.min(index + 1, maxVisibleIndex))
    setPhase('operation')
  }

  const togglePlay = () => {
    if (mode !== 'visualization') return
    if (complete) {
      setVisibleIndex(0)
      setPhase('operation')
      setPlaying(true)
      if (visualizationKind === 'single' && singleRun) setTarget({ x: singleRun.layout.nodes[0].x, y: singleRun.layout.nodes[0].y, scale: 1.08 })
      if (visualizationKind === 'compare' && compareRun) setTarget(compareStartTarget(compareRun.layout, viewport))
    } else setPlaying((value) => !value)
  }

  const restart = () => {
    setPlaying(false)
    setVisibleIndex(0)
    setPhase('operation')
    if (visualizationKind === 'single' && singleRun) setTarget({ x: singleRun.layout.nodes[0].x, y: singleRun.layout.nodes[0].y, scale: 1.08 })
    if (visualizationKind === 'compare' && compareRun) setTarget(compareStartTarget(compareRun.layout, viewport))
  }

  const fitGraph = () => {
    if (visualizationKind === 'single' && singleRun) fit(singleRun.layout.nodes.slice(0, visibleIndex + 1))
    if (visualizationKind === 'compare' && compareRun) setTarget(compareFitTarget(compareRun.layout, viewport))
  }

  const changeCompareScale = (scale: CompareScale) => {
    if (!compareRun || scale === compareScale) return
    const layout = buildCompareLayout(compareRun.trajectories, scale)
    setCompareScale(scale)
    setCompareRun({ trajectories: compareRun.trajectories, layout })
    const target = complete ? compareFitTarget(layout, viewport) : compareFollowTarget(layout, visibleIndex, viewport, compareStartTarget(layout, viewport).scale)
    setTarget(target)
  }

  const updateComparisonValues = (values: bigint[]) => startCompare(values, 'push', compareScale)
  const addComparisonValue = (value: bigint) => {
    if (!compareRun || compareRun.trajectories.length >= 6) return
    updateComparisonValues([...compareRun.trajectories.map((trajectory) => trajectory.start), value])
  }
  const replaceComparisonValue = (index: number, value: bigint) => {
    if (!compareRun) return
    const values = compareRun.trajectories.map((trajectory) => trajectory.start)
    values[index] = value
    updateComparisonValues(values)
  }
  const removeComparisonValue = (index: number) => {
    if (!compareRun || compareRun.trajectories.length <= 2) return
    updateComparisonValues(compareRun.trajectories.filter((_, itemIndex) => itemIndex !== index).map((trajectory) => trajectory.start))
  }
  const selectTrajectory = (value: bigint) => setSelectedStart((current) => current === value ? null : value)

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
    const activeInput = entryKind === 'single' ? singleInput : compareInput
    const setActiveInput = entryKind === 'single' ? setSingleInput : setCompareInput
    return (
      <main className="intro-page">
        <section className="intro-hero">
          <div className="brand-mark" aria-label="3x plus 1">3X + 1</div>
          <button className="about-button" onClick={() => setAboutOpen(true)}><Info size={15} /> About</button>
          <div className="intro-content">
            <p className="eyebrow">The Collatz conjecture</p>
            <h1>{entryKind === 'single' ? <>Choose a number.<br />Watch where it goes.</> : <>Choose a few numbers.<br />Watch them diverge.</>}</h1>
            <form className="start-form" onSubmit={submit} noValidate>
              <div className="entry-switch" role="group" aria-label="Exploration mode">
                <button type="button" className={entryKind === 'single' ? 'is-active' : ''} onClick={() => { setEntryKind('single'); setError('') }}>Single</button>
                <button type="button" className={entryKind === 'compare' ? 'is-active' : ''} onClick={() => { setEntryKind('compare'); setError('') }}>Compare</button>
              </div>
              <label htmlFor="start-number">{entryKind === 'single' ? 'Starting integer' : 'Starting integers · 2–6'}</label>
              <div className={`number-field ${error ? 'has-error' : ''}`}>
                <input id="start-number" value={activeInput} onChange={(event: ChangeEvent<HTMLInputElement>) => { setActiveInput(event.target.value); setError('') }} inputMode={entryKind === 'single' ? 'numeric' : 'text'} autoComplete="off" spellCheck={false} aria-describedby={error ? 'input-error' : 'rule-note'} />
                <button type="submit">Explore <span aria-hidden>→</span></button>
              </div>
              {error ? <p className="input-error" id="input-error" role="alert">{error}</p> : <p className="rule-note" id="rule-note"><span className="odd-rule">odd → 3n + 1</span><span className="even-rule">even → n ÷ 2</span></p>}
              <button className="random-link" type="button" onClick={randomize}>{entryKind === 'single' ? 'Try a random number' : 'Try four random numbers'}</button>
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

  if (visualizationKind === 'single' && !singleRun) return null
  if (visualizationKind === 'compare' && !compareRun) return null

  const current = singleRun?.trajectory.values[Math.min(visibleIndex, singleRun.trajectory.values.length - 1)] ?? 1n
  const compareValues = compareRun?.trajectories.map((trajectory) => trajectory.start) ?? []
  const anyTruncated = compareRun?.trajectories.some((trajectory) => trajectory.truncated) ?? false
  const tooltipStyle = inspection ? {
    left: Math.min(Math.max(12, inspection.clientX + 14), Math.max(12, viewport.width - 196)),
    top: Math.min(Math.max(74, inspection.clientY - 34), Math.max(74, viewport.height - 130)),
  } : undefined

  return (
    <main className={`visualization-shell ${clean ? 'is-clean' : ''} ${visualizationKind === 'compare' ? 'is-compare' : ''}`}>
      <div
        ref={stageRef}
        className="stage"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
        onDoubleClick={fitGraph}
        aria-label={visualizationKind === 'compare' ? 'Interactive Collatz comparison graph. Drag to pan, scroll or pinch to zoom.' : 'Interactive Collatz graph. Drag to pan, scroll or pinch to zoom.'}
      >
        {visualizationKind === 'single' && singleRun ? (
          <GraphView trajectory={singleRun.trajectory} layout={singleRun.layout} visibleIndex={visibleIndex} phase={phase} camera={camera} complete={complete && singleRun.trajectory.reachedOne} viewport={viewport} />
        ) : compareRun ? (
          <CompareGraphView
            trajectories={compareRun.trajectories}
            layout={compareRun.layout}
            visibleStep={visibleIndex}
            camera={camera}
            viewport={viewport}
            selectedStart={selectedStart}
            onSelect={selectTrajectory}
            onInspect={setInspection}
          />
        ) : null}
      </div>

      <header className="viz-header ui-layer">
        <button className="wordmark" onClick={newNumber} aria-label="Return to start">3X + 1</button>
        <button className="text-button" onClick={() => setAboutOpen(true)}><Info size={14} /> About</button>
      </header>

      {visualizationKind === 'single' && singleRun ? (
        <div className="stats-wrap ui-layer"><Stats start={singleRun.trajectory.start} current={current} steps={visibleIndex} peak={currentPeak} /></div>
      ) : compareRun ? (
        <>
          <CompareLegend
            values={compareValues}
            colors={COMPARE_COLORS}
            selectedStart={selectedStart}
            onSelect={selectTrajectory}
            onAdd={addComparisonValue}
            onReplace={replaceComparisonValue}
            onRemove={removeComparisonValue}
          />
          <div className="scale-toggle ui-layer" role="group" aria-label="Vertical scale">
            <button className={compareScale === 'linear' ? 'is-active' : ''} onClick={() => changeCompareScale('linear')}>LIN</button>
            <button className={compareScale === 'log' ? 'is-active' : ''} onClick={() => changeCompareScale('log')}>LOG</button>
          </div>
          {selectedTrajectory && selectedSnapshot && (
            <dl className="compare-readout ui-layer" aria-label={`Trajectory ${selectedTrajectory.start.toString()} details`}>
              <div className="compare-readout-title">{formatInteger(selectedTrajectory.start, 14)}</div>
              <div><dt>Step</dt><dd>{selectedSnapshot.index}</dd></div>
              <div><dt>Current</dt><dd>{formatInteger(selectedSnapshot.current, 14)}</dd></div>
              <div><dt>Peak</dt><dd>{formatInteger(selectedSnapshot.peak, 14)}</dd></div>
            </dl>
          )}
          {inspection && (
            <div className="compare-tooltip ui-layer" style={tooltipStyle}>
              <strong>{formatInteger(inspection.start, 12)} <span>· step {inspection.step}</span></strong>
              {inspection.next !== undefined && inspection.operation ? (
                <><div>{formatInteger(inspection.value, 12)} → {formatInteger(inspection.next, 12)}</div><small>{inspection.operation}</small></>
              ) : <><div>{formatInteger(inspection.value, 12)}</div><small>reached 1</small></>}
            </div>
          )}
        </>
      ) : null}

      {visualizationKind === 'single' && singleRun?.trajectory.truncated && complete && <div className="limit-note ui-layer">Display paused after 10,000 exact steps. Choose Step/Restart or try a smaller start.</div>}
      {visualizationKind === 'compare' && anyTruncated && complete && <div className="limit-note ui-layer">One or more trajectories reached the 10,000-step safety limit.</div>}

      {!clean && (
        <Controls
          playing={playing}
          complete={complete}
          speed={speed}
          onTogglePlay={togglePlay}
          onStep={step}
          onRestart={restart}
          onNewNumber={newNumber}
          onRandom={randomize}
          onSpeed={setSpeed}
          onFit={fitGraph}
          onFullscreen={enterFullscreen}
          onClean={() => setClean(true)}
          newNumberLabel={visualizationKind === 'compare' ? 'Edit comparison' : 'Choose a new number'}
          randomLabel={visualizationKind === 'compare' ? 'Random comparison' : 'Random number'}
        />
      )}
      {clean && <button className="restore-ui" onClick={() => setClean(false)}>Show controls</button>}
      <div className="gesture-hint ui-layer">drag to pan · scroll / pinch to zoom</div>
      <div className="sr-only" aria-live="polite">{visualizationKind === 'compare' ? `Comparison step ${visibleIndex}.` : `Step ${visibleIndex}. Current value ${current.toString()}.`}</div>
      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </main>
  )
}

function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() }}>
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
