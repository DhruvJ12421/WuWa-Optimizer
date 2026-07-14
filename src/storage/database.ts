import Dexie, { type EntityTable } from 'dexie'
import { defaultSettings, GAME_DATA_VERSION, statLabels } from '../game-data'
import { effectiveSubStats, maxSubStatsForLevel } from '../game-data/echo-main-stats'
import type { AccountDocument, AppSettings, Build, Echo, OwnedCharacter, OwnedWeapon, Team } from '../domain/types'

type SettingsRow = AppSettings & { id: 'settings' }

class TacetDatabase extends Dexie {
  echoes!: EntityTable<Echo, 'id'>
  characters!: EntityTable<OwnedCharacter, 'id'>
  weapons!: EntityTable<OwnedWeapon, 'id'>
  builds!: EntityTable<Build, 'id'>
  teams!: EntityTable<Team, 'id'>
  settings!: EntityTable<SettingsRow, 'id'>

  constructor() {
    super('tacet-lab')
    this.version(1).stores({
      echoes: 'id, name, cost, sonata, locked, excluded, equippedBy, createdAt',
      builds: 'id, resonatorId, weaponId',
      teams: 'id',
      settings: 'id'
    })
    this.version(2).stores({
      echoes: 'id, name, cost, sonata, locked, excluded, equippedBy, createdAt',
      characters: 'id, catalogId, level, sequence, locked, createdAt',
      weapons: 'id, catalogId, level, rank, locked, equippedBy, createdAt',
      builds: 'id, resonatorId, weaponId', teams: 'id', settings: 'id'
    })
  }
}

