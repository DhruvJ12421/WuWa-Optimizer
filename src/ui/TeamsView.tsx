import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDamage } from '../domain/damage'
import { createLocalId } from '../domain/id'
import type { BuffEffect, Build, Echo, FormulaResultMode, OwnedCharacter, OwnedWeapon, RotationAction, StatKey, Team } from '../domain/types'
import { characterCatalog, echoCatalog, statLabels, weaponCatalog, weaponPassiveConditions } from '../game-data'
import { characterFormulaSheets, FORMULA_SHEET_VERSION, getFormulaCoverage, type CalculationTrace, type ConditionDefinition } from '../domain/calculation'
import { db } from '../storage/database'
import { EchoWaveform } from './EchoWaveform'
import { richSkillDescription } from './CharacterShowcase'
import { Icon } from './components'
import { CalculatedValue, traceCalculationDetail } from './CalculationDetails'
import { showcaseStatDetail, sumDetail } from './calculation-detail-model'
import { OptimizerView } from './OptimizerView'
import {
  echoArtwork, formatWorkspaceStat, resolveTeamWorkspace, teamBuffLabel,
  type TeamMemberModel, type TeamWorkspaceModel
} from './team-workspace-model'
import { defaultEnabledSkillTreeBonusIds, inherentSkillBonusId, skillTreeBonusId } from './character-showcase-model'
import './team-workspace.css'

type WorkspaceTab = 'settings' | 0 | 1 | 2
type MemberSection = 'overview' | 'forte' | 'optimizer' | 'rotation' | 'damage' | 'echoes'

const MEMBER_SECTIONS: Array<{ id: MemberSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'forte', label: 'Forte' },
  { id: 'optimizer', label: 'Optimize' },
  { id: 'rotation', label: 'Rotation' }
]

const DAMAGE_RESULT_MODES: Array<{ id: FormulaResultMode; label: string }> = [
  { id: 'normal', label: 'Non-crit hit DMG' },
  { id: 'expected', label: 'Avg DMG' },
  { id: 'critical', label: 'Crit hit DMG' }
]

const CORE_STATS: Array<[StatKey, string]> = [
  ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['critRate', 'Crit. Rate'],
  ['critDamage', 'Crit. DMG'], ['energyRegen', 'Energy Regen']
]

const DAMAGE_STATS: Array<[StatKey, string]> = [
  ['basicDamage', 'Basic Attack'], ['heavyDamage', 'Heavy Attack'], ['skillDamage', 'Resonance Skill'],
  ['liberationDamage', 'Resonance Liberation'], ['healingBonus', 'Healing Bonus']
]

const ELEMENT_COLORS: Record<string, string> = {
  Aero: '#73d9c6', Electro: '#a98bf5', Fusion: '#ef7662', Glacio: '#78bde8', Havoc: '#c06ddb', Spectro: '#e6c96b'
}

interface TeamsViewProps {
  echoes: Echo[]
  builds: Build[]
  teams: Team[]
  characters: OwnedCharacter[]
  weapons: OwnedWeapon[]
  refresh: () => Promise<void>
  openScanner: () => void
}

function percent(value: number, total: number) {
  return total > 0 ? `${(value / total * 100).toFixed(1)}%` : '0.0%'
}

function teamMemberName(member: TeamMemberModel) {
  return member.catalog?.name ?? member.build?.name ?? `Member ${member.slot + 1}`
}

function MemberAvatar({ member, compact = false }: { member: Partial<TeamMemberModel> & { slot: number }; compact?: boolean }) {
  if (!member.catalog || !member.character) return <div className={`tw-avatar tw-avatar-empty ${compact ? 'compact' : ''}`}><span>+</span><small>Empty</small></div>
  return <div className={`tw-avatar ${compact ? 'compact' : ''}`}>
    <img src={member.catalog.iconSourceUrl} alt=""/>
    <span>Lv. {member.character.level}</span><b>S{member.character.sequence}</b>
  </div>
}

function EchoThumbs({ member }: { member: TeamMemberModel }) {
  return <div className="tw-echo-thumbs" aria-label="Equipped Echoes">{Array.from({ length: 5 }, (_, index) => {
    const echo = member.showcase?.echoSlots[index]
    return <span className={echo ? '' : 'empty'} key={echo?.id ?? index} title={echo?.name ?? `Empty Echo slot ${index + 1}`}>
      {echo && echoArtwork(echo) && <img src={echoArtwork(echo)} alt=""/>}<b>{echo ? echo.cost : '+'}</b>
    </span>
  })}</div>
}

function WarningList({ warnings, compact = false }: { warnings: string[]; compact?: boolean }) {
  if (!warnings.length) return null
  return <aside className={`tw-warnings ${compact ? 'compact' : ''}`} role="status">
    {!compact && <header>
      <span aria-hidden="true">!</span>
      <div><strong>Build checks</strong><small>Review these items before relying on the team result.</small></div>
      <b>{warnings.length}</b>
    </header>}
    <div className="tw-warning-items">{warnings.map((warning) => <p key={warning}><i aria-hidden="true">!</i>{warning}</p>)}</div>
  </aside>
}

function SonataChips({ member }: { member: TeamMemberModel }) {
  return <div className="tw-chip-list">{member.showcase?.sonatas.length ? member.showcase.sonatas.map((sonata) =>
    <span className="tw-chip" key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<b>{sonata.name}</b><small>{sonata.count}</small></span>
  ) : <span className="tw-chip muted">No Sonata coverage</span>}</div>
}

function TeamMemberColumn({ member, model, builds, onOpen, onAssign }: {
  member: TeamMemberModel
  model: TeamWorkspaceModel
  builds: Build[]
  onOpen: () => void
  onAssign: (buildId: string) => Promise<void>
}) {
  return <article className={`tw-member-column ${member.build ? '' : 'is-empty'}`}>
    {member.build
      ? <header className="tw-member-open" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }} aria-label={`Open ${teamMemberName(member)}`}>
        <MemberAvatar member={member}/><div><span className="eyebrow">Member {member.slot + 1}</span><h3>{member.catalog?.name ?? 'Empty slot'}</h3><p>{member.catalog?.role ?? 'Assign a saved character build'}</p></div>
      </header>
      : <label className="tw-empty-member-picker">
        <MemberAvatar member={member}/><div><span className="eyebrow">Member {member.slot + 1}</span><h3>Empty slot</h3><p>{builds.length ? 'Click anywhere to add a saved character build' : 'Create a saved character build to add it here'}</p></div>
        <select value="" disabled={!builds.length} onChange={(event) => void onAssign(event.target.value)} aria-label={`Add member ${member.slot + 1}`}>
          <option value="" disabled>{builds.length ? 'Choose a saved build' : 'No saved builds available'}</option>
          {builds.map((build) => {
            const catalog = characterCatalog.find((entry) => entry.id === build.resonatorId)
            return <option value={build.id} key={build.id} disabled={model.team.buildIds.includes(build.id)}>{catalog?.name ?? build.name} · {build.name}</option>
          })}
        </select>
      </label>}
    {member.build ? <>
      <div className="tw-member-weapon">{member.showcase?.weapon?.catalog.iconSourceUrl && <img src={member.showcase.weapon.catalog.iconSourceUrl} alt=""/>}<span><small>Equipped weapon</small><b>{member.showcase?.weapon?.catalog.name ?? 'No weapon'}</b><em>{member.showcase?.weapon ? `Lv. ${member.showcase.weapon.owned.level} · R${member.showcase.weapon.owned.rank}` : 'Required for damage'}</em></span></div>
      <EchoThumbs member={member}/><SonataChips member={member}/>
      <dl className="tw-mini-facts"><div><dt>Applied buffs</dt><dd>{member.appliedBuffs.length}</dd></div><div><dt>Received buffs</dt><dd>{member.receivedBuffs.length}</dd></div><div><dt>Rotation</dt><dd><CalculatedValue detail={sumDetail(`${teamMemberName(member)} rotation`, member.contribution, model.actions.filter((row) => row.member?.slot === member.slot).map((row) => ({ label: row.attack?.name ?? 'Action', value: row.expected })))}>{formatDamage(member.contribution)}</CalculatedValue></dd></div><div><dt>Share</dt><dd><CalculatedValue detail={sumDetail(`${teamMemberName(member)} rotation share`, member.contributionPercent, [{ label: 'Member contribution', value: member.contribution }, { label: 'Team rotation', value: model.total }], 'Member contribution ÷ team rotation × 100')}>{percent(member.contribution, model.total)}</CalculatedValue></dd></div></dl>
      <div className="tw-progress"><span style={{ width: `${member.contributionPercent}%` }}/></div>
      <WarningList warnings={member.warnings} compact/>
    </> : <div className="tw-empty-copy"><strong>No member assigned</strong><p>The slot stays visible so the team structure is always clear.</p></div>}
  </article>
}

interface TeamGalleryCardProps {
  team: Team
  builds: Build[]
  characters: OwnedCharacter[]
  weapons: OwnedWeapon[]
  echoes: Echo[]
  onOpen: () => void
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
}

