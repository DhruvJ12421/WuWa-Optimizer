import { useState } from 'react'
import type { CSSProperties } from 'react'
import { characterCatalog, echoCatalog, statLabels, weaponCatalog, type CharacterCatalogEntry, type WeaponCatalogEntry } from '../game-data'
import { effectiveSubStats, fixedSecondaryMainStat } from '../game-data/echo-main-stats'
import { db } from '../storage/database'
import type { AggregatedStats, Build, Echo, OwnedCharacter, OwnedWeapon, StatKey, StatLine } from '../domain/types'
import { EchoMiniCard, Icon } from './components'
import { resolveCharacterShowcaseModel } from './character-showcase-model'
import './character-showcase.css'

const LEVELS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90]
const SKILLS = [
  ['normalAttack', 'Normal Attack'],
  ['resonanceSkill', 'Resonance Skill'],
  ['forteCircuit', 'Forte Circuit'],
  ['resonanceLiberation', 'Resonance Liberation'],
  ['introSkill', 'Intro Skill']
] as const
const ECHO_ACCENTS = ['#67d8c6', '#55a8ef', '#ca7cff', '#e6b85f', '#ed776c', '#8fce65']

interface CharacterShowcaseProps {
  character: OwnedCharacter
  catalog: CharacterCatalogEntry
  weapons: OwnedWeapon[]
  echoes: Echo[]
  builds: Build[]
  refresh: () => Promise<void>
  onBack: () => void
}

function Stars({ rarity }: { rarity: number }) {
  return <span className="cs-stars" aria-label={`${rarity} star rarity`}>{'★'.repeat(rarity)}</span>
}

export function ShowcaseWaveform() {
  return <svg className="cs-waveform" viewBox="0 0 720 42" preserveAspectRatio="none" aria-hidden="true">
    <path className="cs-wave-trace cs-wave-trace-a" d="M0 25 C42 9 72 36 116 20 S193 8 234 24 S310 35 354 17 S429 11 478 25 S555 36 603 18 S676 11 720 24"/>
    <path className="cs-wave-trace cs-wave-trace-b" d="M0 30 C55 24 71 10 127 25 S213 33 257 17 S337 12 382 27 S459 34 506 19 S587 10 632 27 S688 31 720 19"/>
    <path className="cs-wave-trace cs-wave-trace-c" d="M0 18 C46 29 83 7 132 21 S209 31 253 14 S332 28 379 20 S453 7 500 23 S579 32 626 15 S686 25 720 16"/>
    <path className="cs-wave-main" d="M0 24 C38 22 56 12 91 18 S150 33 190 21 S252 11 293 23 S359 31 398 18 S462 13 503 24 S567 30 609 17 S674 15 720 22"/>
  </svg>
}

function StatIcon({ stat }: { stat: StatKey }) {
  const content = stat === 'hp' ? <path d="M12 20S4.5 15.8 4.5 9.8C4.5 6 8.7 4.2 12 7.3 15.3 4.2 19.5 6 19.5 9.8 19.5 15.8 12 20 12 20Z"/>
    : stat === 'atk' ? <><path d="M5 19 18 6M13 6h5v5"/><path d="m7 9 8 8"/></>
      : stat === 'def' ? <path d="M12 3 19 6v5c0 4.7-2.6 8-7 10-4.4-2-7-5.3-7-10V6l7-3Z"/>
        : stat.includes('crit') ? <path d="m12 3 2.2 5.2L20 9l-4.2 3.8 1.2 5.7-5-2.8-5 2.8 1.2-5.7L4 9l5.8-.8L12 3Z"/>
          : stat === 'energyRegen' ? <path d="m13.5 2-7 11h5l-1 9 7-12h-5l1-8Z"/>
            : stat === 'healingBonus' ? <><circle cx="12" cy="12" r="8"/><path d="M12 7v10M7 12h10"/></>
              : <><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>
  return <svg className="cs-stat-icon" viewBox="0 0 24 24" aria-hidden="true">{content}</svg>
}

function formatStat(key: StatKey, value: number) {
  return key === 'hp' || key === 'atk' || key === 'def'
    ? Math.round(value).toLocaleString('en-US')
    : `${value.toFixed(1)}%`
}

function displayedStatValue(stats: AggregatedStats, key: StatKey) {
  return key in stats ? stats[key as keyof typeof stats] : 0
}

