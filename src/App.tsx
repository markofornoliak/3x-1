import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Expand, EyeOff, Info, Save, Share2, X } from 'lucide-react'
import { parsePositiveInteger } from './math/collatz'
import { CompareLegend } from './components/CompareLegend'
import { Timeline } from './components/Timeline'
import { ComputeClient, ComputationCancelledError } from './compute/client'
import { OP_ODD, type ComputedTrajectory, type ContinuationPatch, type SharedTail } from './compute/types'
import { Instrument, COLORS, type Inspection, type RendererDiagnostics } from './visualization/engine/Instrument'
import { applySelectionToUrl, parseComparisonInput, readUrlSelection, type UrlSelection } from './app/urlState'
import { readSessions, writeSessions, type SavedExploration } from './storage/sessions'
import './styles/compare.css'
import './styles/instrument.css'

function shortExact(value: string, max = 18) {
  if (value.length <= max) return value
  return `${value.slice(0, 7)}…${value.slice(-4)}`
}

function mergePatch(previous: ComputedTrajectory, patch: ContinuationPatch): ComputedTrajectory {
  const operations = new Uint8Array(previous.operations.length + patch.appendedOperations.length)
  operations.set(previous.operations)
  operations.set(patch.appendedOperations, previous.operations.length)
  return {
    ...previous,
    values: [...previous.values, ...patch.appendedValues],
    operations,
    peak: patch.peak,
    peakStep: patch.peakStep,
    reachedOne: patch.reachedOne,
    truncated: patch.truncated,
    totalSteps: patch.totalSteps,
    continuationToken: patch.continuationToken,
    continuationAvailable: patch.continuationAvailable,
    geometry: patch.geometry,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [selection, setSelection] = useState<UrlSelection | null>(() => readUrlSelection(window.location.search))
  const [mode, setMode] = useState<'intro' | 'visualization'>(() => selection ? 'visualization' : 'intro')
  const [entryKind, setEntryKind] = useState<'single' | 'compare'>(() => selection?.kind ?? 'single')
  const [singleInput, setSingleInput] = useState(() => selection?.kind === 'single' ? String(selection.values[0]) : '27')
  const [compareInput, setCompareInput] = useState(() => selection?.kind === 'compare' ? selection.values.join(', ') : '7, 27, 31, 97')
  const [error, setError] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [clean, setClean] = useState(false)
  const [selectedStart, setSelectedStart] = useState<bigint | null>(null)
  const [visible, setVisible] = useState<boolean[]>(() => selection?.values.map(() => true) ?? [])
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [engineError, setEngineError] = useState('')
  const [client, setClient] = useState<ComputeClient | null>(null)
  const [workerSessionId, setWorkerSessionId] = useState('')
  const workerSessionIdRef = useRef('')
  const [trajectories, setTrajectories] = useState<ComputedTrajectory[]>([])
  const [sharedTails, setSharedTails] = useState<SharedTail[]>([])
  const [computeState, setComputeState] = useState<'idle' | 'loading' | 'ready' | 'cancelled' | 'error'>('idle')
  const [computeMessage, setComputeMessage] = useState('')
  const [continuingIndex, setContinuingIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [timeline, setTimeline] = useState({ step: 0, maxStep: 0, progress: 1, playing: false })
  const [sessionStore, setSessionStore] = useState(() => readSessions())
  const [pendingRestore, setPendingRestore] = useState<SavedExploration | null>(null)
  const [exporting, setExporting] = useState('')
  const [notice, setNotice] = useState('')
  const [diagnostics, setDiagnostics] = useState<RendererDiagnostics | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<Instrument | null>(null)
  const previousSeriesKey = useRef('')

  useEffect(() => {
    const instance = new ComputeClient()
    setClient(instance)
    return () => instance.destroy()
  }, [])

  const start = useCallback((next: UrlSelection) => {
    setSelection(next)
    setMode('visualization')
    setEntryKind(next.kind)
    setSelectedStart(null)
    setVisible(next.values.map(() => true))
    setClean(false)
    setInspection(null)
    setError('')
    setNotice('')
    if (next.kind === 'single') setSingleInput(String(next.values[0]))
    else setCompareInput(next.values.join(', '))
    window.history.pushState({}, '', applySelectionToUrl(new URL(window.location.href), next))
  }, [])

  useEffect(() => {
    const pop = () => {
      const next = readUrlSelection(window.location.search)
      setSelection(next)
      setMode(next ? 'visualization' : 'intro')
      setEntryKind(next?.kind ?? 'single')
      setVisible(next?.values.map(() => true) ?? [])
      if (next?.kind === 'single') setSingleInput(String(next.values[0]))
      else if (next?.kind === 'compare') setCompareInput(next.values.join(', '))
      setInspection(null)
      setSelectedStart(null)
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    if (!client || mode !== 'visualization' || !selection) return
    const sessionId = crypto.randomUUID()
    workerSessionIdRef.current = sessionId
    setWorkerSessionId(sessionId)
    setComputeState('loading')
    setComputeMessage('Preparing exact trajectories…')
    setTrajectories([])
    setSharedTails([])
    setInspection(null)
    let alive = true

    client.compute(sessionId, selection.values.map(String), {
      onProgress: (progress) => {
        if (!alive) return
        setComputeMessage(`Start ${progress.start} · ${progress.steps.toLocaleString()} exact steps`)
      },
      onSeries: (index, trajectory) => {
        if (!alive) return
        setTrajectories((previous) => {
          const next = [...previous]
          next[index] = trajectory
          return next
        })
      },
    }).then((result) => {
      if (!alive || workerSessionIdRef.current !== sessionId) return
      setTrajectories(result.trajectories)
      setSharedTails(result.sharedTails)
      setComputeState('ready')
      setComputeMessage('')
    }).catch((reason: unknown) => {
      if (!alive) return
      if (reason instanceof ComputationCancelledError) {
        setComputeState('cancelled')
        setComputeMessage('Computation cancelled.')
      } else {
        setComputeState('error')
        setComputeMessage(reason instanceof Error ? reason.message : 'Computation failed.')
      }
    })

    return () => {
      alive = false
      client.cancelActive()
    }
  }, [client, mode, selection])

  useEffect(() => {
    if (mode !== 'visualization' || !canvas.current) return
    try {
      const instance = new Instrument(canvas.current, {
        inspect: setInspection,
        playback: setPlaying,
        timeline: setTimeline,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
      engine.current = instance
      setEngineError('')
      return () => {
        instance.destroy()
        engine.current = null
        previousSeriesKey.current = ''
      }
    } catch (reason) {
      setEngineError(reason instanceof Error ? reason.message : 'Rendering unavailable.')
    }
  }, [mode])

  useEffect(() => {
    const instance = engine.current
    if (!instance || !trajectories.length) return
    const key = trajectories.map((trajectory) => trajectory?.start ?? '').join('|')
    const preserve = key === previousSeriesKey.current && key !== ''
    instance.setTrajectories(trajectories, preserve)
    visible.forEach((flag, index) => instance.setVisibility(index, flag))
    instance.setSpeed(speed)
    previousSeriesKey.current = key
  }, [trajectories])

  useEffect(() => {
    visible.forEach((flag, index) => engine.current?.setVisibility(index, flag))
  }, [visible])

  useEffect(() => { engine.current?.setSpeed(speed) }, [speed])

  useEffect(() => {
    if (!pendingRestore || computeState !== 'ready' || !engine.current || !selection || trajectories.length !== selection.values.length) return
    setVisible(pendingRestore.visibility)
    pendingRestore.visibility.forEach((flag, index) => engine.current?.setVisibility(index, flag))
    const restoredSelected = pendingRestore.selectedStart ? BigInt(pendingRestore.selectedStart) : null
    setSelectedStart(restoredSelected)
    if (restoredSelected !== null) {
      const index = trajectories.findIndex((trajectory) => trajectory.start === restoredSelected.toString())
      if (index >= 0) engine.current.focusTrajectory(index)
    }
    setSpeed(pendingRestore.playback.speed)
    engine.current.setSpeed(pendingRestore.playback.speed)
    engine.current.setStep(pendingRestore.playback.step)
    if (pendingRestore.camera) engine.current.restoreCamera(pendingRestore.camera)
    setPendingRestore(null)
  }, [computeState, pendingRestore, selection, trajectories])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (entryKind === 'single') {
      const parsed = parsePositiveInteger(singleInput)
      if (!parsed.ok) { setError(parsed.error); return }
      start({ kind: 'single', values: [parsed.value] })
    } else {
      const parsed = parseComparisonInput(compareInput)
      if (!parsed.ok) { setError(parsed.error); return }
      start({ kind: 'compare', values: parsed.values })
    }
  }

  const randomize = () => {
    const random = () => BigInt(2 + Math.floor(Math.random() * 99_998))
    if (entryKind === 'single') {
      start({ kind: 'single', values: [random()] })
      return
    }
    const values = new Set<bigint>()
    while (values.size < 4) values.add(random())
    start({ kind: 'compare', values: [...values] })
  }

  const newNumber = () => {
    setSelection(null)
    setMode('intro')
    setPlaying(false)
    setClean(false)
    setTrajectories([])
    setSharedTails([])
    workerSessionIdRef.current = ''
    window.history.pushState({}, '', applySelectionToUrl(new URL(window.location.href), null))
  }

  const updateValues = (values: bigint[]) => start({ kind: 'compare', values })

  const selectTrajectory = (value: bigint) => {
    const next = selectedStart === value ? null : value
    setSelectedStart(next)
    const index = next === null ? null : trajectories.findIndex((trajectory) => trajectory.start === next.toString())
    engine.current?.focusTrajectory(index === -1 ? null : index)
  }

  const activeIndex = useMemo(() => {
    if (!trajectories.length) return -1
    if (selectedStart === null) return 0
    const index = trajectories.findIndex((trajectory) => trajectory.start === selectedStart.toString())
    return index >= 0 ? index : 0
  }, [selectedStart, trajectories])
  const active = activeIndex >= 0 ? trajectories[activeIndex] : null

  const continueActive = async () => {
    if (!client || !workerSessionId || !active || activeIndex < 0 || continuingIndex !== null) return
    const sessionId = workerSessionId
    setContinuingIndex(activeIndex)
    setComputeMessage(`Continuing start ${active.start}…`)
    try {
      const result = await client.continue(sessionId, activeIndex, {
        onProgress: (progress) => {
          if (workerSessionIdRef.current === sessionId) setComputeMessage(`Start ${progress.start} · ${progress.steps.toLocaleString()} exact steps`)
        },
      })
      if (workerSessionIdRef.current !== sessionId) return
      setTrajectories((previous) => previous.map((trajectory, index) => index === result.index ? mergePatch(trajectory, result.patch) : trajectory))
      setSharedTails(result.sharedTails)
      setComputeMessage('')
    } catch (reason) {
      if (workerSessionIdRef.current === sessionId) setComputeMessage(reason instanceof Error ? reason.message : 'Continuation failed.')
    } finally {
      if (workerSessionIdRef.current === sessionId) setContinuingIndex(null)
    }
  }

  const persistSessions = (sessions: SavedExploration[]) => {
    const warning = writeSessions(sessions)
    setSessionStore({ sessions, warning })
  }

  const saveExploration = () => {
    if (!selection || !engine.current) return
    const suggested = selection.values.map(String).join(' · ').slice(0, 56)
    const name = window.prompt('Name this exploration', suggested)
    if (name === null) return
    const now = new Date().toISOString()
    const saved: SavedExploration = {
      version: 2,
      id: crypto.randomUUID(),
      name: name.trim() || suggested || 'Saved exploration',
      createdAt: now,
      updatedAt: now,
      selection: { kind: selection.kind, values: selection.values.map(String) },
      visibility: selection.values.map((_, index) => visible[index] !== false),
      selectedStart: selectedStart?.toString() ?? null,
      camera: engine.current.getCamera(),
      playback: { step: timeline.step, speed },
    }
    persistSessions([saved, ...sessionStore.sessions].slice(0, 50))
    setNotice('Exploration saved locally in this browser.')
  }

  const openSaved = (saved: SavedExploration) => {
    const values = saved.selection.values.map(BigInt)
    const next: UrlSelection = saved.selection.kind === 'single'
      ? { kind: 'single', values: [values[0]] }
      : { kind: 'compare', values }
    setPendingRestore(saved)
    start(next)
  }

  const renameSaved = (saved: SavedExploration) => {
    const name = window.prompt('Rename exploration', saved.name)
    if (name === null) return
    persistSessions(sessionStore.sessions.map((item) => item.id === saved.id ? { ...item, name: name.trim() || item.name, updatedAt: new Date().toISOString() } : item))
  }

  const deleteSaved = (id: string) => {
    persistSessions(sessionStore.sessions.filter((item) => item.id !== id))
  }

  const exportExact = async (format: 'json' | 'csv') => {
    if (!client || !workerSessionId || computeState !== 'ready') return
    setExporting(format)
    try {
      const blob = await client.export(workerSessionId, format)
      const startLabel = selection?.values.map(String).join('-').slice(0, 42) || 'exploration'
      downloadBlob(blob, `collatz-${startLabel}.${format}`)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Export failed.')
    } finally {
      setExporting('')
    }
  }

  const exportPng = async () => {
    if (!engine.current) return
    setExporting('png')
    try {
      const context = selection ? `3x+1 · ${selection.values.map(String).join(', ')} · step/value space` : '3x+1'
      const blob = await engine.current.exportPng(context)
      downloadBlob(blob, 'collatz-visualization.png')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'PNG export failed.')
    } finally {
      setExporting('')
    }
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Share link copied.')
    } catch {
      setNotice('Copy the current URL from the browser address bar to share this exploration.')
    }
  }

  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setNotice('Fullscreen is not available in this browser.')
    }
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
            <h1>{entryKind === 'single' ? <>Choose a number.<br />Follow the trajectory.</> : <>Compare trajectories.<br />Find where they merge.</>}</h1>
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
        </section>
        <section className="editorial" id="the-problem">
          <p className="eyebrow">One rule. Infinite complexity.</p>
          <h2>Simple enough to explain in seconds. Still unproved.</h2>
          <div className="editorial-grid">
            <p>Start with any positive integer. If it is even, divide it by two. If it is odd, multiply it by three and add one. Then repeat.</p>
            <p>Every starting value tested so far eventually reaches 1. No proof is known that this happens for every positive integer. A safety limit in this instrument is only a computation boundary, never a mathematical conclusion.</p>
          </div>
          <div className="rule-display"><span>n even</span><strong>n ÷ 2</strong><span>n odd</span><strong>3n + 1</strong></div>
        </section>
        {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
      </main>
    )
  }

  const inspectionRows = inspection?.hits.map((hit) => {
    const trajectory = trajectories[hit.series]
    const value = trajectory?.values[hit.step]
    return trajectory && value ? { hit, trajectory, value } : null
  }).filter((row): row is NonNullable<typeof row> => row !== null) ?? []

  const relatedTails = activeIndex >= 0 ? sharedTails.filter((tail) => tail.a === activeIndex || tail.b === activeIndex) : []

  return (
    <main className={`visualization-shell instrument ${clean ? 'is-clean' : ''}`}>
      <canvas
        ref={canvas}
        className="stage instrument-canvas"
        tabIndex={0}
        aria-label="Collatz scientific instrument. Drag or use one finger to pan. Pinch or scroll to zoom around the pointer. Arrow keys pan, plus and minus zoom, zero resets, and space toggles playback."
        aria-describedby="trajectory-summary"
      >Interactive trajectory visualization. Exact summaries follow below.</canvas>

      <header className="viz-header ui-layer">
        <button className="wordmark" onClick={newNumber}>3X + 1</button>
        <div className="instrument-actions">
          <button onClick={() => engine.current?.fitToData()}>Reset</button>
          <details className="instrument-menu">
            <summary>Session</summary>
            <div className="instrument-popover session-popover">
              <button onClick={saveExploration}><Save size={14} /> Save current</button>
              {sessionStore.sessions.length ? <div className="saved-list">
                {sessionStore.sessions.map((saved) => <div className="saved-row" key={saved.id}>
                  <button className="saved-open" onClick={() => openSaved(saved)} title={saved.name}>{saved.name}</button>
                  <button onClick={() => renameSaved(saved)}>Rename</button>
                  <button onClick={() => deleteSaved(saved.id)}>Delete</button>
                </div>)}
              </div> : <p>No saved explorations yet.</p>}
              {sessionStore.warning && <p className="menu-warning">{sessionStore.warning}</p>}
            </div>
          </details>
          <details className="instrument-menu">
            <summary>Export</summary>
            <div className="instrument-popover">
              <button onClick={exportPng} disabled={Boolean(exporting)}><Download size={14} /> PNG</button>
              <button onClick={() => void exportExact('json')} disabled={computeState !== 'ready' || Boolean(exporting)}>Exact JSON</button>
              <button onClick={() => void exportExact('csv')} disabled={computeState !== 'ready' || Boolean(exporting)}>Exact CSV</button>
            </div>
          </details>
          <button onClick={() => void share()} aria-label="Copy share link"><Share2 size={15} /></button>
          <details className="instrument-menu">
            <summary>View</summary>
            <div className="instrument-popover">
              <button onClick={newNumber}>Edit input</button>
              <button onClick={randomize}>Random</button>
              <button onClick={() => void enterFullscreen()}><Expand size={14} /> Fullscreen</button>
              <button onClick={() => setClean(true)}><EyeOff size={14} /> Clean view</button>
            </div>
          </details>
          <button onClick={() => setAboutOpen(true)} aria-label="About"><Info size={16} /></button>
        </div>
      </header>

      {selection?.kind === 'compare' && (
        <CompareLegend
          values={selection.values}
          colors={COLORS}
          visible={visible}
          selectedStart={selectedStart}
          onSelect={selectTrajectory}
          onVisibility={(index, flag) => setVisible((previous) => previous.map((item, itemIndex) => itemIndex === index ? flag : item))}
          onAdd={(value) => updateValues([...selection.values, value])}
          onReplace={(index, value) => updateValues(selection.values.map((item, itemIndex) => itemIndex === index ? value : item))}
          onRemove={(index) => updateValues(selection.values.filter((_, itemIndex) => itemIndex !== index))}
        />
      )}

      {active && (
        <dl className={`instrument-stats ui-layer ${selection?.kind === 'compare' ? 'comparison-stats' : ''}`}>
          <div><dt>Starting integer</dt><dd title={active.start}>{shortExact(active.start)}</dd></div>
          <div><dt>{active.truncated ? 'Computed steps' : 'Total steps'}</dt><dd>{active.totalSteps.toLocaleString()}</dd></div>
          <div><dt>Peak value</dt><dd title={active.peak}>{shortExact(active.peak)}</dd></div>
          <div><dt>Peak step</dt><dd>{active.peakStep.toLocaleString()}</dd></div>
        </dl>
      )}

      {relatedTails.length > 0 && selection?.kind === 'compare' && (
        <div className="shared-tail ui-layer" aria-live="polite">
          {relatedTails.slice(0, 3).map((tail) => {
            const otherIndex = tail.a === activeIndex ? tail.b : tail.a
            const activeStep = tail.a === activeIndex ? tail.stepA : tail.stepB
            const otherStep = tail.a === activeIndex ? tail.stepB : tail.stepA
            const otherStart = selection.values[otherIndex]?.toString() ?? `T${otherIndex + 1}`
            return <p key={`${tail.a}-${tail.b}`}>
              Shared tail at <strong title={tail.value}>{shortExact(tail.value, 14)}</strong> · this step {activeStep.toLocaleString()} · start {shortExact(otherStart, 10)} step {otherStep.toLocaleString()} · {tail.verifiedValues.toLocaleString()} computed values verified
            </p>
          })}
        </div>
      )}

      {inspection && inspectionRows.length > 0 && (
        <div className="instrument-inspector ui-layer" style={{ left: Math.max(12, Math.min(window.innerWidth - 316, inspection.x + 18)), top: Math.max(132, Math.min(window.innerHeight - 260, inspection.y + 18)) }}>
          <div>{inspectionRows.length > 1 ? `${inspectionRows.length} nearby trajectories` : 'Exact inspection'}</div>
          {inspectionRows.slice(0, 6).map(({ hit, trajectory, value }) => (
            <section key={`${hit.series}-${hit.step}`}>
              <small>Start {shortExact(trajectory.start, 14)} · step {hit.step.toLocaleString()}</small>
              <strong title={value}>{value}</strong>
              <em>{hit.step >= trajectory.operations.length ? (trajectory.reachedOne ? 'Reached 1' : 'Computed boundary') : trajectory.operations[hit.step] === OP_ODD ? 'Odd · 3n + 1' : 'Even · n / 2'}</em>
            </section>
          ))}
        </div>
      )}

      {computeState === 'loading' && <p className="instrument-status ui-layer" aria-live="polite">{computeMessage}</p>}
      {computeState === 'error' && <p className="instrument-error ui-layer" role="alert">{computeMessage}</p>}
      {computeMessage && continuingIndex !== null && <p className="instrument-status ui-layer" aria-live="polite">{computeMessage}</p>}
      {engineError && <p className="instrument-error ui-layer" role="alert">{engineError} Exact trajectory summaries remain available below.</p>}

      {active?.truncated && (
        <div className="instrument-limit ui-layer">
          <span>{active.totalSteps.toLocaleString()}-step computed boundary reached. This does not establish convergence or divergence.</span>
          {active.continuationAvailable
            ? <button onClick={() => void continueActive()} disabled={continuingIndex !== null}>{continuingIndex === activeIndex ? 'Continuing…' : 'Continue +10,000'}</button>
            : <span>Bounded local continuation limit reached.</span>}
        </div>
      )}

      {trajectories.length > 0 && !clean && (
        <Timeline
          step={timeline.step}
          maxStep={timeline.maxStep}
          playing={playing}
          speed={speed}
          onTogglePlay={() => engine.current?.setPlaying(!playing)}
          onRestart={() => engine.current?.restart()}
          onStep={(step) => engine.current?.goToStep(step, activeIndex >= 0 ? activeIndex : null)}
          onSpeed={(next) => { setSpeed(next); engine.current?.setSpeed(next) }}
          onPeak={() => { if (activeIndex >= 0) engine.current?.jumpToPeak(activeIndex) }}
          onEnd={() => { if (activeIndex >= 0) engine.current?.jumpToEnd(activeIndex) }}
        />
      )}

      {clean && <button className="restore-ui" onClick={() => setClean(false)}>Show controls</button>}
      {notice && <button className="instrument-notice ui-layer" onClick={() => setNotice('')}>{notice}</button>}

      <details className="accessible-summary ui-layer" id="trajectory-summary">
        <summary>Exact data & diagnostics</summary>
        <div className="summary-content">
          <p>All trajectory values are exact decimal integers. The plot uses a shared horizontal step axis and log₂(value) vertically.</p>
          {trajectories.map((trajectory, trajectoryIndex) => <section key={trajectory.start}>
            <h2>Start {trajectory.start}</h2>
            <p>{trajectory.totalSteps.toLocaleString()} computed steps. Peak {trajectory.peak} at step {trajectory.peakStep}. {trajectory.reachedOne ? 'Reached 1.' : 'Stopped at a bounded computation limit; no convergence or divergence conclusion is implied.'}</p>
            <label>Inspect step <input type="number" min="0" max={trajectory.totalSteps} defaultValue="0" onChange={(event) => {
              const step = Math.max(0, Math.min(trajectory.totalSteps, Number(event.target.value) || 0))
              const output = event.currentTarget.parentElement?.nextElementSibling
              const value = trajectory.values[step]
              if (output) output.textContent = `Step ${step}: ${value}. ${step >= trajectory.operations.length ? (trajectory.reachedOne ? 'Reached 1.' : 'Computed boundary.') : trajectory.operations[step] === OP_ODD ? 'Odd. Next: 3n + 1.' : 'Even. Next: n / 2.'}`
              engine.current?.goToStep(step, trajectoryIndex)
            }} /></label>
            <p aria-live="polite">Step 0: {trajectory.start}.</p>
          </section>)}
          <button className="diagnostics-button" onClick={() => setDiagnostics(engine.current?.getDiagnostics() ?? null)}>Sample renderer diagnostics</button>
          {diagnostics && <p>Renderer samples: {diagnostics.samples}. Draw average {diagnostics.drawAverageMs.toFixed(2)} ms, draw p95 {diagnostics.drawP95Ms.toFixed(2)} ms; complete frame average {diagnostics.frameAverageMs.toFixed(2)} ms, frame p95 {diagnostics.frameP95Ms.toFixed(2)} ms.</p>}
        </div>
      </details>

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </main>
  )
}

function About({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button, a, input') ?? [])]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panel} className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <p className="eyebrow">About the instrument</p>
        <h2 id="about-title">Exact arithmetic. Bounded computation. No mathematical overclaim.</h2>
        <p>For a positive integer <em>n</em>: divide by two when it is even; otherwise compute 3n + 1. Repeat.</p>
        <p>All displayed source values are exact integers. Expensive trajectory calculation and geometry preparation run in a cancellable Web Worker so interaction can remain responsive.</p>
        <p>Comparison uses one shared step/value coordinate system. When two paths reach the same exact integer at different steps, the instrument reports both step numbers and identifies the common subsequent sequence.</p>
        <p className="about-note">A truncation or continuation limit is only a resource boundary. It is not evidence that an uncompleted trajectory converges or diverges.</p>
      </section>
    </div>
  )
}
