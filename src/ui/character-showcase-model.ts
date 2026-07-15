import type { AggregatedStats, Build, Echo, OwnedCharacter, OwnedWeapon, StatKey, StatLine } from '../domain/types'
import { emptyStats } from '../domain/damage'
import { echoStatLines } from '../game-data/echo-main-stats'
import { characterCatalog, weaponCatalog, type CharacterCatalogEntry, type WeaponCatalogEntry } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'

export const SHOWCASE_DATA_WARNING = 'Game data is generated from Nanoka 3.5 and has not yet been authoritatively verified against the current English in-game UI.'

export interface CharacterShowcaseInput {
  character: OwnedCharacter
  weapons: OwnedWeapon[]
  echoes: Echo[]
  builds: Build[]
  catalog?: CharacterCatalogEntry
}

export interface EquippedWeaponModel {
  owned: OwnedWeapon
  catalog: WeaponCatalogEntry
  levelStats: WeaponCatalogEntry['levelStats'][number]
  secondaryStat?: StatLine
}

export interface SonataCount {
  name: string
  count: number
  iconSourceUrl: string
}

export interface CharacterShowcaseModel {
  character: OwnedCharacter
  catalog: CharacterCatalogEntry
  build?: Build
  characterBaseStats: CharacterCatalogEntry['levelStats'][number]
  weapon?: EquippedWeaponModel
  echoSlots: Array<Echo | undefined>
  equippedEchoes: Echo[]
  echoStatContributions: Partial<Record<StatKey, number>>
  finalStats: AggregatedStats
  sonatas: SonataCount[]
  skillLevels: [number, number, number, number, number]
  totalEchoCost: number
  warning: string
}

const nearestLevel = <T extends { level: number }>(rows: T[], level: number) => rows.reduce((nearest, row) =>
  Math.abs(row.level - level) < Math.abs(nearest.level - level) ? row : nearest
)

export function characterStatsAtLevel(catalog: CharacterCatalogEntry, level: number) {
  if (!catalog.levelStats.length) return { level, hp: catalog.baseStats.hp, atk: catalog.baseStats.atk, def: catalog.baseStats.def }
  return catalog.levelStats.find((entry) => entry.level === level) ?? nearestLevel(catalog.levelStats, level)
}

export function weaponStatsAtLevel(catalog: WeaponCatalogEntry, level: number) {
  return catalog.levelStats.find((entry) => entry.level === level) ?? nearestLevel(catalog.levelStats, level)
}

export function weaponSecondaryStat(catalog: WeaponCatalogEntry, valueText: string): StatLine | undefined {
  const value = Number.parseFloat(valueText)
  if (!Number.isFinite(value)) return undefined
  const percent = valueText.includes('%')
  const label = catalog.secondaryStat.toLowerCase()
  if (label === 'hp') return { key: percent ? 'hpPercent' : 'hp', value }
  if (label === 'atk') return { key: percent ? 'atkPercent' : 'atk', value }
  if (label === 'def') return { key: percent ? 'defPercent' : 'def', value }
  if (label.includes('crit') && label.includes('rate')) return { key: 'critRate', value }
  if (label.includes('crit')) return { key: 'critDamage', value }
  if (label.includes('energy')) return { key: 'energyRegen', value }
  return undefined
}

function totalLines(lines: StatLine[]) {
  return lines.reduce<Partial<Record<StatKey, number>>>((totals, line) => {
    totals[line.key] = (totals[line.key] ?? 0) + line.value
    return totals
  }, {})
}

