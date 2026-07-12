import type { ScanCandidate, StatLine } from '../domain/types'

export interface ExpectedEchoFields {
  name: string
  cost: 1 | 3 | 4
  rarity: 2 | 3 | 4 | 5
  level: number
  sonata: string
  mainStat: StatLine
  subStats: StatLine[]
}

export interface AccuracyResult {
  matchedFields: number
  totalFields: number
  accuracy: number
}

const sameText = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()
const sameStat = (left: StatLine, right: StatLine) => left.key === right.key && Math.abs(left.value - right.value) <= 0.05

export function evaluateCandidate(candidate: ScanCandidate, expected: ExpectedEchoFields): AccuracyResult {
  const checks = [
    sameText(candidate.fields.name.value, expected.name),
    candidate.fields.cost.value === expected.cost,
    candidate.fields.rarity.value === expected.rarity,
    candidate.fields.level.value === expected.level,
    sameText(candidate.fields.sonata.value, expected.sonata),
    sameStat(candidate.fields.mainStat.value, expected.mainStat),
    ...expected.subStats.map((stat, index) => Boolean(candidate.fields.subStats[index]) && sameStat(candidate.fields.subStats[index].value, stat))
  ]
  const matchedFields = checks.filter(Boolean).length
  return { matchedFields, totalFields: checks.length, accuracy: checks.length ? matchedFields / checks.length : 0 }
}

export function combineAccuracy(results: AccuracyResult[]): AccuracyResult {
  const matchedFields = results.reduce((sum, result) => sum + result.matchedFields, 0)
  const totalFields = results.reduce((sum, result) => sum + result.totalFields, 0)
  return { matchedFields, totalFields, accuracy: totalFields ? matchedFields / totalFields : 0 }
}
