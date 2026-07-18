import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDamage } from '../domain/damage'
import { createLocalId } from '../domain/id'
import type { BuffEffect, Build, Echo, OwnedCharacter, OwnedWeapon, RotationAction, StatKey, Team } from '../domain/types'
import { characterCatalog, echoCatalog, statLabels } from '../game-data'
import { characterFormulaSheets, FORMULA_SHEET_VERSION, getFormulaCoverage, type CalculationTrace } from '../domain/calculation'
import { db } from '../storage/database'
import { EchoWaveform } from './EchoWaveform'
import { Icon } from './components'
import {
  echoArtwork, formatWorkspaceStat, resolveTeamWorkspace, teamBuffLabel,
  type TeamMemberModel, type TeamWorkspaceModel
} from './team-workspace-model'
import './team-workspace.css'

type WorkspaceTab = 'settings' | 0 | 1 | 2
type MemberSection = 'overview' | 'forte' | 'damage' | 'echoes'

const MEMBER_SECTIONS: Array<{ id: MemberSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'forte', label: 'Forte' },
  { id: 'damage', label: 'Damage' },
  { id: 'echoes', label: 'Echoes' }
]

const CORE_STATS: Array<[StatKey, string]> = [
  ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['critRate', 'Crit. Rate'],
  ['critDamage', 'Crit. DMG'], ['energyRegen', 'Energy Regen']
]

const DAMAGE_STATS: Array<[StatKey, string]> = [
  ['basicDamage', 'Basic Attack'], ['heavyDamage', 'Heavy Attack'], ['skillDamage', 'Resonance Skill'],
  ['liberationDamage', 'Resonance Liberation'], ['healingBonus', 'Healing Bonus']
]

interface TeamsViewProps {
  echoes: Echo[]
  builds: Build[]
  teams: Team[]
  characters: OwnedCharacter[]
  weapons: OwnedWeapon[]
  refresh: () => Promise<void>
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
  return <div className={`tw-warnings ${compact ? 'compact' : ''}`} role="status">{warnings.map((warning) => <p key={warning}><span aria-hidden="true">!</span>{warning}</p>)}</div>
}

function SonataChips({ member }: { member: TeamMemberModel }) {
  return <div className="tw-chip-list">{member.showcase?.sonatas.length ? member.showcase.sonatas.map((sonata) =>
    <span className="tw-chip" key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<b>{sonata.name}</b><small>{sonata.count}</small></span>
  ) : <span className="tw-chip muted">No Sonata coverage</span>}</div>
}

