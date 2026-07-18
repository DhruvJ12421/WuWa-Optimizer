import { describe, expect, it } from 'vitest'
import { fixedSecondaryMainStat, primaryMainStatValue } from './echo-main-stats'

describe('Echo main-stat level scaling', () => {
  it('truncates percentage mains to the one-decimal value shown in game', () => {
    expect(primaryMainStatValue(3, 5, 0, 'fusionDamage')).toBe(6)
    expect(primaryMainStatValue(3, 5, 1, 'fusionDamage')).toBe(6.9)
    expect(primaryMainStatValue(3, 5, 2, 'fusionDamage')).toBe(7.9)
    expect(primaryMainStatValue(3, 5, 25, 'fusionDamage')).toBe(30)
    expect(primaryMainStatValue(1, 5, 1, 'atkPercent')).toBe(4.1)
  })

  it('truncates fixed flat secondaries to whole displayed values', () => {
    expect(fixedSecondaryMainStat({ cost: 3, rarity: 5, level: 1 })).toEqual({ key: 'atk', value: 23 })
    expect(fixedSecondaryMainStat({ cost: 3, rarity: 5, level: 3 })).toEqual({ key: 'atk', value: 29 })
    expect(fixedSecondaryMainStat({ cost: 3, rarity: 5, level: 25 })).toEqual({ key: 'atk', value: 100 })
    expect(fixedSecondaryMainStat({ cost: 1, rarity: 5, level: 1 })).toEqual({ key: 'hp', value: 528 })
  })
})
