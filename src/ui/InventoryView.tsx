import { useDeferredValue, useState } from 'react'
import { db } from '../storage/database'
import type { Echo } from '../domain/types'
import { EchoMiniCard, Icon, PageHeader, Panel } from './components'
import { EchoEditModal } from './EchoEditModal'

export function InventoryView({ echoes, refresh, openScanner }: { echoes: Echo[]; refresh: () => Promise<void>; openScanner: () => void }) {
  const [query, setQuery] = useState('')
  const [cost, setCost] = useState('all')
  const [showExcluded, setShowExcluded] = useState(false)
  const [sort, setSort] = useState<'newest' | 'name' | 'cost' | 'level'>('newest')
  const [editing, setEditing] = useState<Echo | null>(null)
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const filtered = echoes.filter((echo) => (showExcluded || !echo.excluded) && (cost === 'all' || echo.cost === Number(cost)) && `${echo.name} ${echo.sonata}`.toLowerCase().includes(deferredQuery)).sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name)
    if (sort === 'cost') return right.cost - left.cost || right.level - left.level
    if (sort === 'level') return right.level - left.level || right.cost - left.cost
    return right.createdAt - left.createdAt
  })

  const patchEcho = async (echo: Echo, patch: Partial<Echo>) => { await db.echoes.update(echo.id, patch); await refresh() }
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
    <PageHeader eyebrow="Archive / { indexed locally }" title="Echo inventory" description="Filter the pieces you own, reserve high-value rolls, and exclude noise without deleting it." actions={<button className="primary" onClick={openScanner}><Icon name="scan"/>Add Echoes</button>} />
    <Panel className="toolbar"><label className="search"><span>?</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Echo or Sonata..."/></label><div className="segmented">{['all', '1', '3', '4'].map((value) => <button className={cost === value ? 'active' : ''} onClick={() => setCost(value)} key={value}>{value === 'all' ? 'All costs' : `${value}-cost`}</button>)}</div><select className="sort-select" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest</option><option value="name">Name</option><option value="cost">Highest cost</option><option value="level">Highest level</option></select><label className="check"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)}/>Show excluded</label><span className="count">{filtered.length} / {echoes.length}</span></Panel>
    {filtered.length ? <div className="echo-grid">{filtered.map((echo) => <EchoMiniCard key={echo.id} echo={echo} actions={<div className="card-actions"><button title="Edit" onClick={(event) => { event.stopPropagation(); setEditing(echo) }}><Icon name="edit"/></button><button title={echo.locked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); patchEcho(echo, { locked: !echo.locked }) }}><Icon name="lock"/></button><button title={echo.excluded ? 'Include' : 'Exclude'} onClick={(event) => { event.stopPropagation(); patchEcho(echo, { excluded: !echo.excluded }) }}>X</button><button title="Delete" onClick={(event) => { event.stopPropagation(); removeEcho(echo) }}><Icon name="trash"/></button></div>} />)}</div> : <Panel className="empty-state"><div className="empty-glyph">O</div><h2>No Echoes match this view</h2><p>Adjust the filters or scan an Echo detail screen.</p><button className="secondary" onClick={openScanner}>Open scanner</button></Panel>}
    {editing && <EchoEditModal echo={editing} onClose={() => setEditing(null)} onSave={async (updated) => { await db.echoes.put(updated); setEditing(null); await refresh() }}/>} 
  </>
}
