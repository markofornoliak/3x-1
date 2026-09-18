import { describe, expect, it } from 'vitest'
import { applySelectionToUrl, parseComparisonInput, readUrlSelection } from './urlState'

describe('comparison URL state', () => {
  it('parses and preserves a compare configuration', () => {
    const selection = readUrlSelection('?n=7,27,31,97&mode=compare')
    expect(selection).toEqual({ kind: 'compare', values: [7n, 27n, 31n, 97n] })

    const url = applySelectionToUrl(new URL('https://example.test/3x-1/'), selection)
    expect(url.searchParams.get('n')).toBe('7,27,31,97')
    expect(url.searchParams.get('mode')).toBe('compare')
  })

  it('keeps legacy single-number URLs unchanged in meaning', () => {
    expect(readUrlSelection('?n=27')).toEqual({ kind: 'single', values: [27n] })
  })

  it('enforces 2–6 distinct positive integers', () => {
    expect(parseComparisonInput('7').ok).toBe(false)
    expect(parseComparisonInput('7,7').ok).toBe(false)
    expect(parseComparisonInput('1,2,3,4,5,6,7').ok).toBe(false)
    expect(parseComparisonInput('7,27').ok).toBe(true)
  })
})
