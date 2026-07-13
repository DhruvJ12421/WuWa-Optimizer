import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { characterCatalog, echoCatalog, weaponCatalog, type CharacterCatalogEntry, type WeaponCatalogEntry } from '../game-data'
import { db } from '../storage/database'
import type { Build, Echo, OwnedCharacter, OwnedWeapon, StatKey, Team } from '../domain/types'
import { EchoMiniCard, Icon, Panel } from './components'

const LEVELS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90]
const SKILLS = ['Basic', 'Skill', 'Forte', 'Liberation', 'Intro']
const ROVER_MARKER = { male: 'T_IconRoleHead256_4_UI', female: 'T_IconRoleHead256_5_UI' } as const

const isRover = (entry: CharacterCatalogEntry) => entry.name.startsWith('Rover:')
const isSelectedRover = (entry: CharacterCatalogEntry, gender: 'male' | 'female') => !isRover(entry) || entry.iconSourceUrl.includes(ROVER_MARKER[gender])
function displayCatalog(catalogId: string, gender: 'male' | 'female') {
  const entry = characterCatalog.find((candidate) => candidate.id === catalogId)
  if (!entry || !isRover(entry)) return entry
  return characterCatalog.find((candidate) => candidate.name === entry.name && isSelectedRover(candidate, gender)) || entry
}
const skillsFor = (character: OwnedCharacter) => character.skillLevels?.length === 5 ? character.skillLevels : [1, 1, 1, 1, 1]

function Stars({ rarity }: { rarity: number }) {
  return <span className={rarity === 4 ? 'rarity-stars four-star' : 'rarity-stars'}>{'★'.repeat(rarity)}</span>
}

function Chips<T extends string | number>({ values, selected, label, onChange }: { values: T[]; selected: T | 'all'; label: string; onChange: (value: T | 'all') => void }) {
  return <div className="owned-chip-filter"><span>{label}</span><div className="filter-chips"><button className={selected === 'all' ? 'active' : ''} onClick={() => onChange('all')}>All</button>{values.map((value) => <button className={selected === value ? 'active' : ''} key={value} onClick={() => onChange(value)}>{typeof value === 'number' ? String(value) + ' ★' : value}</button>)}</div></div>
}

function Picker({ title, query, setQuery, filters, children, onClose }: { title: string; query: string; setQuery: (value: string) => void; filters?: ReactNode; children: ReactNode; onClose: () => void }) {
  return <div className="catalog-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="catalog-picker" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">Local inventory</span><h2>{title}</h2></div><button className="text-button" onClick={onClose}>Close</button></header><div className="catalog-picker-tools"><label className="search"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search ' + title.toLowerCase() + '...'}/></label>{filters}</div><div className="catalog-picker-grid">{children}</div></section></div>
}

function totalsFor(echoes: Echo[]) {
  const totals: Partial<Record<StatKey, number>> = {}
  for (const echo of echoes) for (const line of [echo.mainStat, ...echo.subStats]) totals[line.key] = (totals[line.key] || 0) + line.value
  return totals
}
function statPair(flat?: number, percent?: number) {
  if (flat === undefined && percent === undefined) return '—'
  return (flat ? '+' + Math.round(flat) : '') + (flat && percent ? ' / ' : '') + (percent ? '+' + percent.toFixed(1) + '%' : '')
}

function LoadoutSquare({ label, image, meta, className = '' }: { label: string; image?: string; meta?: string; className?: string }) {
  return <div className={'character-loadout-square ' + className}>{image ? <img src={image} alt=""/> : <span>+</span>}<small>{label}</small>{meta && <b>{meta}</b>}</div>
}