function TeamGalleryCard({ team, builds, characters, weapons, echoes, onOpen, onRename, onDelete }: TeamGalleryCardProps) {
  const [name, setName] = useState(team.name)
  useEffect(() => setName(team.name), [team.name])

  const commitName = () => {
    const nextName = name.trim()
    if (!nextName) setName(team.name)
    else if (nextName !== team.name) void onRename(nextName)
  }

  const members = Array.from({ length: 3 }, (_, slot) => {
    const build = builds.find((entry) => entry.id === team.buildIds[slot])
    const character = characters.find((entry) => entry.catalogId === build?.resonatorId)
    const catalog = characterCatalog.find((entry) => entry.id === build?.resonatorId)
    const weapon = weapons.find((entry) => entry.id === build?.weaponId)
    const weaponEntry = weaponCatalog.find((entry) => entry.id === weapon?.catalogId)
    const equippedEchoes = build?.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo)) ?? []
    return { slot, build, character, catalog, weapon, weaponEntry, equippedEchoes }
  })

  return <article className="tw-gallery-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }}>
    <header>
      <input aria-label={`Team name for ${team.name}`} value={name} onClick={(event) => event.stopPropagation()} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { setName(team.name); event.currentTarget.blur() }
      }}/>
      <button className="tw-gallery-delete" aria-label={`Delete ${team.name}`} onClick={(event) => { event.stopPropagation(); void onDelete() }}><Icon name="trash"/></button>
    </header>
    <div className="tw-gallery-members">{members.map(({ slot, build, character, catalog, weapon, weaponEntry, equippedEchoes }) => <section className={`tw-gallery-member ${catalog ? '' : 'empty'}`} key={slot} style={catalog ? { '--tw-card-element': ELEMENT_COLORS[catalog.element] ?? '#8de4d4' } as CSSProperties : undefined}>
      {catalog?.portraitSourceUrl && <img className="tw-gallery-portrait" src={catalog.portraitSourceUrl} alt=""/>}
      {catalog ? <>
        <div className="tw-gallery-character"><span><strong>{catalog.name}</strong><small>{build?.name ?? 'Saved build'}</small><em>Lv. {character?.level ?? build?.level ?? 1} · S{character?.sequence ?? 0}</em></span></div>
        <div className="tw-gallery-loadout">
          <span className="weapon">{weaponEntry?.iconSourceUrl && <img src={weaponEntry.iconSourceUrl} alt=""/>}<b>{weapon ? `${weapon.level}/90` : '—'}</b><small>{weapon ? `R${weapon.rank}` : 'No weapon'}</small></span>
          {Array.from({ length: 5 }, (_, index) => { const echo = equippedEchoes[index]; return <span key={echo?.id ?? index} className={echo ? '' : 'empty'}>{echo && echoArtwork(echo) && <img src={echoArtwork(echo)} alt=""/>}<b>{echo ? `+${echo.level}` : '+'}</b><small>{echo?.cost ?? '—'}</small></span> })}
        </div>
      </> : <div className="tw-gallery-empty-member"><span>+</span><strong>Empty member slot</strong></div>}
    </section>)}</div>
    <footer><span>{team.buildIds.length}/3 members</span><span>{team.actions.length} rotation actions</span><b>Open team →</b></footer>
  </article>
}

function TeamGallery({ teams, builds, characters, weapons, echoes, onCreate, onOpen, onRename, onDelete }: {
  teams: Team[]
  builds: Build[]
  characters: OwnedCharacter[]
  weapons: OwnedWeapon[]
  echoes: Echo[]
  onCreate: () => Promise<void>
  onOpen: (teamId: string) => void
  onRename: (teamId: string, name: string) => Promise<void>
  onDelete: (team: Team) => Promise<void>
}) {
  const [characterFilter, setCharacterFilter] = useState('all')
  const [query, setQuery] = useState('')
  const characterOptions = useMemo(() => {
    const options = new Map<string, { catalogId: string; name: string; favorite: boolean }>()
    characters.forEach((owned) => {
      const catalog = characterCatalog.find((entry) => entry.id === owned.catalogId)
      if (!catalog) return
      const existing = options.get(owned.catalogId)
      options.set(owned.catalogId, { catalogId: owned.catalogId, name: catalog.name, favorite: Boolean(owned.favorite || existing?.favorite) })
    })
    return [...options.values()].sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.name.localeCompare(right.name))
  }, [characters])
  const visibleTeams = teams.filter((team) => {
    const matchesName = team.name.toLowerCase().includes(query.trim().toLowerCase())
    const matchesCharacter = characterFilter === 'all' || team.buildIds.some((buildId) => builds.find((build) => build.id === buildId)?.resonatorId === characterFilter)
    return matchesName && matchesCharacter
  }).sort((left, right) => left.name.localeCompare(right.name))

  return <div className="tw-gallery-page">
    <section className="tw-gallery-controls tw-panel">
      <div><span className="eyebrow">Team archive</span><h1>Your teams</h1><p>Choose a team to open its full composition, member sheets, buffs, and rotation workspace.</p></div>
      <label><span>Character filter</span><select value={characterFilter} onChange={(event) => setCharacterFilter(event.target.value)}><option value="all">All characters</option>{characterOptions.map((option) => <option value={option.catalogId} key={option.catalogId}>{option.favorite ? '♥ ' : ''}{option.name}</option>)}</select><small>Favorites are listed first.</small></label>
      <label><span>Team name</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams..."/></label>
      <button className="primary tw-gallery-create" onClick={() => void onCreate()}><Icon name="plus"/>Add team</button>
      <strong className="tw-gallery-count">Showing {visibleTeams.length} of {teams.length} teams</strong>
    </section>
    {visibleTeams.length ? <div className="tw-gallery-grid">{visibleTeams.map((team) => <TeamGalleryCard team={team} builds={builds} characters={characters} weapons={weapons} echoes={echoes} onOpen={() => onOpen(team.id)} onRename={(name) => onRename(team.id, name)} onDelete={() => onDelete(team)} key={team.id}/>)}</div>
      : <section className="tw-gallery-empty tw-panel"><span>{teams.length ? 'No matches' : 'No teams yet'}</span><h2>{teams.length ? 'Try another character or team name.' : 'Create your first team.'}</h2>{!teams.length && <button className="primary" onClick={() => void onCreate()}><Icon name="plus"/>Add team</button>}</section>}
  </div>
}

function TeamOverview({ model, builds, updateTeam, openMember }: {
  model: TeamWorkspaceModel
  builds: Build[]
  updateTeam: (patch: Partial<Team>) => Promise<void>
  openMember: (slot: number) => void
}) {
  const chooseMember = async (slot: number, buildId: string) => {
    const next = [...model.team.buildIds]
    if (buildId) {
      if (slot < next.length) next[slot] = buildId
      else next.push(buildId)
    } else next.splice(slot, 1)
    const buildIds = next.filter((id, index) => id && next.indexOf(id) === index).slice(0, 3)
    await updateTeam({ buildIds, actions: model.team.actions.filter((action) => buildIds.includes(action.buildId)), buffs: (model.team.buffs ?? []).filter((buff) => buildIds.includes(buff.sourceBuildId)) })
  }
  return <div className="tw-settings-page">
    <section className="tw-metrics tw-panel">
      <div><span>Expected rotation</span><CalculatedValue detail={sumDetail('Expected rotation', model.total, model.actions.map((row) => ({ label: `${row.action.timestamp.toFixed(1)}s · ${row.attack?.name ?? 'Missing attack'}`, value: row.expected })))}><strong>{formatDamage(model.total)}</strong></CalculatedValue><small>Current supported formula</small></div>
      <div><span>Rotation DPS</span><CalculatedValue detail={sumDetail('Rotation DPS', model.dps, [{ label: 'Expected rotation total', value: model.total }, { label: 'Rotation duration', value: model.team.rotationDuration }], 'Expected rotation ÷ rotation duration')}><strong>{formatDamage(model.dps)}</strong></CalculatedValue><small>{model.team.rotationDuration.toFixed(1)} second window</small></div>
      <label><span>Enemy level</span><input type="number" min="1" max="200" value={model.team.enemy.level} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, level: Math.max(1, Math.min(200, Number(event.target.value))) } })}/></label>
      <label><span>Resistance %</span><input type="number" min="-100" max="100" value={model.team.enemy.resistance} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistance: Math.max(-100, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>DMG reduction %</span><input type="number" min="0" max="100" value={model.team.enemy.damageReduction} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, damageReduction: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>DEF ignore %</span><input type="number" min="0" max="100" value={model.team.enemy.defenseIgnore ?? 0} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, defenseIgnore: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>DEF reduction %</span><input type="number" min="0" max="100" value={model.team.enemy.defenseReduction ?? 0} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, defenseReduction: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>RES ignore %</span><input type="number" min="0" max="100" value={model.team.enemy.resistanceIgnore ?? 0} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistanceIgnore: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>RES reduction %</span><input type="number" min="0" max="100" value={model.team.enemy.resistanceReduction ?? 0} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistanceReduction: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>Special multiplier %</span><input type="number" min="0" value={model.team.enemy.specialMultiplier ?? 0} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, specialMultiplier: Math.max(0, Number(event.target.value)) } })}/></label>
      <label><span>Duration</span><input type="number" min="1" max="600" step="0.1" value={model.team.rotationDuration} onChange={(event) => void updateTeam({ rotationDuration: Math.max(1, Math.min(600, Number(event.target.value))) })}/></label>
    </section>

    <section className="tw-member-columns">{model.members.map((member) => <TeamMemberColumn key={member.slot} member={member} model={model} builds={builds} onOpen={() => openMember(member.slot)} onAssign={(buildId) => chooseMember(member.slot, buildId)}/>)}</section>
    <BuffWorkspace model={model} updateTeam={updateTeam}/>
    <WarningList warnings={model.warnings}/>
  </div>
}

