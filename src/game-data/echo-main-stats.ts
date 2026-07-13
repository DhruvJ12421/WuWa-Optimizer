import type { Echo, StatKey, StatLine } from '../domain/types'

// Source: https://wutheringwaves.fandom.com/wiki/Echo/Stats (retrieved 2026-07-13).
// These are primary main stats. The fixed secondary main stat shown immediately
// below it (HP for cost 1, ATK for costs 3 and 4) is not a tunable substat.
export const mainStatKeysByCost: Record<Echo['cost'], readonly StatKey[]> = {
  1: ['hpPercent', 'atkPercent', 'defPercent'],
  3: ['hpPercent', 'atkPercent', 'defPercent', 'glacioDamage', 'fusionDamage', 'electroDamage', 'aeroDamage', 'spectroDamage', 'havocDamage', 'energyRegen'],
  4: ['hpPercent', 'atkPercent', 'defPercent', 'critRate', 'critDamage', 'healingBonus']
}

const fiveStarLevel25Values: Record<Echo['cost'], Partial<Record<StatKey, number>>> = {
  1: { hpPercent: 22.8, atkPercent: 18, defPercent: 18 },
  3: { hpPercent: 30, atkPercent: 30, defPercent: 38, glacioDamage: 30, fusionDamage: 30, electroDamage: 30, aeroDamage: 30, spectroDamage: 30, havocDamage: 30, energyRegen: 32 },
  4: { hpPercent: 33, atkPercent: 33, defPercent: 41.5, critRate: 22, critDamage: 44, healingBonus: 26 }
}

const maxLevelByRarity: Partial<Record<Echo['rarity'], number>> = { 2: 10, 3: 15, 4: 20, 5: 25 }
const maxSecondaryValueByCost: Record<Echo['cost'], Partial<Record<Echo['rarity'], number>>> = {
  1: { 2: 296, 3: 516, 4: 957, 5: 2280 },
  3: { 2: 31, 3: 44, 4: 63, 5: 100 },
  4: { 2: 46, 3: 68, 4: 92, 5: 150 }
}

export function isMainStatAllowed(cost: Echo['cost'], key: StatKey) {
  return mainStatKeysByCost[cost].includes(key)
}

export function mainStatError(cost: Echo['cost'], rarity: Echo['rarity'], level: number, stat: StatLine) {
  if (!isMainStatAllowed(cost, stat.key)) return `Cost ${cost} Echoes cannot have that primary main stat.`
  const expected = rarity === 5 && level === 25 ? fiveStarLevel25Values[cost][stat.key] : undefined
  if (expected !== undefined && Math.abs(stat.value - expected) > 0.051) return `A level 25 five-star cost ${cost} Echo must have ${expected} as this main stat.`
}

export function fixedSecondaryMainStat(echo: Pick<Echo, 'cost' | 'rarity' | 'level'>): StatLine | undefined {
  if (echo.level !== maxLevelByRarity[echo.rarity]) return
  const value = maxSecondaryValueByCost[echo.cost][echo.rarity]
  return value === undefined ? undefined : { key: echo.cost === 1 ? 'hp' : 'atk', value }
}
