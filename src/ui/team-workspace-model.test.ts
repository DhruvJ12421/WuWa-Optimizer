import { describe, expect, it } from 'vitest'
import { characterCatalog, weaponCatalog } from '../game-data'
import type { Build, Echo, OwnedCharacter, OwnedWeapon, Team } from '../domain/types'
import { resolveTeamWorkspace } from './team-workspace-model'

describe('team formula workspace', () => {
  it('uses one generated formula target for the member sheet and rotation action', () => {
    const catalog = characterCatalog.find((entry) => entry.attacks.length > 0)!
    const weaponCatalogEntry = weaponCatalog.find((entry) => entry.type.toLowerCase() === catalog.weaponType.toLowerCase())!
    const character: OwnedCharacter = { id: 'owned-character', catalogId: catalog.id, level: 90, sequence: 0, skillLevels: [10, 10, 10, 10, 10], locked: false, createdAt: 1 }
    const weapon: OwnedWeapon = { id: 'owned-weapon', catalogId: weaponCatalogEntry.id, level: 90, rank: 1, locked: false, equippedBy: character.id, createdAt: 1 }
    const echoes: Echo[] = Array.from({ length: 5 }, (_, index) => ({ id: `echo-${index}`, name: `Echo ${index}`, cost: 1, rarity: 5, level: 25, sonata: 'Unknown', mainStat: { key: 'atkPercent', value: 18 }, subStats: [], locked: false, excluded: false, equippedBy: 'build', createdAt: index, source: 'manual' }))
    const build: Build = { id: 'build', name: 'Formula build', resonatorId: catalog.id, weaponId: weapon.id, echoIds: echoes.map((echo) => echo.id), level: 90, skillLevel: 10 }
    const attack = catalog.attacks[0]
    const team: Team = { id: 'team', name: 'Formula team', buildIds: [build.id], enemy: { level: 90, resistance: 10, damageReduction: 0 }, rotationDuration: 10, actions: [{ id: 'action', timestamp: 0, buildId: build.id, attackId: attack.id, formulaTargetId: `${catalog.id}:${attack.id}` }], scenario: { resultMode: 'expected', memberConditions: {}, enemyConditions: {}, selectedTargetByBuild: {} } }
    const model = resolveTeamWorkspace({ team, builds: [build], characters: [character], weapons: [weapon], echoes })
    expect(model.members[0].formulaRows.length).toBeGreaterThan(0)
    expect(model.actions[0].formulaTargetId).toBe(`${catalog.id}:${attack.id}`)
    expect(model.actions[0].expected).toBeGreaterThan(0)
    expect(model.actions[0].trace?.operation).toBe('prod')
    expect(model.total).toBeCloseTo(model.actions[0].expected)
  })
})