function BuffWorkspace({ model, updateTeam }: { model: TeamWorkspaceModel; updateTeam: (patch: Partial<Team>) => Promise<void> }) {
  const buffs = model.team.buffs ?? []
  const updateBuff = (id: string, patch: Partial<BuffEffect>) => updateTeam({ buffs: buffs.map((buff) => buff.id === id ? { ...buff, ...patch } : buff) })
  const addBuff = async () => {
    const member = model.members.find((entry) => entry.build && entry.attacks.length)
    const attack = member?.attacks[0]
    if (!member?.build || !attack) return
    await updateTeam({ buffs: [...buffs, { id: createLocalId(), name: 'Team buff', sourceBuildId: member.build.id, target: 'team', triggerAttackId: attack.id, duration: 10, stat: 'atkPercent', value: 10, stackingGroup: createLocalId() }] })
  }
  return <section className="tw-panel tw-buff-workspace"><header><div><span className="eyebrow">Advanced custom modifiers</span><h2>Manual buffs and amplification</h2><p>Built-in formula effects are automatic. Use these rows only for custom scenarios.</p></div><button className="secondary" onClick={() => void addBuff()} disabled={!model.members.some((member) => member.build && member.attacks.length)}><Icon name="plus"/>Add modifier</button></header>
    <div className="tw-buff-list">{buffs.map((buff) => {
      const source = model.members.find((member) => member.build?.id === buff.sourceBuildId)
      const attacks = source?.attacks ?? []
      return <div className="tw-buff-row" key={buff.id}>
        <label><span>Name</span><input value={buff.name} onChange={(event) => void updateBuff(buff.id, { name: event.target.value })}/></label>
        <label><span>Source</span><select value={buff.sourceBuildId} onChange={(event) => { const member = model.members.find((entry) => entry.build?.id === event.target.value); void updateBuff(buff.id, { sourceBuildId: event.target.value, triggerAttackId: member?.attacks[0]?.id ?? '' }) }}>{model.members.flatMap((member) => member.build ? [<option value={member.build.id} key={member.build.id}>{teamMemberName(member)}</option>] : [])}</select></label>
        <label><span>Trigger</span><select value={buff.triggerAttackId} onChange={(event) => void updateBuff(buff.id, { triggerAttackId: event.target.value })}>{attacks.map((attack) => <option value={attack.id} key={attack.id}>{attack.name}</option>)}</select></label>
        <label><span>Target</span><select value={buff.target} onChange={(event) => void updateBuff(buff.id, { target: event.target.value as BuffEffect['target'] })}><option value="self">Self</option><option value="next">Next member</option><option value="team">Team</option></select></label>
        <label><span>Effect</span><select value={buff.stat} onChange={(event) => void updateBuff(buff.id, { stat: event.target.value as BuffEffect['stat'] })}><option value="amplify">Amplification</option><option value="atkPercent">ATK %</option><option value="hpPercent">HP %</option><option value="defPercent">DEF %</option><option value="critRate">Crit. Rate</option><option value="critDamage">Crit. DMG</option><option value="basicDamage">Basic DMG</option><option value="heavyDamage">Heavy DMG</option><option value="skillDamage">Skill DMG</option><option value="liberationDamage">Liberation DMG</option><option value="healingBonus">Healing Bonus</option></select></label>
        <label><span>Value %</span><input type="number" value={buff.value} onChange={(event) => void updateBuff(buff.id, { value: Number(event.target.value) })}/></label>
        <label><span>Duration</span><input type="number" min="0" step="0.1" value={buff.duration} onChange={(event) => void updateBuff(buff.id, { duration: Math.max(0, Number(event.target.value)) })}/></label>
        <button className="tw-remove" aria-label={`Remove ${buff.name}`} onClick={() => void updateTeam({ buffs: buffs.filter((entry) => entry.id !== buff.id) })}><Icon name="trash"/></button>
      </div>
    })}{!buffs.length && <p className="tw-empty-state">No authored buffs. Add an effect to model its activation, duration, target, and stacking group.</p>}</div>
  </section>
}

function RotationWorkspace({ model, updateTeam }: { model: TeamWorkspaceModel; updateTeam: (patch: Partial<Team>) => Promise<void> }) {
  const updateAction = (id: string, patch: Partial<RotationAction>) => updateTeam({ actions: model.team.actions.map((action) => action.id === id ? { ...action, ...patch } : action) })
  const addAction = async () => {
    const member = model.members.find((entry) => entry.build && entry.attacks.length)
    if (!member?.build || !member.attacks[0]) return
    await updateTeam({ actions: [...model.team.actions, { id: createLocalId(), timestamp: Math.min(model.team.rotationDuration, Math.ceil((model.team.actions.at(-1)?.timestamp ?? -1) + 1)), buildId: member.build.id, attackId: member.attacks[0].id, formulaTargetId: `${member.catalog?.id}:${member.attacks[0].id}` }] })
  }
  return <section className="tw-panel tw-rotation"><header><div><span className="eyebrow">Nanoka skill multipliers</span><h2>Rotation workspace</h2><p>Ordered actions calculate through the existing Tacet Lab damage domain.</p></div><button className="primary" onClick={() => void addAction()} disabled={!model.members.some((member) => member.build && member.attacks.length)}><Icon name="plus"/>Add action</button></header>
    <div className="tw-rotation-head" aria-hidden="true"><span>Time</span><span>Character</span><span>Nanoka attack</span><span>Multiplier</span><span>Buff state</span><span>Normal</span><span>Critical</span><span>Expected</span><span/></div>
    <div className="tw-action-list">{model.actions.map((row) => <div className={`tw-action ${row.warnings.length ? 'is-invalid' : ''}`} key={row.action.id}>
      <input aria-label="Timestamp" type="number" min="0" max={model.team.rotationDuration} step="0.1" value={row.action.timestamp} onChange={(event) => void updateAction(row.action.id, { timestamp: Number(event.target.value) })}/>
      <select aria-label="Character" value={row.action.buildId} onChange={(event) => { const member = model.members.find((entry) => entry.build?.id === event.target.value); const attackId = member?.attacks[0]?.id ?? ''; void updateAction(row.action.id, { buildId: event.target.value, attackId, formulaTargetId: member?.catalog ? `${member.catalog.id}:${attackId}` : undefined }) }}>{model.members.flatMap((member) => member.build ? [<option value={member.build.id} key={member.build.id}>{teamMemberName(member)}</option>] : [])}</select>
      <select aria-label="Nanoka attack" value={row.action.attackId} onChange={(event) => void updateAction(row.action.id, { attackId: event.target.value, formulaTargetId: row.member?.catalog ? `${row.member.catalog.id}:${event.target.value}` : undefined })}>{row.member?.attacks.map((attack) => <option value={attack.id} key={attack.id}>{attack.name}</option>)}</select>
      <span className="tw-multiplier">{row.attack ? <><b>{row.attack.multiplierLabel}</b><small>Lv. {row.attack.skillLevel} · {row.attack.scalesWith.toUpperCase()}</small></> : 'Missing'}</span>
      <span className="tw-buff-state">{row.activeBuffs.map(teamBuffLabel).join(', ') || 'No active buffs'}{row.activates.length > 0 && <small>Activates: {row.activates.map((buff) => `${buff.name} until ${(row.action.timestamp + buff.duration).toFixed(1)}s`).join(', ')}</small>}</span>
      <CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.normal, `${row.attack?.name ?? 'Action'} · normal`) : sumDetail('Normal damage', row.normal, [{ label: 'Calculated action', value: row.normal }])}><strong>{formatDamage(row.normal)}</strong></CalculatedValue><CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.critical, `${row.attack?.name ?? 'Action'} · critical`) : sumDetail('Critical damage', row.critical, [{ label: 'Calculated action', value: row.critical }])}><strong>{formatDamage(row.critical)}</strong></CalculatedValue><CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.expected, `${row.attack?.name ?? 'Action'} · expected`) : sumDetail('Expected damage', row.expected, [{ label: 'Calculated action', value: row.expected }])}><strong className="expected">{formatDamage(row.expected)}</strong></CalculatedValue>
      <button className="tw-remove" aria-label="Remove action" onClick={() => void updateTeam({ actions: model.team.actions.filter((action) => action.id !== row.action.id) })}><Icon name="trash"/></button>
      {row.warnings.length > 0 && <p>{row.warnings.join(' ')}</p>}
    </div>)}{!model.actions.length && <p className="tw-empty-state">Add an action to calculate a supported attack and build a timeline.</p>}</div>
    <footer><div><span>Expected rotation</span><CalculatedValue detail={sumDetail('Expected rotation', model.total, model.actions.map((row) => ({ label: `${row.action.timestamp.toFixed(1)}s · ${row.attack?.name ?? 'Missing attack'}`, value: row.expected })))}><strong>{formatDamage(model.total)}</strong></CalculatedValue></div><div><span>DPS</span><CalculatedValue detail={sumDetail('Rotation DPS', model.dps, [{ label: 'Expected rotation total', value: model.total }, { label: 'Rotation duration', value: model.team.rotationDuration }], 'Expected rotation ÷ rotation duration')}><strong>{formatDamage(model.dps)}</strong></CalculatedValue></div>{Object.entries(model.byType).map(([type, value]) => <div key={type}><span>{type}</span><CalculatedValue detail={sumDetail(`${type} damage`, value ?? 0, model.actions.filter((row) => row.attack?.type === type).map((row) => ({ label: row.attack?.name ?? 'Action', value: row.expected })))}><strong>{formatDamage(value ?? 0)} <small>{percent(value ?? 0, model.total)}</small></strong></CalculatedValue></div>)}</footer>
  </section>
}

