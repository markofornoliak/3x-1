import type { ComputedTrajectory } from '../../compute/types'
import { advanceProgress, progressForStep, stepForProgress, type PlaybackState } from '../playback'
import { fitCamera, hydrateSeries, lowerBound, nearest, project, unproject, zoomAt, type Camera, type Point, type Series } from '../geometry'

export const COLORS = ['#9edbe7', '#f0b184', '#9fb8ff', '#cfafe6', '#a7d6a0', '#f0a1b2']

export interface InspectionHit {
  series: number
  step: number
  distance: number
}

export interface Inspection {
  x: number
  y: number
  hits: InspectionHit[]
}

export interface RendererDiagnostics {
  samples: number
  drawAverageMs: number
  drawP95Ms: number
  frameAverageMs: number
  frameP95Ms: number
}

export interface EngineOptions {
  inspect: (hit: Inspection | null) => void
  playback: (playing: boolean) => void
  timeline: (state: PlaybackState) => void
  reducedMotion: boolean
}

function percentile(values: readonly number[], p: number) {
  if (!values.length) return 0
  const copy = [...values].sort((a, b) => a - b)
  return copy[Math.min(copy.length - 1, Math.floor((copy.length - 1) * p))]
}

export class Instrument {
  private ctx: CanvasRenderingContext2D
  private series: Series[] = []
  private visible: boolean[] = []
  private camera: Camera = { x: 0, y: 1, sx: 1, sy: 1 }
  private target: Camera | null = null
  private width = 1
  private height = 1
  private progress = 1
  private playing = false
  private speed = 1
  private selected: number | null = null
  private hovered: Inspection | null = null
  private frame = 0
  private last = 0
  private dirty = true
  private observer: ResizeObserver
  private pointers = new Map<number, Point>()
  private down: Point | null = null
  private moved = false
  private multiTouch = false
  private lastTap = 0
  private disposers: (() => void)[] = []
  private lastTimelineNotify = 0
  private drawSamples: number[] = []
  private frameSamples: number[] = []

  constructor(private canvas: HTMLCanvasElement, private options: EngineOptions) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.')
    this.ctx = ctx
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()

    this.listen('wheel', (event) => {
      event.preventDefault()
      this.target = null
      const raw = event.deltaY * (event.deltaMode === 1 ? 16 : 1)
      const factor = Math.exp(-Math.max(-150, Math.min(150, raw)) * .004)
      this.camera = zoomAt(this.camera, this.point(event), factor)
      this.clearInspection()
      this.invalidate()
    })

