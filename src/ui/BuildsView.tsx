import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { aggregateStats, calculateDamage, formatDamage } from '../domain/damage'
import { resonators, statLabels, weapons } from '../game-data'
import { echoStatLines } from '../game-data/echo-main-stats'
import { db, saveSettings, setBuildEchoIds, setOwnedWeaponOwner } from '../storage/database'
import type { AppSettings, Build, Echo, StatKey } from '../domain/types'
import { EchoMiniCard, formatStat, Icon, PageHeader, Panel, StatValue } from './components'

function scoreEcho(echo: Echo, weights: Partial<Record<StatKey, number>>) {
  return echoStatLines(echo).reduce((sum, line) => sum + line.value * (weights[line.key] ?? 0), 0)
}

function relativeGrade(value: number, population: number[]) {
  if (!population.length) return '-'
  const percentile = population.filter((score) => score <= value).length / population.length
  if (percentile >= 0.95) return 'SSS'
  if (percentile >= 0.85) return 'S'
  if (percentile >= 0.7) return 'A'
  if (percentile >= 0.45) return 'B'
  return 'C'
}

export function BuildsView({ echoes, builds, settings, refresh }: { echoes: Echo[]; builds: Build[]; settings: AppSettings; refresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(builds[0]?.id)
  const [message, setMessage] = useState('')
  const [cardMode, setCardMode] = useState<'full' | 'compact'>('full')
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const build = builds.find((item) => item.id === selectedId) ?? builds[0]
  const resonator = resonators.find((item) => item.id === build?.resonatorId)
  const weapon = weapons.find((item) => item.id === build?.weaponId)
  if (!build || !resonator || !weapon) return null
  const equipped = build.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo))
  const stats = aggregateStats(resonator, weapon, equipped)
  const attack = resonator.attacks[0]
  const damage = calculateDamage(stats, attack, { level: 100, resistance: 10, damageReduction: 0 })
  const weights = settings.scoreWeights[resonator.id] ?? {}
  const score = equipped.reduce((sum, echo) => sum + scoreEcho(echo, weights), 0)
  const inventoryScores = echoes.filter((echo) => !echo.excluded).map((echo) => scoreEcho(echo, weights))
  const buildGrade = relativeGrade(equipped.length ? score / equipped.length : 0, inventoryScores)
  const scoreBreakdown = Object.entries(weights).map(([key, weight]) => {
    const raw = equipped.flatMap(echoStatLines).filter((line) => line.key === key).reduce((sum, line) => sum + line.value, 0)
    return { key: key as StatKey, raw, weight: weight ?? 0, contribution: raw * (weight ?? 0) }
  }).filter((entry) => entry.contribution > 0)
  const cost = equipped.reduce((sum, echo) => sum + echo.cost, 0)
  const weaponType = resonator.id === 'rover-spectro' ? 'sword' : resonator.id === 'chixia' ? 'pistols' : 'rectifier'
  const compatibleWeapons = weapons.filter((item) => item.type === weaponType)
  const weightKeys: StatKey[] = resonator.id === 'baizhi'
    ? ['hpPercent', 'energyRegen', 'healingBonus', 'critRate']
    : ['critRate', 'critDamage', 'atkPercent', resonator.element === 'spectro' ? 'spectroDamage' : resonator.element === 'fusion' ? 'fusionDamage' : 'glacioDamage']

  const toggleEcho = async (echo: Echo) => {
    setMessage('')
    const selected = build.echoIds.includes(echo.id)
    if (!selected && echo.equippedBy && echo.equippedBy !== build.id) { setMessage('That Echo belongs to another build. Unassign it there first.'); return }
    if (!selected && build.echoIds.length >= 5) { setMessage('A build can equip five Echoes.'); return }
    if (!selected && cost + echo.cost > 12) { setMessage('This selection would exceed the 12-cost limit.'); return }
    const echoIds = selected ? build.echoIds.filter((id) => id !== echo.id) : [...build.echoIds, echo.id]
    await setBuildEchoIds(build.id, echoIds)
    await refresh()
  }

  const exportCard = async () => {
    if (!cardRef.current) return
    setExporting(true); setMessage('')
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#080b0d' })
      const anchor = document.createElement('a'); anchor.download = `${resonator.name.replace(/\W+/g, '-')}-build.png`; anchor.href = dataUrl; anchor.click()
    } catch { setMessage('Card export failed. Try the plain background or reload the page.') }
    finally { setExporting(false) }
  }

  const updateBuild = async (patch: Partial<Build>) => {
    if (patch.weaponId !== undefined) {
      const [ownedWeapon, character] = await Promise.all([db.weapons.get(patch.weaponId), db.characters.where('catalogId').equals(build.resonatorId).first()])
      if (ownedWeapon && character) await setOwnedWeaponOwner(ownedWeapon.id, character.id)
      else await db.builds.update(build.id, patch)
    } else await db.builds.update(build.id, patch)
    await refresh()
  }
  const updateWeight = async (key: StatKey, value: number) => {
    await saveSettings({ ...settings, scoreWeights: { ...settings.scoreWeights, [resonator.id]: { ...weights, [key]: value } } })
    await refresh()
  }

  return <>
    <PageHeader eyebrow="Loadout studio" title="Character builds" description="Equip directly from your local archive, inspect the full stat pipeline, and export a card worth sharing." actions={<><button className="secondary" onClick={() => setCardMode((mode) => mode === 'full' ? 'compact' : 'full')}>{cardMode === 'full' ? 'Compact card' : 'Full card'}</button><button className="primary" disabled={exporting} onClick={exportCard}><Icon name="download"/>{exporting ? 'Rendering...' : 'Export card'}</button></>} />
    <div className="character-tabs">{builds.map((item) => { const character = resonators.find((entry) => entry.id === item.resonatorId); return <button key={item.id} className={item.id === build.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><span style={{ '--accent': character?.accent } as React.CSSProperties}>{character?.name[0]}</span><div><strong>{character?.name}</strong><small>{item.echoIds.length}/5 Echoes</small></div></button> })}</div>
    <div className="build-layout">
      <div className={`build-card bg-${settings.background} mode-${cardMode}`} ref={cardRef} style={{ '--character-accent': resonator.accent } as React.CSSProperties}>
        <div className="card-noise"/><section className="character-art"><div className="character-sigil">{resonator.name[0]}</div><div className="character-copy"><span>{resonator.element} / {resonator.role}</span><h2>{resonator.name}</h2><p>{settings.privacyMode ? 'PRIVATE BUILD' : settings.displayName}</p></div><div className="sonata-tags">{Array.from(new Set(equipped.map((echo) => echo.sonata))).map((name) => <span key={name}>{name}</span>)}</div></section>
        <section className="build-stats"><div className="card-title"><div><span>BUILD 01 / LV. {build.level}</span><h2>{resonator.name}</h2></div><b title={`${Math.round(score)} weighted points`}>{buildGrade}</b></div>{(['hp', 'atk', 'def', 'critRate', 'critDamage', 'energyRegen', `${resonator.element}Damage`] as Array<keyof typeof stats>).map((key) => <StatValue key={key} label={statLabels[key as StatKey] ?? String(key)} value={formatStat(key as StatKey, stats[key])} accent={key === 'critRate' || key === 'critDamage'}/>) }<div className="damage-callout"><span>{attack.name} / Expected</span><strong>{formatDamage(damage.expected)}</strong><small>{formatDamage(damage.normal)} normal · {formatDamage(damage.critical)} critical</small></div></section>
        <section className="weapon-card"><span>WEAPON / RANK 1</span><div className="weapon-glyph">◇</div><h3>{weapon.name}</h3><p>Base ATK <strong>{weapon.baseAtk}</strong></p>{weapon.stat && <p>{statLabels[weapon.stat.key]} <strong>{formatStat(weapon.stat.key, weapon.stat.value)}</strong></p>}</section>
        <section className="forte-card"><span>FORTE CIRCUIT / MVP</span><div className="forte-line">{resonator.attacks.map((item, index) => <div key={item.id}><i>{index + 1}</i><strong>{item.name}</strong><small>{(item.multiplier * 100).toFixed(2)}% × {item.hits}</small></div>)}</div></section>
        <section className="equipped-row">{Array.from({ length: 5 }, (_, index) => equipped[index] ? <EchoMiniCard key={equipped[index].id} echo={equipped[index]} grade={relativeGrade(scoreEcho(equipped[index], weights), inventoryScores)}/> : <div className="empty-echo" key={index}><span>+</span><small>EMPTY</small></div>)}</section>
        <footer className="build-footer"><span>TACET LAB // LOCAL BUILD</span><span>{cost}/12 COST</span><span>DATA {new Date().toISOString().slice(0, 10)}</span></footer>
      </div>
      <Panel className="build-picker"><div className="section-heading"><div><span className="eyebrow">Archive link</span><h2>Equip Echoes</h2></div><b>{build.echoIds.length}/5 · {cost}/12</b></div><div className="build-controls"><label>Weapon<select value={build.weaponId} onChange={(event) => updateBuild({ weaponId: event.target.value })}>{compatibleWeapons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Character level<input type="number" min="1" max="90" value={build.level} onChange={(event) => updateBuild({ level: Math.min(90, Math.max(1, Number(event.target.value))) })}/></label></div><details className="score-weights"><summary>Echo score weights & breakdown</summary><p>Grades are percentiles within your visible inventory. Weights affect the score only, not damage.</p>{weightKeys.map((key) => <label key={key}>{statLabels[key]}<input type="number" min="0" max="10" step="0.1" value={weights[key] ?? 0} onChange={(event) => updateWeight(key, Number(event.target.value))}/></label>)}{scoreBreakdown.map((entry) => <div className="score-line" key={entry.key}><span>{statLabels[entry.key]}: {entry.raw.toFixed(1)} x {entry.weight}</span><b>{entry.contribution.toFixed(1)}</b></div>)}</details>{message && <div className="notice warning">{message}</div>}<div className="picker-list">{echoes.filter((echo) => !echo.excluded).map((echo) => <EchoMiniCard key={echo.id} echo={echo} selected={build.echoIds.includes(echo.id)} onClick={() => toggleEcho(echo)}/>)}</div></Panel>
    </div>
  </>
}
