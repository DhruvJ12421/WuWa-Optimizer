import { useDeferredValue, useMemo, useState } from 'react'
import { statLabels } from '../game-data'
import { echoRollGrade, echoRollPoints, echoRollQuality } from '../domain/echo-grade'
import { db } from '../storage/database'
import type { Echo, StatKey } from '../domain/types'
import { EchoMiniCard, Icon, PageHeader, Panel } from './components'
import { EchoEditModal } from './EchoEditModal'
import { SonataPicker } from './SonataPicker'

type SortKey = 'score' | 'newest' | 'name' | 'cost' | 'level'

const echoScore = echoRollQuality

export function InventoryView({ echoes, refresh, openScanner, embedded = false }: { echoes: Echo[]; refresh: () => Promise<void>; openScanner: () => void; embedded?: boolean }) {
  const [query, setQuery] = useState('')
  const [costs, setCosts] = useState<number[]>([])
  const [rarities, setRarities] = useState<number[]>([])
  const [sonata, setSonata] = useState('all')
  const [mainStat, setMainStat] = useState('all')
  const [subStat, setSubStat] = useState('all')
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
  const reset = () => { setQuery(''); setCosts([]); setRarities([]); setSonata('all'); setMainStat('all'); setSubStat('all'); setLockState('all'); setAssignment('all'); setShowExcluded(false); setSort('score'); setDescending(true) }

  const filtered = useMemo(() => echoes.filter((echo) =>
    (showExcluded || !echo.excluded) &&
    (!costs.length || costs.includes(echo.cost)) &&
    (!rarities.length || rarities.includes(echo.rarity)) &&
    (sonata === 'all' || echo.sonata === sonata) &&
    (mainStat === 'all' || echo.mainStat.key === mainStat) &&
    (subStat === 'all' || echo.subStats.some((stat) => stat.key === subStat)) &&
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
  }), [assignment, costs, deferredQuery, descending, echoes, lockState, mainStat, rarities, showExcluded, sonata, sort, subStat])

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
        <label>Sonata<SonataPicker id="inventory-sonata" value={sonata} onChange={setSonata} allowAll/></label>
        <label>Main stat<select value={mainStat} onChange={(event) => setMainStat(event.target.value)}><option value="all">Any main stat</option>{statKeys.map((key) => <option value={key} key={key}>{statLabels[key]}</option>)}</select></label>
        <label>Required substat<select value={subStat} onChange={(event) => setSubStat(event.target.value)}><option value="all">Any substat</option>{statKeys.map((key) => <option value={key} key={key}>{statLabels[key]}</option>)}</select></label>
        <label>Lock state<select value={lockState} onChange={(event) => setLockState(event.target.value as typeof lockState)}><option value="all">Locked or unlocked</option><option value="locked">Locked only</option><option value="unlocked">Unlocked only</option></select></label>
        <label>Assignment<select value={assignment} onChange={(event) => setAssignment(event.target.value as typeof assignment)}><option value="all">Equipped or available</option><option value="equipped">Equipped only</option><option value="unequipped">Available only</option></select></label>
        <label className="check"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)}/>Include excluded</label>
      </div>}
    </Panel>
    <div className="inventory-sort"><span>Showing {filtered.length} Echoes</span><label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="score">Roll score</option><option value="newest">Newest</option><option value="name">Name</option><option value="cost">Cost</option><option value="level">Level</option></select></label><button className="secondary" onClick={() => setDescending((value) => !value)}>{descending ? 'Descending ↓' : 'Ascending ↑'}</button></div>
    {filtered.length ? <div className="echo-grid">{filtered.map((echo) => { const score = echoScore(echo); return <EchoMiniCard key={echo.id} echo={echo} grade={`${score.toFixed(1)} · ${echoRollGrade(score)}`} scoreLabel={`${echoRollPoints(echo)}/40 ROLL POINTS`} actions={<div className="card-actions"><button title="Edit" onClick={(event) => { event.stopPropagation(); setEditing(echo) }}><Icon name="edit"/></button><button title={echo.locked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { locked: !echo.locked }) }}><Icon name="lock"/></button><button title={echo.excluded ? 'Include' : 'Exclude'} onClick={(event) => { event.stopPropagation(); void patchEcho(echo, { excluded: !echo.excluded }) }}>X</button><button title="Delete" onClick={(event) => { event.stopPropagation(); void removeEcho(echo) }}><Icon name="trash"/></button></div>} /> })}</div> : <Panel className="empty-state"><div className="empty-glyph">O</div><h2>No Echoes match these filters</h2><p>Reset the filters or add another Echo.</p><button className="secondary" onClick={reset}>Reset filters</button></Panel>}
    {editing && <EchoEditModal echo={editing} onClose={() => setEditing(null)} onSave={async (updated) => { await db.echoes.put(updated); setEditing(null); await refresh() }}/>} 
  </>
}