function GameDescription({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const copyRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const copy = copyRef.current
    if (!copy || expanded) return
    const measure = () => setCanExpand(copy.scrollHeight > copy.clientHeight + 1)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [canExpand, expanded, value])

  const copy = <div ref={copyRef} className={`tw-game-description-copy ${expanded ? 'is-expanded' : ''}`}>{richSkillDescription(value)}</div>
  if (!canExpand) return <div className="tw-game-description">{copy}</div>
  return <button type="button" className="tw-game-description tw-description-trigger" aria-expanded={expanded} aria-label={expanded ? 'Collapse description' : 'Expand description'} onClick={() => setExpanded((current) => !current)}>
    {copy}<span className="tw-description-toggle" aria-hidden="true">⌄</span>
  </button>
}

interface ForteAttackGroup {
  name: string
  type: string
  multipliers: number[]
  attackIds: string[]
}

function splitSkillDescription(value: string) {
  const headingPattern = /<size=\d+>\s*<color=Title>([\s\S]*?)<\/color>\s*<\/size>/gi
  const headings = [...value.matchAll(headingPattern)]
  if (!headings.length) return [{ title: '', description: value }]
  const sections: Array<{ title: string; description: string }> = []
  const preamble = value.slice(0, headings[0].index ?? 0).trim()
  if (preamble) sections.push({ title: '', description: preamble })
  headings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? value.length
    sections.push({ title: heading[1].replace(/<[^>]+>/g, '').trim(), description: value.slice(start, end).replace(/<size=10>\s*<\/size>/gi, '').trim() })
  })
  return sections
}

function normalizedMoveName(value: string) {
  return value.toLowerCase().replace(/mid[- ]air/g, 'plunging').replace(/normal attack/g, 'basic attack').replace(/[^a-z0-9]+/g, ' ').trim()
}

function attackSectionScore(sectionTitle: string, attack: ForteAttackGroup) {
  const section = normalizedMoveName(sectionTitle)
  const name = normalizedMoveName(attack.name)
  if (!section) return 0
  let score = 0
  if (name.includes(section)) score += 20
  const sectionWords = new Set(section.split(' ').filter((word) => word.length > 2))
  name.split(' ').forEach((word) => { if (sectionWords.has(word)) score += 2 })
  if (section.includes('basic attack') && attack.type === 'basic') score += 4
  if (section.includes('heavy attack') && attack.type === 'heavy') score += 6
  if (section.includes('plunging') && name.includes('plunging')) score += 12
  if (section.includes('dodge counter') && name.includes('dodge counter')) score += 12
  return score
}

const flatValueSuffixPattern = /(?:^|\s+)(?:sta(?:mina)?\s+cost|concerto\s+(?:regen|regeneration|recovery)|cooldown|duration|resonance(?:\s+energy)?\s+cost)\s*$/i

function flatValueMoveName(valueName: string, skillName: string) {
  const label = valueName.startsWith(`${skillName} - `) ? valueName.slice(skillName.length + 3) : valueName
  return label.replace(flatValueSuffixPattern, '').replace(/\s+-\s*$/, '').trim()
}

function flatValueSectionScore(sectionTitle: string, valueName: string, skillName: string) {
  const section = normalizedMoveName(sectionTitle)
  const move = normalizedMoveName(flatValueMoveName(valueName, skillName))
  if (!section) return 0
  if (!move) return 1
  let score = 0
  if (section === move) score += 100
  else if (move.includes(section)) score += 30
  else if (section.includes(move)) score += 20
  const sectionWords = new Set(section.split(' ').filter((word) => word.length > 2))
  move.split(' ').forEach((word) => { if (sectionWords.has(word)) score += 2 })
  return score
}

function flatValueLabel(valueName: string, skillName: string, sectionTitle: string) {
  const label = valueName.startsWith(`${skillName} - `) ? valueName.slice(skillName.length + 3) : valueName
  if (!sectionTitle) return label
  const sectionPrefix = new RegExp(`^${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+-)?\\s+`, 'i')
  return label.replace(sectionPrefix, '')
}

function ForteDamageRows({ attacks, member, resultMode, skillName }: { attacks: ForteAttackGroup[]; member: TeamMemberModel; resultMode: 'normal' | 'expected' | 'critical'; skillName: string }) {
  if (!attacks.length) return null
  return <dl className="tw-skill-damage-rows">{attacks.map((attack) => {
    const formulaRows = attack.attackIds.flatMap((attackId) => member.formulaRows.filter((row) => row.target.id === `${member.catalog!.id}:${attackId}`))
    const damage = formulaRows.reduce((total, row) => total + row[resultMode], 0)
    const detail = formulaRows.length === 1
      ? traceCalculationDetail(formulaRows[0].traces[resultMode], attack.name)
      : sumDetail(`${attack.name} · ${resultMode}`, damage, formulaRows.map((row, rowIndex) => ({ label: String(rowIndex + 1), value: row[resultMode] })))
    const hitValues = formulaRows.flatMap((row) => {
      const sourceAttack = member.attacks.find((candidate) => row.target.id === `${member.catalog!.id}:${candidate.id}`)
      const hitMultipliers = sourceAttack?.hitMultipliers.length ? sourceAttack.hitMultipliers : [sourceAttack?.multiplier ?? 1]
      const totalMultiplier = hitMultipliers.reduce((total, multiplier) => total + multiplier, 0)
      return hitMultipliers.map((multiplier) => totalMultiplier > 0 ? row[resultMode] * multiplier / totalMultiplier : row[resultMode])
    })
    const label = attack.name.startsWith(`${skillName} - `) ? attack.name.slice(skillName.length + 3) : attack.name
    return <div key={`${attack.name}:${attack.type}`}><dt>{label}<small>{attack.type}{hitValues.length > 1 ? ` · ${hitValues.length}-hit sequence` : ''}</small></dt><dd><CalculatedValue detail={detail} presentation="tooltip" tooltipValues={hitValues.map(formatDamage)}><b>{formulaRows.length ? formatDamage(damage) : '—'}</b></CalculatedValue><small>{resultMode}</small></dd></div>
  })}</dl>
}

function ForteConditionControls({ conditions, values, mode, modes, disabled = false, setCondition }: {
  conditions: ConditionDefinition[]
  values: Record<string, boolean | number | string>
  mode?: string
  modes: string[]
  disabled?: boolean
  setCondition: (id: string, value: boolean | number | string) => void
}) {
  if (!conditions.length && modes.length < 2) return null
  return <div className={`tw-card-conditions ${disabled ? 'is-disabled' : ''}`}>
    {modes.length > 1 && <div className="tw-condition-mode"><span>Mode</span><div>{modes.map((option) => <button type="button" disabled={disabled} className={mode === option ? 'active' : ''} aria-pressed={mode === option} key={option} onClick={() => setCondition('wt:mode', option)}>{option}</button>)}</div></div>}
    {conditions.map((condition) => {
      const value = values[condition.id] ?? condition.defaultValue
      const conditionDisabled = disabled || condition.disabled === true
      const numeric = condition.type === 'stack' || condition.type === 'number'
      const valueActive = numeric ? Number(value) > Number(condition.min ?? 0) : Boolean(value)
      const active = condition.disabled ? valueActive : !disabled && valueActive
      return <article className={active ? 'is-active' : ''} key={condition.id}>
        <div><strong>{condition.label}</strong>{condition.description && <p>{condition.description}</p>}</div>
        {numeric
          ? <label className="tw-stack-condition"><span>{condition.type === 'stack' ? 'Stacks' : 'Value'}</span><select disabled={conditionDisabled} value={Number(value)} onChange={(event) => setCondition(condition.id, Number(event.target.value))}>{Array.from({ length: Math.max(1, (condition.max ?? condition.min ?? 0) - (condition.min ?? 0) + 1) }, (_, index) => (condition.min ?? 0) + index).map((option) => <option value={option} key={option}>{option}</option>)}</select><small>/{condition.max}</small></label>
          : <button type="button" disabled={conditionDisabled} className="tw-condition-toggle" aria-pressed={active} onClick={() => setCondition(condition.id, !active)}><i/><span>{active ? 'On' : 'Off'}</span></button>}
      </article>
    })}
  </div>
}