function echoAccent(echo: Echo | undefined, index: number) {
  if (!echo) return ECHO_ACCENTS[index % ECHO_ACCENTS.length]
  const hash = [...echo.sonata].reduce((total, character) => total + character.charCodeAt(0), index)
  return ECHO_ACCENTS[hash % ECHO_ACCENTS.length]
}

function EchoShowcaseCard({ echo, index, editing, onOpen }: { echo?: Echo; index: number; editing: boolean; onOpen: () => void }) {
  const style = { '--cs-accent': echoAccent(echo, index) } as CSSProperties
  if (!echo) return <article className={`cs-echo-card cs-echo-empty ${editing ? 'is-editable' : ''}`} style={style} onClick={editing ? onOpen : undefined} role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined}>
    <div className="cs-empty-mark">+</div><strong>Empty Echo slot</strong><small>{editing ? 'Select to equip' : `Slot ${index + 1}`}</small><ShowcaseWaveform/>
  </article>
  const catalog = echoCatalog.find((entry) => entry.name === echo.name)
  const secondary = fixedSecondaryMainStat(echo)
  const subStats = effectiveSubStats(echo).slice(0, 5)
  return <article className={`cs-echo-card ${editing ? 'is-editable' : ''}`} style={style} onClick={editing ? onOpen : undefined} role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined}>
    <header><div className="cs-echo-art">{catalog?.iconSourceUrl && <img src={catalog.iconSourceUrl} alt=""/>}<b>{echo.cost}</b></div><div><strong>{echo.name}</strong><span>{echo.sonata}</span><small>Lv. {echo.level} · <Stars rarity={echo.rarity}/></small></div></header>
    <div className="cs-echo-primary"><span>{statLabels[echo.mainStat.key]}</span><b>{formatStat(echo.mainStat.key, echo.mainStat.value)}</b></div>
    <div className="cs-echo-secondary"><span>{statLabels[secondary.key]}</span><b>{formatStat(secondary.key, secondary.value)}</b></div>
    <div className="cs-echo-substats">{subStats.map((line, lineIndex) => <div key={`${line.key}-${lineIndex}`}><span>{statLabels[line.key]}</span><b>{formatStat(line.key, line.value)}</b></div>)}</div>
    <ShowcaseWaveform/>
  </article>
}

function WeaponPicker({ character, catalog, weapons, builds, refresh, onClose }: { character: OwnedCharacter; catalog: CharacterCatalogEntry; weapons: OwnedWeapon[]; builds: Build[]; refresh: () => Promise<void>; onClose: () => void }) {
  const [adding, setAdding] = useState(false)
  const eligibleOwned = weapons.flatMap((owned) => {
    const entry = weaponCatalog.find((candidate) => candidate.id === owned.catalogId)
    return entry?.type.toLowerCase() === catalog.weaponType.toLowerCase() ? [{ owned, entry }] : []
  })
  const eligibleCatalog = weaponCatalog.filter((entry) => entry.type.toLowerCase() === catalog.weaponType.toLowerCase())
  const equip = async (weapon: OwnedWeapon) => {
    const build = builds.find((entry) => entry.resonatorId === character.catalogId)
    const previousCharacter = weapon.equippedBy ? await db.characters.get(weapon.equippedBy) : undefined
    const previousBuild = previousCharacter ? builds.find((entry) => entry.resonatorId === previousCharacter.catalogId) : undefined
    await db.transaction('rw', db.weapons, db.builds, async () => {
      await db.weapons.where('equippedBy').equals(character.id).modify({ equippedBy: undefined })
      await db.weapons.update(weapon.id, { equippedBy: character.id })
      if (previousBuild && previousBuild.id !== build?.id && previousBuild.weaponId === weapon.id) await db.builds.update(previousBuild.id, { weaponId: '' })
      if (build) await db.builds.update(build.id, { weaponId: weapon.id })
      else await db.builds.add({ id: crypto.randomUUID(), name: `${catalog.name} build`, resonatorId: character.catalogId, weaponId: weapon.id, echoIds: [], level: character.level, skillLevel: character.skillLevels?.[1] ?? 1 })
    })
    await refresh()
    onClose()
  }
  const add = async (entry: WeaponCatalogEntry) => {
    const weapon: OwnedWeapon = { id: crypto.randomUUID(), catalogId: entry.id, level: 1, rank: 1, locked: false, createdAt: Date.now() }
    await db.weapons.add(weapon)
    await equip(weapon)
  }
  return <div className="catalog-picker-backdrop cs-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="catalog-picker cs-picker" role="dialog" aria-modal="true" aria-label="Equip weapon"><header><div><span className="eyebrow">{catalog.weaponType} inventory</span><h2>{adding ? 'Add and equip weapon' : 'Equip weapon'}</h2></div><div>{adding && <button className="secondary" onClick={() => setAdding(false)}>Owned</button>}<button className="text-button" onClick={onClose}>Close</button></div></header><div className="catalog-picker-grid">
    {!adding && eligibleOwned.map(({ owned, entry }) => <button className={`catalog-choice weapon-choice rarity-${entry.rarity}`} key={owned.id} onClick={() => void equip(owned)}><img src={entry.iconSourceUrl} alt=""/><span><strong>{entry.name}</strong><small>Lv. {owned.level} · R{owned.rank}</small><Stars rarity={entry.rarity}/>{owned.equippedBy && owned.equippedBy !== character.id && <em>Currently equipped elsewhere</em>}</span></button>)}
    {!adding && <button className="catalog-choice add-owned-choice" onClick={() => setAdding(true)}><span className="add-glyph">+</span><span><strong>Add weapon</strong><small>Create a local copy and equip it.</small></span></button>}
    {adding && eligibleCatalog.map((entry) => <button className={`catalog-choice weapon-choice rarity-${entry.rarity}`} key={entry.id} onClick={() => void add(entry)}><img src={entry.iconSourceUrl} alt=""/><span><strong>{entry.name}</strong><small>{entry.type}</small><Stars rarity={entry.rarity}/></span></button>)}
  </div></section></div>
}