function WeaponPicker({ character, catalog, weapons, builds, refresh, onClose }: { character: OwnedCharacter; catalog: CharacterCatalogEntry; weapons: OwnedWeapon[]; builds: Build[]; refresh: () => Promise<void>; onClose: () => void }) {
  const [adding, setAdding] = useState(false)
  const eligibleOwned = weapons.flatMap((item) => {
    const entry = weaponCatalog.find((candidate) => candidate.id === item.catalogId)
    return entry?.type.toLowerCase() === catalog.weaponType.toLowerCase() ? [{ item, catalog: entry }] : []
  })
  const eligibleCatalog = weaponCatalog.filter((entry) => entry.type.toLowerCase() === catalog.weaponType.toLowerCase())
  const equip = async (weapon: OwnedWeapon) => {
    const build = builds.find((item) => item.resonatorId === character.catalogId)
    const previousOwner = weapons.find((item) => item.id === weapon.id)?.equippedBy
    const previousCharacter = previousOwner ? await db.characters.get(previousOwner) : undefined
    const previousBuild = previousCharacter ? builds.find((item) => item.resonatorId === previousCharacter.catalogId) : undefined
    await db.transaction('rw', db.weapons, db.builds, async () => {
      await db.weapons.where('equippedBy').equals(character.id).modify({ equippedBy: undefined })
      await db.weapons.update(weapon.id, { equippedBy: character.id })
      if (previousBuild && previousBuild.id !== build?.id && previousBuild.weaponId === weapon.id) await db.builds.update(previousBuild.id, { weaponId: '' })
      if (build) await db.builds.update(build.id, { weaponId: weapon.id })
      else await db.builds.add({ id: crypto.randomUUID(), name: catalog.name + ' build', resonatorId: character.catalogId, weaponId: weapon.id, echoIds: [], level: character.level, skillLevel: skillsFor(character)[1] })
    })
    await refresh()
    onClose()
  }
  const add = async (entry: WeaponCatalogEntry) => {
    const weapon: OwnedWeapon = { id: crypto.randomUUID(), catalogId: entry.id, level: 1, rank: 1, locked: false, createdAt: Date.now() }
    await db.weapons.add(weapon)
    await equip(weapon)
  }
  return <div className="catalog-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="catalog-picker character-weapon-picker" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{catalog.weaponType} only</span><h2>{adding ? 'Add and equip weapon' : 'Equip weapon'}</h2></div><div className="picker-header-actions">{adding && <button className="secondary" onClick={() => setAdding(false)}>Owned weapons</button>}<button className="text-button" onClick={onClose}>Close</button></div></header><div className="catalog-picker-grid">
    {!adding && eligibleOwned.map(({ item, catalog: entry }) => <button className={'catalog-choice weapon-choice rarity-' + entry.rarity} key={item.id} onClick={() => void equip(item)}><img src={entry.iconSourceUrl} alt=""/><span><strong>{entry.name}</strong><small>Lv. {item.level} · R{item.rank}</small><Stars rarity={entry.rarity}/>{item.equippedBy && item.equippedBy !== character.id && <em>Currently equipped</em>}</span></button>)}
    {!adding && <button className="catalog-choice add-owned-choice" onClick={() => setAdding(true)}><span className="add-glyph">+</span><span><strong>Add weapon</strong><small>Create a local copy and equip it.</small></span></button>}
    {adding && eligibleCatalog.map((entry) => <button className={'catalog-choice weapon-choice rarity-' + entry.rarity} key={entry.id} onClick={() => void add(entry)}><img src={entry.iconSourceUrl} alt=""/><span><strong>{entry.name}</strong><small>{entry.type}</small><Stars rarity={entry.rarity}/></span></button>)}
  </div></section></div>
}

function EchoPicker({ slot, build, echoes, refresh, onClose }: { slot: number; build: Build; echoes: Echo[]; refresh: () => Promise<void>; onClose: () => void }) {
  const currentId = build.echoIds[slot]
  const options = echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build.id))
  const choose = async (next?: Echo) => {
    const oldId = build.echoIds[slot]
    const echoIds = [...build.echoIds]
    if (next) echoIds[slot] = next.id
    else echoIds.splice(slot, 1)
    const unique = echoIds.filter((id, index) => echoIds.indexOf(id) === index)
    const cost = unique.reduce((sum, id) => sum + (echoes.find((echo) => echo.id === id)?.cost || 0), 0)
    if (unique.length > 5 || cost > 12) return
    await db.transaction('rw', db.builds, db.echoes, async () => {
      await db.builds.update(build.id, { echoIds: unique })
      if (oldId && oldId !== next?.id) await db.echoes.update(oldId, { equippedBy: undefined })
      if (next) await db.echoes.update(next.id, { equippedBy: build.id })
    })
    await refresh()
    onClose()
  }
  return <div className="catalog-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="catalog-picker echo-equip-picker" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Echo slot {slot + 1}</span><h2>Equip Echo</h2></div><button className="text-button" onClick={onClose}>Close</button></header><div className="echo-picker-list">{currentId && <button className="danger" onClick={() => void choose()}>Unequip current Echo</button>}{options.map((echo) => <EchoMiniCard key={echo.id} echo={echo} selected={echo.id === currentId} onClick={() => void choose(echo)}/>)}</div></section></div>
}