function TeamMemberColumn({ member, model, onOpen }: { member: TeamMemberModel; model: TeamWorkspaceModel; onOpen: () => void }) {
  return <article className={`tw-member-column ${member.build ? '' : 'is-empty'}`}>
    <header><MemberAvatar member={member}/><div><span className="eyebrow">Member {member.slot + 1}</span><h3>{member.catalog?.name ?? 'Empty slot'}</h3><p>{member.catalog?.role ?? 'Assign a saved character build'}</p></div><button className="tw-icon-button" onClick={onOpen} aria-label={`Open member ${member.slot + 1}`}>→</button></header>
    {member.build ? <>
      <div className="tw-member-weapon">{member.showcase?.weapon?.catalog.iconSourceUrl && <img src={member.showcase.weapon.catalog.iconSourceUrl} alt=""/>}<span><small>Equipped weapon</small><b>{member.showcase?.weapon?.catalog.name ?? 'No weapon'}</b><em>{member.showcase?.weapon ? `Lv. ${member.showcase.weapon.owned.level} · R${member.showcase.weapon.owned.rank}` : 'Required for damage'}</em></span></div>
      <EchoThumbs member={member}/><SonataChips member={member}/>
      <dl className="tw-mini-facts"><div><dt>Applied buffs</dt><dd>{member.appliedBuffs.length}</dd></div><div><dt>Received buffs</dt><dd>{member.receivedBuffs.length}</dd></div><div><dt>Rotation</dt><dd>{formatDamage(member.contribution)}</dd></div><div><dt>Share</dt><dd>{percent(member.contribution, model.total)}</dd></div></dl>
      <div className="tw-progress"><span style={{ width: `${member.contributionPercent}%` }}/></div>
      <WarningList warnings={member.warnings} compact/>
    </> : <div className="tw-empty-copy"><strong>No member assigned</strong><p>The slot stays visible so the team structure is always clear.</p></div>}
  </article>
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
      <div><span>Expected rotation</span><strong>{formatDamage(model.total)}</strong><small>Current supported formula</small></div>
      <div><span>Rotation DPS</span><strong>{formatDamage(model.dps)}</strong><small>{model.team.rotationDuration.toFixed(1)} second window</small></div>
      <label><span>Enemy level</span><input type="number" min="1" max="200" value={model.team.enemy.level} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, level: Math.max(1, Math.min(200, Number(event.target.value))) } })}/></label>
      <label><span>Resistance %</span><input type="number" min="-100" max="100" value={model.team.enemy.resistance} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistance: Math.max(-100, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>Reduction %</span><input type="number" min="0" max="100" value={model.team.enemy.damageReduction} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, damageReduction: Math.max(0, Math.min(100, Number(event.target.value))) } })}/></label>
      <label><span>Duration</span><input type="number" min="1" max="600" step="0.1" value={model.team.rotationDuration} onChange={(event) => void updateTeam({ rotationDuration: Math.max(1, Math.min(600, Number(event.target.value))) })}/></label>
    </section>

    <section className="tw-coverage-grid">
      <article className="tw-panel tw-coverage"><header><span className="eyebrow">Team signals</span><h2>Sonata coverage</h2></header><div className="tw-coverage-list">{model.sonatas.length ? model.sonatas.map((sonata) => <div key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<span><b>{sonata.name}</b><small>{sonata.activeThresholds.length ? `${sonata.activeThresholds.join(' / ')}-piece threshold represented` : 'No modeled threshold active'}</small></span><strong>{sonata.pieces}</strong></div>) : <p>No equipped Echoes contribute Sonata coverage.</p>}</div></article>
      <article className="tw-panel tw-coverage"><header><span className="eyebrow">Swap sequence</span><h2>Intro / Outro chain</h2></header><div className="tw-chain"><div><strong>{model.introCount}</strong><span>Intro attacks in Nanoka catalog</span></div><div><strong>{model.outroCount}</strong><span>Outro attacks in Nanoka catalog</span></div></div><p className="tw-limitation">Chain timing and Concerto generation are not simulated.</p></article>
      <article className="tw-panel tw-coverage"><header><span className="eyebrow">Composition</span><h2>Role coverage</h2></header><div className="tw-role-list">{model.roles.length ? model.roles.map((role) => <span key={role}>{role}</span>) : <p>Add members to inspect role coverage.</p>}</div><p className="tw-limitation">Roles are inferred from generated catalog descriptions and available attacks.</p></article>
    </section>

    <section className="tw-slot-selectors tw-panel"><header><div><span className="eyebrow">Composition</span><h2>Team members</h2></div><small>Saved builds and local inventory</small></header><div>{model.members.map((member) => <label key={member.slot}><span>Member {member.slot + 1}</span><select value={member.build?.id ?? ''} onChange={(event) => void chooseMember(member.slot, event.target.value)}><option value="">Empty slot</option>{builds.map((build) => { const catalog = characterCatalog.find((entry) => entry.id === build.resonatorId); return <option value={build.id} key={build.id} disabled={model.team.buildIds.includes(build.id) && member.build?.id !== build.id}>{catalog?.name ?? build.name} · {build.name}</option> })}</select></label>)}</div></section>

    <section className="tw-member-columns">{model.members.map((member) => <TeamMemberColumn key={member.slot} member={member} model={model} onOpen={() => openMember(member.slot)}/>)}</section>
    <BuffWorkspace model={model} updateTeam={updateTeam}/>
    <RotationWorkspace model={model} updateTeam={updateTeam}/>
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
      <strong>{formatDamage(row.normal)}</strong><strong>{formatDamage(row.critical)}</strong><strong className="expected">{formatDamage(row.expected)}</strong>
      <button className="tw-remove" aria-label="Remove action" onClick={() => void updateTeam({ actions: model.team.actions.filter((action) => action.id !== row.action.id) })}><Icon name="trash"/></button>
      {row.warnings.length > 0 && <p>{row.warnings.join(' ')}</p>}
    </div>)}{!model.actions.length && <p className="tw-empty-state">Add an action to calculate a supported attack and build a timeline.</p>}</div>
    <footer><div><span>Expected rotation</span><strong>{formatDamage(model.total)}</strong></div><div><span>DPS</span><strong>{formatDamage(model.dps)}</strong></div>{Object.entries(model.byType).map(([type, value]) => <div key={type}><span>{type}</span><strong>{formatDamage(value ?? 0)} <small>{percent(value ?? 0, model.total)}</small></strong></div>)}</footer>
  </section>
}

