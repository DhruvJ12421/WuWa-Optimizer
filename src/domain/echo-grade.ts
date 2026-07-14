import type { Echo, StatKey } from './types'
import { tunableRolls } from '../game-data/tunable-rolls'
import { effectiveSubStats, maxSubStatsForLevel } from '../game-data/echo-main-stats'

export type EchoRollGrade = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'

const FLAT_STAT_POINTS = 3
const MAX_TIER_POINTS = 8

export function substatTierPoints(key: StatKey, value: number) {
  if (key === 'hp' || key === 'atk' || key === 'def') return FLAT_STAT_POINTS
  const rolls = tunableRolls[key]
  if (!rolls?.length) return 0
  const tierIndex = rolls.findIndex((roll) => Math.abs(roll.value - value) < 0.001)
  return tierIndex < 0 ? 0 : tierIndex + 1
}

export function echoRollPoints(echo: Pick<Echo, 'level' | 'subStats'>) {
  return effectiveSubStats(echo).reduce((sum, stat) => sum + substatTierPoints(stat.key, stat.value), 0)
}

export function echoRollQuality(echo: Pick<Echo, 'level' | 'subStats'>) {
  const maximum = maxSubStatsForLevel(echo.level) * MAX_TIER_POINTS
  return maximum ? echoRollPoints(echo) / maximum * 100 : 0
}

export function echoRollGrade(score: number): EchoRollGrade {
  if (score >= 93.75) return 'SSS'
  if (score >= 81.25) return 'SS'
  if (score >= 68.75) return 'S'
  if (score >= 56.25) return 'A'
  if (score >= 43.75) return 'B'
  if (score >= 31.25) return 'C'
  if (score >= 18.75) return 'D'
  return 'E'
}
