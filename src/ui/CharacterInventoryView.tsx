import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { characterCatalog, echoCatalog, statLabels, weaponCatalog, type CharacterCatalogEntry, type WeaponCatalogEntry } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'
import { echoStatLines } from '../game-data/echo-main-stats'
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
  for (const echo of echoes) for (const line of echoStatLines(echo)) totals[line.key] = (totals[line.key] || 0) + line.value
  return totals
}
function statPair(flat?: number, percent?: number) {
  if (flat === undefined && percent === undefined) return '—'
  return (flat ? '+' + Math.round(flat) : '') + (flat && percent ? ' / ' : '') + (percent ? '+' + percent.toFixed(1) + '%' : '')
}

function LoadoutSquare({ label, image, meta, className = '' }: { label: string; image?: string; meta?: string; className?: string }) {
  return <div className={'character-loadout-square ' + className}>{image ? <img src={image} alt=""/> : <span>+</span>}<small>{label}</small>{meta && <b>{meta}</b>}</div>
}

function SignalWave({ tone = 0 }: { tone?: number }) {
  return <svg className={`signal-wave signal-tone-${tone % 6}`} viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden="true">
    <path className="signal-wave-fill" d="M0 13C56 4 84 20 139 13S231 3 286 12s94 10 146 1 109-7 168 0v11H0Z"/>
    <path className="signal-wave-dim" d="M0 12c44-7 86 8 130 2s78-12 124-4 85 13 137 4 93-12 132-5 49 8 77 4"/>
    <path className="signal-wave-mid" d="M0 17c62 2 82-13 143-7s89 13 145 5 95-13 151-5 95 12 161 1"/>
    <path className="signal-wave-bright" d="M0 10c51 8 92-9 142-3s83 16 139 7 91-15 151-6 97 9 168-2"/>
  </svg>
}

function StatGlyph({ stat }: { stat: StatKey }) {
  const shape = stat === 'hp' ? <path d="M12 20S4 15.6 4 9.4C4 5.5 8.7 3.7 12 7c3.3-3.3 8-1.5 8 2.4C20 15.6 12 20 12 20Z"/>
    : stat === 'atk' ? <><path d="m5 19 14-14M14 5h5v5M5 14v5h5"/><path d="m8 8 8 8"/></>
      : stat === 'def' ? <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z"/>
        : stat.includes('crit') ? <><path d="m12 3 2.2 5.1L20 9l-4.2 3.8 1.1 5.7L12 15.7l-4.9 2.8 1.1-5.7L4 9l5.8-.9L12 3Z"/></>
          : stat === 'energyRegen' ? <path d="M13.4 2 6 13h5l-.5 9L18 10h-5l.4-8Z"/>
            : <><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>
  return <svg className="showcase-stat-icon" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>
}

function SkillGlyph({ index }: { index: number }) {
  const paths = [
    <><path d="M5 18 17 6M13 5h5v5M4 19l4-1-3-3-1 4Z"/><path d="m8 8 8 8"/></>,
    <><circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14M8 8l8 8M16 8l-8 8"/></>,
    <><path d="M12 3 6 10l6 11 6-11-6-7Z"/><path d="m9 11 3-4 3 4-3 5-3-5Z"/></>,
    <><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3 3M15.4 15.4l3 3M18.4 5.6l-3 3M8.6 15.4l-3 3"/></>,
    <><path d="M4 17c4.8 0 7-2.4 8-7 1 4.6 3.2 7 8 7"/><path d="M7 10c2.2 0 4-1.8 5-6 1 4.2 2.8 6 5 6"/></>
  ]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[index]}</svg>
}

