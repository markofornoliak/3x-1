import { parsePositiveInteger } from '../math/collatz'

export type UrlSelection =
  | { kind: 'single'; values: [bigint] }
  | { kind: 'compare'; values: bigint[] }

export function parseComparisonInput(raw: string): { ok: true; values: bigint[] } | { ok: false; error: string } {
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return { ok: false, error: 'Enter at least two positive integers.' }
  if (parts.length > 6) return { ok: false, error: 'Compare up to six trajectories at once.' }

  const values: bigint[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const parsed = parsePositiveInteger(part)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    const key = parsed.value.toString()
    if (seen.has(key)) return { ok: false, error: 'Use different starting integers for comparison.' }
    seen.add(key)
    values.push(parsed.value)
  }
  return { ok: true, values }
}

export function readUrlSelection(search: string): UrlSelection | null {
  const params = new URLSearchParams(search)
  const raw = params.get('n')
  if (!raw) return null

  if (params.get('mode') === 'compare') {
    const parsed = parseComparisonInput(raw)
    return parsed.ok ? { kind: 'compare', values: parsed.values } : null
  }

  const parsed = parsePositiveInteger(raw)
  return parsed.ok ? { kind: 'single', values: [parsed.value] } : null
}

export function applySelectionToUrl(url: URL, selection: UrlSelection | null) {
  if (!selection) {
    url.searchParams.delete('n')
    url.searchParams.delete('mode')
    return url
  }

  if (selection.kind === 'compare') {
    url.searchParams.set('n', selection.values.map(String).join(','))
    url.searchParams.set('mode', 'compare')
  } else {
    url.searchParams.set('n', selection.values[0].toString())
    url.searchParams.delete('mode')
  }
  return url
}
