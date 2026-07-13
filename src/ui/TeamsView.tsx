import { useMemo, useState } from 'react'
import { calculateRotation, formatDamage } from '../domain/damage'
import { characterCatalog, echoCatalog, statAliases, weaponCatalog } from '../game-data'
import { db } from '../storage/database'
import type { AttackDefinition, Build, Echo, Element, OwnedCharacter, OwnedWeapon, Resonator, RotationAction, StatLine, Team, Weapon } from '../domain/types'
import { Icon } from './components'

const elementNames: Record<string, Element> = { spectro: 'spectro', fusion: 'fusion', glacio: 'glacio', electro: 'electro', aero: 'aero', havoc: 'havoc' }

function characterFor(build?: Build) {
  return characterCatalog.find((entry) => entry.id === build?.resonatorId)
}

function ownedCharacterFor(build: Build, owned: OwnedCharacter[]) {
  return owned.find((entry) => entry.catalogId === build.resonatorId)
}

function attacksFor(build: Build, owned: OwnedCharacter[]): AttackDefinition[] {
  const character = characterFor(build)
  const levels = ownedCharacterFor(build, owned)?.skillLevels ?? [build.skillLevel, build.skillLevel, build.skillLevel, build.skillLevel, build.skillLevel]
  const element = elementNames[character?.element.toLowerCase() ?? ''] ?? 'spectro'
  return (character?.attacks ?? []).map((attack) => {
    const level = Math.max(1, Math.min(attack.multipliers.length, levels[attack.skillLevelIndex] ?? build.skillLevel))
    return { id: attack.id, name: attack.name, type: attack.type, element, multiplier: attack.multipliers[level - 1] ?? 0, hits: 1, scalesWith: attack.scalesWith }
  })
}

function runtimeResonator(build: Build, owned: OwnedCharacter[]): Resonator | undefined {
  const character = characterFor(build)
  if (!character) return undefined
  return {
    id: character.id,
    name: character.name,
    element: elementNames[character.element.toLowerCase()] ?? 'spectro',
    role: character.role,
    accent: character.rarity === 5 ? '#d6a85f' : '#9a7be8',
    baseStats: character.baseStats,
    attacks: attacksFor(build, owned)
  }
}

function weaponStat(name: string, formattedValue: string): StatLine | undefined {
  const match = statAliases.find(([pattern]) => pattern.test(name))
  const value = Number.parseFloat(formattedValue)
  return match && Number.isFinite(value) ? { key: match[1], value } : undefined
}

function runtimeWeapon(build: Build, ownedWeapons: OwnedWeapon[]): Weapon | undefined {
  const owned = ownedWeapons.find((entry) => entry.id === build.weaponId)
  const catalog = weaponCatalog.find((entry) => entry.id === owned?.catalogId)
  if (!owned || !catalog) return undefined
  const level = [...catalog.levelStats].sort((left, right) => Math.abs(left.level - owned.level) - Math.abs(right.level - owned.level))[0]
  return {
    id: owned.id,
    name: catalog.name,
    type: catalog.type.toLowerCase() as Weapon['type'],
    baseAtk: level?.baseAtk ?? catalog.baseAtk,
    stat: weaponStat(catalog.secondaryStat, level?.secondaryStatValue ?? catalog.secondaryStatValue)
  }
}

function calculateTeam(team: Team, builds: Build[], characters: OwnedCharacter[], weapons: OwnedWeapon[], echoes: Echo[]) {
  const teamBuilds = builds.filter((build) => team.buildIds.includes(build.id))
  const runtimeCharacters = teamBuilds.map((build) => runtimeResonator(build, characters)).filter((entry): entry is Resonator => Boolean(entry))
  const runtimeWeapons = teamBuilds.map((build) => runtimeWeapon(build, weapons)).filter((entry): entry is Weapon => Boolean(entry))
  return calculateRotation(team, builds, runtimeCharacters, runtimeWeapons, echoes)
}

function TeamMember({ build, team, builds, characters, weapons, echoes, contribution, total }: { build?: Build; team: Team; builds: Build[]; characters: OwnedCharacter[]; weapons: OwnedWeapon[]; echoes: Echo[]; contribution: number; total: number }) {
  if (!build) return <div className="go-team-member empty"><div className="go-empty-avatar">+</div><div><strong>Empty slot</strong><small>Add a character in team details</small></div></div>
  const character = characterFor(build)
  const ownedCharacter = ownedCharacterFor(build, characters)
  const ownedWeapon = weapons.find((entry) => entry.id === build.weaponId)
  const weapon = weaponCatalog.find((entry) => entry.id === ownedWeapon?.catalogId)
  const equipped = build.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((entry): entry is Echo => Boolean(entry))
  const mainEcho = echoCatalog.find((entry) => entry.name === equipped[0]?.name)
  const percent = total > 0 ? contribution / total * 100 : 0
  return <div className="go-team-member" style={{ '--member-art': `url("${character?.portraitSourceUrl ?? character?.iconSourceUrl ?? ''}")` } as React.CSSProperties}>
    <div className="go-member-portrait"><img src={character?.iconSourceUrl} alt=""/><span>{ownedCharacter?.level ?? build.level}/90</span><b>S{ownedCharacter?.sequence ?? 0}</b></div>
    <div className="go-member-copy"><strong>{character?.name ?? 'Unknown character'}</strong><small><Icon name="team"/>{build.name}</small><small><Icon name="build"/>{weapon?.name ?? 'No weapon'} · Lv. {ownedWeapon?.level ?? 1} · R{ownedWeapon?.rank ?? 1}</small></div>
    <div className="go-member-loadout">{weapon && <img src={weapon.iconSourceUrl} alt=""/>}{mainEcho && <img src={mainEcho.iconSourceUrl} alt=""/>}<span>{equipped.length}/5</span></div>
    <div className="go-member-damage"><strong>{formatDamage(contribution)}</strong><span>{percent.toFixed(1)}%</span></div>
  </div>
}

