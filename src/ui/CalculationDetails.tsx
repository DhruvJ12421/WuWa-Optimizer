import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { CalculationTrace } from '../domain/calculation'
import './calculation-details.css'

export interface CalculationDetailRow {
  label: string
  value: string
  children?: CalculationDetailRow[]
}

export interface CalculationDetail {
  title: string
  value: string
  formula?: string
  note?: string
  rows: CalculationDetailRow[]
}

function DetailRows({ rows, depth = 0 }: { rows: CalculationDetailRow[]; depth?: number }) {
  return <ul>{rows.map((row, index) => <li style={{ '--calc-depth': depth } as CSSProperties} key={`${row.label}-${index}`}>
    <span>{row.label}</span><b>{row.value}</b>
    {row.children?.length ? <DetailRows rows={row.children} depth={depth + 1}/> : null}
  </li>)}</ul>
}

function compactDetailRows(rows: CalculationDetailRow[]) {
  const generic = /^(prod|sum|min|max|stat|input|constant|lookup|query|if|compare)$/i
  const result: CalculationDetailRow[] = []
  const visit = (row: CalculationDetailRow) => {
    if (!generic.test(row.label.trim())) result.push(row)
    else row.children?.forEach(visit)
  }
  rows.forEach(visit)
  return result.filter((row, index) => result.findIndex((candidate) => candidate.label === row.label && candidate.value === row.value) === index).slice(0, 10)
}

export function traceCalculationDetail(trace: CalculationTrace, title = trace.label): CalculationDetail {
  const row = (node: CalculationTrace): CalculationDetailRow => ({
    label: node.label,
    value: typeof node.value === 'number' ? node.value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(node.value),
    children: node.children.map(row)
  })
  return { title, value: row(trace).value, formula: 'Declarative formula trace', rows: [row(trace)] }
}

export function CalculatedValue({ children, detail, className = '', ariaLabel, presentation = 'dialog' }: { children: ReactNode; detail: CalculationDetail; className?: string; ariaLabel?: string; presentation?: 'dialog' | 'tooltip' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  if (presentation === 'tooltip') {
    const rows = compactDetailRows(detail.rows)
    return <span className="calculation-tooltip-anchor">
      <button type="button" className={`calculated-value ${className}`} aria-label={ariaLabel ?? `Show calculation for ${detail.title}`}>{children}</button>
      <span className="calculation-tooltip" role="tooltip"><strong>{detail.title}</strong><span className="calculation-tooltip-expression">{rows.length ? rows.map((row, index) => <span key={`${row.label}-${index}`}><b>{row.label}</b> {row.value}</span>) : <span>{detail.formula ?? 'Calculated formula'}: {detail.value}</span>}</span></span>
    </span>
  }
  return <>
    <button type="button" className={`calculated-value ${className}`} onClick={() => setOpen(true)} aria-label={ariaLabel ?? `Show calculation for ${detail.title}`}>{children}</button>
    {open && <div className="calculation-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <article className="calculation-box" role="dialog" aria-modal="true" aria-label={`${detail.title} calculation`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Calculation details</span><h2>{detail.title}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close calculation">×</button></header>
        <div className="calculation-result"><span>Calculated value</span><strong>{detail.value}</strong></div>
        {detail.formula && <code>{detail.formula}</code>}
        <DetailRows rows={detail.rows}/>
        {detail.note && <p>{detail.note}</p>}
      </article>
    </div>}
  </>
}