function DetailedEchoCard({ echo, index }: { echo?: Echo; index: number }) {
  if (!echo) return <article className="tw-echo-card empty"><span>+</span><strong>Empty Echo slot</strong><small>Slot {index + 1}</small></article>
  const catalog = echoCatalog.find((entry) => entry.name === echo.name)
  return <article className="tw-echo-card"><header>{catalog?.iconSourceUrl && <img src={catalog.iconSourceUrl} alt=""/>}<span><strong>{echo.name}</strong><small>{echo.sonata}</small></span><b>{echo.cost}</b></header><div className="tw-echo-main"><span>{statLabels[echo.mainStat.key]}</span><b>{formatWorkspaceStat(echo.mainStat.key, echo.mainStat.value)}</b></div><dl>{echo.subStats.slice(0, 5).map((line, lineIndex) => <div key={`${line.key}-${lineIndex}`}><dt>{statLabels[line.key]}</dt><dd>{formatWorkspaceStat(line.key, line.value)}</dd></div>)}</dl><footer>Lv. {echo.level} · {echo.rarity}★</footer></article>
}

function TraceBranch({ trace, depth = 0 }: { trace: CalculationTrace; depth?: number }) {
  return <li style={{ '--trace-depth': depth } as CSSProperties}><span>{trace.label}</span><b>{typeof trace.value === 'number' ? Number(trace.value).toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(trace.value)}</b>{trace.children.length > 0 && <ul>{trace.children.map((child, index) => <TraceBranch trace={child} depth={depth + 1} key={`${child.entryId ?? child.label}-${index}`}/>)}</ul>}</li>
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
      <div className="tw-result-modes" role="tablist" aria-label="Damage result mode">{([['normal', 'Non-CRIT'], ['expected', 'Average'], ['critical', 'CRIT']] as const).map(([value, label]) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} key={value} onClick={() => void updateScenario({ resultMode: value })}>{label}</button>)}</div>
      <div className="tw-condition-chips">{sheet?.conditions.map((condition) => condition.type === 'boolean'
        ? <label className={Boolean(conditions[condition.id] ?? condition.defaultValue) ? 'active' : ''} key={condition.id}><input type="checkbox" checked={Boolean(conditions[condition.id] ?? condition.defaultValue)} onChange={(event) => setCondition(condition.id, event.target.checked)}/>{condition.label}</label>
        : <label key={condition.id}><span>{condition.label}</span><input type="number" min={condition.min} max={condition.max} value={Number(conditions[condition.id] ?? condition.defaultValue)} onChange={(event) => setCondition(condition.id, Number(event.target.value))}/></label>)}</div>
      <label className="tw-compare"><span>Compare</span><select value={scenario.compareBuildId ?? ''} onChange={(event) => void updateScenario({ compareBuildId: event.target.value || undefined })}><option value="">Current only</option>{model.members.filter((entry) => entry.build && entry.build.id !== member.build?.id).map((entry) => <option key={entry.build!.id} value={entry.build!.id}>{teamMemberName(entry)}</option>)}</select></label>
      <span className="tw-provenance">{FORMULA_SHEET_VERSION}<b>{coverage.complete ? 'Full catalog classified' : 'Coverage incomplete'}</b></span>
    </section>
    <section className="tw-formula-grid">
      <article className="tw-sheet-column tw-sheet-stats"><header><span>Basic Stats</span></header><dl>{CORE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{member.showcase ? formatWorkspaceStat(key, member.showcase.finalStats[key as keyof typeof member.showcase.finalStats]) : '—'}</dd></div>)}</dl><header><span>Bonus Stats</span></header><dl>{DAMAGE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{member.showcase ? formatWorkspaceStat(key, member.showcase.finalStats[key as keyof typeof member.showcase.finalStats]) : '—'}</dd></div>)}</dl></article>
      <div className="tw-sheet-results">{groups.map((group) => <article className="tw-sheet-column" key={group}><header><span>{group}</span><small>{mode}</small></header>{member.formulaRows.filter((row) => row.target.group === group).map((row) => <button className={scenario.selectedTargetByBuild[member.build?.id ?? ''] === row.target.id ? 'selected' : ''} onClick={() => selectRow(row)} key={row.target.id}><span>{row.target.label}<small>{row.target.damageType ?? row.target.kind}</small></span><b>{formatDamage(row[mode])}</b></button>)}</article>)}</div>
      <aside className="tw-sheet-side"><article className="tw-sheet-column"><header><span>Received Team Buffs</span></header>{member.receivedBuffs.map((buff) => <div className="tw-sheet-buff" key={buff.id}><span>{buff.name}</span><b>{buff.value.toFixed(1)}%</b></div>)}{!member.receivedBuffs.length && <p>No active custom team buffs.</p>}</article><article className="tw-sheet-column"><header><span>Enemy</span></header><label>Level<input type="number" min="1" max="200" value={model.team.enemy.level} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, level: Number(event.target.value) } })}/></label><label>Resistance %<input type="number" min="-100" max="100" value={model.team.enemy.resistance} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, resistance: Number(event.target.value) } })}/></label><label>Reduction %<input type="number" min="0" max="100" value={model.team.enemy.damageReduction} onChange={(event) => void updateTeam({ enemy: { ...model.team.enemy, damageReduction: Number(event.target.value) } })}/></label></article></aside>
    </section>
    {trace && <div className="tw-trace-backdrop" onMouseDown={() => setTrace(null)}><article className="tw-trace tw-panel" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Calculation trace</span><h2>{trace.label}</h2></div><button className="close" onClick={() => setTrace(null)}>×</button></header><ul><TraceBranch trace={trace}/></ul></article></div>}
  </>
}

