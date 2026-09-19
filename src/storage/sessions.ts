import type { Camera } from '../visualization/geometry'

export const SESSION_STORAGE_KEY = 'collatz.explorations.v2'
export const SESSION_SCHEMA_VERSION = 2

export interface SavedExploration {
  version: 2
  id: string
  name: string
  createdAt: string
  updatedAt: string
  selection: { kind: 'single' | 'compare'; values: string[] }
  visibility: boolean[]
  selectedStart: string | null
  camera: Camera | null
  playback: { step: number; speed: number }
}

export interface StorageResult {
  sessions: SavedExploration[]
  warning: string
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validSelection(value: unknown): value is SavedExploration['selection'] {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { kind?: unknown; values?: unknown }
  if (candidate.kind !== 'single' && candidate.kind !== 'compare') return false
  if (!Array.isArray(candidate.values)) return false
  if (candidate.kind === 'single' && candidate.values.length !== 1) return false
  if (candidate.kind === 'compare' && (candidate.values.length < 2 || candidate.values.length > 6)) return false
  return candidate.values.every((item) => typeof item === 'string' && /^[1-9]\d{0,511}$/.test(item))
}

export function validateSavedExploration(value: unknown): SavedExploration | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<SavedExploration>
  if (item.version !== 2 || typeof item.id !== 'string' || typeof item.name !== 'string') return null
  if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || !validSelection(item.selection)) return null
  if (!Array.isArray(item.visibility) || item.visibility.length !== item.selection.values.length || !item.visibility.every((flag) => typeof flag === 'boolean')) return null
  if (item.selectedStart !== null && (typeof item.selectedStart !== 'string' || !item.selection.values.includes(item.selectedStart))) return null
  if (item.camera !== null && (!item.camera || !finite(item.camera.x) || !finite(item.camera.y) || !finite(item.camera.sx) || !finite(item.camera.sy) || item.camera.sx <= 0 || item.camera.sy <= 0)) return null
  if (!item.playback || !finite(item.playback.step) || item.playback.step < 0 || !finite(item.playback.speed) || item.playback.speed <= 0 || item.playback.speed > 16) return null
  return item as SavedExploration
}

function migrate(value: unknown): SavedExploration | null {
  if (!value || typeof value !== 'object') return null
  const legacy = value as Record<string, unknown>
  if (legacy.version === 1 && Array.isArray(legacy.values) && legacy.values.every((item) => typeof item === 'string')) {
    const selection = { kind: legacy.values.length > 1 ? 'compare' as const : 'single' as const, values: legacy.values as string[] }
    return validateSavedExploration({
      version: 2,
      id: typeof legacy.id === 'string' ? legacy.id : crypto.randomUUID(),
      name: typeof legacy.name === 'string' ? legacy.name : 'Saved exploration',
      createdAt: typeof legacy.createdAt === 'string' ? legacy.createdAt : new Date().toISOString(),
      updatedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : new Date().toISOString(),
      selection,
      visibility: selection.values.map(() => true),
      selectedStart: null,
      camera: null,
      playback: { step: 0, speed: 1 },
    })
  }
  return validateSavedExploration(value)
}

export function readSessions(storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage): StorageResult {
  if (!storage) return { sessions: [], warning: 'Browser storage is unavailable in this context.' }
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return { sessions: [], warning: '' }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { sessions: [], warning: 'Saved explorations were malformed and were ignored.' }
    const sessions = parsed.map(migrate).filter((item): item is SavedExploration => item !== null)
    const warning = sessions.length === parsed.length ? '' : 'Some malformed saved explorations were ignored.'
    return { sessions, warning }
  } catch {
    return { sessions: [], warning: 'Saved explorations could not be read from browser storage.' }
  }
}

export function writeSessions(sessions: readonly SavedExploration[], storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage): string {
  if (!storage) return 'Browser storage is unavailable in this context.'
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
    return ''
  } catch {
    return 'The exploration could not be saved. Browser storage may be unavailable or full.'
  }
}