function TeamEditor({ team, builds, characters, weapons, echoes, refresh, close }: { team: Team; builds: Build[]; characters: OwnedCharacter[]; weapons: OwnedWeapon[]; echoes: Echo[]; refresh: () => Promise<void>; close: () => void }) {
  const rotation = calculateTeam(team, builds, characters, weapons, echoes)
  const update = async (patch: Partial<Team>) => { await db.teams.update(team.id, patch); await refresh() }
  const updateAction = async (id: string, patch: Partial<RotationAction>) => update({ actions: team.actions.map((action) => action.id === id ? { ...action, ...patch } : action) })
  const addAction = async () => {
    const build = builds.find((entry) => team.buildIds.includes(entry.id))
    const attack = build && attacksFor(build, characters)[0]
    if (!build || !attack) return
    await update({ actions: [...team.actions, { id: crypto.randomUUID(), timestamp: Math.min(team.rotationDuration, Math.ceil((team.actions.at(-1)?.timestamp ?? 0) + 1)), buildId: build.id, attackId: attack.id }] })
  }
  const chooseMember = async (slot: number, buildId: string) => {
    const next = [...team.buildIds]
    if (buildId) next[slot] = buildId
    else next.splice(slot, 1)
    const buildIds = next.filter((id, index) => id && next.indexOf(id) === index).slice(0, 3)
    await update({ buildIds, actions: team.actions.filter((action) => buildIds.includes(action.buildId)) })
  }
  return <div className="team-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="go-team-editor" role="dialog" aria-modal="true" aria-label={`${team.name} details`}>
    <header><div><span>TEAM DETAILS</span><input aria-label="Team name" value={team.name} onChange={(event) => void update({ name: event.target.value })}/></div><button className="close" onClick={close}>×</button></header>
    <div className="go-editor-summary"><div><span>EXPECTED ROTATION</span><strong>{formatDamage(rotation.total)}</strong><small>{formatDamage(rotation.dps)} DPS</small></div><label>Enemy level<input type="number" min="1" max="200" value={team.enemy.level} onChange={(event) => void update({ enemy: { ...team.enemy, level: Math.max(1, Math.min(200, Number(event.target.value))) } })}/></label><label>Resistance %<input type="number" min="-100" max="100" value={team.enemy.resistance} onChange={(event) => void update({ enemy: { ...team.enemy, resistance: Math.max(-100, Math.min(100, Number(event.target.value))) } })}/></label><label>Rotation seconds<input type="number" min="1" max="600" value={team.rotationDuration} onChange={(event) => void update({ rotationDuration: Math.max(1, Math.min(600, Number(event.target.value))) })}/></label></div>
    <div className="go-editor-members">{Array.from({ length: 3 }, (_, index) => <label key={index}><span>Member {index + 1}</span><select value={team.buildIds[index] ?? ''} onChange={(event) => void chooseMember(index, event.target.value)}><option value="">Empty slot</option>{builds.map((build) => <option key={build.id} value={build.id} disabled={team.buildIds.includes(build.id) && team.buildIds[index] !== build.id}>{characterFor(build)?.name ?? build.name}</option>)}</select></label>)}</div>
    <div className="go-rotation-heading"><div><span>NANOKA 3.5 MULTIPLIERS</span><h2>Rotation actions</h2></div><button className="go-cyan-button" onClick={() => void addAction()}><Icon name="plus"/>Add action</button></div>
    <div className="go-action-list">{[...team.actions].sort((left, right) => left.timestamp - right.timestamp).map((action) => {
      const build = builds.find((entry) => entry.id === action.buildId)
      const attacks = build ? attacksFor(build, characters) : []
      const attack = attacks.find((entry) => entry.id === action.attackId)
      const result = rotation.actions.find((entry) => entry.buildId === action.buildId && entry.timestamp === action.timestamp && entry.attackId === action.attackId)
      return <div className="go-action-row" key={action.id}><input aria-label="Timestamp" type="number" min="0" max={team.rotationDuration} step="0.1" value={action.timestamp} onChange={(event) => void updateAction(action.id, { timestamp: Number(event.target.value) })}/><select aria-label="Character" value={action.buildId} onChange={(event) => { const next = builds.find((entry) => entry.id === event.target.value); void updateAction(action.id, { buildId: event.target.value, attackId: next ? attacksFor(next, characters)[0]?.id ?? '' : '' }) }}>{team.buildIds.map((id) => { const member = builds.find((entry) => entry.id === id); return <option key={id} value={id}>{characterFor(member)?.name ?? member?.name}</option> })}</select><select aria-label="Attack" value={action.attackId} onChange={(event) => void updateAction(action.id, { attackId: event.target.value })}>{attacks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><b>{attack ? `${(attack.multiplier * 100).toFixed(2)}% ${attack.scalesWith.toUpperCase()}` : 'Select an attack'}</b><strong>{formatDamage(result?.expected ?? 0)}</strong><button className="go-remove" aria-label="Remove action" onClick={() => void update({ actions: team.actions.filter((entry) => entry.id !== action.id) })}>×</button></div>
    })}{!team.actions.length && <div className="go-empty-actions">Add an action to calculate damage from Nanoka skill percentages.</div>}</div>
  </section></div>
}

export function TeamsView({ echoes, builds, teams, characters, weapons, refresh }: { echoes: Echo[]; builds: Build[]; teams: Team[]; characters: OwnedCharacter[]; weapons: OwnedWeapon[]; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [characterFilter, setCharacterFilter] = useState('')
  const [descending, setDescending] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const eligibleBuilds = useMemo(() => builds.filter((build) => characterFor(build)), [builds])
  const visible = teams.filter((team) => team.name.toLowerCase().includes(query.toLowerCase()) && (!characterFilter || team.buildIds.some((id) => builds.find((build) => build.id === id)?.resonatorId === characterFilter))).sort((left, right) => (descending ? -1 : 1) * left.name.localeCompare(right.name))
  const selected = teams.find((team) => team.id === selectedId)
  const addTeam = async () => {
    const members = eligibleBuilds.slice(0, 3)
    const team: Team = { id: crypto.randomUUID(), name: `Team Name ${teams.length + 1}`, buildIds: members.map((build) => build.id), enemy: { level: 90, resistance: 10, damageReduction: 0 }, rotationDuration: 20, actions: members.flatMap((build, index) => { const attack = attacksFor(build, characters)[0]; return attack ? [{ id: crypto.randomUUID(), timestamp: index * 3, buildId: build.id, attackId: attack.id }] : [] }), buffs: [] }
    await db.teams.add(team)
    await refresh()
    setSelectedId(team.id)
  }
  const removeTeam = async (team: Team) => { if (!confirm(`Delete ${team.name}?`)) return; await db.teams.delete(team.id); await refresh() }
  return <div className="go-teams-page">
    <section className="go-team-toolbar"><div className="go-team-filters"><label><span>Characters</span><select value={characterFilter} onChange={(event) => setCharacterFilter(event.target.value)}><option value="">Characters</option>{eligibleBuilds.map((build) => <option key={build.id} value={build.resonatorId}>{characterFor(build)?.name}</option>)}</select></label><label><span>Team Name</span><input value={query} onChange={(event) => setQuery(event.target.value)}/></label></div><div className="go-team-result-row"><p>Showing <strong>{visible.length}</strong> out of <strong>{teams.length}</strong> Teams</p><div><span>Sort By:</span><button>Name <small>⌄</small></button><button onClick={() => setDescending((value) => !value)}>☰ {descending ? 'Descending' : 'Ascending'}</button></div></div></section>
    <div className="go-team-actions"><button onClick={() => void addTeam()} disabled={!eligibleBuilds.length}><Icon name="plus"/>Add Team</button><button disabled title="Team files are handled by the account backup tools"><Icon name="upload"/>Import Team</button></div>
    {!eligibleBuilds.length && <div className="go-team-notice">Equip a weapon or Echo on a character first to create a build, then return here to add a team.</div>}
    <div className="go-team-grid">{visible.map((team) => { const rotation = calculateTeam(team, builds, characters, weapons, echoes); return <article className="go-team-card" key={team.id}><header><button onClick={() => setSelectedId(team.id)}><h2>{team.name}</h2><span title="Open team details">i</span></button><button className="go-card-delete" aria-label={`Delete ${team.name}`} onClick={() => void removeTeam(team)}><Icon name="trash"/></button></header><button className="go-team-card-body" onClick={() => setSelectedId(team.id)}>{Array.from({ length: 3 }, (_, index) => { const build = builds.find((entry) => entry.id === team.buildIds[index]); return <TeamMember key={build?.id ?? index} build={build} team={team} builds={builds} characters={characters} weapons={weapons} echoes={echoes} contribution={build ? rotation.byBuild[build.id] ?? 0 : 0} total={rotation.total}/> })}<footer><span>Expected rotation</span><strong>{formatDamage(rotation.total)}</strong><b>{formatDamage(rotation.dps)} DPS</b></footer></button></article> })}</div>
    {!visible.length && teams.length > 0 && <div className="go-team-notice">No teams match the current filters.</div>}
    {selected && <TeamEditor team={selected} builds={builds} characters={characters} weapons={weapons} echoes={echoes} refresh={refresh} close={() => setSelectedId(null)}/>} 
  </div>
}