function EchoPicker({ slot, build, echoes, refresh, onClose }: { slot: number; build: Build; echoes: Echo[]; refresh: () => Promise<void>; onClose: () => void }) {
  const currentId = build.echoIds[slot]
  const options = echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build.id))
  const choose = async (next?: Echo) => {
    const oldId = build.echoIds[slot]
    const echoIds = [...build.echoIds]
    if (next) {
      const duplicateSlot = echoIds.indexOf(next.id)
      if (duplicateSlot >= 0 && duplicateSlot !== slot) return
      if (slot < echoIds.length) echoIds[slot] = next.id
      else echoIds.push(next.id)
    } else if (oldId) echoIds.splice(slot, 1)
    const cost = echoIds.reduce((total, id) => total + (echoes.find((echo) => echo.id === id)?.cost ?? 0), 0)
    if (echoIds.length > 5 || cost > 12) return
    await db.transaction('rw', db.builds, db.echoes, async () => {
      await db.builds.update(build.id, { echoIds })
      if (oldId && oldId !== next?.id) await db.echoes.update(oldId, { equippedBy: undefined })
      if (next) await db.echoes.update(next.id, { equippedBy: build.id })
    })
    await refresh()
    onClose()
  }
  return <div className="catalog-picker-backdrop cs-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="catalog-picker cs-picker cs-echo-picker" role="dialog" aria-modal="true" aria-label={`Equip Echo slot ${slot + 1}`}><header><div><span className="eyebrow">Echo slot {slot + 1}</span><h2>Equip Echo</h2></div><button className="text-button" onClick={onClose}>Close</button></header><div className="echo-picker-list">{currentId && <button className="danger" onClick={() => void choose()}>Unequip current Echo</button>}{options.map((echo) => <EchoMiniCard key={echo.id} echo={echo} selected={echo.id === currentId} onClick={() => void choose(echo)}/>)}</div></section></div>
}

