import { useCallback, useEffect, useRef, useState } from 'react'
import { boundsOf, type LayoutNode } from '../visualization/layout'

export interface CameraState { x: number; y: number; scale: number }
interface Viewport { width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function useCamera(viewport: Viewport, reducedMotion: boolean) {
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, scale: 1 })
  const current = useRef(camera)
  const target = useRef(camera)
  const raf = useRef<number | null>(null)
  const inputRaf = useRef<number | null>(null)

  const animate = useCallback(() => {
    if (raf.current !== null) return
    const tick = () => {
      const c = current.current
      const t = target.current
      const factor = reducedMotion ? 0.75 : 0.13
      const next = {
        x: c.x + (t.x - c.x) * factor,
        y: c.y + (t.y - c.y) * factor,
        scale: c.scale + (t.scale - c.scale) * factor,
      }
      const done = Math.abs(next.x - t.x) < 0.08 && Math.abs(next.y - t.y) < 0.08 && Math.abs(next.scale - t.scale) < 0.0008
      current.current = done ? t : next
      setCamera(current.current)
      if (done) raf.current = null
      else raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [reducedMotion])

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    if (inputRaf.current !== null) cancelAnimationFrame(inputRaf.current)
  }, [])

  const setTarget = useCallback((next: CameraState, immediate = false) => {
    target.current = { ...next, scale: clamp(next.scale, 0.08, 4.5) }
    if (immediate || reducedMotion) {
      current.current = target.current
      setCamera(target.current)
    } else animate()
  }, [animate, reducedMotion])

  // panBy/zoomBy fire once per raw pointermove/wheel event, which can be far
  // more often than once per animation frame. `target.current` is updated
  // synchronously on every call (so successive deltas still compose
  // correctly), but the React state update — and therefore the re-render —
  // is coalesced to at most once per frame.
  const scheduleInputTarget = useCallback((next: CameraState) => {
    target.current = { ...next, scale: clamp(next.scale, 0.08, 4.5) }
    if (inputRaf.current !== null) return
    inputRaf.current = requestAnimationFrame(() => {
      inputRaf.current = null
      current.current = target.current
      setCamera(target.current)
    })
  }, [])

  const follow = useCallback((node: LayoutNode, previous?: LayoutNode) => {
    const biasX = viewport.width < 700 ? 0 : viewport.width * 0.06
    const biasY = viewport.height < viewport.width ? viewport.height * 0.04 : -viewport.height * 0.05
    let scale = target.current.scale
    if (scale < 0.64) scale = 0.64
    if (scale > 1.18) scale = 1.18
    if (previous) {
      const distance = Math.hypot(node.x - previous.x, node.y - previous.y)
      if (distance * scale > Math.min(viewport.width, viewport.height) * 0.52) scale *= 0.9
    }
    setTarget({ x: node.x - biasX / scale, y: node.y - biasY / scale, scale })
  }, [setTarget, viewport.height, viewport.width])

  const fit = useCallback((nodes: LayoutNode[], padding = 96) => {
    if (!nodes.length) return
    const bounds = boundsOf(nodes)
    const availableW = Math.max(160, viewport.width - padding * 2)
    const availableH = Math.max(160, viewport.height - padding * 2)
    const scale = clamp(Math.min(availableW / (bounds.width + 86), availableH / (bounds.height + 86)), 0.08, 1.45)
    setTarget({
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      scale,
    })
  }, [setTarget, viewport.height, viewport.width])

  const panBy = useCallback((dxScreen: number, dyScreen: number) => {
    const t = target.current
    scheduleInputTarget({ ...t, x: t.x - dxScreen / t.scale, y: t.y - dyScreen / t.scale })
  }, [scheduleInputTarget])

  const zoomBy = useCallback((factor: number) => {
    const t = target.current
    scheduleInputTarget({ ...t, scale: clamp(t.scale * factor, 0.08, 4.5) })
  }, [scheduleInputTarget])

  return { camera, setTarget, follow, fit, panBy, zoomBy }
}
