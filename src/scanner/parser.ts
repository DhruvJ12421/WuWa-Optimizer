import { sonataNames, statAliases } from '../game-data'
import type { Echo, ScanCandidate, StatKey, StatLine } from '../domain/types'

const uuid = () => crypto.randomUUID()

export function normalizeOcrText(text: string) {
  return text
    .replace(/[|]/g, 'I')
    .replace(/[％]/g, '%')
    .replace(/[–—]/g, '-')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function parseStatLine(line: string): StatLine | undefined {
  const valueMatch = line.match(/(-?\d+(?:[.,]\d+)?)\s*(%)?\s*$/)
  if (!valueMatch) return
  const label = line.slice(0, valueMatch.index).replace(/[+.:]/g, ' ').trim()
  const isPercent = Boolean(valueMatch[2] || label.includes('%'))
  const normalizedLabel = label.replace(/%/g, '').trim()
  let key: StatKey | undefined
  for (const [pattern, candidate] of statAliases) {
    if (pattern.test(`${normalizedLabel}${isPercent ? ' %' : ''}`)) { key = candidate; break }
  }
  if (!key) return
  const value = Number(valueMatch[1].replace(',', '.'))
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return
  return { key, value }
}

function closestSonata(lines: string[]) {
  const lower = lines.join(' ').toLowerCase()
  return sonataNames.find((name) => lower.includes(name.toLowerCase())) ?? 'Unknown Sonata'
}

function confidence(found: boolean, base: number) {
  return found ? base : 0.25
}

export async function imageFingerprint(dataUrl: string) {
  const data = new TextEncoder().encode(dataUrl.slice(-6000))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function parseEchoText(text: string, imageDataUrl: string, source: ScanCandidate['source']): Promise<ScanCandidate> {
  const lines = normalizeOcrText(text)
  const stats = lines.map(parseStatLine).filter((stat): stat is StatLine => Boolean(stat))
  const levelMatch = lines.join(' ').match(/(?:Lv\.?|Level)\s*(\d{1,2})/i)
  const costMatch = lines.join(' ').match(/Cost\s*([134])/i)
  const rarityMatch = lines.join(' ').match(/([2-5])\s*(?:Star|★)/i)
  const name = lines.find((line) => !parseStatLine(line) && !/(level|cost|sonata|equipped|locked)/i.test(line) && line.length > 2) ?? 'Unknown Echo'
  const sonata = closestSonata(lines)
  const mainStat = stats[0] ?? { key: 'atkPercent', value: 0 }
  return {
    id: uuid(), createdAt: Date.now(), imageDataUrl, fingerprint: await imageFingerprint(imageDataUrl), source,
    fields: {
      name: { value: name, confidence: confidence(name !== 'Unknown Echo', 0.72), raw: name },
      cost: { value: Number(costMatch?.[1] ?? 1) as 1 | 3 | 4, confidence: confidence(Boolean(costMatch), 0.9), raw: costMatch?.[0] },
      rarity: { value: Number(rarityMatch?.[1] ?? 5) as 2 | 3 | 4 | 5, confidence: confidence(Boolean(rarityMatch), 0.85), raw: rarityMatch?.[0] },
      level: { value: Number(levelMatch?.[1] ?? 0), confidence: confidence(Boolean(levelMatch), 0.92), raw: levelMatch?.[0] },
      sonata: { value: sonata, confidence: confidence(sonata !== 'Unknown Sonata', 0.86), raw: sonata },
      mainStat: { value: mainStat, confidence: confidence(stats.length > 0, 0.82) },
      subStats: stats.slice(1, 6).map((stat) => ({ value: stat, confidence: 0.78 }))
    }
  }
}

export function candidateToEcho(candidate: ScanCandidate): Echo {
  return {
    id: uuid(), name: candidate.fields.name.value, cost: candidate.fields.cost.value,
    rarity: candidate.fields.rarity.value, level: candidate.fields.level.value,
    sonata: candidate.fields.sonata.value, mainStat: candidate.fields.mainStat.value,
    subStats: candidate.fields.subStats.map((field) => field.value), locked: false, excluded: false,
    createdAt: Date.now(), source: candidate.source === 'screen' ? 'scan' : candidate.source
  }
}

export function candidateErrors(candidate: ScanCandidate) {
  const errors: string[] = []
  if (!candidate.fields.name.value.trim() || candidate.fields.name.value === 'Unknown Echo') errors.push('Enter the Echo name.')
  if (candidate.fields.level.value < 0 || candidate.fields.level.value > 25) errors.push('Level must be between 0 and 25.')
  if (![1, 3, 4].includes(candidate.fields.cost.value)) errors.push('Cost must be 1, 3, or 4.')
  if (![2, 3, 4, 5].includes(candidate.fields.rarity.value)) errors.push('Rarity must be between 2 and 5.')
  if (!candidate.fields.sonata.value.trim() || candidate.fields.sonata.value === 'Unknown Sonata') errors.push('Choose or enter a Sonata set.')
  if (!Number.isFinite(candidate.fields.mainStat.value.value) || candidate.fields.mainStat.value.value < 0) errors.push('Main stat must be a non-negative number.')
  if (candidate.fields.subStats.length > 5) errors.push('An Echo cannot have more than five substats.')
  if (candidate.fields.subStats.some((field) => !Number.isFinite(field.value.value) || field.value.value < 0)) errors.push('Substats must be non-negative numbers.')
  return errors
}
