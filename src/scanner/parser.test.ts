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
  })

  it('returns low confidence defaults instead of silently inventing missing fields', async () => {
    const candidate = await parseEchoText('Hooscamp\nCost 1\n5 Star\nLv. 25\nLingering Tunes\nATK % 18.0%\nCrit. Rate 6.3%', 'data:image/png;base64,abc', 'screenshot')
    expect(candidate.fields.name.value).toBe('Hooscamp')
    expect(candidate.fields.sonata.value).toBe('Lingering Tunes')
    expect(candidate.fields.subStats[0].value.key).toBe('critRate')
  })
})