    this.listen('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      this.canvas.focus({ preventScroll: true })
      this.canvas.setPointerCapture(event.pointerId)
      const p = this.point(event)
      this.pointers.set(event.pointerId, p)
      this.down = p
      this.moved = false
      if (this.pointers.size > 1) this.multiTouch = true
      this.target = null
    })

    this.listen('pointermove', (event) => {
      const p = this.point(event)
      const old = this.pointers.get(event.pointerId)
      if (!old) {
        if (event.pointerType === 'mouse') this.inspect(p)
        return
      }

      const before = [...this.pointers.values()]
      this.pointers.set(event.pointerId, p)
      if (this.down && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) this.moved = true

      if (before.length === 1) {
        this.camera.x -= (p.x - old.x) / this.camera.sx
        this.camera.y += (p.y - old.y) / this.camera.sy
      } else {
        const after = [...this.pointers.values()]
        const center = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
        const anchorBefore = center(before)
        const anchorAfter = center(after)
        const beforeDistance = Math.max(1, Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y))
        const afterDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y)
        this.camera = zoomAt(this.camera, anchorBefore, afterDistance / beforeDistance)
        this.camera.x -= (anchorAfter.x - anchorBefore.x) / this.camera.sx
        this.camera.y += (anchorAfter.y - anchorBefore.y) / this.camera.sy
      }
      this.clearInspection()
      this.invalidate()
    })

    this.listen('pointerup', (event) => {
      if (!this.moved && !this.multiTouch) {
        if (event.pointerType !== 'mouse' && performance.now() - this.lastTap < 320) this.fitToData()
        else this.inspect(this.point(event))
        this.lastTap = performance.now()
      }
      this.pointers.delete(event.pointerId)
      if (!this.pointers.size) this.multiTouch = false
    })

    this.listen('pointercancel', (event) => {
      this.pointers.delete(event.pointerId)
      if (!this.pointers.size) this.multiTouch = false
    })
    this.listen('pointerleave', () => { if (!this.pointers.size) this.clearInspection() })
    this.listen('dblclick', () => this.fitToData())
    this.listen('keydown', (event) => this.keyboard(event))
  }

  private listen<K extends keyof HTMLElementEventMap>(name: K, fn: (event: HTMLElementEventMap[K]) => void) {
    this.canvas.addEventListener(name, fn, { passive: false })
    this.disposers.push(() => this.canvas.removeEventListener(name, fn))
  }

  private point(event: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private keyboard(event: KeyboardEvent) {
    const center = { x: this.width / 2, y: this.height / 2 }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Escape', ' '].includes(event.key)) return
    event.preventDefault()
    this.target = null
    if (event.key === '0') this.fitToData()
    else if (event.key === 'Escape') this.clearInspection()
    else if (event.key === ' ') this.setPlaying(!this.playing)
    else if (['+', '=', '-'].includes(event.key)) this.camera = zoomAt(this.camera, center, event.key === '-' ? .8 : 1.25)
    else {
      this.camera.x += (event.key === 'ArrowRight' ? 40 : event.key === 'ArrowLeft' ? -40 : 0) / this.camera.sx
      this.camera.y += (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) / this.camera.sy
    }
    this.invalidate()
  }

  setTrajectories(data: ComputedTrajectory[], preserveView = false) {
    const previousCamera = { ...this.camera }
    const previousProgress = this.progress
    const previousVisibility = [...this.visible]
    this.series = data.map(hydrateSeries)
    this.visible = data.map((_, index) => previousVisibility[index] ?? true)
    this.selected = this.selected !== null && this.selected < data.length ? this.selected : null
    this.clearInspection()
    if (preserveView && this.series.length) {
      this.camera = previousCamera
      this.progress = previousProgress
      this.invalidate()
    } else {
      this.progress = 1
      this.fitToData(true)
    }
    this.notifyTimeline(true)
  }

  setVisibility(index: number, visible: boolean) {
    if (!this.series[index]) return
    this.visible[index] = visible
    if (this.selected === index && !visible) this.selected = null
    this.clearInspection()
    this.invalidate()
  }

  fitToData(immediate = false) {
    const visibleSeries = this.series.filter((_, index) => this.visible[index] !== false)
    const target = fitCamera(visibleSeries.length ? visibleSeries : this.series, this.width, this.height)
    this.move(target, immediate)
  }

  focusTrajectory(index: number | null) {
    this.selected = index
    if (index === null) this.fitToData()
    else if (this.series[index]) {
      if (!this.visible[index]) this.visible[index] = true
      this.move(fitCamera([this.series[index]], this.width, this.height))
    }
    this.invalidate()
  }

  getCamera() { return { ...this.camera } }

  restoreCamera(camera: Camera) {
    if (![camera.x, camera.y, camera.sx, camera.sy].every(Number.isFinite) || camera.sx <= 0 || camera.sy <= 0) return
    this.camera = { ...camera }
    this.target = null
    this.invalidate()
  }

  private move(camera: Camera, immediate = false) {
    this.clearInspection()
    if (immediate || this.options.reducedMotion) {
      this.camera = camera
      this.target = null
    } else {
      this.target = camera
    }
    this.invalidate()
  }

  getMaxStep() { return Math.max(0, ...this.series.map((item) => item.y.length - 1)) }

  getStep() { return stepForProgress(this.progress, this.getMaxStep()) }

  setStep(step: number) {
    this.setPlaying(false)
    this.progress = progressForStep(step, this.getMaxStep())
    this.clearInspection()
    this.notifyTimeline(true)
    this.invalidate()
  }

  setProgress(progress: number) {
    this.progress = Math.max(0, Math.min(1, progress))
    this.clearInspection()
    this.notifyTimeline(true)
    this.invalidate()
  }

  setSpeed(speed: number) {
    this.speed = Math.max(.1, Math.min(16, speed))
    this.notifyTimeline(true)
  }

  setPlaying(playing: boolean) {
    if (playing && this.progress >= 1) this.progress = 0
    this.playing = playing
    this.options.playback(playing)
    this.last = 0
    this.notifyTimeline(true)
    this.invalidate()
  }

  restart() {
    this.setPlaying(false)
    this.setStep(0)
  }

  step() {
    this.setStep(this.getStep() + 1)
  }

  goToStep(step: number, seriesIndex: number | null = null) {
    this.setStep(step)
    if (seriesIndex !== null && this.series[seriesIndex]) this.focusPoint(seriesIndex, Math.min(step, this.series[seriesIndex].y.length - 1))
  }

  jumpToPeak(seriesIndex: number) {
    const series = this.series[seriesIndex]
    if (!series) return
    this.setStep(series.peakStep)
    this.focusPoint(seriesIndex, series.peakStep)
  }

  jumpToEnd(seriesIndex: number) {
    const series = this.series[seriesIndex]
    if (!series) return
    const step = series.y.length - 1
    this.setStep(step)
    this.focusPoint(seriesIndex, step)
  }

  private focusPoint(seriesIndex: number, step: number) {
    const series = this.series[seriesIndex]
    if (!series) return
    const y = series.y[Math.max(0, Math.min(step, series.y.length - 1))]
    const target = {
      ...this.camera,
      x: step - this.width / (2 * this.camera.sx),
      y: y + this.height / (2 * this.camera.sy),
    }
    this.move(target)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const oldWidth = this.width
    const oldHeight = this.height
    const center = {
      x: this.camera.x + oldWidth / (2 * this.camera.sx),
      y: this.camera.y - oldHeight / (2 * this.camera.sy),
    }

    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (this.series.length && oldWidth > 1 && oldHeight > 1) {
      this.camera.x = center.x - this.width / (2 * this.camera.sx)
      this.camera.y = center.y + this.height / (2 * this.camera.sy)
      this.invalidate()
    } else if (this.series.length) this.fitToData(true)
    else this.invalidate()
  }

  hitTestAll(p: Point): InspectionHit[] {
    const hits: InspectionHit[] = []
    const max = this.getMaxStep()
    const limit = Math.floor(this.progress * max)
    this.series.forEach((series, index) => {
      if (this.visible[index] === false) return
      const step = nearest(series, this.camera, p, limit, 28)
      if (step === null) return
      const q = project({ x: step, y: series.y[step] }, this.camera)
      hits.push({ series: index, step, distance: Math.hypot(q.x - p.x, q.y - p.y) })
    })
    return hits.sort((a, b) => a.distance - b.distance || a.series - b.series)
  }

  private inspect(p: Point) {
    const hits = this.hitTestAll(p)
    this.hovered = hits.length ? { x: p.x, y: p.y, hits } : null
    this.options.inspect(this.hovered)
    this.invalidate()
  }

  private clearInspection() {
    if (this.hovered) {
      this.hovered = null
      this.options.inspect(null)
    }
    this.invalidate()
  }

  private invalidate() {
    this.dirty = true
    if (!this.frame) this.frame = requestAnimationFrame(this.tick)
  }

  private notifyTimeline(force = false) {
    const now = performance.now()
    if (!force && now - this.lastTimelineNotify < 80) return
    this.lastTimelineNotify = now
    this.options.timeline({
      step: this.getStep(),
      maxStep: this.getMaxStep(),
      progress: this.progress,
      playing: this.playing,
    })
  }

  private record(samples: number[], value: number) {
    samples.push(value)
    if (samples.length > 240) samples.shift()
  }

  private tick = (now: number) => {
    const frameStarted = performance.now()
    this.frame = 0
    const dt = this.last ? Math.min(50, now - this.last) : 0
    this.last = now

    if (this.playing) {
      this.progress = advanceProgress(this.progress, dt, this.speed, this.getMaxStep())
      this.dirty = true
      this.notifyTimeline()
      if (this.progress >= 1) {
        this.playing = false
        this.options.playback(false)
        this.notifyTimeline(true)
      }
    }

    if (this.target) {
      let difference = 0
      for (const key of ['x', 'y', 'sx', 'sy'] as const) {
        const delta = this.target[key] - this.camera[key]
        difference += Math.abs(delta) / Math.max(1, Math.abs(this.target[key]))
        this.camera[key] += delta * (1 - Math.exp(-Math.max(1, dt) / 65))
      }
      if (difference < .0001) {
        this.camera = this.target
        this.target = null
      }
      this.dirty = true
    }

    if (this.dirty) {
      const drawStarted = performance.now()
      this.draw()
      this.record(this.drawSamples, performance.now() - drawStarted)
      this.dirty = false
    }
    this.record(this.frameSamples, performance.now() - frameStarted)

    if (this.playing || this.target) this.frame = requestAnimationFrame(this.tick)
    else this.last = 0
  }

  private draw() {
    const ctx = this.ctx
    const camera = this.camera
    const width = this.width
    const height = this.height
    ctx.globalAlpha = 1
    ctx.fillStyle = '#070b12'
    ctx.fillRect(0, 0, width, height)
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui'
    ctx.textBaseline = 'middle'

    const ySpan = height / camera.sy
    const interval = Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, ySpan / 7))))
    for (let y = Math.max(0, Math.ceil((camera.y - ySpan) / interval) * interval); y <= camera.y; y += interval) {
      const p = project({ x: 0, y }, camera)
      if (p.y < 120 || p.y > height - 110) continue
      ctx.strokeStyle = '#ffffff08'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(18, p.y)
      ctx.lineTo(width - 18, p.y)
      ctx.stroke()
      ctx.fillStyle = '#707c8e'
      ctx.fillText(y === 0 ? '1' : `2^${y}`, 12, p.y - 9)
    }

    const max = this.getMaxStep()
    const reveal = this.progress * max
    const boxes: { x: number; y: number; w: number }[] = []
    const focus = this.hovered?.hits[0]?.series ?? this.selected

    this.series.forEach((series, index) => {
      if (this.visible[index] === false) return
      const end = Math.min(reveal, series.y.length - 1)
      let level = 0
      while (level + 1 < series.levels.length && (8 * 4 ** level) * camera.sx < 2) level += 1
      const points = series.levels[level]
      const visibleStart = unproject({ x: -20, y: 0 }, camera).x
      const visibleEnd = Math.min(end, unproject({ x: width + 20, y: 0 }, camera).x)
      const startIndex = Math.max(0, lowerBound(points, visibleStart) - 1)
      const endIndex = Math.min(points.length - 1, lowerBound(points, visibleEnd))
      const path = new Path2D()
      let started = false

      for (let pointIndex = startIndex; pointIndex <= endIndex; pointIndex += 1) {
        const step = Math.min(points[pointIndex], end)
        const lo = Math.floor(step)
        const hi = Math.min(series.y.length - 1, lo + 1)
        const p = project({ x: step, y: series.y[lo] + (series.y[hi] - series.y[lo]) * (step - lo) }, camera)
        if (!started) { path.moveTo(p.x, p.y); started = true } else path.lineTo(p.x, p.y)
        if (points[pointIndex] >= end) break
      }

      const alpha = focus === null || focus === index ? 1 : .28
      ctx.strokeStyle = COLORS[index % COLORS.length]
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.globalAlpha = .055 * alpha
      ctx.lineWidth = 5
      ctx.stroke(path)
      ctx.globalAlpha = .92 * alpha
      ctx.lineWidth = focus === index ? 1.9 : 1.25
      ctx.stroke(path)

      const markers = [...new Set([0, series.peakStep, Math.floor(end)])]
      for (const step of markers) {
        if (step > end) continue
        const p = project({ x: step, y: series.y[step] }, camera)
        if (p.x < 16 || p.x > width - 16 || p.y < 118 || p.y > height - 106) continue

        ctx.fillStyle = COLORS[index % COLORS.length]
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, focus === index ? 3.2 : 2.5, 0, Math.PI * 2)
        ctx.fill()

        const raw = series.data.values[step]
        const label = raw.length > 16 ? `${raw.slice(0, 6)}… · ${raw.length} digits` : raw
        const text = step === series.peakStep && step !== 0 ? `peak ${label}` : label
        const labelWidth = ctx.measureText(text).width
        const x = Math.max(10, Math.min(width - labelWidth - 10, p.x + 8))
        const y = p.y - 14
        const important = step === 0 || step === series.peakStep || step === series.y.length - 1
        const enoughSpace = !boxes.some((box) => Math.abs(box.y - y) < 22 && x < box.x + box.w + 12 && x + labelWidth + 12 > box.x)

        if (important && enoughSpace && (camera.sx > .7 || step === series.peakStep)) {
          ctx.fillText(text, x, y)
          boxes.push({ x, y, w: labelWidth })
        }
      }
    })

    ctx.globalAlpha = 1
    if (this.hovered?.hits.length) {
      const first = this.hovered.hits[0]
      const series = this.series[first.series]
      const p = project({ x: first.step, y: series.y[first.step] }, camera)
      ctx.strokeStyle = '#f2f7ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.fillStyle = '#7f8b9c'
    ctx.fillText('STEP →    VALUE · LOG₂', 20, height - 105)
    ctx.fillStyle = '#9edbe7'
    ctx.fillRect(0, height - 1, width * this.progress, 1)
  }

  getDiagnostics(): RendererDiagnostics {
    return {
      samples: this.drawSamples.length,
      drawAverageMs: this.drawSamples.length ? this.drawSamples.reduce((a, b) => a + b, 0) / this.drawSamples.length : 0,
      drawP95Ms: percentile(this.drawSamples, .95),
      frameAverageMs: this.frameSamples.length ? this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length : 0,
      frameP95Ms: percentile(this.frameSamples, .95),
    }
  }

  exportPng(contextText = '') {
    return new Promise<Blob>((resolve, reject) => {
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = this.canvas.width
      exportCanvas.height = this.canvas.height
      const ctx = exportCanvas.getContext('2d')
      if (!ctx) { reject(new Error('PNG export is unavailable.')); return }
      ctx.drawImage(this.canvas, 0, 0)
      if (contextText) {
        const dpr = Math.max(1, exportCanvas.width / Math.max(1, this.width))
        ctx.fillStyle = 'rgba(7,11,18,.82)'
        ctx.fillRect(0, 0, exportCanvas.width, 48 * dpr)
        ctx.fillStyle = '#e8eef7'
        ctx.font = `${12 * dpr}px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui`
        ctx.fillText(contextText, 18 * dpr, 29 * dpr)
      }
      exportCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png')
    })
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.disposers.forEach((dispose) => dispose())
    this.series = []
    this.options.inspect(null)
  }
}
