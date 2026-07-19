import { describe, expect, it } from 'vitest'
import { alwaysOnPassiveStatLines, alwaysOnSequenceStatLines, hasConditionalStatLines } from './passive-stats'

describe('passive stat extraction', () => {
  it('extracts unconditional weapon and skill-tree stats', () => {
    expect(alwaysOnPassiveStatLines('Max HP is increased by 12%. Increases Basic Attack DMG Bonus and Heavy Attack DMG Bonus by 15%.')).toEqual([
      { key: 'hpPercent', value: 12 },
      { key: 'basicDamage', value: 15 },
      { key: 'heavyDamage', value: 15 }
    ])
  })

  it('expands all-attribute and Sonata bonuses', () => {
    expect(alwaysOnPassiveStatLines('Grants 12% All-Attribute DMG Bonus.')).toHaveLength(6)
    expect(alwaysOnPassiveStatLines('Fusion DMG + 10%.')).toEqual([{ key: 'fusionDamage', value: 10 }])
  })

  it('does not apply triggered, timed, or stacking stats', () => {
    const description = 'Max HP is increased by 12%. 15s after casting Intro Skill, ATK is increased by 20% for 10s.'
    expect(alwaysOnPassiveStatLines(description)).toEqual([{ key: 'hpPercent', value: 12 }])
    expect(hasConditionalStatLines(description)).toBe(true)
  })

  it('only applies unconditional character-wide Sequence stats', () => {
    expect(alwaysOnSequenceStatLines("Rover's Energy Regen is increased by 20%.")).toEqual([{ key: 'energyRegen', value: 20 }])
    expect(alwaysOnSequenceStatLines('Crit. DMG is increased by 30%. When casting Resonance Skill, ATK is increased by 20% for 10s.')).toEqual([{ key: 'critDamage', value: 30 }])
    expect(alwaysOnSequenceStatLines("The Crit. DMG of Resonance Liberation is increased by 100%.")).toEqual([])
    expect(alwaysOnSequenceStatLines("In the Dark Surge state, Rover's Crit. Rate is increased by 25%.")).toEqual([])
  })
})
