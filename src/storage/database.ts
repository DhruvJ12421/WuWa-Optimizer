import Dexie, { type EntityTable } from 'dexie'
import { defaultSettings, GAME_DATA_VERSION, resonators, statLabels, weapons } from '../game-data'
import type { AccountDocument, AppSettings, Build, Echo, Team } from '../domain/types'

type SettingsRow = AppSettings & { id: 'settings' }

class TacetDatabase extends Dexie {
  echoes!: EntityTable<Echo, 'id'>
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
  }
}

export const db = new TacetDatabase()

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return undefined
  if (navigator.storage.persisted && await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function ensureSeedData() {
  const builds: Build[] = resonators.map((resonator, index) => ({
    id: `build-${resonator.id}`,
    name: `${resonator.name} / Build 01`,
    resonatorId: resonator.id,
    weaponId: (weapons[index] ?? weapons[0]).id,
    echoIds: [], level: 90, skillLevel: 10
  }))
  const team: Team = {
    id: 'team-primary', name: 'Tacet Field Unit', buildIds: builds.map((build) => build.id),
    enemy: { level: 100, resistance: 10, damageReduction: 0 }, rotationDuration: 20,
    actions: builds.flatMap((build, index) => resonators[index].attacks.map((attack, attackIndex) => ({
      id: `action-${build.id}-${attack.id}`, timestamp: index * 5 + attackIndex * 2, buildId: build.id, attackId: attack.id
    })))
  }
  await db.transaction('rw', db.settings, db.builds, db.teams, async () => {
    if (!(await db.settings.get('settings'))) await db.settings.put({ id: 'settings', ...structuredClone(defaultSettings) })
    const existingBuildIds = new Set((await db.builds.toArray()).map((build) => build.id))
    await db.builds.bulkPut(builds.filter((build) => !existingBuildIds.has(build.id)))
    if (!(await db.teams.get(team.id))) await db.teams.put(team)
  })
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('settings')
  if (!row) return structuredClone(defaultSettings)
  const { id: _, ...settings } = row
  return settings
}

export async function saveSettings(settings: AppSettings) {
  await db.settings.put({ id: 'settings', ...settings })
}

export async function exportAccount(): Promise<AccountDocument> {
  return {
    schemaVersion: 1,
    gameDataVersion: GAME_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    echoes: await db.echoes.toArray(),
    builds: await db.builds.toArray(),
    teams: await db.teams.toArray(),
    settings: await getSettings()
  }
}

export function validateAccount(value: unknown): value is AccountDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.gameDataVersion !== 'string' || typeof value.exportedAt !== 'string') return false
  return Array.isArray(value.echoes) && value.echoes.every(isEcho)
    && Array.isArray(value.builds) && value.builds.every(isBuild)
    && Array.isArray(value.teams) && value.teams.every(isTeam)
    && isSettings(value.settings)
}

export async function importAccount(document: AccountDocument) {
  if (!validateAccount(document)) throw new Error('The account backup is invalid or unsupported.')
  await db.transaction('rw', db.echoes, db.builds, db.teams, db.settings, async () => {
    await Promise.all([db.echoes.clear(), db.builds.clear(), db.teams.clear(), db.settings.clear()])
    await db.echoes.bulkPut(document.echoes.map((echo) => ({ ...echo, source: 'import' })))
    await db.builds.bulkPut(document.builds)
    await db.teams.bulkPut(document.teams)
    await saveSettings(document.settings)
  })
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
    && Array.isArray(value.subStats) && value.subStats.length <= 5 && value.subStats.every(isStatLine)
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
    && isFiniteNumber(value.scanIntervalMs) && value.scanIntervalMs >= 250 && value.scanIntervalMs <= 10_000
    && isRecord(value.scoreWeights) && Object.values(value.scoreWeights).every((weights) => isRecord(weights)
      && Object.entries(weights).every(([key, weight]) => key in statLabels && isFiniteNumber(weight)))
}
