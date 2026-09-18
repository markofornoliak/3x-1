import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { Plus, SquarePen, X } from 'lucide-react'
import { formatInteger, parsePositiveInteger } from '../math/collatz'

interface Props {
  values: bigint[]
  colors: string[]
  selectedStart: bigint | null
  onSelect: (value: bigint) => void
  onAdd: (value: bigint) => void
  onReplace: (index: number, value: bigint) => void
  onRemove: (index: number) => void
}

type EditState = { kind: 'add' } | { kind: 'replace'; index: number } | null

export function CompareLegend({ values, colors, selectedStart, onSelect, onAdd, onReplace, onRemove }: Props) {
  const [editing, setEditing] = useState<EditState>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const beginAdd = () => {
    if (values.length >= 6) return
    setDraft('')
    setError('')
    setEditing({ kind: 'add' })
  }

  const beginReplace = (index: number) => {
    setDraft(values[index].toString())
    setError('')
    setEditing({ kind: 'replace', index })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const parsed = parsePositiveInteger(draft)
    if (!parsed.ok) { setError(parsed.error); return }
    if (values.some((value, index) => value === parsed.value && (editing.kind === 'add' || index !== editing.index))) {
      setError('Already shown')
      return
    }
    if (editing.kind === 'add') onAdd(parsed.value)
    else onReplace(editing.index, parsed.value)
    setEditing(null)
    setError('')
  }

  return (
    <div className="compare-legend ui-layer" aria-label="Compared starting values">
      <div className="compare-chips">
        {values.map((value, index) => {
          if (editing?.kind === 'replace' && editing.index === index) {
            return (
              <form className="compare-chip-edit" key={`edit-${index}`} onSubmit={submit}>
                <span className="compare-dot" style={{ background: colors[index], color: colors[index] }} />
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft(event.target.value); setError('') }}
                  onBlur={() => setEditing(null)}
                  inputMode="numeric"
                  aria-label={`Replace ${value.toString()}`}
                />
              </form>
            )
          }

          return (
            <div className={`compare-chip ${selectedStart === value ? 'is-selected' : ''}`} key={value.toString()}>
              <button className="compare-chip-main" onClick={() => onSelect(value)} title={value.toString()}>
                <span className="compare-dot" style={{ background: colors[index], color: colors[index] }} />
                <span>{formatInteger(value, 10)}</span>
              </button>
              <button className="compare-chip-action" onClick={() => beginReplace(index)} aria-label={`Replace ${value.toString()}`}><SquarePen size={11} /></button>
              <button className="compare-chip-action" onClick={() => onRemove(index)} disabled={values.length <= 2} aria-label={`Remove ${value.toString()}`}><X size={12} /></button>
            </div>
          )
        })}

        {editing?.kind === 'add' ? (
          <form className={`compare-chip-edit ${error ? 'has-error' : ''}`} onSubmit={submit}>
            <Plus size={11} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft(event.target.value); setError('') }}
              onBlur={() => setEditing(null)}
              inputMode="numeric"
              placeholder="number"
              aria-label="Add starting value"
              title={error || undefined}
            />
          </form>
        ) : values.length < 6 ? (
          <button className="compare-add" onClick={beginAdd} aria-label="Add a starting value"><Plus size={12} /></button>
        ) : null}
      </div>
      {error && <span className="compare-legend-error" role="alert">{error}</span>}
    </div>
  )
}
