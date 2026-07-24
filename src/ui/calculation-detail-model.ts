import { defenseMultiplier, resistanceMultiplier } from '../domain/damage'
import type { AggregatedStats, AttackDefinition, Echo, EnemyConfig, Resonator, StatKey, StatLine, Weapon } from '../domain/types'
import { statLabels } from '../game-data'
import { echoStatLines } from '../game-data/echo-main-stats'
import type { CharacterShowcaseModel } from './character-showcase-model'
import type { CalculationDetail, CalculationDetailRow } from './CalculationDetails'

const percentKeys = new Set<StatKey>(['critRate', 'critDamage', 'energyRegen', 'basicDamage', 'heavyDamage', 'skillDamage', 'liberationDamage', 'spectroDamage', 'fusionDamage', 'glacioDamage', 'electroDamage', 'aeroDamage', 'havocDamage', 'healingBonus'])
const numeric = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 })
const damageNumeric = (value: number) => Math.floor(value + 1e-9).toLocaleString('en-US')
const display = (key: StatKey, value: number) => percentKeys.has(key) ? `${numeric(value)}%` : numeric(value)
const sumKey = (lines: StatLine[], key: StatKey) => lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.value, 0)

function sourceRow(label: string, lines: StatLine[], keys: StatKey[]): CalculationDetailRow | undefined {
  const children = keys.flatMap((key) => { const value = sumKey(lines, key); return value ? [{ label: statLabels[key], value: display(key, value) }] : [] })
  return children.length ? { label, value: children.length === 1 ? children[0].value : `${children.length} contributions`, children } : undefined
}

export function showcaseStatDetail(model: CharacterShowcaseModel, key: StatKey, label = statLabels[key]): CalculationDetail {
  const final = model.finalStats[key as keyof AggregatedStats]
  const percentKey: StatKey | undefined = key === 'hp' ? 'hpPercent' : key === 'atk' ? 'atkPercent' : key === 'def' ? 'defPercent' : undefined
  const relevant = percentKey ? [key, percentKey] : [key]
  const rows: CalculationDetailRow[] = []
  if (key === 'hp' || key === 'atk' || key === 'def') {
    rows.push({ label: 'Character base', value: numeric(model.characterBaseStats[key]) })
    if (key === 'atk' && model.weapon) rows.push({ label: `${model.weapon.catalog.name} base ATK`, value: numeric(model.weapon.levelStats.baseAtk) })
  } else if (key === 'critRate' || key === 'critDamage') rows.push({ label: 'Character base', value: display(key, model.catalog.baseStats[key]) })
  else if (key === 'energyRegen') rows.push({ label: 'Base Energy Regen', value: '100%' })
  for (const echo of model.equippedEchoes) { const row = sourceRow(echo.name, echoStatLines(echo), relevant); if (row) rows.push(row) }
  if (model.weapon?.secondaryStat) { const row = sourceRow(`${model.weapon.catalog.name} secondary stat`, [model.weapon.secondaryStat], relevant); if (row) rows.push(row) }
  for (const source of model.statBonusSources) { const row = sourceRow(source.label, source.lines, relevant); if (row) rows.push(row) }
  return {
    title: label,
    value: display(key, final),
    formula: percentKey ? `Base × (1 + total ${statLabels[percentKey]} / 100) + flat ${label}` : 'Base value + all applicable contributions',
    equationOperator: '+',
    rows: rows.length ? rows : [{ label: 'No active contribution', value: display(key, final) }],
    note: 'Conditional passive effects are excluded unless the current calculation context explicitly supports them.'
  }
}

const typeBonus = (stats: AggregatedStats, attack: AttackDefinition) => attack.type === 'basic' ? stats.basicDamage : attack.type === 'heavy' ? stats.heavyDamage : attack.type === 'skill' ? stats.skillDamage : attack.type === 'liberation' ? stats.liberationDamage : 0
const elementBonus = (stats: AggregatedStats, attack: AttackDefinition) => stats[`${attack.element}Damage` as keyof AggregatedStats]