function MemberWorkspace({ member, model, section, setSection, updateTeam }: { member: TeamMemberModel; model: TeamWorkspaceModel; section: MemberSection; setSection: (section: MemberSection) => void; updateTeam: (patch: Partial<Team>) => Promise<void> }) {
  if (!member.build || !member.catalog || !member.character || !member.showcase) return <section className="tw-member-empty tw-panel"><MemberAvatar member={member}/><h2>Member {member.slot + 1} is empty</h2><p>Assign a saved build from Team Settings. This slot remains part of the team workspace.</p></section>
  const showcase = member.showcase
  const elementStat = `${member.catalog.element.toLowerCase()}Damage` as StatKey
  const weaponPassive = showcase.weapon?.catalog.passiveEffects[Math.max(0, (showcase.weapon?.owned.rank ?? 1) - 1)] ?? showcase.weapon?.catalog.passiveEffects[0]
  return <div className="tw-member-page">
    <nav className="tw-subnav" aria-label={`${member.catalog.name} sections`} role="tablist">{MEMBER_SECTIONS.map((item) => <button key={item.id} role="tab" className={section === item.id ? 'active' : ''} aria-selected={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
    <section className="tw-member-hero tw-panel" style={{ '--tw-element': member.catalog.element.toLowerCase() } as CSSProperties}>
      <div className="tw-member-art"><img src={member.catalog.portraitSourceUrl || member.catalog.iconSourceUrl} alt=""/><div className="tw-sequence-rail">{member.catalog.sequenceIcons.slice(0, 6).map((sequence) => <span className={member.character && member.character.sequence >= sequence.sequence ? 'unlocked' : ''} key={sequence.sequence} title={sequence.name}><img src={sequence.iconSourceUrl} alt=""/><b>S{sequence.sequence}</b></span>)}</div><div><span>{member.catalog.element} · {member.catalog.weaponType}</span><h1>{member.catalog.name}</h1><p>{member.catalog.title}</p><strong>Lv. {member.character.level} · Sequence {member.character.sequence}</strong></div><EchoWaveform element={member.catalog.element}/></div>
      <div className="tw-member-summary">
        {(section === 'overview' || section === 'damage') && <><article className="tw-stat-block"><header><span className="eyebrow">Basic stats</span><h2>Current attributes</h2></header><dl>{CORE_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatWorkspaceStat(key, showcase.finalStats[key as keyof typeof showcase.finalStats])}</dd></div>)}</dl></article><article className="tw-stat-block"><header><span className="eyebrow">Damage bonuses</span><h2>Specialized output</h2></header><dl>{[...DAMAGE_STATS, [elementStat, `${member.catalog.element} DMG`] as [StatKey, string]].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatWorkspaceStat(key, showcase.finalStats[key as keyof typeof showcase.finalStats])}</dd></div>)}</dl></article></>}
        {(section === 'overview' || section === 'forte') && <article className="tw-forte-block"><header><span className="eyebrow">Generated Nanoka assets</span><h2>Forte and skill levels</h2></header><div>{Object.entries(member.catalog.skillIcons).map(([key, skill], index) => <span key={key}><img src={skill.iconSourceUrl} alt=""/><b>{skill.name}</b><small>Lv. {showcase.skillLevels[index]}</small></span>)}</div>{section === 'forte' && <div className="tw-attack-catalog">{member.attacks.map((attack) => <article key={attack.id}><img src={attack.iconSourceUrl} alt=""/><span><b>{attack.name}</b><small>{attack.skillName} · Lv. {attack.skillLevel}</small></span><strong>{attack.multiplierLabel}</strong><em>{attack.type} · {attack.scalesWith.toUpperCase()}</em></article>)}</div>}</article>}
        {(section === 'overview' || section === 'echoes') && <article className="tw-loadout-block"><header><span className="eyebrow">Loadout</span><h2>Weapon and Echoes</h2></header><div className="tw-weapon-detail">{showcase.weapon ? <><img src={showcase.weapon.catalog.iconSourceUrl} alt=""/><span><strong>{showcase.weapon.catalog.name}</strong><small>Lv. {showcase.weapon.owned.level} · R{showcase.weapon.owned.rank} · {showcase.weapon.catalog.type}</small><b>{showcase.weapon.levelStats.baseAtk} Base ATK</b><em>{showcase.weapon.catalog.secondaryStat} {showcase.weapon.levelStats.secondaryStatValue}</em></span></> : <p>No weapon equipped.</p>}</div><EchoThumbs member={member}/><SonataChips member={member}/></article>}
        {(section === 'overview' || section === 'damage') && <article className="tw-damage-block"><header><span className="eyebrow">Rotation participation</span><h2>Attack and healing breakdown</h2></header><div className="tw-contribution"><strong>{formatDamage(member.contribution)}</strong><span>{member.contributionPercent.toFixed(1)}% of expected rotation</span><div><i style={{ width: `${member.contributionPercent}%` }}/></div></div><dl>{Object.entries(member.byType).map(([type, value]) => <div key={type}><dt>{type}</dt><dd>{formatDamage(value ?? 0)}</dd></div>)}</dl>{model.actions.filter((row) => row.member?.slot === member.slot).map((row) => <div className="tw-member-action" key={row.action.id}><span>{row.action.timestamp.toFixed(1)}s · {row.attack?.name ?? 'Missing attack'}<small>{row.attack?.type ?? 'invalid'} · Normal {formatDamage(row.normal)} · Critical {formatDamage(row.critical)}</small></span><b>{formatDamage(row.expected)}<small>Expected</small></b></div>)}</article>}
        {(section === 'overview' || section === 'damage') && <article className="tw-buff-summary"><header><span className="eyebrow">Team effects</span><h2>Applied and received buffs</h2></header><h3>Applied</h3><div className="tw-chip-list">{member.appliedBuffs.map((buff) => <span className="tw-chip" key={buff.id}>{teamBuffLabel(buff)}</span>)}{!member.appliedBuffs.length && <span className="tw-chip muted">None authored</span>}</div><h3>Received</h3><div className="tw-chip-list">{member.receivedBuffs.map((buff) => <span className="tw-chip" key={buff.id}>{teamBuffLabel(buff)}</span>)}{!member.receivedBuffs.length && <span className="tw-chip muted">None authored</span>}</div></article>}
        {section === 'echoes' && <article className="tw-sonata-detail"><header><span className="eyebrow">Coverage details</span><h2>Active Sonata sets</h2></header>{showcase.sonatas.map((sonata) => <div key={sonata.name}>{sonata.iconSourceUrl && <img src={sonata.iconSourceUrl} alt=""/>}<span><b>{sonata.name}</b><small>{sonata.count} equipped pieces</small></span></div>)}</article>}
      </div>
    </section>
    <FormulaResultSheet member={member} model={model} updateTeam={updateTeam}/>
    <section className="tw-panel tw-passive"><header><span className="eyebrow">Weapon passive</span><h2>{showcase.weapon?.catalog.passiveName ?? 'No weapon passive'}</h2></header><p>{weaponPassive ?? 'Equip a supported weapon to display its generated Nanoka passive text.'}</p><strong>Reference only — passive effects are not included in current damage calculations.</strong></section>
    <section className="tw-member-echoes"><header><div><span className="eyebrow">Detailed Echo loadout</span><h2>Five equipped Echoes</h2></div><span>{showcase.equippedEchoes.length}/5 · {showcase.totalEchoCost}/12 cost</span></header><div>{showcase.echoSlots.map((echo, index) => <DetailedEchoCard echo={echo} index={index} key={echo?.id ?? index}/>)}</div></section>
    <WarningList warnings={member.warnings}/>
  </div>
}

