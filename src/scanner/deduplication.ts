import type { Echo } from '../domain/types'
import type { DiagnosticScanCandidate } from './types'

const text = (value?: string) => (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
const number = (value: number) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null
const stat = (value: { key: string; value: number }) => `${value.key}:${number(value.value)}`

export function echoSignature(value: Echo | DiagnosticScanCandidate) {
  const candidate = 'fields' in value
  const fields = candidate ? value.fields : undefined
  const subStats = candidate ? fields!.subStats.map((entry) => entry.value) : value.subStats
  return JSON.stringify({
    name: text(candidate ? fields!.name.value : value.name),
    sonata: text(candidate ? fields!.sonata.value : value.sonata),
    cost: candidate ? fields!.cost.value : value.cost,
    rarity: candidate ? fields!.rarity.value : value.rarity,
    level: candidate ? fields!.level.value : value.level,
    mainStat: stat(candidate ? fields!.mainStat.value : value.mainStat),
    subStats: subStats.map(stat).sort(),
    locked: candidate ? fields!.locked.value : value.locked,
    excluded: candidate ? fields!.excluded.value : value.excluded,
    equippedBy: text(candidate ? fields!.equippedBy.value : value.equippedByName)
  })
}

export function findDuplicate(candidate: DiagnosticScanCandidate, echoes: Echo[], pending: DiagnosticScanCandidate[] = []) {
  const signature = echoSignature(candidate)
  const stored = echoes.find((echo) => echoSignature(echo) === signature)
  if (stored) return stored.id
  return pending.find((entry) => entry.id !== candidate.id && echoSignature(entry) === signature)?.id
}

