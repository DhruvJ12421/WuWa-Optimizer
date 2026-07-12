import { describe, expect, it } from 'vitest'
import { combineAccuracy, evaluateCandidate, type ExpectedEchoFields } from './accuracy'
import { parseEchoText } from './parser'

const expected: ExpectedEchoFields = {
  name: 'Hooscamp', cost: 1, rarity: 5, level: 25, sonata: 'Lingering Tunes',
  mainStat: { key: 'atkPercent', value: 18 }, subStats: [{ key: 'critRate', value: 6.3 }]
}

describe('OCR fixture accuracy accounting', () => {
  it('counts exact English fields and aggregates corpus accuracy', async () => {
    const candidate = await parseEchoText('Hooscamp\nCost 1\n5 Star\nLv. 25\nLingering Tunes\nATK % 18.0%\nCrit. Rate 6.3%', 'data:image/png;base64,fixture', 'screenshot')
    const result = evaluateCandidate(candidate, expected)
    expect(result.accuracy).toBe(1)
    expect(combineAccuracy([result, result]).accuracy).toBe(1)
  })

  it('reports mismatched fields instead of rounding them into a pass', async () => {
    const candidate = await parseEchoText('Hooscamp\nCost 1\n5 Star\nLv. 24\nLingering Tunes\nATK % 18.0%\nCrit. Rate 6.3%', 'data:image/png;base64,fixture', 'screenshot')
    expect(evaluateCandidate(candidate, expected).accuracy).toBeLessThan(1)
  })
})