function CharacterDetail({ character, catalog, weapons, echoes, builds, teams, refresh, onClose }: { character: OwnedCharacter; catalog: CharacterCatalogEntry; weapons: OwnedWeapon[]; echoes: Echo[]; builds: Build[]; teams: Team[]; refresh: () => Promise<void>; onClose: () => void }) {
  const [weaponOpen, setWeaponOpen] = useState(false)
  const [echoSlot, setEchoSlot] = useState<number | null>(null)
  const build = builds.find((entry) => entry.resonatorId === character.catalogId)
  const equipped = build?.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo)) || []
  const weapon = weapons.find((item) => item.id === build?.weaponId)
  const weaponEntry = weaponCatalog.find((entry) => entry.id === weapon?.catalogId)
  const totals = totalsFor(equipped)
  const elementKey = (catalog.element.toLowerCase() + 'Damage') as StatKey
  const stats = [
    ['HP', statPair(totals.hp, totals.hpPercent)], ['ATK', statPair(totals.atk, totals.atkPercent)], ['DEF', statPair(totals.def, totals.defPercent)],
    ['Energy Regen', (100 + (totals.energyRegen || 0)).toFixed(1) + '%'], ['Crit. Rate', (5 + (totals.critRate || 0)).toFixed(1) + '%'], ['Crit. DMG', (150 + (totals.critDamage || 0)).toFixed(1) + '%'],
    [catalog.element + ' DMG', (totals[elementKey] || 0).toFixed(1) + '%'], ['Basic DMG', (totals.basicDamage || 0).toFixed(1) + '%'], ['Heavy DMG', (totals.heavyDamage || 0).toFixed(1) + '%'],
    ['Skill DMG', (totals.skillDamage || 0).toFixed(1) + '%'], ['Liberation DMG', (totals.liberationDamage || 0).toFixed(1) + '%'], ['Healing Bonus', (totals.healingBonus || 0).toFixed(1) + '%']
  ]
  const skills = skillsFor(character)
  const update = async (patch: Partial<OwnedCharacter>) => { await db.characters.update(character.id, patch); if (build && patch.level) await db.builds.update(build.id, { level: patch.level }); await refresh() }
  const remove = async () => {
    await db.transaction('rw', db.characters, db.weapons, db.echoes, db.builds, db.teams, async () => {
      await db.characters.delete(character.id)
      await db.weapons.where('equippedBy').equals(character.id).modify({ equippedBy: undefined })
      if (build) {
        await db.echoes.where('equippedBy').equals(build.id).modify({ equippedBy: undefined })
        await db.teams.toCollection().modify((team) => { team.buildIds = team.buildIds.filter((id) => id !== build.id) })
        await db.builds.delete(build.id)
      }
    })
    await refresh()
    onClose()
  }
  const openEcho = async (slot: number) => {
    if (!build) await db.builds.add({ id: crypto.randomUUID(), name: catalog.name + ' build', resonatorId: character.catalogId, weaponId: '', echoIds: [], level: character.level, skillLevel: skills[1] })
    await refresh()
    setEchoSlot(slot)
  }
  return <div className="character-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={'character-detail redesigned rarity-' + catalog.rarity} role="dialog" aria-modal="true" aria-label={catalog.name + ' build'}>
    <header><div><span className="eyebrow">Character loadout</span><h2>{catalog.name}</h2></div><div className="detail-header-actions"><button className="danger" onClick={() => void remove()}><Icon name="trash"/>Delete character</button><button className="close" onClick={onClose}>×</button></div></header>
    <aside className="character-detail-left"><div className="detail-portrait"><img src={catalog.iconSourceUrl} alt=""/><button className={character.favorite ? 'favorite active' : 'favorite'} aria-label="Favorite character" onClick={() => void update({ favorite: !character.favorite })}>♥</button><div><h1>{catalog.name}</h1><span>{catalog.element} · {catalog.weaponType}</span><Stars rarity={catalog.rarity}/></div></div>
      <div className="detail-controls"><span className="control-title">Level</span><div className="level-buttons">{LEVELS.map((level) => <button className={character.level === level ? 'active' : ''} key={level} onClick={() => void update({ level })}>{level}</button>)}</div><span className="control-title">Sequence</span><div className="sequence-buttons">{[0, 1, 2, 3, 4, 5, 6].map((sequence) => <button className={character.sequence === sequence ? 'active' : ''} key={sequence} onClick={() => void update({ sequence })}><i>{sequence}</i><small>S{sequence}</small></button>)}</div></div>
      <div className="character-stat-list"><div><strong>Complete stats</strong><small>Echo contribution; base character values are not yet verified.</small></div>{stats.map(([label, value]) => <p key={label}><span>{label}</span><b>{value}</b></p>)}</div>
    </aside>
    <main className="character-detail-workspace redesigned-workspace"><Panel className="detail-skills"><div className="section-heading"><div><span className="eyebrow">Forte</span><h3>Skill levels</h3></div></div><div className="skill-editor">{SKILLS.map((name, index) => <div key={name}><span>{name}</span><button disabled={skills[index] <= 1} onClick={() => { const next = [...skills]; next[index] -= 1; void update({ skillLevels: next }) }}>−</button><b>{skills[index]}</b><button disabled={skills[index] >= 10} onClick={() => { const next = [...skills]; next[index] += 1; void update({ skillLevels: next }) }}>+</button></div>)}</div></Panel>
      <Panel className="detail-weapon equip-subcard" onClick={() => setWeaponOpen(true)}><div className="section-heading"><div><span className="eyebrow">Weapon</span><h3>{weaponEntry?.name || 'Equip Weapon'}</h3></div><b>Change</b></div>{weaponEntry ? <div className="detail-weapon-body"><img src={weaponEntry.iconSourceUrl} alt=""/><div><strong>Lv. {weapon?.level} · R{weapon?.rank}</strong><span>{weaponEntry.type}</span><Stars rarity={weaponEntry.rarity}/></div></div> : <div className="empty-equip-callout"><span>+</span><strong>Equip Weapon</strong><small>Choose an eligible owned weapon or add one.</small></div>}</Panel>
      <Panel className="detail-echoes"><div className="section-heading"><div><span className="eyebrow">Echo loadout</span><h3>{equipped.length}/5 equipped</h3></div><b>{equipped.reduce((sum, echo) => sum + echo.cost, 0)}/12 cost</b></div><div className="echo-loadout-layout">{Array.from({ length: 5 }, (_, index) => { const echo = equipped[index]; return <button className={'echo-slot echo-slot-' + (index + 1)} key={index} onClick={() => void openEcho(index)}>{echo ? <EchoMiniCard echo={echo}/> : <div className="detail-empty"><span>+</span><small>Echo {index + 1}</small></div>}</button> })}</div></Panel>
      <Panel className="detail-teams"><div className="section-heading"><div><span className="eyebrow">Teams</span><h3>Team connections</h3></div></div>{build && teams.filter((team) => team.buildIds.includes(build.id)).length ? teams.filter((team) => team.buildIds.includes(build.id)).map((team) => <article key={team.id}><strong>{team.name}</strong><span>{team.buildIds.length}/3 members</span></article>) : <div className="detail-empty-team"><strong>Not assigned to a team</strong><span>Use the Teams tab to add this build.</span></div>}</Panel>
    </main>
    {weaponOpen && <WeaponPicker character={character} catalog={catalog} weapons={weapons} builds={builds} refresh={refresh} onClose={() => setWeaponOpen(false)}/>}
    {echoSlot !== null && build && <EchoPicker slot={echoSlot} build={build} echoes={echoes} refresh={refresh} onClose={() => setEchoSlot(null)}/>}
  </section></div>
}