function sequenceConditionLabel(condition: ConditionDefinition) {
  const trigger = condition.description?.match(/\b((?:After|When|While|Upon|Casting|Obtaining|Dealing|Using|If|Whenever|Once|In the)\b[^,.;]{0,80})/i)?.[1]
  return trigger?.trim() || 'Conditional effect'
}

function ForteWorkspace({ member, model, refresh, updateTeam }: { member: TeamMemberModel; model: TeamWorkspaceModel; refresh: () => Promise<void>; updateTeam: (patch: Partial<Team>) => Promise<void> }) {
  if (!member.catalog || !member.character || !member.showcase) return null
  const skillEntries = [
    ...Object.entries(member.catalog.skillIcons).map(([key, skill], index) => ({ key, skill, level: member.showcase!.skillLevels[index] ?? 1, skillLevelIndex: index })),
    { key: 'outroSkill', skill: member.catalog.skillTreeExtras.outroSkill, level: undefined, skillLevelIndex: -1 }
  ].filter(({ skill }) => skill.name || skill.description || skill.iconSourceUrl)
  const bonusBranches = member.catalog.skillTreeExtras.bonusStatBranches
  const bonusNodes = Object.entries(bonusBranches).flatMap(([branch, nodes]) => nodes.map((node, sourceIndex) => ({ ...node, id: skillTreeBonusId(branch as keyof typeof bonusBranches, sourceIndex) })))
  const enabledNodeIds = member.character.enabledSkillTreeBonusIds ?? defaultEnabledSkillTreeBonusIds(member.catalog)
  const passiveCards = [
    ...member.catalog.skillTreeExtras.inherentSkills.map((skill, index) => ({ ...skill, eyebrow: `Inherent Skill ${index + 1}`, id: inherentSkillBonusId(index), inherentSkillIndex: index })),
    { ...member.catalog.skillTreeExtras.tuneBreakSkill, eyebrow: 'Tune Break', id: undefined, inherentSkillIndex: undefined }
  ].filter((skill) => skill.name || skill.description || skill.iconSourceUrl)
  const resultMode = model.team.scenario?.resultMode ?? 'expected'
  const sheet = characterFormulaSheets.find((entry) => entry.id === member.catalog!.id)
  const scenario = model.team.scenario ?? { resultMode: 'expected' as const, memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} }
  const conditionValues = member.build ? scenario.memberConditions[member.build.id] ?? {} : {}
  const modeDefinition = sheet?.conditions.find((condition) => condition.id === 'wt:mode')
  const modes = modeDefinition?.options ?? []
  const mode = String(conditionValues['wt:mode'] ?? modeDefinition?.defaultValue ?? '')
  const setCondition = (id: string, value: boolean | number | string) => {
    if (!member.build) return
    void updateTeam({ scenario: { ...scenario, memberConditions: { ...scenario.memberConditions, [member.build.id]: { ...conditionValues, [id]: value } } } })
  }
  const updateCharacter = async (patch: Partial<OwnedCharacter>) => {
    await db.characters.update(member.character!.id, patch)
    await refresh()
  }
  const toggleNode = async (id: string) => {
    const enabled = new Set(enabledNodeIds)
    if (enabled.has(id)) enabled.delete(id)
    else enabled.add(id)
    await updateCharacter({ enabledSkillTreeBonusIds: [...enabled].sort() })
  }

  return <section className="tw-forte-workspace">
    <aside className="tw-sequence-column">
      <header><span>Sequence</span><b>S{member.character.sequence}</b></header>
      {member.catalog.sequenceIcons.slice(0, 6).map((sequence) => { const active = member.character!.sequence >= sequence.sequence; const sequenceConditions = (sheet?.conditions ?? []).filter((condition) => condition.sequence === sequence.sequence && !condition.disabled && (condition.modifiers?.length ?? 0) > 0 && (!condition.stance || condition.stance === mode)).map((condition) => ({ ...condition, label: sequenceConditionLabel(condition), description: undefined })); return <article className={active ? 'unlocked' : ''} key={sequence.sequence}>
        <button type="button" className="tw-node-header" aria-pressed={active} onClick={() => void updateCharacter({ sequence: active ? sequence.sequence - 1 : sequence.sequence })}><img src={sequence.iconSourceUrl} alt=""/><span><strong>{sequence.name}</strong><small>Sequence Node {sequence.sequence}</small></span></button>
        <GameDescription value={sequence.description}/>
        <ForteConditionControls conditions={sequenceConditions} values={conditionValues} mode={mode} modes={sequenceConditions.some((condition) => condition.stance) ? modes : []} disabled={!active} setCondition={setCondition}/>
      </article>})}
    </aside>
    <div className="tw-skill-board">
      <div className="tw-skill-grid">{skillEntries.map(({ key, skill, level, skillLevelIndex }) => {
        const attacks = member.attacks.filter((attack) => attack.skillName === skill.name)
        const flatValues = member.catalog!.flatSkillValues.filter((value) => value.skillLevelIndex === skillLevelIndex)
        const attackGroups = [...attacks.reduce((groups, attack) => {
          const groupKey = `${attack.name}:${attack.type}`
          const existing = groups.get(groupKey)
          if (existing) {
            existing.multipliers.push(attack.multiplier)
            existing.attackIds.push(attack.id)
          } else groups.set(groupKey, { name: attack.name, type: attack.type, multipliers: [attack.multiplier], attackIds: [attack.id] })
          return groups
        }, new Map<string, ForteAttackGroup>()).values()]
        const sectionBlocks = splitSkillDescription(skill.description).map((section) => ({ ...section, attacks: [] as ForteAttackGroup[], flatValues: [] as typeof flatValues }))
        const unmatchedAttacks: ForteAttackGroup[] = []
        attackGroups.forEach((attack) => {
          let bestIndex = -1
          let bestScore = 0
          sectionBlocks.forEach((section, sectionIndex) => {
            const score = attackSectionScore(section.title, attack)
            if (score > bestScore) { bestScore = score; bestIndex = sectionIndex }
          })
          if (bestIndex >= 0) sectionBlocks[bestIndex].attacks.push(attack)
          else unmatchedAttacks.push(attack)
        })
        const unmatchedFlatValues: typeof flatValues = []
        flatValues.forEach((value) => {
          let bestIndex = -1
          let bestScore = 0
          sectionBlocks.forEach((section, sectionIndex) => {
            const score = flatValueSectionScore(section.title, value.name, skill.name)
            if (score > bestScore) { bestScore = score; bestIndex = sectionIndex }
          })
          if (bestIndex >= 0) sectionBlocks[bestIndex].flatValues.push(value)
          else unmatchedFlatValues.push(value)
        })
        if (unmatchedAttacks.length || unmatchedFlatValues.length) sectionBlocks.push({ title: sectionBlocks.length > 1 ? 'Other Details' : '', description: '', attacks: unmatchedAttacks, flatValues: unmatchedFlatValues })
        const allCardConditions = (sheet?.conditions ?? []).filter((condition) => condition.source === 'wutheringtools'
          && condition.id !== 'wt:mode'
          && condition.inherentSkillIndex === undefined
          && !condition.sequence
          && condition.card === key
          && (!condition.sequence || member.character!.sequence >= condition.sequence))
        const cardConditions = allCardConditions.filter((condition) => !condition.stance || condition.stance === mode)
        return <article className={`tw-skill-card skill-${key}`} key={key}>
          <header><span>{level === undefined ? 'Outro Skill' : `Skill Lv. ${level}`}</span></header>
          <div className="tw-skill-title"><img src={skill.iconSourceUrl} alt=""/><div><strong>{skill.name}</strong><small>{key.replace(/([A-Z])/g, ' $1')}</small></div></div>
          <ForteConditionControls conditions={cardConditions} values={conditionValues} mode={mode} modes={allCardConditions.some((condition) => condition.stance) ? modes : []} setCondition={setCondition}/>
          <div className="tw-skill-sections">{sectionBlocks.map((section, sectionIndex) => <section key={`${section.title}-${sectionIndex}`}>
            {section.title && <h3>{section.title}</h3>}
            {section.description && <GameDescription value={section.description}/>}
            {section.flatValues.length > 0 && <dl className="tw-flat-values">{section.flatValues.map((value) => {
              const valueIndex = Math.max(0, Math.min(value.values.length - 1, (level ?? 1) - 1))
              return <div key={value.id}><dt>{flatValueLabel(value.name, skill.name, section.title)}<small>Flat value</small></dt><dd>{value.values[valueIndex] ?? value.values[0] ?? '—'}</dd></div>
            })}</dl>}
            <ForteDamageRows attacks={section.attacks} member={member} resultMode={resultMode} skillName={skill.name}/>
          </section>)}</div>
        </article>
      })}</div>
      <div className="tw-passive-grid">{passiveCards.map((skill) => { const active = skill.id ? enabledNodeIds.includes(skill.id) : undefined; const skillConditions = (sheet?.conditions ?? []).filter((condition) => condition.source === 'wutheringtools' && !condition.sequence && condition.inherentSkillIndex === skill.inherentSkillIndex && skill.inherentSkillIndex !== undefined && (!condition.stance || condition.stance === mode)); return <article className={`tw-passive-card ${active === true ? 'is-enabled' : active === false ? 'is-disabled' : ''}`} key={`${skill.eyebrow}-${skill.name}`}>
        {skill.id ? <button type="button" className="tw-skill-title tw-node-toggle" aria-pressed={active} onClick={() => void toggleNode(skill.id!)}><img src={skill.iconSourceUrl} alt=""/><span><strong>{skill.name}</strong><small>{skill.eyebrow}</small></span></button> : <div className="tw-skill-title"><img src={skill.iconSourceUrl} alt=""/><div><strong>{skill.name}</strong><small>{skill.eyebrow}</small></div></div>}
        <GameDescription value={skill.description}/>
        <ForteConditionControls conditions={skillConditions} values={conditionValues} mode={mode} modes={skillConditions.some((condition) => condition.stance) ? modes : []} disabled={active === false} setCondition={setCondition}/>
      </article>})}</div>
      {bonusNodes.length > 0 && <section className="tw-bonus-nodes"><header><span className="eyebrow">Skill tree</span><h3>Bonus stat nodes</h3></header><div>{bonusNodes.map((node) => { const active = enabledNodeIds.includes(node.id); return <article className={active ? 'is-enabled' : 'is-disabled'} key={node.id}><button type="button" className="tw-bonus-node-header" aria-pressed={active} onClick={() => void toggleNode(node.id)}><img src={node.iconSourceUrl} alt=""/><strong>{node.name}</strong></button><GameDescription value={node.description}/></article> })}</div></section>}
    </div>
  </section>
}