export function TeamsView({ echoes, builds, teams, characters, weapons, refresh }: TeamsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(teams[0]?.id ?? null)
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [memberSection, setMemberSection] = useState<MemberSection>('overview')
  const [nameDraft, setNameDraft] = useState('')
  const team = teams.find((entry) => entry.id === selectedId) ?? teams[0]
  const model = useMemo(() => team ? resolveTeamWorkspace({ team, builds, characters, weapons, echoes }) : undefined, [team, builds, characters, weapons, echoes])

  useEffect(() => { if (!team && teams[0]) setSelectedId(teams[0].id) }, [team, teams])
  useEffect(() => { setNameDraft(team?.name ?? '') }, [team?.id, team?.name])

  const updateTeam = async (patch: Partial<Team>) => {
    if (!team) return
    await db.teams.update(team.id, patch)
    await refresh()
  }
  const createTeam = async () => {
    const next: Team = { id: createLocalId(), name: `Team ${teams.length + 1}`, buildIds: [], enemy: { level: 90, resistance: 10, damageReduction: 0 }, rotationDuration: 20, actions: [], buffs: [], scenario: { resultMode: 'expected', memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} } }
    await db.teams.add(next); await refresh(); setSelectedId(next.id); setTab('settings')
  }
  const duplicateTeam = async () => {
    if (!team) return
    const next: Team = { ...team, id: createLocalId(), name: `${team.name} Copy`, actions: team.actions.map((action) => ({ ...action, id: createLocalId() })), buffs: (team.buffs ?? []).map((buff) => ({ ...buff, id: createLocalId(), stackingGroup: createLocalId() })) }
    await db.teams.add(next); await refresh(); setSelectedId(next.id); setTab('settings')
  }
  const deleteTeam = async () => {
    if (!team || !confirm(`Delete ${team.name}? This removes its local rotation and authored buffs.`)) return
    await db.teams.delete(team.id); await refresh(); setSelectedId(teams.find((entry) => entry.id !== team.id)?.id ?? null); setTab('settings')
  }

  return <main className="team-workspace">
    <header className="tw-toolbar tw-panel">
      <div className="tw-team-select"><span className="eyebrow">Team workspace</span><label><span>Current team</span><select value={team?.id ?? ''} onChange={(event) => { setSelectedId(event.target.value); setTab('settings') }}><option value="" disabled>Select a team</option>{teams.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label></div>
      <label className="tw-name-field"><span>Team name</span><input value={nameDraft} disabled={!team} onChange={(event) => setNameDraft(event.target.value)} onBlur={() => { if (team && nameDraft.trim() && nameDraft.trim() !== team.name) void updateTeam({ name: nameDraft.trim() }) }}/></label>
      <div className="tw-management"><button className="primary" onClick={() => void createTeam()}><Icon name="plus"/>Create</button><button className="secondary" disabled={!team} onClick={() => { if (team && nameDraft.trim()) void updateTeam({ name: nameDraft.trim() }) }}>Rename</button><button className="secondary" disabled={!team} onClick={() => void duplicateTeam()}>Duplicate</button><button className="danger" disabled={!team} onClick={() => void deleteTeam()}><Icon name="trash"/>Delete</button></div>
    </header>
    <nav className="tw-primary-tabs" aria-label="Team workspace pages" role="tablist">
      <button role="tab" className={tab === 'settings' ? 'active' : ''} aria-selected={tab === 'settings'} onClick={() => setTab('settings')}><span>Team Settings</span><small>Composition and rotation</small></button>
      {Array.from({ length: 3 }, (_, slot) => { const member = model?.members[slot]; return <button role="tab" className={tab === slot ? 'active' : ''} aria-selected={tab === slot} key={slot} onClick={() => { setTab(slot as 0 | 1 | 2); setMemberSection('overview') }}><MemberAvatar member={member ?? { slot, attacks: [], contribution: 0, contributionPercent: 0, byType: {}, appliedBuffs: [], receivedBuffs: [], roles: [], warnings: [] }} compact/><span>Member {slot + 1}</span><small>{member?.catalog?.name ?? 'Empty slot'}</small></button> })}
    </nav>
    {!model ? <section className="tw-first-team tw-panel"><span className="eyebrow">No teams yet</span><h1>Start a team workspace</h1><p>Create a local team, assign up to three saved builds, and author its rotation without leaving this page.</p><button className="primary" onClick={() => void createTeam()}><Icon name="plus"/>Create team</button></section>
      : tab === 'settings' ? <TeamOverview model={model} builds={builds} updateTeam={updateTeam} openMember={(slot) => { setTab(slot as 0 | 1 | 2); setMemberSection('overview') }}/>
        : <MemberWorkspace member={model.members[tab]} model={model} section={memberSection} setSection={setMemberSection} updateTeam={updateTeam}/>}
  </main>
}
