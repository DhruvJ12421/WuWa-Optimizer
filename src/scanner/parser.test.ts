import { describe, expect, it } from 'vitest'
import { normalizeOcrText, parseEchoText, parseStatLine } from './parser'

describe('English Echo OCR parser', () => {
  it('normalizes common OCR punctuation without translating text', () => {
    expect(normalizeOcrText('  Crit.  Rate  6.3％\r\n— ATK 40 ')).toEqual(['Crit. Rate 6.3%', '- ATK 40'])
  })

  it('parses percent and flat English stat labels', () => {
    expect(parseStatLine('Crit. DMG 18.6%')).toEqual({ key: 'critDamage', value: 18.6 })
    expect(parseStatLine('ATK 40')).toEqual({ key: 'atk', value: 40 })
    expect(parseStatLine('ATK % 18.0%')).toEqual({ key: 'atkPercent', value: 18 })
    expect(parseStatLine('Resonance Skill DMG 8.6%')).toEqual({ key: 'skillDamage', value: 8.6 })
    expect(parseStatLine('Crit. Rate 220%')).toEqual({ key: 'critRate', value: 22 })
    expect(parseStatLine('Crit. DMG 186%')).toEqual({ key: 'critDamage', value: 18.6 })
    expect(parseStatLine('Crit. Rate 63%')).toEqual({ key: 'critRate', value: 6.3 })
    expect(parseStatLine('DEF 50')).toEqual({ key: 'def', value: 50 })
  })

  it('returns low confidence defaults instead of silently inventing missing fields', async () => {
    const candidate = await parseEchoText('Hooscamp\nCost 1\n5 Star\nLv. 25\nLingering Tunes\nATK % 18.0%\nCrit. Rate 6.3%', 'data:image/png;base64,abc', 'screenshot')
    expect(candidate.fields.name.value).toBe('Hooscamp')
    expect(candidate.fields.sonata.value).toBe('Lingering Tunes')
    expect(candidate.fields.subStats[0].value.key).toBe('critRate')
  })

  it('uses catalog metadata and limits tuned stats to the detail block', async () => {
    const candidate = await parseEchoText('Cyan Feathered Heron +25\nCOST 3\nCelestial Light\nSpectro DMG Bonus 30.0%\nATK 100\nCrit. DMG 12.6%\nEcho Skills: Countermeasures\nAero DMG 236.80%\nEquipped by Lucy', 'data:image/png;base64,cyan', 'screenshot', { rarity: { value: 5, confidence: 0.94 } })
    expect(candidate.fields.name.value).toBe('Cyan-Feathered Heron')
    expect(candidate.fields.sonata.value).toBe('Celestial Light')
    expect(candidate.fields.subStats).toHaveLength(2)
    expect(candidate.fields.equippedBy.value).toBe('Lucy')
  })

  it('reads equipment only from the footer instead of skill prose', async () => {
    const candidate = await parseEchoText('Reminiscence - Nightmare: Adam Smasher +25\nCOST 4\nCrit. Rate 220%\nATK 150\nCrit. DMG 186%\nCrit. Rate 63%\nDEF 50\nHeavy Attack DMG Bonus 7.9%\nEcho Skill\nWhen Lucy uses this skill, if equipped by Lucy press the Echo Skill button\nEquipped by Lucy\nSwitch\nUpgrade', 'data:image/png;base64,adam', 'screenshot')
    expect(candidate.fields.name.value).toBe('Reminiscence - Nightmare: Adam Smasher')
    expect(candidate.fields.sonata.value).toBe('Shadow of Shattered Dreams')
    expect(candidate.fields.mainStat.value.value).toBe(22)
    expect(candidate.fields.subStats.map((field) => field.value.value)).toEqual([150, 18.6, 6.3, 50, 7.9])
    expect(candidate.fields.equippedBy.value).toBe('Lucy')
  })
})