function SequenceGlyph({ index }: { index: number }) {
  const turns = index % 2 ? 45 : 0
  return <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${turns}deg)` }}><path d="M16 3 27 9v14l-11 6L5 23V9l11-6Z"/><path d={index % 3 === 0 ? 'M9 17c5-8 9-8 14 0-5 8-9 8-14 0Z' : index % 3 === 1 ? 'm10 22 6-14 6 14-6-4-6 4Z' : 'M9 12h14l-7 11-7-11Z'}/></svg>
}

function parseWeaponSecondary(entry: WeaponCatalogEntry, levelValue: string) {
  const value = Number.parseFloat(levelValue) || 0
  const percent = levelValue.includes('%')
  const label = entry.secondaryStat.toLowerCase()
  if (label === 'hp') return { key: percent ? 'hpPercent' : 'hp', value } as const
  if (label === 'atk') return { key: percent ? 'atkPercent' : 'atk', value } as const
  if (label === 'def') return { key: percent ? 'defPercent' : 'def', value } as const
  if (label.includes('crit') && label.includes('rate')) return { key: 'critRate', value } as const
  if (label.includes('crit')) return { key: 'critDamage', value } as const
  if (label.includes('energy')) return { key: 'energyRegen', value } as const
  return undefined
}

function showcaseStats(catalog: CharacterCatalogEntry, weaponEntry: WeaponCatalogEntry | undefined, weapon: OwnedWeapon | undefined, echoes: Echo[]) {
  const totals = totalsFor(echoes)
  const levelStats = weaponEntry?.levelStats.find((entry) => entry.level === weapon?.level) || weaponEntry?.levelStats[0]
  const weaponSecondary = weaponEntry && levelStats ? parseWeaponSecondary(weaponEntry, levelStats.secondaryStatValue) : undefined
  if (weaponSecondary) totals[weaponSecondary.key] = (totals[weaponSecondary.key] || 0) + weaponSecondary.value
  const baseAtk = catalog.baseStats.atk + (levelStats?.baseAtk || 0)
  const hp = catalog.baseStats.hp * (1 + (totals.hpPercent || 0) / 100) + (totals.hp || 0)
  const atk = baseAtk * (1 + (totals.atkPercent || 0) / 100) + (totals.atk || 0)
  const def = catalog.baseStats.def * (1 + (totals.defPercent || 0) / 100) + (totals.def || 0)
  const elementKey = (catalog.element.toLowerCase() + 'Damage') as StatKey
  return [
    { key: 'hp' as const, label: 'HP', value: Math.round(hp).toLocaleString('en-US') },
    { key: 'atk' as const, label: 'ATK', value: Math.round(atk).toLocaleString('en-US') },
    { key: 'def' as const, label: 'DEF', value: Math.round(def).toLocaleString('en-US') },
    { key: 'critRate' as const, label: 'Crit. Rate', value: `${(catalog.baseStats.critRate + (totals.critRate || 0)).toFixed(1)}%` },
    { key: 'critDamage' as const, label: 'Crit. DMG', value: `${(catalog.baseStats.critDamage + (totals.critDamage || 0)).toFixed(1)}%` },
    { key: 'energyRegen' as const, label: 'Energy Regen', value: `${(100 + (totals.energyRegen || 0)).toFixed(1)}%` },
    { key: elementKey, label: `${catalog.element} DMG`, value: `${(totals[elementKey] || 0).toFixed(1)}%` },
    { key: 'basicDamage' as const, label: 'Basic Attack', value: `${(totals.basicDamage || 0).toFixed(1)}%` },
    { key: 'heavyDamage' as const, label: 'Heavy Attack', value: `${(totals.heavyDamage || 0).toFixed(1)}%` },
    { key: 'skillDamage' as const, label: 'Res. Skill', value: `${(totals.skillDamage || 0).toFixed(1)}%` },
    { key: 'liberationDamage' as const, label: 'Res. Liberation', value: `${(totals.liberationDamage || 0).toFixed(1)}%` },
    { key: 'healingBonus' as const, label: 'Healing Bonus', value: `${(totals.healingBonus || 0).toFixed(1)}%` }
  ]
}

function ShowcaseEchoCard({ echo, index, onClick }: { echo?: Echo; index: number; onClick: () => void }) {
  if (!echo) return <button className="showcase-echo-card empty" onClick={onClick}><span>+</span><strong>Equip Echo {index + 1}</strong><small>Open local inventory</small><SignalWave tone={index}/></button>
  const catalog = echoCatalog.find((entry) => entry.name === echo.name)
  const lines = echoStatLines(echo)
  return <button className={`showcase-echo-card signal-tone-${index}`} onClick={onClick}>
    <header><div className="showcase-echo-art">{catalog?.iconSourceUrl && <img src={catalog.iconSourceUrl} alt=""/>}<b>{echo.cost}</b></div><div><strong>{echo.name}</strong><span>{echo.sonata}</span><small>Lv. {echo.level} · <Stars rarity={echo.rarity}/></small></div></header>
    <div className="showcase-echo-main"><span>{statLabels[lines[0].key]}</span><b>{lines[0].key === 'hp' || lines[0].key === 'atk' || lines[0].key === 'def' ? Math.round(lines[0].value).toLocaleString('en-US') : `${lines[0].value.toFixed(1)}%`}</b></div>
    <div className="showcase-echo-lines">{lines.slice(1, 6).map((line, lineIndex) => <div key={`${line.key}-${lineIndex}`}><span>{statLabels[line.key]}</span><b>{line.key === 'hp' || line.key === 'atk' || line.key === 'def' ? Math.round(line.value).toLocaleString('en-US') : `${line.value.toFixed(1)}%`}</b></div>)}</div>
    <SignalWave tone={index}/>
  </button>
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
  const stats = showcaseStats(catalog, weaponEntry, weapon, equipped)
  const weaponLevelStats = weaponEntry?.levelStats.find((entry) => entry.level === weapon?.level) || weaponEntry?.levelStats[0]
  const sonatas = Object.entries(equipped.reduce<Record<string, number>>((sets, echo) => { sets[echo.sonata] = (sets[echo.sonata] || 0) + 1; return sets }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const linkedTeams = build ? teams.filter((team) => team.buildIds.includes(build.id)) : []
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
  return <div className="character-detail-backdrop showcase-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={'character-showcase rarity-' + catalog.rarity} role="dialog" aria-modal="true" aria-label={catalog.name + ' showcase'}>
    <header className="showcase-header"><div><span className="eyebrow">Character showcase</span><h2>{catalog.name}</h2><p>{catalog.title} · {catalog.element} · {catalog.weaponType}</p></div><div className="detail-header-actions"><button className="danger" onClick={() => void remove()}><Icon name="trash"/>Delete character</button><button className="close" aria-label="Close showcase" onClick={onClose}>×</button></div></header>
    <main className="showcase-grid">
      <section className="showcase-portrait-card">
        <div className="showcase-art-backdrop"/>
        <img className="showcase-character-art" src={catalog.portraitSourceUrl || catalog.iconSourceUrl} alt=""/>
        <button className={character.favorite ? 'showcase-favorite active' : 'showcase-favorite'} aria-label="Favorite character" onClick={() => void update({ favorite: !character.favorite })}>♥</button>
        <div className="showcase-sequence-rail" aria-label={`Sequence ${character.sequence}`}>{[1, 2, 3, 4, 5, 6].map((sequence) => <button className={character.sequence >= sequence ? 'active' : ''} key={sequence} title={`Set Sequence ${sequence}`} onClick={() => void update({ sequence: character.sequence === sequence ? sequence - 1 : sequence })}><SequenceGlyph index={sequence}/><small>S{sequence}</small></button>)}</div>
        <div className="showcase-character-title"><span>{catalog.role}</span><h1>{catalog.name}</h1><div><b>Lv. {character.level}</b><Stars rarity={catalog.rarity}/></div></div>
        <div className="showcase-sonatas">{sonatas.length ? sonatas.map(([name, count]) => <span key={name}>{generatedSonataIconSources[name] && <img src={generatedSonataIconSources[name]} alt=""/>}<b>{name}</b><small>{count}</small></span>) : <span className="empty"><b>No Sonata set</b><small>0</small></span>}</div>
        <SignalWave tone={0}/>
      </section>

      <section className="showcase-stat-card showcase-panel">
        <header><div><span className="eyebrow">Resonator stats</span><h3>{catalog.name}</h3></div><Stars rarity={catalog.rarity}/></header>
        <div className="showcase-stat-list">{stats.map((stat) => <div key={stat.label}><StatGlyph stat={stat.key}/><span>{stat.label}</span><i/><b>{stat.value}</b></div>)}</div>
        <div className="showcase-level-editor"><span>Character level</span><div>{LEVELS.map((level) => <button className={character.level === level ? 'active' : ''} key={level} onClick={() => void update({ level })}>{level}</button>)}</div><small>Game values are catalog-backed but still pending authoritative in-game verification.</small></div>
        <SignalWave tone={1}/>
      </section>

      <button className="showcase-weapon-card showcase-panel" onClick={() => setWeaponOpen(true)}>
        {weaponEntry ? <><div className="showcase-weapon-copy"><span className="eyebrow">Equipped weapon · Change</span><h3>{weaponEntry.name}</h3><Stars rarity={weaponEntry.rarity}/><div><span><StatGlyph stat="atk"/>ATK</span><b>{weaponLevelStats?.baseAtk || weaponEntry.baseAtk}</b></div><div><span><StatGlyph stat={parseWeaponSecondary(weaponEntry, weaponLevelStats?.secondaryStatValue || weaponEntry.secondaryStatValue)?.key || 'atk'}/>{weaponEntry.secondaryStat}</span><b>{weaponLevelStats?.secondaryStatValue || weaponEntry.secondaryStatValue}</b></div><small>Lv. {weapon?.level} · Rank {weapon?.rank}</small></div><img src={weaponEntry.iconSourceUrl} alt=""/></> : <div className="showcase-empty-weapon"><span>+</span><strong>Equip {catalog.weaponType}</strong><small>Choose an eligible weapon from local inventory.</small></div>}
        <SignalWave tone={2}/>
      </button>

      <section className="showcase-skills-card showcase-panel">
        <header><div><span className="eyebrow">Forte circuit</span><h3>Skill levels</h3></div><small>Use − / + to edit</small></header>
        <div className="showcase-skill-tree">{SKILLS.map((name, index) => <div className={`showcase-skill-node skill-${index}`} key={name}><div className="skill-orb"><SkillGlyph index={index}/></div><strong>{name}</strong><span><button disabled={skills[index] <= 1} onClick={() => { const next = [...skills]; next[index] -= 1; void update({ skillLevels: next }) }}>−</button><b>Lv. {skills[index]}</b><button disabled={skills[index] >= 10} onClick={() => { const next = [...skills]; next[index] += 1; void update({ skillLevels: next }) }}>+</button></span></div>)}</div>
        <SignalWave tone={3}/>
      </section>

      <section className="showcase-echo-strip showcase-panel"><header><div><span className="eyebrow">Equipped Echoes</span><h3>{equipped.length}/5 · {equipped.reduce((sum, echo) => sum + echo.cost, 0)}/12 cost</h3></div><small>Select a card to change it</small></header><div className="showcase-echo-grid">{Array.from({ length: 5 }, (_, index) => <ShowcaseEchoCard key={index} echo={equipped[index]} index={index} onClick={() => void openEcho(index)}/>)}</div></section>

      <section className="showcase-team-strip showcase-panel"><span className="eyebrow">Team links</span>{linkedTeams.length ? linkedTeams.map((team) => <span key={team.id}><strong>{team.name}</strong><small>{team.buildIds.length}/3 members</small></span>) : <span><strong>Not assigned</strong><small>Add this build from Teams</small></span>}</section>
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
