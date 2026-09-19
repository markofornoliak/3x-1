import { OP_ODD } from '../compute/types'

export interface ExportSeries {
  start: string
  values: readonly string[]
  operations: Uint8Array
  peak: string
  peakStep: number
  reachedOne: boolean
  truncated: boolean
}

function operationLabel(code: number | undefined) {
  if (code === undefined) return ''
  return code === OP_ODD ? '3n+1' : 'n/2'
}

export function createJsonExport(series: readonly ExportSeries[], generatedAt = new Date().toISOString()): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt,
    coordinateSystem: { x: 'step', y: 'log2(value)', exactValues: 'decimal strings' },
    trajectories: series.map((trajectory, index) => ({
      id: `T${index + 1}`,
      start: trajectory.start,
      status: trajectory.reachedOne ? 'complete' : 'truncated',
      steps: trajectory.operations.length,
      peak: trajectory.peak,
      peakStep: trajectory.peakStep,
      values: trajectory.values,
      operations: Array.from(trajectory.operations, operationLabel),
    })),
  }, null, 2)
}

function csv(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function createCsvExport(series: readonly ExportSeries[]): string {
  const rows = ['trajectory,start,step,value,operation,status']
  series.forEach((trajectory, index) => {
    const status = trajectory.reachedOne ? 'complete' : 'truncated'
    trajectory.values.forEach((value, step) => {
      rows.push([
        `T${index + 1}`,
        trajectory.start,
        step,
        value,
        operationLabel(trajectory.operations[step]),
        status,
      ].map(csv).join(','))
    })
  })
  return rows.join('\n')
}
