import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { characterCatalog, sonataNames, statLabels } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'
import { echoRollGrade, echoRollPoints, echoRollQuality } from '../domain/echo-grade'
import { effectiveSubStats, maxSubStatsForLevel } from '../game-data/echo-main-stats'
import { db } from '../storage/database'
import type { Build, Echo, StatKey } from '../domain/types'
import { EchoMiniCard, EquippedCharacterLabel, Icon, PageHeader, Panel } from './components'
import { EchoEditModal } from './EchoEditModal'

type SortKey = 'score' | 'newest' | 'name' | 'cost' | 'level'

const echoScore = echoRollQuality

function MultiSelect({ label, values, options, emptyLabel, onChange, icon }: { label: string; values: string[]; options: Array<{ value: string; label: string }>; emptyLabel: string; onChange: (values: string[]) => void; icon?: (value: string) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  return <label className="multi-filter">{label}<div className="multi-select">
    <button type="button" className="multi-select-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="multi-select-values">{values.length ? values.map((value) => <span className="multi-select-chip" key={value}>{icon?.(value)}<b>{options.find((option) => option.value === value)?.label ?? value}</b><i role="button" aria-label={`Remove ${value}`} onClick={(event) => { event.stopPropagation(); onChange(values.filter((item) => item !== value)) }}>×</i></span>) : <em>{emptyLabel}</em>}</span><strong>⌄</strong>
    </button>
    {open && <div className="multi-select-menu">
      <div className="multi-select-options">{options.map((option) => <button type="button" className={values.includes(option.value) ? 'active' : ''} onClick={() => toggle(option.value)} key={option.value}>{icon?.(option.value)}<span>{option.label}</span><i>{values.includes(option.value) ? '✓' : ''}</i></button>)}</div>
      <footer><button type="button" className="multi-select-clear" disabled={!values.length} onClick={() => onChange([])}>Clear selections</button></footer>
    </div>}
  </div></label>
}

export function InventoryView({ echoes, builds = [], refresh, openScanner, embedded = false }: { echoes: Echo[]; builds?: Build[]; refresh: () => Promise<void>; openScanner: () => void; embedded?: boolean }) {
  const [query, setQuery] = useState('')
  const [costs, setCosts] = useState<number[]>([])
  const [rarities, setRarities] = useState<number[]>([])
  const [sonatas, setSonatas] = useState<string[]>([])
  const [mainStats, setMainStats] = useState<string[]>([])
  const [subStats, setSubStats] = useState<string[]>([])
  const [lockState, setLockState] = useState<'all' | 'locked' | 'unlocked'>('all')
  const [assignment, setAssignment] = useState<'all' | 'equipped' | 'unequipped'>('all')
  const [showExcluded, setShowExcluded] = useState(false)
  const [sort, setSort] = useState<SortKey>('score')
  const [descending, setDescending] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [editing, setEditing] = useState<Echo | null>(null)
  const [rollInfoOpen, setRollInfoOpen] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const statKeys = Object.keys(statLabels) as StatKey[]
  const toggle = (values: number[], value: number, change: (next: number[]) => void) => change(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  const reset = () => { setQuery(''); setCosts([]); setRarities([]); setSonatas([]); setMainStats([]); setSubStats([]); setLockState('all'); setAssignment('all'); setShowExcluded(false); setSort('score'); setDescending(true) }

  const filtered = useMemo(() => echoes.filter((echo) =>
    (showExcluded || !echo.excluded) &&
    (!costs.length || costs.includes(echo.cost)) &&
    (!rarities.length || rarities.includes(echo.rarity)) &&
    (!sonatas.length || sonatas.includes(echo.sonata)) &&
    (!mainStats.length || mainStats.includes(echo.mainStat.key)) &&
    (!subStats.length || subStats.every((key) => effectiveSubStats(echo).some((stat) => stat.key === key))) &&
    (lockState === 'all' || echo.locked === (lockState === 'locked')) &&
    (assignment === 'all' || Boolean(echo.equippedBy) === (assignment === 'equipped')) &&
    (!deferredQuery || `${echo.name} ${echo.sonata} ${statLabels[echo.mainStat.key]} ${effectiveSubStats(echo).map((stat) => statLabels[stat.key]).join(' ')}`.toLowerCase().includes(deferredQuery))
  ).sort((left, right) => {
    const direction = descending ? -1 : 1
    if (sort === 'score') return (echoScore(left) - echoScore(right)) * direction || left.name.localeCompare(right.name)
    if (sort === 'name') return left.name.localeCompare(right.name) * direction
    if (sort === 'cost') return (left.cost - right.cost) * direction || (left.level - right.level) * direction
    if (sort === 'level') return (left.level - right.level) * direction || (left.cost - right.cost) * direction
    return (left.createdAt - right.createdAt) * direction
  }), [assignment, costs, deferredQuery, descending, echoes, lockState, mainStats, rarities, showExcluded, sonatas, sort, subStats])

  const patchEcho = async (echo: Echo, patch: Partial<Echo>) => {
    const exclusivePatch = patch.locked ? { ...patch, excluded: false } : patch.excluded ? { ...patch, locked: false } : patch
    await db.echoes.update(echo.id, exclusivePatch); await refresh()
  }
  const removeEcho = async (echo: Echo) => {
    if (!confirm(`Delete ${echo.name}? This cannot be undone.`)) return
    await db.transaction('rw', db.echoes, db.builds, async () => {
      if (echo.equippedBy) {
        const build = await db.builds.get(echo.equippedBy)
        if (build) await db.builds.update(build.id, { echoIds: build.echoIds.filter((id) => id !== echo.id) })
      }
      await db.echoes.delete(echo.id)
    })
    await refresh()
  }

  return <>
    {!embedded && <PageHeader eyebrow="Archive / { indexed locally }" title="Echo inventory" description="Filter the pieces you own, compare roll quality, and reserve the strongest Echoes." actions={<button className="primary" onClick={openScanner}><Icon name="scan"/>Add Echoes</button>} />}
    {embedded && <div className="inventory-section-heading"><div><span className="eyebrow">Echo collection</span><h2>Owned Echoes</h2></div><button className="primary" onClick={openScanner}><Icon name="scan"/>Add Echoes</button></div>}
    <Panel className="inventory-filter">
      <div className="filter-heading"><div><strong>Echo filters</strong><span>{filtered.length} / {echoes.length} shown</span><button type="button" className="roll-quality-help" onClick={() => setRollInfoOpen(true)}>Roll quality <span aria-hidden="true">ⓘ</span></button></div><div><button className="text-button" onClick={reset}>Reset</button><button className="secondary" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? 'Collapse' : 'Expand'}</button></div></div>
      <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Echo, Sonata, or stat..."/></label>
      {filtersOpen && <div className="filter-body">
        <div className="filter-group"><span>Cost</span><div className="filter-chips">{[1,3,4].map((value) => <button className={costs.includes(value) ? 'active' : ''} onClick={() => toggle(costs, value, setCosts)} key={value}>{value} cost</button>)}</div></div>
        <div className="filter-group"><span>Rarity</span><div className="filter-chips">{[5,4,3,2,1].map((value) => <button className={rarities.includes(value) ? 'active' : ''} onClick={() => toggle(rarities, value, setRarities)} key={value}>{value} ★</button>)}</div></div>
        <MultiSelect label="Sonata" values={sonatas} options={sonataNames.map((name) => ({ value: name, label: name }))} emptyLabel="All Sonatas" onChange={setSonatas} icon={(name) => <img src={generatedSonataIconSources[name]} alt=""/>}/>
        <MultiSelect label="Main stat" values={mainStats} options={statKeys.map((key) => ({ value: key, label: statLabels[key] }))} emptyLabel="Any main stat" onChange={setMainStats}/>
        <MultiSelect label="Substat" values={subStats} options={statKeys.map((key) => ({ value: key, label: statLabels[key] }))} emptyLabel="Any substat" onChange={setSubStats}/>
        <label>Lock state<select value={lockState} onChange={(event) => setLockState(event.target.value as typeof lockState)}><option value="all">All</option><option value="locked">Locked</option><option value="unlocked">Unlocked</option></select></label>
        <label>Equipped<select value={assignment} onChange={(event) => setAssignment(event.target.value as typeof assignment)}><option value="all">All</option><option value="equipped">Equipped</option><option value="unequipped">Unequipped</option></select></label>
        <label className="check"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)}/>Include discarded</label>
      </div>}
    </Panel>
    <div className="inventory-sort"><span>Showing {filtered.length} Echoes</span><label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="score">Roll score</option><option value="newest">Newest</option><option value="name">Name</option><option value="cost">Cost</option><option value="level">Level</option></select></label><button className="secondary" onClick={() => setDescending((value) => !value)}>{descending ? 'Descending ↓' : 'Ascending ↑'}</button></div>
    {filtered.length ? <div className="echo-grid">{filtered.map((echo) => { const score = echoScore(echo); const build = builds.find((entry) => entry.echoIds.includes(echo.id)); const character = characterCatalog.find((entry) => entry.id === build?.resonatorId); return <EchoMiniCard key={echo.id} echo={echo} grade={`${score.toFixed(1)} · ${echoRollGrade(score)}`} scoreLabel={`${echoRollPoints(echo)}/${maxSubStatsForLevel(echo.level) * 8} ROLL POINTS`} equipment={<><EquippedCharacterLabel name={character?.name}/><button title="Edit Echo" aria-label={`Edit ${echo.name}`} onClick={(event) => { event.stopPropagation(); setEditing(echo) }}><Icon name="edit"/></button></>} actions={<div className="card-actions"><button title={echo.locked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { locked: !echo.locked }) }}><Icon name="lock"/></button><button title={echo.excluded ? 'Restore discarded Echo' : 'Mark as discarded'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { excluded: !echo.excluded }) }}>X</button><button title="Delete" onClick={(event) => { event.stopPropagation(); void removeEcho(echo) }}><Icon name="trash"/></button></div>} /> })}</div> : <Panel className="empty-state"><div className="empty-glyph">O</div><h2>No Echoes match these filters</h2><p>Reset the filters or add another Echo.</p><button className="secondary" onClick={reset}>Reset filters</button></Panel>}
    {rollInfoOpen && <div className="modal-backdrop roll-quality-backdrop" onMouseDown={() => setRollInfoOpen(false)}><Panel className="roll-quality-modal" role="dialog" aria-modal="true" aria-labelledby="roll-quality-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">Echo evaluation</span><h2 id="roll-quality-title">How Roll Quality works</h2></div><button className="close" aria-label="Close Roll Quality information" onClick={() => setRollInfoOpen(false)}>×</button></header>
      <p>Roll Quality measures how high an Echo's valid substat rolls landed. It does not judge whether those stats are useful for a particular character.</p>
      <section><h3>1. Each substat earns roll points</h3><p>Percentage substats use their position on the eight fixed in-game roll values. The lowest roll earns 1 point and the highest earns 8.</p><div className="roll-tier-legend"><span className="tier-low">1–2 Low</span><span className="tier-mid">3–4 Mid</span><span className="tier-high">5–6 High</span><span className="tier-perfect">7–8 Elite</span></div><p>Flat HP, ATK, and DEF use four possible values and currently receive 3 points.</p></section>
      <section><h3>2. Level controls the maximum</h3><p>An Echo gains one available substat slot every five levels: +5 has one slot, +15 has three, +20 has four, and +25 has five. Maximum points equal available slots × 8.</p></section>
      <section><h3>3. Points become a percentage and grade</h3><div className="quality-formula"><b>Earned roll points</b><span>÷</span><b>Maximum points at this level</b><span>× 100</span></div><div className="grade-legend"><span className="grade-e">E<small>0–18.74</small></span><span className="grade-d">D<small>18.75–31.24</small></span><span className="grade-c">C<small>31.25–43.74</small></span><span className="grade-b">B<small>43.75–56.24</small></span><span className="grade-a">A<small>56.25–68.74</small></span><span className="grade-s">S<small>68.75–81.24</small></span><span className="grade-ss">SS<small>81.25–93.74</small></span><span className="grade-sss">SSS<small>93.75–100</small></span></div></section>
    </Panel></div>}
    {editing && <EchoEditModal echo={editing} onClose={() => setEditing(null)} onSave={async (updated) => { await db.echoes.put(updated); setEditing(null); await refresh() }}/>} 
  </>
}
