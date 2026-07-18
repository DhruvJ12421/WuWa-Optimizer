import { describe, expect, it } from 'vitest'
import { optimizeBuilds } from './optimizer'
import type { Echo, OptimizerRequest, Resonator, Weapon } from './types'

const resonator: Resonator = { id: 'test', name: 'Test', element: 'spectro', role: 'test', accent: '#fff', baseStats: { hp: 10000, atk: 400, def: 1000, critRate: 5, critDamage: 150 }, attacks: [{ id: 'attack', name: 'Attack', type: 'skill', element: 'spectro', multiplier: 1, hits: 1, scalesWith: 'atk' }] }
const weapon: Weapon = { id: 'weapon', name: 'Weapon', type: 'sword', baseAtk: 500, stat: { key: 'critRate', value: 24.3 } }

function makeEcho(id: string, crit: number, locked = false): Echo {
  return { id, name: id, cost: 1, rarity: 5, level: 25, sonata: 'Celestial Light', mainStat: { key: 'critRate', value: crit }, subStats: [], locked, excluded: false, createdAt: 1, source: 'manual' }
}

describe('optimizer', () => {
  const request = (echoes: Echo[]): OptimizerRequest => ({
    requestId: 'test', echoes, resonator, weapon, attack: resonator.attacks[0],
    enemy: { level: 100, resistance: 10, damageReduction: 0 }, objective: 'critRate', minimumStats: {}, limit: 20
  })

  it('matches the exhaustive best five on a small inventory', () => {
    const echoes = [1, 2, 3, 4, 5, 6].map((value) => makeEcho(String(value), value))
    const results = optimizeBuilds(request(echoes))
    expect(results[0].echoIds.sort()).toEqual(['2', '3', '4', '5', '6'])
    expect(results[0].complete).toBe(true)
  })

  it('evaluates declarative formula targets and labels capped searches', () => {
    const echoes = [1, 2, 3, 4, 5, 6].map((value) => makeEcho(String(value), value))
    const formulaRequest: OptimizerRequest = {
      ...request(echoes), objective: 'expected', maxEvaluations: 10,
      formula: { target: { id: 'atk-target', label: 'ATK target', kind: 'stat', mode: 'expected' }, node: { op: 'stat', key: 'critRate' }, inputs: {}, entries: [] }
    }
    const results = optimizeBuilds(formulaRequest)
    expect(results[0].targetId).toBe('atk-target')
    expect(results[0].complete).toBe(false)
  })

  it('honors locked, excluded, and minimum-stat constraints', () => {
    const echoes = [makeEcho('locked', 1, true), ...[2, 3, 4, 5, 6].map((value) => makeEcho(String(value), value)), { ...makeEcho('excluded', 100), excluded: true }]
    const results = optimizeBuilds({ ...request(echoes), minimumStats: { critRate: 40 } })
    expect(results[0].echoIds).toContain('locked')
    expect(results[0].echoIds).not.toContain('excluded')
  })

  it('deduplicates inventory IDs and rejects impossible locked cost', () => {
    const duplicate = makeEcho('same', 10)
    const duplicateResults = optimizeBuilds(request([
      duplicate,
      { ...duplicate },
      ...[1, 2, 3, 4].map((value) => makeEcho(String(value), value))
    ]))
    expect(duplicateResults[0].echoIds.filter((id) => id === 'same')).toHaveLength(1)
    const impossible = [1, 2, 3, 4].map((value) => ({ ...makeEcho(String(value), value, true), cost: 4 as const }))
    expect(optimizeBuilds(request(impossible))).toEqual([])
  })
})