export function CharacterInventory({ owned, weapons = [], echoes = [], builds = [], teams = [], roverGender, refresh }: { owned: OwnedCharacter[]; weapons?: OwnedWeapon[]; echoes?: Echo[]; builds?: Build[]; teams?: Team[]; roverGender: 'male' | 'female'; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<string | 'all'>('all')
  const [rarity, setRarity] = useState<number | 'all'>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerElement, setPickerElement] = useState<string | 'all'>('all')
  const [pickerRarity, setPickerRarity] = useState<number | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const deferred = useDeferredValue(query.toLowerCase())
  const rows = useMemo(() => {
    const seenRovers = new Set<string>()
    return owned.flatMap((item) => {
      const catalog = displayCatalog(item.catalogId, roverGender)
      if (!catalog) return []
      if (isRover(catalog)) {
        if (seenRovers.has(catalog.name)) return []
        seenRovers.add(catalog.name)
      }
      return [{ item, catalog }]
    })
  }, [owned, roverGender])
  const visible = rows.filter(({ catalog }) => (element === 'all' || catalog.element === element) && (rarity === 'all' || catalog.rarity === rarity) && (catalog.name + ' ' + catalog.element + ' ' + catalog.weaponType).toLowerCase().includes(deferred)).sort((a, b) => Number(Boolean(b.item.favorite)) - Number(Boolean(a.item.favorite)) || a.catalog.name.localeCompare(b.catalog.name))
  const addCatalog = characterCatalog.filter((entry) => isSelectedRover(entry, roverGender))
  const available = addCatalog.filter((entry) => !owned.some((item) => displayCatalog(item.catalogId, roverGender)?.name === entry.name) && (pickerElement === 'all' || entry.element === pickerElement) && (pickerRarity === 'all' || entry.rarity === pickerRarity) && (entry.name + ' ' + entry.element + ' ' + entry.weaponType).toLowerCase().includes(pickerQuery.toLowerCase()))
  const selected = rows.find(({ item }) => item.id === selectedId)
  const add = async (catalogId: string) => { await db.characters.add({ id: crypto.randomUUID(), catalogId, level: 1, sequence: 0, locked: false, favorite: false, skillLevels: [1, 1, 1, 1, 1], createdAt: Date.now() }); setPickerOpen(false); await refresh() }
  return <><Panel className="owned-add"><div><span className="eyebrow">Character roster</span><strong>Favorites stay at the top. Open a card to edit its loadout.</strong></div><button className="primary" onClick={() => setPickerOpen(true)}><Icon name="plus"/>Add character</button></Panel><Panel className="owned-filter chip-toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search characters..."/></label><Chips label="Element" values={[...new Set(addCatalog.map((item) => item.element))]} selected={element} onChange={setElement}/><Chips label="Rarity" values={[5, 4]} selected={rarity} onChange={setRarity}/><span>{visible.length} / {owned.length}</span></Panel>
    <div className="character-candy-grid">{visible.map(({ item, catalog }) => {
      const build = builds.find((entry) => entry.resonatorId === item.catalogId)
      const weapon = weapons.find((entry) => entry.id === build?.weaponId)
      const weaponEntry = weaponCatalog.find((entry) => entry.id === weapon?.catalogId)
      const equipped = build?.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo)) || []
      return <article className={'character-candy-card rarity-' + catalog.rarity} key={item.id} onClick={() => setSelectedId(item.id)}><button className={item.favorite ? 'favorite active' : 'favorite'} aria-label="Favorite character" onClick={async (event) => { event.stopPropagation(); await db.characters.update(item.id, { favorite: !item.favorite }); await refresh() }}>♥</button><div className="candy-character-art"><img src={catalog.iconSourceUrl} alt=""/></div><div className="candy-character-copy"><header><h2>{catalog.name}</h2><p>{catalog.element} · {catalog.weaponType} · <Stars rarity={catalog.rarity}/></p></header><div className="candy-level"><strong>Lv. {item.level}/90</strong><b>S{item.sequence}</b></div><div className="candy-skills">{skillsFor(item).map((level, index) => <span key={SKILLS[index]} title={SKILLS[index]}><i>{SKILLS[index].slice(0, 1)}</i>{level}</span>)}</div></div><div className="candy-loadout"><LoadoutSquare className={weaponEntry ? 'rarity-' + weaponEntry.rarity : ''} label={weaponEntry?.name || 'Weapon'} image={weaponEntry?.iconSourceUrl} meta={weapon ? 'Lv.' + weapon.level : undefined}/>{Array.from({ length: 5 }, (_, index) => { const echo = equipped[index]; return <LoadoutSquare key={index} label={echo?.name || 'Echo ' + (index + 1)} image={echo ? echoCatalog.find((entry) => entry.name === echo.name)?.iconSourceUrl : undefined} meta={echo ? '+' + echo.level : undefined}/> })}</div></article>
    })}</div>
    {pickerOpen && <Picker title="Choose a character" query={pickerQuery} setQuery={setPickerQuery} filters={<div className="catalog-picker-filters"><Chips label="Element" values={[...new Set(addCatalog.map((item) => item.element))]} selected={pickerElement} onChange={setPickerElement}/><Chips label="Rarity" values={[5, 4]} selected={pickerRarity} onChange={setPickerRarity}/></div>} onClose={() => setPickerOpen(false)}>{available.map((entry) => <button className={'catalog-choice character-choice rarity-' + entry.rarity} key={entry.id} onClick={() => void add(entry.id)}><img src={entry.iconSourceUrl} alt=""/><span><strong>{entry.name}</strong><small>{entry.element} · {entry.weaponType}</small><Stars rarity={entry.rarity}/></span></button>)}</Picker>}
    {selected && <CharacterDetail character={selected.item} catalog={selected.catalog} weapons={weapons} echoes={echoes} builds={builds} teams={teams} refresh={refresh} onClose={() => setSelectedId(null)}/>}
  </>
}
