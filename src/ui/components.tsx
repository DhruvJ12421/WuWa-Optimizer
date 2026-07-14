import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { echoCatalog, statLabels } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'
import { effectiveSubStats, fixedSecondaryMainStat } from '../game-data/echo-main-stats'
import { substatTierPoints } from '../domain/echo-grade'
import type { Echo, StatKey } from '../domain/types'

export function Icon({ name }: { name: 'home' | 'scan' | 'echo' | 'build' | 'team' | 'optimize' | 'download' | 'upload' | 'lock' | 'unlock' | 'trash' | 'edit' | 'plus' }) {
  const paths: Record<typeof name, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M7 12h10M12 7v10"/></>,
    echo: <><circle cx="12" cy="12" r="8"/><path d="M4 12h4l2-6 4 12 2-6h4"/></>,
    build: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></>,
    team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 20c.5-5 2.5-7 5.5-7s5 2 5.5 7M14 15c3.5 0 5.5 1.5 6 5"/></>,
    optimize: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    unlock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.7-1.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
    edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function Panel({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return <section className={`panel ${className}`} {...props}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</header>
}

export function StatValue({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return <div className="stat-value"><span>{label}</span><strong className={accent ? 'accent' : ''}>{value}</strong></div>
}

export function EchoMiniCard({ echo, selected, onClick, actions, equipment, grade, scoreLabel = 'ROLL QUALITY' }: { echo: Echo; selected?: boolean; onClick?: () => void; actions?: ReactNode; equipment?: ReactNode; grade?: string; scoreLabel?: string }) {
  const catalog = echoCatalog.find((item) => item.name === echo.name)
  const secondary = fixedSecondaryMainStat(echo)
  const gradeTone = grade?.trim().split(/\s+/).at(-1)?.toLowerCase()
  return <article className={`echo-card ${selected ? 'selected' : ''} ${echo.excluded ? 'excluded' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick() } } : undefined}>
    <div className="echo-card-head"><div className="echo-portrait">{catalog?.iconSourceUrl ? <img src={catalog.iconSourceUrl} alt="" loading="lazy"/> : <span>◎</span>}<b className={`cost-orb cost-${echo.cost}`}>{echo.cost}</b></div><div className="echo-identity"><h3>{echo.name}</h3><span className="echo-sonata">{generatedSonataIconSources[echo.sonata] && <img src={generatedSonataIconSources[echo.sonata]} alt="" loading="lazy"/>}<b>{echo.sonata}</b></span><small>LV. {echo.level} · <b className="echo-stars">{'★'.repeat(echo.rarity)}</b></small></div>{echo.locked && <Icon name="lock" />}</div>
    <div className="echo-main-stats"><div className="main-stat"><span><i>✦</i>{statLabels[echo.mainStat.key]}</span><strong>{formatStat(echo.mainStat.key, echo.mainStat.value)}</strong></div><div className="secondary-main-stat"><span><i>◆</i>{statLabels[secondary.key]}</span><strong>{formatStat(secondary.key, secondary.value)}</strong></div></div>
    <div className="substats">{effectiveSubStats(echo).map((stat, index) => { const tier = substatTierPoints(stat.key, stat.value); return <div key={`${stat.key}-${index}`}><span><i>{statGlyph(stat.key)}</i>{statLabels[stat.key]}</span><b className={`roll-tier-${tier}`} title={tier ? `Roll tier ${tier}/8` : 'Unknown roll tier'}>{formatStat(stat.key, stat.value)}</b></div> })}</div>
    <footer>{grade && <><span>{scoreLabel}</span><strong className={`echo-score ${gradeTone ? `grade-${gradeTone}` : ''}`}>{grade}</strong></>}{actions}</footer>
    {equipment && <div className="echo-equipment">{equipment}</div>}
  </article>
}

function statGlyph(key: StatKey) {
  if (key.includes('crit')) return '✧'
  if (key.includes('Damage')) return '✦'
  if (key.includes('Percent')) return '◇'
  if (key === 'energyRegen') return '↻'
  return '◆'
}

export function formatStat(key: StatKey, value: number) {
  return ['hp', 'atk', 'def'].includes(key) ? Math.round(value).toLocaleString('en-US') : `${value.toFixed(1)}%`
}

export function Confidence({ value }: { value: number }) {
  const level = value >= 0.8 ? 'high' : value >= 0.55 ? 'medium' : 'low'
  return <span className={`confidence ${level}`}>{Math.round(value * 100)}%</span>
}
