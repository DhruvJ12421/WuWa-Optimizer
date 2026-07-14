import type { ScanCandidate, StatLine } from '../domain/types'
import type { ScanLayout, ScanRect } from './types'

export interface ExpectedEchoFields {
  name: string
  cost: 1 | 3 | 4
  rarity: 1 | 2 | 3 | 4 | 5
  level: number
  sonata: string
  mainStat: StatLine
  subStats: StatLine[]
  equippedBy?: string
  locked?: boolean
  excluded?: boolean
}

export interface ExpectedOcrFixture extends ExpectedEchoFields {
  fixtureVersion: 1
  layout: Exclude<ScanLayout, 'unknown'>
  resolution: { width: number; height: number }
  uiScale: number
  panelRect: ScanRect
  fieldRects: Record<string, ScanRect>
}

export interface AccuracyResult {
  matchedFields: number
  totalFields: number
  accuracy: number
  completeEcho?: boolean
}

const sameText = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()
const sameStat = (left: StatLine, right: StatLine) => left.key === right.key && Math.abs(left.value - right.value) <= 0.05

export function evaluateCandidate(candidate: ScanCandidate, expected: ExpectedEchoFields): AccuracyResult {
  const checks: boolean[] = [
    sameText(candidate.fields.name.value, expected.name),
    candidate.fields.cost.value === expected.cost,
    candidate.fields.rarity.value === expected.rarity,
    candidate.fields.level.value === expected.level,
    sameText(candidate.fields.sonata.value, expected.sonata),
    sameStat(candidate.fields.mainStat.value, expected.mainStat),
    ...expected.subStats.map((stat, index) => Boolean(candidate.fields.subStats[index]) && sameStat(candidate.fields.subStats[index].value, stat)),
    ...(expected.equippedBy === undefined ? [] : [sameText(candidate.fields.equippedBy.value, expected.equippedBy)]),
    ...(expected.locked === undefined ? [] : [candidate.fields.locked.value === expected.locked]),
    ...(expected.excluded === undefined ? [] : [candidate.fields.excluded.value === expected.excluded])
  ]
  const matchedFields = checks.filter(Boolean).length
  return { matchedFields, totalFields: checks.length, accuracy: checks.length ? matchedFields / checks.length : 0, completeEcho: checks.every(Boolean) }
}

export function combineAccuracy(results: AccuracyResult[]): AccuracyResult {
  const matchedFields = results.reduce((sum, result) => sum + result.matchedFields, 0)
  const totalFields = results.reduce((sum, result) => sum + result.totalFields, 0)
  return { matchedFields, totalFields, accuracy: totalFields ? matchedFields / totalFields : 0, completeEcho: results.length > 0 && results.every((result) => result.completeEcho) }
}