export function damageDetail(stats: AggregatedStats, attack: AttackDefinition, enemy: EnemyConfig, mode: 'normal' | 'critical' | 'expected', value: number, characterLevel = 90, amplify = 0): CalculationDetail {
  const scaling = attack.scalesWith === 'hp' ? stats.hp : stats.atk
  if (attack.type === 'healing') return {
    title: `${attack.name} healing`,
    value: damageNumeric(value),
    formula: 'HP × multiplier × hits × healing bonus',
    equationOperator: '×',
    rows: [
      { label: 'HP', value: numeric(stats.hp) },
      { label: 'Multiplier', value: `${numeric(attack.multiplier * 100)}%` },
      { label: 'Hits', value: numeric(attack.hits) },
      { label: 'Healing Bonus', value: `${numeric(stats.healingBonus)}%` }
    ]
  }
  const critMultiplier = Math.max(1, stats.critDamage / 100)
  const critRate = Math.min(1, Math.max(0, stats.critRate / 100))
  const totalDamageBonus = typeBonus(stats, attack) + elementBonus(stats, attack)
  const defense = defenseMultiplier(characterLevel, enemy.level, enemy.defenseIgnore, enemy.defenseReduction)
  const resistance = resistanceMultiplier(enemy.resistance, enemy.resistanceReduction, enemy.resistanceIgnore)
  const rows: CalculationDetailRow[] = [
    { label: 'Skill multiplier', value: `${numeric(attack.multiplier * 100)}%` },
    { label: attack.scalesWith.toUpperCase(), value: numeric(scaling) },
    { label: 'Hits', value: numeric(attack.hits) },
    { label: 'Total DMG Bonus', value: `(100% + ${numeric(totalDamageBonus)}%)`, children: [{ label: `${attack.type} bonus`, value: `${numeric(typeBonus(stats, attack))}%` }, { label: `${attack.element} bonus`, value: `${numeric(elementBonus(stats, attack))}%` }] },
    { label: 'Enemy DEF multiplier', value: `${numeric(defense * 100)}%` },
    { label: 'Enemy RES multiplier', value: `${numeric(resistance * 100)}%` },
    { label: 'Damage reduction multiplier', value: `${numeric(Math.max(0, 1 - enemy.damageReduction / 100) * 100)}%` },
    { label: 'Amplification multiplier', value: `${numeric(Math.max(0, 1 + amplify / 100) * 100)}%` },
    { label: 'Special multiplier', value: `${numeric(Math.max(0, 1 + (enemy.specialMultiplier ?? 0) / 100) * 100)}%` }
  ]
  if (mode === 'critical') rows.push({ label: 'CRIT multiplier', value: `${numeric(critMultiplier * 100)}%` })
  if (mode === 'expected') rows.push({ label: 'Expected CRIT factor', value: `${numeric((1 + critRate * (critMultiplier - 1)) * 100)}%`, children: [{ label: 'Crit. Rate', value: `${numeric(critRate * 100)}%` }, { label: 'Crit. DMG', value: `${numeric(stats.critDamage)}%` }] })
  return {
    title: `${attack.name} · ${mode}`,
    value: damageNumeric(value),
    formula: mode === 'normal' ? 'Scaling × multiplier × hits × bonuses × enemy multipliers' : mode === 'critical' ? 'Normal damage × CRIT multiplier' : 'Normal damage × expected CRIT factor',
    equationOperator: '×',
    rows
  }
}

export function runtimeStatDetail(resonator: Resonator, weapon: Weapon, echoes: Echo[], key: StatKey, value: number): CalculationDetail {
  const relevant = key === 'hp' ? ['hp', 'hpPercent'] as StatKey[] : key === 'atk' ? ['atk', 'atkPercent'] as StatKey[] : key === 'def' ? ['def', 'defPercent'] as StatKey[] : [key]
  const rows: CalculationDetailRow[] = []
  const baseValue = key === 'atk' ? resonator.baseStats.atk + weapon.baseAtk : key in resonator.baseStats ? resonator.baseStats[key as keyof typeof resonator.baseStats] : 0
  rows.push({ label: 'Character and weapon base', value: display(key, baseValue) })
  const echoRow = sourceRow(`${echoes.length} equipped Echoes`, echoes.flatMap(echoStatLines), relevant); if (echoRow) rows.push(echoRow)
  if (weapon.stat) { const row = sourceRow('Weapon secondary stat', [weapon.stat], relevant); if (row) rows.push(row) }
  return { title: statLabels[key], value: display(key, value), formula: relevant.length > 1 ? 'Base × (1 + percent / 100) + flat' : 'Base value + weapon + Echo + active Sonata contributions', equationOperator: '+', rows }
}

export function sumDetail(title: string, value: number, rows: Array<{ label: string; value: number }>, formula = 'Sum of listed values'): CalculationDetail {
  const isDamageTotal = /\b(?:rotation|dps|damage|contribution)\b/i.test(title) && !/\bshare\b/i.test(title)
  return {
    title,
    value: isDamageTotal ? damageNumeric(value) : numeric(value),
    formula,
    equationOperator: formula.includes('÷') ? '÷' : '+',
    rows: rows.map((row) => ({
      label: row.label,
      value: isDamageTotal && !/\bduration\b/i.test(row.label) ? damageNumeric(row.value) : numeric(row.value)
    }))
  }
}