export const db = new TacetDatabase()

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return undefined
  if (navigator.storage.persisted && await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function ensureSeedData() {
  await db.transaction('rw', [db.settings, db.echoes], async () => {
    if (!(await db.settings.get('settings'))) await db.settings.put({ id: 'settings', ...structuredClone(defaultSettings) })
    await db.echoes.toCollection().modify((echo) => { echo.subStats = effectiveSubStats(echo) })
  })
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('settings')
  if (!row) return structuredClone(defaultSettings)
  const { id: _, ...settings } = row
  return { ...structuredClone(defaultSettings), ...settings }
}

export async function saveSettings(settings: AppSettings) {
  await db.settings.put({ id: 'settings', ...settings })
}

export async function exportAccount(): Promise<AccountDocument> {
  return {
    schemaVersion: 2,
    gameDataVersion: GAME_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    echoes: (await db.echoes.toArray()).map((echo) => ({ ...echo, subStats: effectiveSubStats(echo) })),
    characters: await db.characters.toArray(),
    weapons: await db.weapons.toArray(),
    builds: await db.builds.toArray(),
    teams: await db.teams.toArray(),
    settings: await getSettings()
  }
}

export function validateAccount(value: unknown): value is AccountDocument {
  if (!isRecord(value) || ![1, 2].includes(Number(value.schemaVersion)) || typeof value.gameDataVersion !== 'string' || typeof value.exportedAt !== 'string') return false
  return Array.isArray(value.echoes) && value.echoes.every(isEcho)
    && (value.schemaVersion === 1 || (Array.isArray(value.characters) && value.characters.every(isOwnedCharacter)))
    && (value.schemaVersion === 1 || (Array.isArray(value.weapons) && value.weapons.every(isOwnedWeapon)))
    && Array.isArray(value.builds) && value.builds.every(isBuild)
    && Array.isArray(value.teams) && value.teams.every(isTeam)
    && isSettings(value.settings)
}

export async function importAccount(document: AccountDocument) {
  if (!validateAccount(document)) throw new Error('The account backup is invalid or unsupported.')
  await db.transaction('rw', [db.echoes, db.characters, db.weapons, db.builds, db.teams, db.settings], async () => {
    await Promise.all([db.echoes.clear(), db.characters.clear(), db.weapons.clear(), db.builds.clear(), db.teams.clear(), db.settings.clear()])
    await db.echoes.bulkPut(document.echoes.map((echo) => ({ ...echo, source: 'import' })))
    await db.characters.bulkPut(document.characters ?? [])
    await db.weapons.bulkPut(document.weapons ?? [])
    await db.builds.bulkPut(document.builds)
    await db.teams.bulkPut(document.teams)
    await saveSettings(document.settings)
  })
}

function isOwnedCharacter(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.catalogId === 'string'
    && isFiniteNumber(value.level) && value.level >= 1 && value.level <= 90
    && isFiniteNumber(value.sequence) && value.sequence >= 0 && value.sequence <= 6
    && typeof value.locked === 'boolean'
    && (value.favorite === undefined || typeof value.favorite === 'boolean')
    && (value.skillLevels === undefined || (Array.isArray(value.skillLevels) && value.skillLevels.length === 5 && value.skillLevels.every((level) => isFiniteNumber(level) && level >= 1 && level <= 10)))
    && isFiniteNumber(value.createdAt)
}

function isOwnedWeapon(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.catalogId === 'string'
    && isFiniteNumber(value.level) && value.level >= 1 && value.level <= 90
    && isFiniteNumber(value.rank) && value.rank >= 1 && value.rank <= 5
    && typeof value.locked === 'boolean' && (value.equippedBy === undefined || typeof value.equippedBy === 'string')
    && isFiniteNumber(value.createdAt)
}

export async function clearAccount() {
  await db.delete()
  await db.open()
  await ensureSeedData()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStatLine(value: unknown) {
  return isRecord(value) && typeof value.key === 'string' && value.key in statLabels && isFiniteNumber(value.value)
}

function isEcho(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.name === 'string'
    && [1, 3, 4].includes(Number(value.cost)) && [1, 2, 3, 4, 5].includes(Number(value.rarity))
    && isFiniteNumber(value.level) && value.level >= 0 && value.level <= 25
    && typeof value.sonata === 'string' && isStatLine(value.mainStat)
    && Array.isArray(value.subStats) && value.subStats.length <= maxSubStatsForLevel(value.level) && value.subStats.every(isStatLine)
    && typeof value.locked === 'boolean' && typeof value.excluded === 'boolean'
    && (value.equippedBy === undefined || typeof value.equippedBy === 'string')
    && (value.equippedByName === undefined || typeof value.equippedByName === 'string')
    && isFiniteNumber(value.createdAt) && ['scan', 'screenshot', 'manual', 'import'].includes(String(value.source))
}

function isBuild(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.resonatorId === 'string' && typeof value.weaponId === 'string'
    && Array.isArray(value.echoIds) && value.echoIds.length <= 5 && value.echoIds.every((id) => typeof id === 'string')
    && new Set(value.echoIds).size === value.echoIds.length
    && isFiniteNumber(value.level) && value.level >= 1 && value.level <= 90
    && isFiniteNumber(value.skillLevel) && value.skillLevel >= 1 && value.skillLevel <= 10
}

function isTeam(value: unknown) {
  if (!isRecord(value) || !isRecord(value.enemy)) return false
  return typeof value.id === 'string' && typeof value.name === 'string'
    && Array.isArray(value.buildIds) && value.buildIds.length <= 3 && value.buildIds.every((id) => typeof id === 'string')
    && new Set(value.buildIds).size === value.buildIds.length
    && isFiniteNumber(value.rotationDuration) && value.rotationDuration > 0
    && isFiniteNumber(value.enemy.level) && value.enemy.level >= 1
    && isFiniteNumber(value.enemy.resistance) && value.enemy.resistance >= -100 && value.enemy.resistance <= 100
    && isFiniteNumber(value.enemy.damageReduction) && value.enemy.damageReduction >= 0 && value.enemy.damageReduction <= 100
    && Array.isArray(value.actions) && value.actions.every((action) => isRecord(action) && typeof action.id === 'string'
      && typeof action.buildId === 'string' && typeof action.attackId === 'string' && isFiniteNumber(action.timestamp))
    && (value.buffs === undefined || (Array.isArray(value.buffs) && value.buffs.every((buff) => isRecord(buff)
      && typeof buff.id === 'string' && typeof buff.sourceBuildId === 'string' && typeof buff.triggerAttackId === 'string'
      && ['self', 'next', 'team'].includes(String(buff.target))
      && typeof buff.stat === 'string' && (buff.stat === 'amplify' || buff.stat in statLabels)
      && typeof buff.stackingGroup === 'string' && isFiniteNumber(buff.duration) && buff.duration >= 0 && isFiniteNumber(buff.value))))
}

function isSettings(value: unknown) {
  return isRecord(value) && typeof value.displayName === 'string' && typeof value.privacyMode === 'boolean'
    && ['signal', 'tacet', 'plain'].includes(String(value.background))
    && (value.roverGender === undefined || ['male', 'female'].includes(String(value.roverGender)))
    && isFiniteNumber(value.scanIntervalMs) && value.scanIntervalMs >= 250 && value.scanIntervalMs <= 10_000
    && isRecord(value.scoreWeights) && Object.values(value.scoreWeights).every((weights) => isRecord(weights)
      && Object.entries(weights).every(([key, weight]) => key in statLabels && isFiniteNumber(weight)))
}
