import type { CollatzTrajectory } from '../../math/collatz'
import { fitCamera, lowerBound, nearest, prepare, project, unproject, zoomAt, type Camera, type Point, type Series } from '../geometry'
export const COLORS = ['#acdce8', '#e8b58d', '#a8bded', '#c6b1df', '#b9d5ab', '#e4a9b7']
export interface Inspection { series: number; step: number; x: number; y: number }
export interface EngineOptions { inspect: (hit: Inspection | null) => void; playback: (playing: boolean) => void; reducedMotion: boolean }
export class Instrument {
  private ctx: CanvasRenderingContext2D
  private series: Series[] = []
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
  constructor(private canvas: HTMLCanvasElement, private options: EngineOptions) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.')
    this.ctx = ctx
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    this.listen('wheel', e => { e.preventDefault(); this.target = null; this.camera = zoomAt(this.camera, this.point(e), Math.exp(-Math.max(-150, Math.min(150, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * .004)); this.clearInspection(); this.invalidate() })
    this.listen('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, this.point(e)); this.down = this.point(e); this.moved = false
      if (this.pointers.size > 1) this.multiTouch = true
      this.target = null
    })
    this.listen('pointermove', e => {
      const p = this.point(e), old = this.pointers.get(e.pointerId)
      if (!old) { if (e.pointerType === 'mouse') this.inspect(p); return }
      const before = [...this.pointers.values()]
      this.pointers.set(e.pointerId, p)
      if (this.down && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) this.moved = true
      if (before.length === 1) { this.camera.x -= (p.x - old.x) / this.camera.sx; this.camera.y += (p.y - old.y) / this.camera.sy }
      else {
        const after = [...this.pointers.values()]
        const center = (a: Point[]) => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 })
        const a = center(before), b = center(after)
        this.camera = zoomAt(this.camera, a, Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y) / Math.max(1, Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y)))
        this.camera.x -= (b.x - a.x) / this.camera.sx; this.camera.y += (b.y - a.y) / this.camera.sy
      }
      this.clearInspection(); this.invalidate()
    })
    this.listen('pointerup', e => {
      if (!this.moved && !this.multiTouch) {
        if (e.pointerType !== 'mouse' && performance.now() - this.lastTap < 320) this.fitToData()
        else this.inspect(this.point(e))
        this.lastTap = performance.now()
      }
      this.pointers.delete(e.pointerId)
      if (!this.pointers.size) this.multiTouch = false
    })
    this.listen('pointercancel', e => { this.pointers.delete(e.pointerId); this.multiTouch = false })
    this.listen('pointerleave', () => { if (!this.pointers.size) this.clearInspection() })
    this.listen('dblclick', () => this.fitToData())
    this.listen('keydown', e => {
      const center = { x: this.width / 2, y: this.height / 2 }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Escape'].includes(e.key)) {
        e.preventDefault(); this.target = null
        if (e.key === '0') this.fitToData()
        else if (e.key === 'Escape') this.clearInspection()
        else if (['+', '=', '-'].includes(e.key)) this.camera = zoomAt(this.camera, center, e.key === '-' ? .8 : 1.25)
        else { this.camera.x += (e.key === 'ArrowRight' ? 40 : e.key === 'ArrowLeft' ? -40 : 0) / this.camera.sx; this.camera.y += (e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0) / this.camera.sy }
        this.invalidate()
      }
    })
  }
  private listen<K extends keyof HTMLElementEventMap>(name: K, fn: (event: HTMLElementEventMap[K]) => void) {
    this.canvas.addEventListener(name, fn, { passive: false })
    this.disposers.push(() => this.canvas.removeEventListener(name, fn))
  }
  private point(e: MouseEvent): Point { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  setTrajectories(data: CollatzTrajectory[]) { this.series = data.map(prepare); this.progress = 1; this.setPlaying(false); this.selected = null; this.clearInspection(); this.fitToData(true) }
  setViewport(camera: Camera) { this.camera = { ...camera }; this.target = null; this.invalidate() }
  fitToData(immediate = false) { this.move(fitCamera(this.series, this.width, this.height), immediate) }
  focusTrajectory(index: number | null) { this.selected = index; this.move(fitCamera(index === null ? this.series : [this.series[index]], this.width, this.height)); this.invalidate() }
  private move(c: Camera, immediate = false) { this.clearInspection(); if (immediate || this.options.reducedMotion) { this.camera = c; this.target = null } else this.target = c; this.invalidate() }
  setProgress(progress: number) { this.progress = Math.max(0, Math.min(1, progress)); this.clearInspection(); this.invalidate() }
  setSpeed(speed: number) { this.speed = speed }
  setPlaying(playing: boolean) { if (playing && this.progress >= 1) this.progress = 0; this.playing = playing; this.options.playback(playing); this.last = 0; this.invalidate() }
  step() { this.setPlaying(false); const max = Math.max(1, ...this.series.map(s => s.y.length - 1)); this.setProgress(Math.min(1, (Math.floor(this.progress * max) + 1) / max)) }
  resize() {
    const r = this.canvas.getBoundingClientRect(); this.width = Math.max(1, r.width); this.height = Math.max(1, r.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.fitToData(true)
  }
  hitTest(p: Point): Inspection | null {
    let hit: Inspection | null = null, distance = 26
    const max = Math.max(0, ...this.series.map(s => s.y.length - 1)), limit = Math.floor(this.progress * max)
    this.series.forEach((s, i) => { const step = nearest(s, this.camera, p, limit, distance); if (step !== null) { const q = project({ x: step, y: s.y[step] }, this.camera); distance = Math.hypot(q.x - p.x, q.y - p.y); hit = { series: i, step, x: q.x, y: q.y } } })
    return hit
  }
  private inspect(p: Point) { this.hovered = this.hitTest(p); this.options.inspect(this.hovered); this.invalidate() }
  private clearInspection() { if (this.hovered) { this.hovered = null; this.options.inspect(null) }; this.invalidate() }
  private invalidate() { this.dirty = true; if (!this.frame) this.frame = requestAnimationFrame(this.tick) }
  private tick = (now: number) => {
    this.frame = 0
    const dt = this.last ? Math.min(50, now - this.last) : 0; this.last = now
    if (this.playing) {
      const max = Math.max(1, ...this.series.map(s => s.y.length - 1))
      const duration = Math.min(30000, Math.max(4000, max * 65))
      this.progress = Math.min(1, this.progress + dt * this.speed / duration); this.dirty = true
      if (this.progress === 1) { this.playing = false; this.options.playback(false) }
    }
    if (this.target) {
      let difference = 0
      for (const key of ['x', 'y', 'sx', 'sy'] as const) { const d = this.target[key] - this.camera[key]; difference += Math.abs(d) / Math.max(1, Math.abs(this.target[key])); this.camera[key] += d * (1 - Math.exp(-Math.max(1, dt) / 65)) }
      if (difference < .0001) { this.camera = this.target; this.target = null }
      this.dirty = true
    }
    if (this.dirty) { this.draw(); this.dirty = false }
    if (this.playing || this.target) this.frame = requestAnimationFrame(this.tick)
    else this.last = 0
  }
  private draw() {
    const ctx = this.ctx, c = this.camera, w = this.width, h = this.height
    ctx.globalAlpha = 1; ctx.fillStyle = '#080d16'; ctx.fillRect(0, 0, w, h)
    ctx.font = '11px ui-sans-serif, system-ui'; ctx.textBaseline = 'middle'
    const ySpan = h / c.sy, interval = Math.max(1, 2 ** Math.ceil(Math.log2(ySpan / 7)))
    for (let y = Math.max(0, Math.ceil((c.y - ySpan) / interval) * interval); y <= c.y; y += interval) {
      const p = project({ x: 0, y }, c); if (p.y < 160 || p.y > h - 85) continue
      ctx.strokeStyle = '#ffffff09'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(20, p.y); ctx.lineTo(w - 20, p.y); ctx.stroke()
      ctx.fillStyle = '#8491a5'; ctx.fillText(y === 0 ? '1' : `2^${y}`, 12, p.y - 9)
    }
    const max = Math.max(0, ...this.series.map(s => s.y.length - 1)), reveal = this.progress * max
    const boxes: { x: number; y: number; w: number }[] = []
    const focus = this.hovered?.series ?? this.selected
    this.series.forEach((s, index) => {
      const end = Math.min(reveal, s.y.length - 1)
      let level = 0
      while (level + 1 < s.levels.length && (8 * 4 ** level) * c.sx < 2) level++
      const points = s.levels[level]
      const startIndex = Math.max(0, lowerBound(points, unproject({ x: -20, y: 0 }, c).x) - 1)
      const endIndex = Math.min(points.length - 1, lowerBound(points, Math.min(end, unproject({ x: w + 20, y: 0 }, c).x)))
      const path = new Path2D()
      let started = false
      for (let i = startIndex; i <= endIndex; i++) {
        const step = Math.min(points[i], end), lo = Math.floor(step), hi = Math.min(s.y.length - 1, lo + 1)
        const p = project({ x: step, y: s.y[lo] + (s.y[hi] - s.y[lo]) * (step - lo) }, c)
        if (!started) { path.moveTo(p.x, p.y); started = true } else path.lineTo(p.x, p.y)
        if (points[i] >= end) break
      }
      ctx.strokeStyle = COLORS[index % COLORS.length]; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      const alpha = focus === null || focus === index ? 1 : .4
      ctx.globalAlpha = .075 * alpha; ctx.lineWidth = 6; ctx.stroke(path)
      ctx.globalAlpha = .92 * alpha; ctx.lineWidth = focus === index ? 1.8 : 1.3; ctx.stroke(path)
      const markers = [...new Set([0, s.peakStep, Math.floor(end)])]
      for (const step of markers) {
        if (step > end) continue
        const p = project({ x: step, y: s.y[step] }, c)
        if (p.x < 18 || p.x > w - 18 || p.y < 150 || p.y > h - 85) continue
        ctx.fillStyle = COLORS[index % COLORS.length]; ctx.beginPath(); ctx.arc(p.x, p.y, 2.7, 0, Math.PI * 2); ctx.fill()
        const raw = s.data.values[step].toString()
        const label = raw.length > 15 ? `${raw.slice(0, 6)}… (${raw.length} digits)` : raw
        const text = step === s.peakStep && step !== 0 ? `peak ${label}` : label
        const width = ctx.measureText(text).width, x = Math.max(10, Math.min(w - width - 10, p.x + 8)), y = p.y - 14
        if ((step === 0 || step === s.peakStep || step === s.y.length - 1) && !boxes.some(b => Math.abs(b.y - y) < 22 && x < b.x + b.w + 12 && x + width + 12 > b.x)) {
          ctx.fillText(text, x, y); boxes.push({ x, y, w: width })
        }
      }
    })
    ctx.globalAlpha = 1
    if (this.hovered) {
      const p = this.hovered; ctx.strokeStyle = '#f0f5ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.fillStyle = '#94a1b4'; ctx.fillText('STEP →   /   VALUE · LOG₂', 22, h - 88)
    ctx.fillStyle = '#acdce8'; ctx.fillRect(0, h - 1, w * this.progress, 1)
  }
  destroy() { cancelAnimationFrame(this.frame); this.observer.disconnect(); this.disposers.forEach(fn => fn()); this.series = [] }
}
