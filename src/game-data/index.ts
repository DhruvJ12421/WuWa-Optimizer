import type { AppSettings, Resonator, StatKey, Weapon } from '../domain/types'
export { echoCatalog, type EchoCatalogEntry } from './echoes'

export const GAME_DATA_VERSION = 'mvp-2026.07-unverified'

export const statLabels: Record<StatKey, string> = {
  hp: 'HP', hpPercent: 'HP %', atk: 'ATK', atkPercent: 'ATK %', def: 'DEF', defPercent: 'DEF %',
  critRate: 'Crit. Rate', critDamage: 'Crit. DMG', energyRegen: 'Energy Regen', basicDamage: 'Basic Attack',
  heavyDamage: 'Heavy Attack', skillDamage: 'Res. Skill', liberationDamage: 'Res. Liberation',
  spectroDamage: 'Spectro DMG', fusionDamage: 'Fusion DMG', glacioDamage: 'Glacio DMG', healingBonus: 'Healing Bonus'
}

export const statAliases: Array<[RegExp, StatKey]> = [
  [/^hp\s*%$/i, 'hpPercent'], [/^atk\s*%$/i, 'atkPercent'], [/^def\s*%$/i, 'defPercent'],
  [/^hp$/i, 'hp'], [/^atk$/i, 'atk'], [/^def$/i, 'def'],
  [/crit(?:ical)?\.?\s*rate/i, 'critRate'], [/crit(?:ical)?\.?\s*(?:dmg|damage)/i, 'critDamage'],
  [/energy\s*regen/i, 'energyRegen'], [/basic\s*attack/i, 'basicDamage'], [/heavy\s*attack/i, 'heavyDamage'],
  [/(?:res\.?|resonance)\s*skill/i, 'skillDamage'], [/(?:res\.?|resonance)\s*liberation/i, 'liberationDamage'],
  [/spectro\s*dmg/i, 'spectroDamage'], [/fusion\s*dmg/i, 'fusionDamage'], [/glacio\s*dmg/i, 'glacioDamage'],
  [/healing\s*bonus/i, 'healingBonus']
]

export const resonators: Resonator[] = [
  {
    id: 'rover-spectro', name: 'Rover (Spectro)', element: 'spectro', role: 'Hybrid DPS', accent: '#e6c86e',
    baseStats: { hp: 10825, atk: 412, def: 1259, critRate: 5, critDamage: 150 },
    attacks: [
      { id: 'resonating-slashes', name: 'Resonating Slashes', type: 'skill', element: 'spectro', multiplier: 1.6803, hits: 2, scalesWith: 'atk' },
      { id: 'echoing-orchestra', name: 'Echoing Orchestra', type: 'liberation', element: 'spectro', multiplier: 6.04, hits: 1, scalesWith: 'atk' }
    ]
  },
  {
    id: 'chixia', name: 'Chixia', element: 'fusion', role: 'Main DPS', accent: '#f07852',
    baseStats: { hp: 9088, atk: 300, def: 953, critRate: 5, critDamage: 150 },
    attacks: [
      { id: 'daka-daka', name: 'DAKA DAKA!', type: 'skill', element: 'fusion', multiplier: 0.423, hits: 8, scalesWith: 'atk' },
      { id: 'blazing-flames', name: 'Blazing Flames', type: 'liberation', element: 'fusion', multiplier: 4.8, hits: 1, scalesWith: 'atk' }
    ]
  },
  {
    id: 'baizhi', name: 'Baizhi', element: 'glacio', role: 'Healer', accent: '#91b9df',
    baseStats: { hp: 12813, atk: 213, def: 1002, critRate: 5, critDamage: 150 },
    attacks: [
      { id: 'emergency-plan', name: 'Emergency Plan', type: 'healing', element: 'glacio', multiplier: 0.048, hits: 1, scalesWith: 'hp' },
      { id: 'momentary-unity', name: 'Momentary Unity', type: 'liberation', element: 'glacio', multiplier: 1.42, hits: 4, scalesWith: 'atk' }
    ]
  }
]

export const weapons: Weapon[] = [
  { id: 'emerald-of-genesis', name: 'Emerald of Genesis', type: 'sword', baseAtk: 587, stat: { key: 'critRate', value: 24.3 } },
  { id: 'static-mist', name: 'Static Mist', type: 'pistols', baseAtk: 587, stat: { key: 'critRate', value: 24.3 } },
  { id: 'variation', name: 'Variation', type: 'rectifier', baseAtk: 337, stat: { key: 'energyRegen', value: 51.8 } }
]

export const sonataNames = ['Celestial Light', 'Molten Rift', 'Freezing Frost', 'Moonlit Clouds', 'Rejuvenating Glow', 'Lingering Tunes']

export const defaultSettings: AppSettings = {
  displayName: 'Resonator', privacyMode: false, background: 'signal', scanIntervalMs: 900,
  scoreWeights: {
    'rover-spectro': { critRate: 2, critDamage: 1, atkPercent: 1, skillDamage: 0.8, spectroDamage: 1 },
    chixia: { critRate: 2, critDamage: 1, atkPercent: 1, skillDamage: 1, fusionDamage: 1 },
    baizhi: { hpPercent: 1, energyRegen: 1.2, healingBonus: 1.5 }
  }
}