function calculateFinalStats(
  character: CharacterCatalogEntry,
  base: CharacterCatalogEntry['levelStats'][number],
  weapon: EquippedWeaponModel | undefined,
  echoLines: StatLine[]
) {
  const stats = emptyStats()
  const baseHp = base.hp
  const baseAtk = base.atk + (weapon?.levelStats.baseAtk ?? 0)
  const baseDef = base.def
  const lines = weapon?.secondaryStat ? [...echoLines, weapon.secondaryStat] : echoLines
  const totals = totalLines(lines)

  stats.baseHp = baseHp
  stats.baseAtk = baseAtk
  stats.baseDef = baseDef
  stats.hp = baseHp * (1 + (totals.hpPercent ?? 0) / 100) + (totals.hp ?? 0)
  stats.atk = baseAtk * (1 + (totals.atkPercent ?? 0) / 100) + (totals.atk ?? 0)
  stats.def = baseDef * (1 + (totals.defPercent ?? 0) / 100) + (totals.def ?? 0)
  stats.critRate = character.baseStats.critRate + (totals.critRate ?? 0)
  stats.critDamage = character.baseStats.critDamage + (totals.critDamage ?? 0)
  stats.energyRegen += totals.energyRegen ?? 0
  stats.basicDamage = totals.basicDamage ?? 0
  stats.heavyDamage = totals.heavyDamage ?? 0
  stats.skillDamage = totals.skillDamage ?? 0
  stats.liberationDamage = totals.liberationDamage ?? 0
  stats.spectroDamage = totals.spectroDamage ?? 0
  stats.fusionDamage = totals.fusionDamage ?? 0
  stats.glacioDamage = totals.glacioDamage ?? 0
  stats.electroDamage = totals.electroDamage ?? 0
  stats.aeroDamage = totals.aeroDamage ?? 0
  stats.havocDamage = totals.havocDamage ?? 0
  stats.healingBonus = totals.healingBonus ?? 0
  return stats
}

function normalizedSkillLevels(character: OwnedCharacter): [number, number, number, number, number] {
  const levels = character.skillLevels?.length === 5 ? character.skillLevels : [1, 1, 1, 1, 1]
  return levels.map((level) => Math.max(1, Math.min(10, level))) as [number, number, number, number, number]
}

export function resolveCharacterShowcaseModel(input: CharacterShowcaseInput): CharacterShowcaseModel | undefined {
  const catalog = input.catalog ?? characterCatalog.find((entry) => entry.id === input.character.catalogId)
  if (!catalog) return undefined

  const build = input.builds.find((entry) => entry.resonatorId === input.character.catalogId)
  const ownedWeapon = input.weapons.find((entry) => entry.id === build?.weaponId)
    ?? input.weapons.find((entry) => entry.equippedBy === input.character.id)
  const weaponEntry = weaponCatalog.find((entry) => entry.id === ownedWeapon?.catalogId)
  const weaponLevel = ownedWeapon && weaponEntry ? weaponStatsAtLevel(weaponEntry, ownedWeapon.level) : undefined
  const weapon = ownedWeapon && weaponEntry && weaponLevel ? {
    owned: ownedWeapon,
    catalog: weaponEntry,
    levelStats: weaponLevel,
    secondaryStat: weaponSecondaryStat(weaponEntry, weaponLevel.secondaryStatValue)
  } : undefined

  const echoSlots = Array.from({ length: 5 }, (_, index) => {
    const id = build?.echoIds[index]
    return id ? input.echoes.find((echo) => echo.id === id) : undefined
  })
  const equippedEchoes = echoSlots.filter((echo): echo is Echo => Boolean(echo))
  const echoLines = equippedEchoes.flatMap(echoStatLines)
  const sonataCounts: Record<string, number> = {}
  for (const echo of equippedEchoes) sonataCounts[echo.sonata] = (sonataCounts[echo.sonata] ?? 0) + 1
  const sonatas = Object.entries(sonataCounts)
    .map(([name, count]) => ({ name, count, iconSourceUrl: generatedSonataIconSources[name] ?? '' }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
  const characterBaseStats = characterStatsAtLevel(catalog, input.character.level)

  return {
    character: input.character,
    catalog,
    build,
    characterBaseStats,
    weapon,
    echoSlots,
    equippedEchoes,
    echoStatContributions: totalLines(echoLines),
    finalStats: calculateFinalStats(catalog, characterBaseStats, weapon, echoLines),
    sonatas,
    skillLevels: normalizedSkillLevels(input.character),
    totalEchoCost: equippedEchoes.reduce((total, echo) => total + echo.cost, 0),
    warning: SHOWCASE_DATA_WARNING
  }
}