export function CharacterShowcase({ character, catalog, weapons, echoes, builds, refresh, onBack }: CharacterShowcaseProps) {
  const [editing, setEditing] = useState(false)
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false)
  const [echoSlot, setEchoSlot] = useState<number | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [portraitFailed, setPortraitFailed] = useState(false)
  const model = resolveCharacterShowcaseModel({ character, catalog, weapons, echoes, builds })
  if (!model) return null

  const elementStat = `${catalog.element.toLowerCase()}Damage` as StatKey
  const statRows: Array<[StatKey, string]> = [
    ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['critRate', 'Crit. Rate'], ['critDamage', 'Crit. DMG'], ['energyRegen', 'Energy Regen'],
    ['healingBonus', 'Healing Bonus'], [elementStat, `${catalog.element} DMG`], ['basicDamage', 'Basic Attack DMG'], ['heavyDamage', 'Heavy Attack DMG'],
    ['skillDamage', 'Resonance Skill DMG'], ['liberationDamage', 'Resonance Liberation DMG']
  ]
  const updateCharacter = async (patch: Partial<OwnedCharacter>) => {
    await db.transaction('rw', db.characters, db.builds, async () => {
      await db.characters.update(character.id, patch)
      if (patch.level !== undefined && model.build) await db.builds.update(model.build.id, { level: patch.level })
      if (patch.skillLevels && model.build) await db.builds.update(model.build.id, { skillLevel: patch.skillLevels[1] })
    })
    await refresh()
  }
  const openEchoPicker = async (slot: number) => {
    if (!model.build) {
      await db.builds.add({ id: crypto.randomUUID(), name: `${catalog.name} build`, resonatorId: character.catalogId, weaponId: '', echoIds: [], level: character.level, skillLevel: model.skillLevels[1] })
      await refresh()
    }
    setEchoSlot(slot)
  }
  const removeCharacter = async () => {
    if (!deleteArmed) { setDeleteArmed(true); return }
    await db.transaction('rw', db.characters, db.weapons, db.echoes, db.builds, db.teams, async () => {
      await db.characters.delete(character.id)
      await db.weapons.where('equippedBy').equals(character.id).modify({ equippedBy: undefined })
      if (model.build) {
        await db.echoes.where('equippedBy').equals(model.build.id).modify({ equippedBy: undefined })
        await db.teams.toCollection().modify((team) => { team.buildIds = team.buildIds.filter((id) => id !== model.build?.id) })
        await db.builds.delete(model.build.id)
      }
    })
    await refresh()
    onBack()
  }
  const currentBuild = builds.find((entry) => entry.resonatorId === character.catalogId)

  return <section className={`cs-page cs-element-${catalog.element.toLowerCase()}`}>
    <header className="cs-toolbar"><button className="cs-back" onClick={onBack}>← Back to roster</button><div><span className="eyebrow">Character showcase</span><strong>{catalog.name}</strong></div><div className="cs-toolbar-actions">{editing && <><button className={character.favorite ? 'cs-favorite active' : 'cs-favorite'} onClick={() => void updateCharacter({ favorite: !character.favorite })}>{character.favorite ? '♥ Favorited' : '♡ Favorite'}</button><button className={`danger ${deleteArmed ? 'is-armed' : ''}`} onClick={() => void removeCharacter()}><Icon name="trash"/>{deleteArmed ? 'Confirm delete' : 'Delete'}</button></>}<button className={editing ? 'primary' : 'secondary'} onClick={() => { setEditing(!editing); setDeleteArmed(false) }}>{editing ? 'Done editing' : 'Edit loadout'}</button></div></header>

    <div className="cs-layout">
      <section className="cs-character-panel cs-panel">
        <div className="cs-art-grid"/>
        <img
          className={`cs-character-art ${portraitFailed ? 'is-fallback' : ''}`}
          src={portraitFailed ? catalog.iconSourceUrl : (catalog.portraitSourceUrl || catalog.iconSourceUrl)}
          alt={catalog.name}
          onError={() => {
            if (!portraitFailed && catalog.portraitSourceUrl && catalog.portraitSourceUrl !== catalog.iconSourceUrl) setPortraitFailed(true)
          }}
        />
        <div className="cs-sequence-rail" aria-label={`Sequence ${character.sequence}`}>{catalog.sequenceIcons.slice(0, 6).map((sequence) => <button key={sequence.sequence} className={character.sequence >= sequence.sequence ? 'is-unlocked' : 'is-locked'} disabled={!editing} onClick={() => void updateCharacter({ sequence: character.sequence === sequence.sequence ? sequence.sequence - 1 : sequence.sequence })} title={sequence.name}><img src={sequence.iconSourceUrl} alt=""/><span>S{sequence.sequence}</span></button>)}</div>
        <div className="cs-character-copy"><div className="cs-character-kicker"><span>{catalog.element}</span><span>{catalog.weaponType}</span><span>{catalog.role}</span></div><h1>{catalog.name}</h1><p>{catalog.title}</p><div className="cs-level-rarity"><strong>Lv. {character.level}</strong><Stars rarity={catalog.rarity}/>{character.favorite && <span className="cs-favorite-mark">♥</span>}</div>{editing && <div className="cs-level-editor" aria-label="Character level">{LEVELS.map((level) => <button key={level} className={character.level === level ? 'active' : ''} onClick={() => void updateCharacter({ level })}>{level}</button>)}</div>}</div>
        <div className="cs-sonatas">{model.sonatas.length ? model.sonatas.map((sonata) => <span key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<b>{sonata.name}</b><small>{sonata.count}</small></span>) : <span className="is-empty"><b>No active Sonata</b><small>0</small></span>}</div>
        <ShowcaseWaveform/>
      </section>

      <section className="cs-stats-panel cs-panel"><header><div><span className="eyebrow">Resonator statistics</span><h2>Current attributes</h2></div><span>Lv. {model.characterBaseStats.level}</span></header><div className="cs-stat-list">{statRows.map(([key, label]) => <div key={key}><StatIcon stat={key}/><span>{label}</span><i/><b>{formatStat(key, displayedStatValue(model.finalStats, key))}</b></div>)}</div><p className="cs-warning">{model.warning}</p></section>

      <section className={`cs-weapon-panel cs-panel ${editing ? 'is-editable' : ''}`} onClick={editing ? () => setWeaponPickerOpen(true) : undefined} role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined}>
        {model.weapon ? <><div className="cs-weapon-copy"><span className="eyebrow">Equipped weapon</span><h2>{model.weapon.catalog.name}</h2><Stars rarity={model.weapon.catalog.rarity}/><div><span>Level</span><b>{model.weapon.owned.level}</b></div><div><span>Rank</span><b>R{model.weapon.owned.rank}</b></div><div><span>Base ATK</span><b>{model.weapon.levelStats.baseAtk}</b></div><div><span>{model.weapon.catalog.secondaryStat}</span><b>{model.weapon.levelStats.secondaryStatValue}</b></div>{editing && <small>Select to replace</small>}</div><img src={model.weapon.catalog.iconSourceUrl} alt=""/></> : <div className="cs-empty-weapon"><span>+</span><strong>No weapon equipped</strong><small>{editing ? `Select a ${catalog.weaponType}` : catalog.weaponType}</small></div>}
        <ShowcaseWaveform/>
      </section>

      <section className="cs-skills-panel cs-panel"><header><div><span className="eyebrow">Forte circuit</span><h2>Skill levels</h2></div>{editing && <small>Adjust levels</small>}</header><div className="cs-skill-tree">{SKILLS.map(([key, label], index) => { const skill = catalog.skillIcons[key]; return <div className={`cs-skill-node cs-skill-${index}`} key={key}><div className="cs-skill-orb"><img src={skill.iconSourceUrl} alt=""/></div><strong>{label}</strong><small>{skill.name}</small><div className="cs-skill-level">{editing && <button disabled={model.skillLevels[index] <= 1} onClick={() => { const levels = [...model.skillLevels] as [number, number, number, number, number]; levels[index] -= 1; void updateCharacter({ skillLevels: levels }) }}>−</button>}<b>Lv. {model.skillLevels[index]}</b>{editing && <button disabled={model.skillLevels[index] >= 10} onClick={() => { const levels = [...model.skillLevels] as [number, number, number, number, number]; levels[index] += 1; void updateCharacter({ skillLevels: levels }) }}>+</button>}</div></div> })}</div></section>

      <section className="cs-echo-section"><header><div><span className="eyebrow">Equipped Echoes</span><h2>Echo loadout</h2></div><span>{model.equippedEchoes.length}/5 · {model.totalEchoCost}/12 cost</span></header><div className="cs-echo-row">{model.echoSlots.map((echo, index) => <EchoShowcaseCard key={echo?.id ?? `empty-${index}`} echo={echo} index={index} editing={editing} onOpen={() => void openEchoPicker(index)}/>)}</div></section>
    </div>

    {weaponPickerOpen && <WeaponPicker character={character} catalog={catalog} weapons={weapons} builds={builds} refresh={refresh} onClose={() => setWeaponPickerOpen(false)}/>} 
    {echoSlot !== null && currentBuild && <EchoPicker slot={echoSlot} build={currentBuild} echoes={echoes} refresh={refresh} onClose={() => setEchoSlot(null)}/>} 
  </section>
}
