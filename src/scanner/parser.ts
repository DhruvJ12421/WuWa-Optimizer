import { echoCatalog, sonataNames, statAliases, type EchoCatalogEntry } from '../game-data'
import type { Echo, ScanCandidate, StatKey, StatLine } from '../domain/types'

export interface VisualRecognition {
  rarity?: { value: Echo['rarity']; confidence: number }
}

const uuid = () => crypto.randomUUID()

export function normalizeOcrText(text: string) {
  return text.replace(/[|]/g, 'I').replace(/\uFF05/g, '%').replace(/[\u2013\u2014]/g, '-').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const percentageLimits: Partial<Record<StatKey, number>> = {
  hpPercent: 50, atkPercent: 50, defPercent: 50, critRate: 22, critDamage: 50,
  energyRegen: 50, basicDamage: 50, heavyDamage: 50, skillDamage: 50,
  liberationDamage: 50, spectroDamage: 50, fusionDamage: 50, glacioDamage: 50,
  healingBonus: 50
}

function restoreDroppedDecimal(key: StatKey, value: number) {
  const limit = percentageLimits[key]
  if (!limit || !Number.isInteger(value)) return value
  let normalized = value
  while (normalized > limit) normalized /= 10
  return normalized
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
  const value = restoreDroppedDecimal(key, Number(valueMatch[1].replace(',', '.')))
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return
  return { key, value }
}

function closestSonata(lines: string[]) {
  const lower = lines.join(' ').toLowerCase()
  return sonataNames.find((name) => lower.includes(name.toLowerCase())) ?? 'Unknown Sonata'
}

const normalizedIdentity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

function catalogMatch(lines: string[]): EchoCatalogEntry | undefined {
  const text = normalizedIdentity(lines.join(' '))
  return echoCatalog.find((entry) => [entry.name, ...(entry.aliases ?? [])].some((name) => text.includes(normalizedIdentity(name))))
}

function confidence(found: boolean, base: number) { return found ? base : 0.25 }

export async function imageFingerprint(dataUrl: string) {
  const data = new TextEncoder().encode(dataUrl.slice(-6000))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function parseEchoText(text: string, imageDataUrl: string, source: ScanCandidate['source'], visual: VisualRecognition = {}): Promise<ScanCandidate> {
  const lines = normalizeOcrText(text)
  const detailsEnd = lines.findIndex((line) => /Echo Skills|Sonata Effect/i.test(line))
  const detailLines = detailsEnd < 0 ? lines : lines.slice(0, detailsEnd)
  const stats = detailLines.map(parseStatLine).filter((stat): stat is StatLine => Boolean(stat))
  const joined = lines.join(' ')
  const levelMatch = joined.match(/(?:Lv\.?|Level|\+)\s*(\d{1,2})/i)
  const costMatch = joined.match(/Cost\s*([134])/i)
  const rarityMatch = joined.match(/([1-5])\s*(?:Star|★)/i)
  const equippedLine = [...lines].reverse().find((line) => /^\W*Equipped\s+by\s+/i.test(line))
  const equippedMatch = equippedLine?.match(/^\W*Equipped\s+by\s+([A-Za-z][A-Za-z .'-]{0,30})/i)
  const catalog = catalogMatch(lines)
  const detectedName = lines.find((line) => !parseStatLine(line) && !/(level|cost|sonata|equipped|locked|echo skills)/i.test(line) && line.length > 2) ?? 'Unknown Echo'
  const name = catalog?.name ?? detectedName.replace(/\s*\+\s*\d{1,2}.*$/, '').trim()
  const textSonata = closestSonata(lines)
  const sonata = catalog?.sonatas.length === 1 ? catalog.sonatas[0] : textSonata
  const mainStat = stats[0] ?? { key: 'atkPercent' as const, value: 0 }
  const rarity = visual.rarity?.value ?? Number(rarityMatch?.[1] ?? 5) as Echo['rarity']
  return {
    id: uuid(), createdAt: Date.now(), imageDataUrl, fingerprint: await imageFingerprint(imageDataUrl), source,
    fields: {
      name: { value: name, confidence: catalog ? 0.98 : confidence(name !== 'Unknown Echo', 0.72), raw: detectedName },
      cost: { value: catalog?.cost ?? Number(costMatch?.[1] ?? 1) as 1 | 3 | 4, confidence: catalog ? 0.98 : confidence(Boolean(costMatch), 0.9), raw: costMatch?.[0] },
      rarity: { value: rarity, confidence: visual.rarity?.confidence ?? confidence(Boolean(rarityMatch), 0.85), raw: rarityMatch?.[0] },
      level: { value: Number(levelMatch?.[1] ?? 0), confidence: confidence(Boolean(levelMatch), 0.92), raw: levelMatch?.[0] },
      sonata: { value: sonata, confidence: catalog?.sonatas.length === 1 ? 0.96 : confidence(sonata !== 'Unknown Sonata', 0.86), raw: textSonata },
      mainStat: { value: mainStat, confidence: confidence(stats.length > 0, 0.82) },
      subStats: stats.slice(1, 6).map((stat) => ({ value: stat, confidence: 0.78 })),
      equippedBy: { value: equippedMatch?.[1]?.trim() ?? '', confidence: confidence(Boolean(equippedMatch), 0.84), raw: equippedMatch?.[0] }
    }
  }
}

export function candidateToEcho(candidate: ScanCandidate): Echo {
  return {
    id: uuid(), name: candidate.fields.name.value, cost: candidate.fields.cost.value,
    rarity: candidate.fields.rarity.value, level: candidate.fields.level.value,
    sonata: candidate.fields.sonata.value, mainStat: candidate.fields.mainStat.value,
    subStats: candidate.fields.subStats.map((field) => field.value), locked: false, excluded: false,
    equippedByName: candidate.fields.equippedBy.value.trim() || undefined,
    createdAt: Date.now(), source: candidate.source === 'screen' ? 'scan' : candidate.source
  }
}

export function candidateErrors(candidate: ScanCandidate) {
  const errors: string[] = []
  if (!candidate.fields.name.value.trim() || candidate.fields.name.value === 'Unknown Echo') errors.push('Enter the Echo name.')
  if (candidate.fields.level.value < 0 || candidate.fields.level.value > 25) errors.push('Level must be between 0 and 25.')
  if (![1, 3, 4].includes(candidate.fields.cost.value)) errors.push('Cost must be 1, 3, or 4.')
  if (![1, 2, 3, 4, 5].includes(candidate.fields.rarity.value)) errors.push('Rarity must be between 1 and 5.')
  if (!candidate.fields.sonata.value.trim() || candidate.fields.sonata.value === 'Unknown Sonata') errors.push('Choose or enter a Sonata set.')
  if (!Number.isFinite(candidate.fields.mainStat.value.value) || candidate.fields.mainStat.value.value < 0) errors.push('Main stat must be a non-negative number.')
  if (candidate.fields.subStats.length > 5) errors.push('An Echo cannot have more than five substats.')
  if (candidate.fields.subStats.some((field) => !Number.isFinite(field.value.value) || field.value.value < 0)) errors.push('Substats must be non-negative numbers.')
  return errors
}
