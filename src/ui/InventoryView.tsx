import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { characterCatalog, sonataNames, statLabels } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'
import { echoRollGrade, echoRollPoints, echoRollQuality } from '../domain/echo-grade'
import { db } from '../storage/database'
import type { Build, Echo, StatKey } from '../domain/types'
import { EchoMiniCard, Icon, PageHeader, Panel } from './components'
import { EchoEditModal } from './EchoEditModal'

type SortKey = 'score' | 'newest' | 'name' | 'cost' | 'level'

const echoScore = echoRollQuality

function MultiSelect({ label, values, options, emptyLabel, onChange, icon }: { label: string; values: string[]; options: Array<{ value: string; label: string }>; emptyLabel: string; onChange: (values: string[]) => void; icon?: (value: string) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(values)
  const show = () => { setDraft(values); setOpen(true) }
  const toggle = (value: string) => setDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  return <label className="multi-filter">{label}<div className="multi-select">
    <button type="button" className="multi-select-trigger" aria-expanded={open} onClick={() => open ? setOpen(false) : show()}>
      <span className="multi-select-values">{values.length ? values.map((value) => <span className="multi-select-chip" key={value}>{icon?.(value)}<b>{options.find((option) => option.value === value)?.label ?? value}</b><i role="button" aria-label={`Remove ${value}`} onClick={(event) => { event.stopPropagation(); onChange(values.filter((item) => item !== value)) }}>x</i></span>) : <em>{emptyLabel}</em>}</span><strong>⌄</strong>
    </button>
    {open && <div className="multi-select-menu">
      <div className="multi-select-options">{options.map((option) => <button type="button" className={draft.includes(option.value) ? 'active' : ''} onClick={() => toggle(option.value)} key={option.value}>{icon?.(option.value)}<span>{option.label}</span><i>{draft.includes(option.value) ? '✓' : ''}</i></button>)}</div>
      <footer><button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="primary" onClick={() => { onChange(draft); setOpen(false) }}>Apply</button></footer>
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
    (!subStats.length || subStats.every((key) => echo.subStats.some((stat) => stat.key === key))) &&
    (lockState === 'all' || echo.locked === (lockState === 'locked')) &&
    (assignment === 'all' || Boolean(echo.equippedBy) === (assignment === 'equipped')) &&
    (!deferredQuery || `${echo.name} ${echo.sonata} ${statLabels[echo.mainStat.key]} ${echo.subStats.map((stat) => statLabels[stat.key]).join(' ')}`.toLowerCase().includes(deferredQuery))
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
      <div className="filter-heading"><div><strong>Echo filters</strong><span>{filtered.length} / {echoes.length} shown</span><small title="Each relevant substat earns 1–8 points by roll tier. Flat HP, ATK, and DEF earn 3 points. The total is scaled from 40 to 100; character usefulness is not applied.">Roll quality ⓘ</small></div><div><button className="text-button" onClick={reset}>Reset</button><button className="secondary" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? 'Collapse' : 'Expand'}</button></div></div>
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
    {filtered.length ? <div className="echo-grid">{filtered.map((echo) => { const score = echoScore(echo); const build = builds.find((entry) => entry.id === echo.equippedBy || entry.echoIds.includes(echo.id)); const character = characterCatalog.find((entry) => entry.id === build?.resonatorId); const equippedName = character?.name ?? echo.equippedByName ?? 'Unequipped'; return <EchoMiniCard key={echo.id} echo={echo} grade={`${score.toFixed(1)} · ${echoRollGrade(score)}`} scoreLabel={`${echoRollPoints(echo)}/40 ROLL POINTS`} equipment={<><span>{character?.iconSourceUrl ? <img src={character.iconSourceUrl} alt=""/> : <i>—</i>}<b>{equippedName}</b></span><button title="Edit Echo" aria-label={`Edit ${echo.name}`} onClick={(event) => { event.stopPropagation(); setEditing(echo) }}><Icon name="edit"/></button></>} actions={<div className="card-actions"><button title={echo.locked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { locked: !echo.locked }) }}><Icon name="lock"/></button><button title={echo.excluded ? 'Restore discarded Echo' : 'Mark as discarded'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { excluded: !echo.excluded }) }}>X</button><button title="Delete" onClick={(event) => { event.stopPropagation(); void removeEcho(echo) }}><Icon name="trash"/></button></div>} /> })}</div> : <Panel className="empty-state"><div className="empty-glyph">O</div><h2>No Echoes match these filters</h2><p>Reset the filters or add another Echo.</p><button className="secondary" onClick={reset}>Reset filters</button></Panel>}
    {editing && <EchoEditModal echo={editing} onClose={() => setEditing(null)} onSave={async (updated) => { await db.echoes.put(updated); setEditing(null); await refresh() }}/>} 
  </>
}
