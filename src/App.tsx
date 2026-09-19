import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Info, X } from 'lucide-react'
import { buildTrajectory, parsePositiveInteger } from './math/collatz'
import { CompareLegend } from './components/CompareLegend'
import { Controls } from './components/Controls'
import { Instrument, COLORS, type Inspection } from './visualization/engine/Instrument'
import { applySelectionToUrl, parseComparisonInput, readUrlSelection, type UrlSelection } from './app/urlState'
import './styles/compare.css'
import './styles/instrument.css'

export default function App() {
  const [selection, setSelection] = useState<UrlSelection | null>(() => readUrlSelection(window.location.search))
  const [mode, setMode] = useState<'intro' | 'visualization'>(() => selection ? 'visualization' : 'intro')
  const [entryKind, setEntryKind] = useState<'single' | 'compare'>(() => selection?.kind ?? 'single')
  const [singleInput, setSingleInput] = useState(() => selection?.kind === 'single' ? String(selection.values[0]) : '27')
  const [compareInput, setCompareInput] = useState(() => selection?.kind === 'compare' ? selection.values.join(', ') : '7, 27, 31, 97')
  const [error, setError] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [clean, setClean] = useState(false)
  const [selectedStart, setSelectedStart] = useState<bigint | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [engineError, setEngineError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<Instrument | null>(null)
  const trajectories = useMemo(() => selection?.values.map(value => buildTrajectory(value)) ?? [], [selection])
  const start = useCallback((next: UrlSelection) => {
    setSelection(next); setMode('visualization'); setEntryKind(next.kind); setSelectedStart(null); setClean(false); setInspection(null); setError('')
    if (next.kind === 'single') setSingleInput(String(next.values[0])); else setCompareInput(next.values.join(', '))
    window.history.pushState({}, '', applySelectionToUrl(new URL(window.location.href), next))
  }, [])
  useEffect(() => {
    const pop = () => { const next = readUrlSelection(window.location.search); setSelection(next); setMode(next ? 'visualization' : 'intro'); setEntryKind(next?.kind ?? 'single'); if (next?.kind === 'single') setSingleInput(String(next.values[0])); else if (next?.kind === 'compare') setCompareInput(next.values.join(', ')); setInspection(null); setSelectedStart(null) }
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => {
    if (mode !== 'visualization' || !canvas.current) return
    try {
      const instance = new Instrument(canvas.current, { inspect: setInspection, playback: setPlaying, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
      engine.current = instance
      return () => { instance.destroy(); engine.current = null }
    } catch (e) { setEngineError(e instanceof Error ? e.message : 'Rendering unavailable.') }
  }, [mode])
  useEffect(() => { if (mode === 'visualization') engine.current?.setTrajectories(trajectories) }, [trajectories, mode])
  useEffect(() => { engine.current?.setSpeed(speed) }, [speed, mode])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (entryKind === 'single') { const parsed = parsePositiveInteger(singleInput); if (!parsed.ok) { setError(parsed.error); return }; start({ kind: 'single', values: [parsed.value] }) }
    else { const parsed = parseComparisonInput(compareInput); if (!parsed.ok) { setError(parsed.error); return }; start({ kind: 'compare', values: parsed.values }) }
  }
  const randomize = () => {
    const random = () => BigInt(2 + Math.floor(Math.random() * 99998))
    const values = new Set<bigint>(); while (values.size < 4) values.add(random())
    start(entryKind === 'compare' ? { kind: 'compare', values: [...values] } : { kind: 'single', values: [random()] })
  }
  const newNumber = () => { setMode('intro'); setPlaying(false); setClean(false); window.history.pushState({}, '', applySelectionToUrl(new URL(window.location.href), null)) }
  const updateValues = (values: bigint[]) => start({ kind: 'compare', values })
  const selectTrajectory = (value: bigint) => { const next = selectedStart === value ? null : value; setSelectedStart(next); engine.current?.focusTrajectory(next === null ? null : trajectories.findIndex(t => t.start === next)) }
  const enterFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { /* Browser may not support fullscreen. */ } }
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

  const active = trajectories.find(t => t.start === selectedStart) ?? trajectories[0]
  const inspected = inspection ? trajectories[inspection.series] : null
  const value = inspection && inspected ? inspected.values[inspection.step] : null
  return <main className={`visualization-shell instrument ${clean ? 'is-clean' : ''}`}>
    <canvas ref={canvas} className="stage instrument-canvas" tabIndex={0} aria-label="Collatz instrument. Drag to pan, pinch or scroll to zoom. Arrow keys pan, plus and minus zoom, zero resets. Tap a path to inspect." aria-describedby="trajectory-summary">Interactive trajectory visualization. Exact summaries follow below.</canvas>
    <header className="viz-header ui-layer"><button className="wordmark" onClick={newNumber}>3X + 1</button><div className="instrument-actions"><button onClick={() => engine.current?.fitToData()}>Reset View</button><button onClick={() => setAboutOpen(true)} aria-label="About"><Info size={16}/></button></div></header>
    {selection?.kind === 'compare' && <CompareLegend values={selection.values} colors={COLORS} selectedStart={selectedStart} onSelect={selectTrajectory} onAdd={v => updateValues([...selection.values, v])} onReplace={(i, v) => updateValues(selection.values.map((n, j) => i === j ? v : n))} onRemove={i => updateValues(selection.values.filter((_, j) => i !== j))}/>}
    {active && <dl className={`instrument-stats ui-layer ${selection?.kind === 'compare' ? 'comparison-stats' : ''}`}>
      <div><dt>Starting integer</dt><dd title={String(active.start)}>{String(active.start)}</dd></div>
      <div><dt>{active.truncated ? 'Computed steps' : 'Total steps'}</dt><dd>{active.steps.length}</dd></div>
      <div><dt>Peak value</dt><dd title={String(active.peak)}>{String(active.peak)}</dd></div>
      <div><dt>Peak step</dt><dd>{active.values.indexOf(active.peak)}</dd></div>
    </dl>}
    {inspection && inspected && value !== null && <div className="instrument-inspector ui-layer" style={{ left: Math.max(12, Math.min(window.innerWidth - 292, inspection.x + 18)), top: Math.max(160, Math.min(window.innerHeight - 230, inspection.y + 18)) }}>
      <div>Start {String(inspected.start)} · step {inspection.step}</div><strong>{String(value)}</strong><small>{value === 1n ? 'Reached 1' : value % 2n === 0n ? 'Even · n / 2' : 'Odd · 3n + 1'}</small>
    </div>}
    {trajectories.some(t => t.truncated) && <p className="instrument-limit ui-layer">10,000-step safety limit reached; convergence has not been established for the truncated paths.</p>}
    {engineError && <p className="instrument-error" role="alert">{engineError} Exact trajectory summaries remain available below.</p>}
    {!clean && <Controls playing={playing} complete={false} speed={speed} onTogglePlay={() => engine.current?.setPlaying(!playing)} onStep={() => engine.current?.step()} onRestart={() => { engine.current?.setPlaying(false); engine.current?.setProgress(0) }} onNewNumber={newNumber} onRandom={randomize} onSpeed={setSpeed} onFit={() => engine.current?.fitToData()} onFullscreen={enterFullscreen} onClean={() => setClean(true)} newNumberLabel={selection?.kind === 'compare' ? 'Edit comparison' : 'Choose a new number'} />}
    {clean && <button className="restore-ui" onClick={() => setClean(false)}>Show controls</button>}
    <details className="accessible-summary ui-layer" id="trajectory-summary"><summary>Exact data</summary><div className="summary-content">
      <p>Steps share a horizontal scale. Height represents log₂(value). All values below are exact integers.</p>
      {trajectories.map(t => <section key={String(t.start)}><h2>Start {String(t.start)}</h2><p>{t.steps.length} computed steps. Peak {String(t.peak)} at step {t.values.indexOf(t.peak)}. {t.reachedOne ? 'Reached 1.' : 'Stopped at the safety limit; not known to converge from this computation.'}</p><label>Inspect step <input type="number" min="0" max={t.steps.length} defaultValue="0" onChange={event => { const step = Math.max(0, Math.min(t.steps.length, Number(event.target.value) || 0)); const output = event.currentTarget.parentElement?.nextElementSibling; if (output) output.textContent = `Step ${step}: ${t.values[step]}. ${t.values[step] === 1n ? 'Reached 1.' : t.values[step] % 2n === 0n ? 'Even. Next: n / 2.' : 'Odd. Next: 3n + 1.'}` }}/></label><p aria-live="polite">Step 0: {String(t.start)}.</p></section>)}
    </div></details>
    {aboutOpen && <About onClose={() => setAboutOpen(false)}/>}
  </main>
}

function About({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') { event.preventDefault(); panel.current?.querySelector<HTMLButtonElement>('button')?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])
  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panel} className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
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