function DetailedEchoCard({ echo, index }: { echo?: Echo; index: number }) {
  if (!echo) return <article className="tw-echo-card empty"><span>+</span><strong>Empty Echo slot</strong><small>Slot {index + 1}</small></article>
  const catalog = echoCatalog.find((entry) => entry.name === echo.name)
  return <article className="tw-echo-card"><header>{catalog?.iconSourceUrl && <img src={catalog.iconSourceUrl} alt=""/>}<span><strong>{echo.name}</strong><small>{echo.sonata}</small></span><b>{echo.cost}</b></header><div className="tw-echo-main"><span>{statLabels[echo.mainStat.key]}</span><b>{formatWorkspaceStat(echo.mainStat.key, echo.mainStat.value)}</b></div><dl>{echo.subStats.slice(0, 5).map((line, lineIndex) => <div key={`${line.key}-${lineIndex}`}><dt>{statLabels[line.key]}</dt><dd>{formatWorkspaceStat(line.key, line.value)}</dd></div>)}</dl><footer>Lv. {echo.level} · {echo.rarity}★</footer></article>
}

function TraceBranch({ trace, depth = 0 }: { trace: CalculationTrace; depth?: number }) {
  return <li style={{ '--trace-depth': depth } as CSSProperties}><span>{trace.label}</span><b>{typeof trace.value === 'number' ? (depth === 0 ? Math.floor(trace.value + 1e-9).toLocaleString('en-US') : Number(trace.value).toLocaleString('en-US', { maximumFractionDigits: 3 })) : String(trace.value)}</b>{trace.children.length > 0 && <ul>{trace.children.map((child, index) => <TraceBranch trace={child} depth={depth + 1} key={`${child.entryId ?? child.label}-${index}`}/>)}</ul>}</li>
}

function FormulaResultSheet({ member, model, updateTeam }: { member: TeamMemberModel; model: TeamWorkspaceModel; updateTeam: (patch: Partial<Team>) => Promise<void> }) {
  const [trace, setTrace] = useState<CalculationTrace | null>(null)
  const scenario = model.team.scenario ?? { resultMode: 'expected' as const, memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} }
  const mode = scenario.resultMode
  const sheet = characterFormulaSheets.find((entry) => entry.id === member.catalog?.id)
  const conditions = member.build ? scenario.memberConditions[member.build.id] ?? {} : {}
  const groups = [...new Set(member.formulaRows.map((row) => row.target.group))]
  const updateScenario = (patch: Partial<typeof scenario>) => updateTeam({ scenario: { ...scenario, ...patch } })
  const setCondition = (id: string, value: string | number | boolean) => {
    if (!member.build) return
    void updateScenario({ memberConditions: { ...scenario.memberConditions, [member.build.id]: { ...conditions, [id]: value } } })
  }
  const selectRow = (row: TeamMemberModel['formulaRows'][number]) => {
    if (member.build) void updateScenario({ selectedTargetByBuild: { ...scenario.selectedTargetByBuild, [member.build.id]: row.target.id } })
    setTrace(row.traces[mode])
  }
  const coverage = getFormulaCoverage()
  return <>
    <section className="tw-formula-toolbar tw-panel">
      <div className="tw-condition-chips">{sheet?.conditions.filter((condition) => condition.source !== 'wutheringtools').map((condition) => condition.type === 'boolean'
        ? <label className={Boolean(conditions[condition.id] ?? condition.defaultValue) ? 'active' : ''} key={condition.id}><input type="checkbox" checked={Boolean(conditions[condition.id] ?? condition.defaultValue)} onChange={(event) => setCondition(condition.id, event.target.checked)}/>{condition.label}</label>
        : <label key={condition.id}><span>{condition.label}</span><input type="number" min={condition.min} max={condition.max} value={Number(conditions[condition.id] ?? condition.defaultValue)} onChange={(event) => setCondition(condition.id, Number(event.target.value))}/></label>)}</div>
      <label className="tw-compare"><span>Compare</span><select value={scenario.compareBuildId ?? ''} onChange={(event) => void updateScenario({ compareBuildId: event.target.value || undefined })}><option value="">Current only</option>{model.members.filter((entry) => entry.build && entry.build.id !== member.build?.id).map((entry) => <option key={entry.build!.id} value={entry.build!.id}>{teamMemberName(entry)}</option>)}</select></label>
      <span className="tw-provenance">{FORMULA_SHEET_VERSION}<b>{coverage.complete ? 'Full catalog classified' : 'Coverage incomplete'}</b></span>
    </section>
    <section className="tw-formula-grid">
      <article className="tw-sheet-column tw-sheet-stats"><header><span>Basic Stats</span></header><dl>{CORE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{member.showcase ? <CalculatedValue detail={showcaseStatDetail(member.showcase, key, label)}>{formatWorkspaceStat(key, member.conditionedStats?.[key] ?? member.showcase.finalStats[key as keyof typeof member.showcase.finalStats])}</CalculatedValue> : '—'}</dd></div>)}</dl><header><span>Bonus Stats</span></header><dl>{DAMAGE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{member.showcase ? <CalculatedValue detail={showcaseStatDetail(member.showcase, key, label)}>{formatWorkspaceStat(key, member.conditionedStats?.[key] ?? member.showcase.finalStats[key as keyof typeof member.showcase.finalStats])}</CalculatedValue> : '—'}</dd></div>)}</dl></article>
      <div className="tw-sheet-results">{groups.map((group) => <article className="tw-sheet-column" key={group}><header><span>{group}</span><small>{mode}</small></header>{member.formulaRows.filter((row) => row.target.group === group).map((row) => <button className={scenario.selectedTargetByBuild[member.build?.id ?? ''] === row.target.id ? 'selected' : ''} onClick={() => selectRow(row)} key={row.target.id}><span>{row.target.label}<small>{row.target.damageType ?? row.target.kind}</small></span><b>{formatDamage(row[mode])}</b></button>)}</article>)}</div>
      <aside className="tw-sheet-side"><article className="tw-sheet-column"><header><span>Received Team Buffs</span></header>{member.receivedBuffs.map((buff) => <div className="tw-sheet-buff" key={buff.id}><span>{buff.name}</span><b>{buff.value.toFixed(1)}%</b></div>)}{!member.receivedBuffs.length && <p>No active custom team buffs.</p>}</article><article className="tw-sheet-column"><header><span>Enemy</span></header><label>Level<input type="number" min="1" max="200" value={model.team.enemy.level} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, level: Number(event.target.value) } })}/></label><label>Resistance %<input type="number" min="-100" max="100" value={model.team.enemy.resistance} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistance: Number(event.target.value) } })}/></label><label>Reduction %<input type="number" min="0" max="100" value={model.team.enemy.damageReduction} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, damageReduction: Number(event.target.value) } })}/></label></article></aside>
    </section>
    {trace && <div className="tw-trace-backdrop" onMouseDown={() => setTrace(null)}><article className="tw-trace tw-panel" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Calculation trace</span><h2>{trace.label}</h2></div><button className="close" onClick={() => setTrace(null)}>×</button></header><ul><TraceBranch trace={trace}/></ul></article></div>}
  </>
}

