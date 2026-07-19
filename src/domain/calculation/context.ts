import { aggregateStats, defenseMultiplier, resistanceMultiplier } from '../damage'
import type { AttackDefinition, BuffEffect, Build, Echo, EnemyConfig, OwnedCharacter, OwnedWeapon, Resonator, TeamScenario, Weapon } from '../types'
import { characterCatalog, isFixedSkillValueName, weaponCatalog } from '../../game-data'
import { weaponSecondaryStat } from '../../ui/character-showcase-model'
import type { CalculationContext, FormulaEntry, FormulaScalar } from './engine'

export interface BuildCalculationInput {
  build: Build
  character: OwnedCharacter
  weapon: OwnedWeapon
  echoes: Echo[]
  enemy: EnemyConfig
  scenario?: TeamScenario
  buffs?: BuffEffect[]
  actionInputs?: Record<string, FormulaScalar>
}

export function resolveRuntimeBuild(build: Build, characters: OwnedCharacter[], weapons: OwnedWeapon[]): { character: OwnedCharacter; weapon: OwnedWeapon; resonator: Resonator; runtimeWeapon: Weapon } | undefined {
  const ownedCharacter = characters.find((entry) => entry.catalogId === build.resonatorId)
  const ownedWeapon = weapons.find((entry) => entry.id === build.weaponId)
  const character = characterCatalog.find((entry) => entry.id === ownedCharacter?.catalogId)
  const weapon = weaponCatalog.find((entry) => entry.id === ownedWeapon?.catalogId)
  if (!ownedCharacter || !ownedWeapon || !character || !weapon || !character.levelStats.length || !weapon.levelStats.length) return undefined
  const characterStats = character.levelStats.reduce((nearest, row) => Math.abs(row.level - ownedCharacter.level) < Math.abs(nearest.level - ownedCharacter.level) ? row : nearest)
  const weaponStats = weapon.levelStats.reduce((nearest, row) => Math.abs(row.level - ownedWeapon.level) < Math.abs(nearest.level - ownedWeapon.level) ? row : nearest)
  const element = character.element.toLowerCase() as Resonator['element']
  const attacks: AttackDefinition[] = character.attacks.filter((attack) => !isFixedSkillValueName(attack.name)).map((attack) => {
    const level = Math.max(1, Math.min(attack.multipliers.length, ownedCharacter.skillLevels?.[attack.skillLevelIndex] ?? build.skillLevel ?? 1))
    return { id: attack.id, name: attack.name, type: attack.type, element, multiplier: attack.multipliers[level - 1] ?? attack.multipliers[0] ?? 0, hits: 1, scalesWith: attack.scalesWith }
  })
  return {
    character: ownedCharacter,
    weapon: ownedWeapon,
    resonator: { id: character.id, name: character.name, element, role: character.role, accent: '', baseStats: { hp: characterStats.hp, atk: characterStats.atk, def: characterStats.def, critRate: character.baseStats.critRate, critDamage: character.baseStats.critDamage }, attacks },
    runtimeWeapon: { id: ownedWeapon.id, name: weapon.name, type: weapon.type.toLowerCase() as Weapon['type'], baseAtk: weaponStats.baseAtk, stat: weaponSecondaryStat(weapon, weaponStats.secondaryStatValue) }
  }
}

export function createBuildCalculationContext(input: BuildCalculationInput): CalculationContext {
  const character = characterCatalog.find((entry) => entry.id === input.character.catalogId)
  const weapon = weaponCatalog.find((entry) => entry.id === input.weapon.catalogId)
  if (!character || !weapon) throw new Error('Character or weapon catalog data is unavailable.')
  const characterStats = character.levelStats.reduce((nearest, row) => Math.abs(row.level - input.character.level) < Math.abs(nearest.level - input.character.level) ? row : nearest)
  const weaponStats = weapon.levelStats.reduce((nearest, row) => Math.abs(row.level - input.weapon.level) < Math.abs(nearest.level - input.weapon.level) ? row : nearest)
  const runtimeCharacter = {
    id: character.id, name: character.name, element: character.element.toLowerCase() as 'spectro' | 'fusion' | 'glacio' | 'electro' | 'aero' | 'havoc', role: character.role, accent: '',
    baseStats: { hp: characterStats.hp, atk: characterStats.atk, def: characterStats.def, critRate: character.baseStats.critRate, critDamage: character.baseStats.critDamage }, attacks: []
  }
  const runtimeWeapon = { id: input.weapon.id, name: weapon.name, type: weapon.type.toLowerCase() as 'broadblade' | 'sword' | 'pistols' | 'gauntlets' | 'rectifier', baseAtk: weaponStats.baseAtk, stat: weaponSecondaryStat(weapon, weaponStats.secondaryStatValue) }
  const stats = aggregateStats(runtimeCharacter, runtimeWeapon, input.echoes)
  let amplification = 0
  for (const buff of input.buffs ?? []) {
    if (buff.stat === 'amplify') amplification += buff.value
    else if (buff.stat === 'atkPercent') stats.atk += stats.baseAtk * buff.value / 100
    else if (buff.stat === 'hpPercent') stats.hp += stats.baseHp * buff.value / 100
    else if (buff.stat === 'defPercent') stats.def += stats.baseDef * buff.value / 100
    else if (buff.stat in stats) stats[buff.stat as keyof typeof stats] += buff.value
  }
  const memberConditions = input.scenario?.memberConditions[input.build.id] ?? {}
  const entries: FormulaEntry[] = []
  const inputs: Record<string, FormulaScalar> = {
    ...memberConditions,
    ...input.scenario?.enemyConditions,
    ...input.actionInputs,
    effectiveCritRate: stats.critRate,
    amplification,
    defenseMultiplier: defenseMultiplier(input.character.level, input.enemy.level),
    resistanceMultiplier: resistanceMultiplier(input.enemy.resistance),
    damageReduction: input.enemy.damageReduction
  }
  input.character.skillLevels?.forEach((level, index) => { inputs[`skillLevel:${index}`] = level })
  return { stats: { ...stats }, inputs, entries }
}