function MemberWorkspace({ member, model, section, setSection, updateTeam, echoes, builds, characters, weapons, openScanner, refresh }: { member: TeamMemberModel; model: TeamWorkspaceModel; section: MemberSection; setSection: (section: MemberSection) => void; updateTeam: (patch: Partial<Team>) => Promise<void>; echoes: Echo[]; builds: Build[]; characters: OwnedCharacter[]; weapons: OwnedWeapon[]; openScanner: () => void; refresh: () => Promise<void> }) {
  if (!member.build || !member.catalog || !member.character || !member.showcase) return <section className="tw-member-empty tw-panel"><MemberAvatar member={member}/><h2>Member {member.slot + 1} is empty</h2><p>Return to Team Settings and click the empty member card to add a saved build.</p></section>
  const showcase = member.showcase
  const elementStat = `${member.catalog.element.toLowerCase()}Damage` as StatKey
  const weaponPassive = showcase.weapon?.catalog.passiveEffects[Math.max(0, (showcase.weapon?.owned.rank ?? 1) - 1)] ?? showcase.weapon?.catalog.passiveEffects[0]
  const scenario = model.team.scenario ?? { resultMode: 'expected' as const, memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} }
  const conditionValues = scenario.memberConditions[member.build.id] ?? {}
  const weaponConditions: ConditionDefinition[] = showcase.weapon ? weaponPassiveConditions(showcase.weapon.catalog, showcase.weapon.owned.rank).map((condition) => ({
    id: condition.id,
    label: condition.label,
    type: condition.type,
    defaultValue: condition.defaultValue,
    min: condition.min,
    max: condition.max,
    scope: 'self',
    description: condition.description,
    disabled: condition.alwaysOn
  })) : []
  const setCondition = (id: string, value: boolean | number | string) => void updateTeam({
    scenario: { ...scenario, memberConditions: { ...scenario.memberConditions, [member.build!.id]: { ...conditionValues, [id]: value } } }
  })
  const setResultMode = (resultMode: FormulaResultMode) => updateTeam({ scenario: { ...scenario, resultMode } })
  return <div className={`tw-member-page section-${section}`}>
    <nav className="tw-subnav" aria-label={`${member.catalog.name} sections`} role="tablist">
      {MEMBER_SECTIONS.map((item) => <button key={item.id} role="tab" className={section === item.id ? 'active' : ''} aria-selected={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}
      <div className="tw-nav-result-modes" role="group" aria-label="Damage result mode">
        {DAMAGE_RESULT_MODES.map((mode) => <button type="button" aria-pressed={scenario.resultMode === mode.id} className={scenario.resultMode === mode.id ? 'active' : ''} key={mode.id} onClick={() => void setResultMode(mode.id)}>{mode.label}</button>)}
      </div>
    </nav>
    {section === 'rotation' ? <RotationWorkspace model={model} updateTeam={updateTeam}/>
      : section === 'optimizer' ? <OptimizerView echoes={echoes} builds={builds} characters={characters} ownedWeapons={weapons} refresh={refresh} openScanner={openScanner} buildId={member.build.id} initialEnemy={model.team.enemy} damageMode={scenario.resultMode} scenario={scenario}/>
      : <>
    <section className={`tw-member-hero tw-panel ${section === 'forte' ? 'forte-mode' : ''}`} style={{ '--tw-element': member.catalog.element.toLowerCase() } as CSSProperties}>
      <div className="tw-member-art"><img src={member.catalog.portraitSourceUrl || member.catalog.iconSourceUrl} alt=""/><div className="tw-sequence-rail">{member.catalog.sequenceIcons.slice(0, 6).map((sequence) => <span className={member.character && member.character.sequence >= sequence.sequence ? 'unlocked' : ''} key={sequence.sequence} title={sequence.name}><img src={sequence.iconSourceUrl} alt=""/><b>S{sequence.sequence}</b></span>)}</div><div><span>{member.catalog.element} · {member.catalog.weaponType}</span><h1>{member.catalog.name}</h1><p>{member.catalog.title}</p><strong>Lv. {member.character.level} · Sequence {member.character.sequence}</strong></div><EchoWaveform element={member.catalog.element}/></div>
      <div className="tw-member-summary">
        {(section === 'overview' || section === 'damage') && <><article className="tw-stat-block"><header><span className="eyebrow">Basic stats</span><h2>Current attributes</h2></header><dl>{CORE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd><CalculatedValue detail={showcaseStatDetail(showcase, key, label)}>{formatWorkspaceStat(key, member.conditionedStats?.[key] ?? showcase.finalStats[key as keyof typeof showcase.finalStats])}</CalculatedValue></dd></div>)}</dl></article><article className="tw-stat-block"><header><span className="eyebrow">Damage bonuses</span><h2>Specialized output</h2></header><dl>{[...DAMAGE_STATS, [elementStat, `${member.catalog.element} DMG`] as [StatKey, string]].map(([key, label]) => <div key={key}><dt>{label}</dt><dd><CalculatedValue detail={showcaseStatDetail(showcase, key, label)}>{formatWorkspaceStat(key, member.conditionedStats?.[key] ?? showcase.finalStats[key as keyof typeof showcase.finalStats])}</CalculatedValue></dd></div>)}</dl></article></>}
        {section === 'overview' && <article className="tw-forte-block"><header><span className="eyebrow">Skills</span><h2>Forte and skill levels</h2></header><div>{Object.entries(member.catalog.skillIcons).map(([key, skill], index) => <span key={key}><img src={skill.iconSourceUrl} alt=""/><b>{skill.name}</b><small>Lv. {showcase.skillLevels[index]}</small></span>)}</div></article>}
        {section === 'forte' && <ForteWorkspace member={member} model={model} refresh={refresh} updateTeam={updateTeam}/>}
        {(section === 'overview' || section === 'damage') && <article className="tw-damage-block"><header><span className="eyebrow">Rotation participation</span><h2>Attack and healing breakdown</h2></header><div className="tw-contribution"><CalculatedValue detail={sumDetail(`${teamMemberName(member)} contribution`, member.contribution, model.actions.filter((row) => row.member?.slot === member.slot).map((row) => ({ label: row.attack?.name ?? 'Action', value: row.expected })))}><strong>{formatDamage(member.contribution)}</strong></CalculatedValue><span>{member.contributionPercent.toFixed(1)}% of expected rotation</span><div><i style={{ width: `${member.contributionPercent}%` }}/></div></div><dl>{Object.entries(member.byType).map(([type, value]) => <div key={type}><dt>{type}</dt><dd><CalculatedValue detail={sumDetail(`${type} contribution`, value ?? 0, model.actions.filter((row) => row.member?.slot === member.slot && row.attack?.type === type).map((row) => ({ label: row.attack?.name ?? 'Action', value: row.expected })))}>{formatDamage(value ?? 0)}</CalculatedValue></dd></div>)}</dl>{model.actions.filter((row) => row.member?.slot === member.slot).map((row) => <div className="tw-member-action" key={row.action.id}><span>{row.action.timestamp.toFixed(1)}s · {row.attack?.name ?? 'Missing attack'}<small>{row.attack?.type ?? 'invalid'} · Normal <CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.normal) : sumDetail('Normal damage', row.normal, [{ label: 'Calculated action', value: row.normal }])}>{formatDamage(row.normal)}</CalculatedValue> · Critical <CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.critical) : sumDetail('Critical damage', row.critical, [{ label: 'Calculated action', value: row.critical }])}>{formatDamage(row.critical)}</CalculatedValue></small></span><CalculatedValue detail={row.traces ? traceCalculationDetail(row.traces.expected) : sumDetail('Expected damage', row.expected, [{ label: 'Calculated action', value: row.expected }])}><b>{formatDamage(row.expected)}<small>Expected</small></b></CalculatedValue></div>)}</article>}
        {(section === 'overview' || section === 'damage') && <article className="tw-buff-summary"><header><span className="eyebrow">Team effects</span><h2>Applied and received buffs</h2></header><h3>Applied</h3><div className="tw-chip-list">{member.appliedBuffs.map((buff) => <span className="tw-chip" key={buff.id}>{teamBuffLabel(buff)}</span>)}{!member.appliedBuffs.length && <span className="tw-chip muted">None authored</span>}</div><h3>Received</h3><div className="tw-chip-list">{member.receivedBuffs.map((buff) => <span className="tw-chip" key={buff.id}>{teamBuffLabel(buff)}</span>)}{!member.receivedBuffs.length && <span className="tw-chip muted">None authored</span>}</div></article>}
        {section === 'echoes' && <article className="tw-sonata-detail"><header><span className="eyebrow">Coverage details</span><h2>Active Sonata sets</h2></header>{showcase.sonatas.map((sonata) => <div key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<span><b>{sonata.name}</b><small>{sonata.count} equipped pieces</small></span></div>)}</article>}
      </div>
    </section>
    {(section === 'overview' || section === 'echoes') && <section className="tw-loadout-block tw-panel">
      <header><span className="eyebrow">Loadout</span><h2>Weapon and Echoes</h2></header>
      <div className="tw-loadout-weapon-row">
        <div className="tw-weapon-detail">{showcase.weapon ? <><img src={showcase.weapon.catalog.iconSourceUrl} alt=""/><span><strong>{showcase.weapon.catalog.name}</strong><small>Lv. {showcase.weapon.owned.level} · R{showcase.weapon.owned.rank} · {showcase.weapon.catalog.type}</small><b>{showcase.weapon.levelStats.baseAtk} Base ATK</b><em>{showcase.weapon.catalog.secondaryStat} {showcase.weapon.levelStats.secondaryStatValue}</em></span></> : <p>No weapon equipped.</p>}</div>
        {section === 'overview' && <div className="tw-weapon-passive"><header><span className="eyebrow">Weapon passive</span><h3>{showcase.weapon?.catalog.passiveName ?? 'No weapon passive'}</h3></header><p>{weaponPassive ?? 'Equip a supported weapon to display its generated Nanoka passive text.'}</p><ForteConditionControls conditions={weaponConditions} values={conditionValues} modes={[]} setCondition={setCondition}/>{showcase.weapon && <strong>Always-on lines are locked on. Triggered and stackable effects use the controls above.</strong>}</div>}
      </div>
      <div className="tw-loadout-echoes"><EchoThumbs member={member}/><SonataChips member={member}/></div>
    </section>}
    {(section === 'overview' || section === 'damage') && <FormulaResultSheet member={member} model={model} updateTeam={updateTeam}/>}
    {(section === 'overview' || section === 'echoes') && <section className="tw-member-echoes"><header><div><span className="eyebrow">Detailed Echo loadout</span><h2>Five equipped Echoes</h2></div><span>{showcase.equippedEchoes.length}/5 · {showcase.totalEchoCost}/12 cost</span></header><div>{showcase.echoSlots.map((echo, index) => <DetailedEchoCard echo={echo} index={index} key={echo?.id ?? index}/>)}</div></section>}
    </>}
    <WarningList warnings={section === 'rotation' ? model.warnings : member.warnings}/>
  </div>
}

export function TeamsView({ echoes, builds, teams, characters, weapons, refresh, openScanner }: TeamsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(teams[0]?.id ?? null)
  const [showGallery, setShowGallery] = useState(true)
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [memberSection, setMemberSection] = useState<MemberSection>('overview')
  const [nameDraft, setNameDraft] = useState('')
  const team = teams.find((entry) => entry.id === selectedId) ?? teams[0]
  const model = useMemo(() => team ? resolveTeamWorkspace({ team, builds, characters, weapons, echoes }) : undefined, [team, builds, characters, weapons, echoes])

  useEffect(() => { if (!team && teams[0]) setSelectedId(teams[0].id) }, [team, teams])
  useEffect(() => { setNameDraft(team?.name ?? '') }, [team?.id, team?.name])

  const updateTeamById = async (teamId: string, patch: Partial<Team>) => {
    await db.teams.update(teamId, patch)
    await refresh()
  }
  const updateTeam = async (patch: Partial<Team>) => {
    if (!team) return
    await updateTeamById(team.id, patch)
  }
  const createTeam = async () => {
    const next: Team = { id: createLocalId(), name: `Team ${teams.length + 1}`, buildIds: [], enemy: { level: 90, resistance: 10, damageReduction: 0 }, rotationDuration: 20, actions: [], buffs: [], scenario: { resultMode: 'expected', memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} } }
    await db.teams.add(next); await refresh(); setSelectedId(next.id); setTab('settings'); setShowGallery(false)
  }
  const duplicateTeam = async () => {
    if (!team) return
    const next: Team = { ...team, id: createLocalId(), name: `${team.name} Copy`, actions: team.actions.map((action) => ({ ...action, id: createLocalId() })), buffs: (team.buffs ?? []).map((buff) => ({ ...buff, id: createLocalId(), stackingGroup: createLocalId() })) }
    await db.teams.add(next); await refresh(); setSelectedId(next.id); setTab('settings')
  }
  const deleteTeam = async () => {
    if (!team || !confirm(`Delete ${team.name}? This removes its local rotation and authored buffs.`)) return
    await db.teams.delete(team.id); await refresh(); setSelectedId(teams.find((entry) => entry.id !== team.id)?.id ?? null); setTab('settings'); setShowGallery(true)
  }

  const deleteGalleryTeam = async (target: Team) => {
    if (!confirm(`Delete ${target.name}? This removes its local rotation and authored buffs.`)) return
    await db.teams.delete(target.id)
    await refresh()
    if (selectedId === target.id) setSelectedId(teams.find((entry) => entry.id !== target.id)?.id ?? null)
  }

  if (showGallery) return <main className="team-workspace"><TeamGallery teams={teams} builds={builds} characters={characters} weapons={weapons} echoes={echoes} onCreate={createTeam} onOpen={(teamId) => { setSelectedId(teamId); setTab('settings'); setShowGallery(false) }} onRename={(teamId, name) => updateTeamById(teamId, { name })} onDelete={deleteGalleryTeam}/></main>

  return <main className="team-workspace">
    <header className="tw-toolbar tw-panel">
      <div className="tw-team-select"><button className="tw-back-to-gallery" onClick={() => setShowGallery(true)}>← All teams</button><label><span>Current team</span><select value={team?.id ?? ''} onChange={(event) => { setSelectedId(event.target.value); setTab('settings') }}><option value="" disabled>Select a team</option>{teams.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label></div>
      <label className="tw-name-field"><span>Team name</span><input value={nameDraft} disabled={!team} onChange={(event) => setNameDraft(event.target.value)} onBlur={() => { if (team && nameDraft.trim() && nameDraft.trim() !== team.name) void updateTeam({ name: nameDraft.trim() }) }}/></label>
      <div className="tw-management"><button className="primary" onClick={() => void createTeam()}><Icon name="plus"/>Create</button><button className="secondary" disabled={!team} onClick={() => { if (team && nameDraft.trim()) void updateTeam({ name: nameDraft.trim() }) }}>Rename</button><button className="secondary" disabled={!team} onClick={() => void duplicateTeam()}>Duplicate</button><button className="danger" disabled={!team} onClick={() => void deleteTeam()}><Icon name="trash"/>Delete</button></div>
    </header>
    <nav className="tw-primary-tabs" aria-label="Team workspace pages" role="tablist">
      <button role="tab" className={tab === 'settings' ? 'active' : ''} aria-selected={tab === 'settings'} onClick={() => setTab('settings')}><span>Team Settings</span><small>Composition and enemy</small></button>
      {Array.from({ length: 3 }, (_, slot) => { const member = model?.members[slot]; return <button role="tab" className={tab === slot ? 'active' : ''} aria-selected={tab === slot} key={slot} onClick={() => { setTab(slot as 0 | 1 | 2); setMemberSection('overview') }}><MemberAvatar member={member ?? { slot, attacks: [], contribution: 0, contributionPercent: 0, byType: {}, appliedBuffs: [], receivedBuffs: [], roles: [], warnings: [] }} compact/><span>Member {slot + 1}</span><small>{member?.catalog?.name ?? 'Empty slot'}</small></button> })}
    </nav>
    {!model ? <section className="tw-first-team tw-panel"><span className="eyebrow">No teams yet</span><h1>Start a team workspace</h1><p>Create a local team, assign up to three saved builds, and author its rotation without leaving this page.</p><button className="primary" onClick={() => void createTeam()}><Icon name="plus"/>Create team</button></section>
      : tab === 'settings' ? <TeamOverview model={model} builds={builds} updateTeam={updateTeam} openMember={(slot) => { setTab(slot as 0 | 1 | 2); setMemberSection('overview') }}/>
        : <MemberWorkspace member={model.members[tab]} model={model} section={memberSection} setSection={setMemberSection} updateTeam={updateTeam} echoes={echoes} builds={builds} characters={characters} weapons={weapons} openScanner={openScanner} refresh={refresh}/>}
  </main>
}
