import type { StatKey, StatLine } from '../domain/types'

const elementDamageKeys: StatKey[] = [
  'spectroDamage', 'fusionDamage', 'glacioDamage', 'electroDamage', 'aeroDamage', 'havocDamage'
]

const conditionalLanguage = /\b(?:after|when|while|upon|during|if|every|within|for\s+\d+(?:\.\d+)?s|stack(?:s|ing)?|above|below|dealing|casting|providing|hitting|using|entering|taking|once|with\s+\d+)\b|\bin\s+(?:the\s+)?[^,.]{0,80}\b(?:state|mode|form|domain|combat)\b/i

function normalizedEffectText(description: string) {
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/\{Cus:[^}]*\}/g, '')
}

function effectSentences(description: string) {
  return normalizedEffectText(description)
    .replace(/\n+/g, ' ')
    .split(/(?<=\.)\s+(?=(?:\d+s\b|[A-Z]))/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function percentFor(sentence: string, label: RegExp) {
  const source = label.source
  const patterns = [
    new RegExp(`${source}\\s*(?:is\\s*)?(?:increased\\s*by|\\+)\\s*([\\d.]+)%`, 'i'),
    new RegExp(`(?:increase(?:s|d)?|grant(?:s|ed)?|gain(?:s|ed)?)\\s+(?:the\\s+(?:wielder|resonator)(?:'s|’s)\\s+)?${source}\\s+by\\s+([\\d.]+)%`, 'i'),
    new RegExp(`(?:grant(?:s|ed)?|gain(?:s|ed)?)\\s+([\\d.]+)%\\s+${source}`, 'i')
  ]
  for (const pattern of patterns) {
    const value = Number.parseFloat(sentence.match(pattern)?.[1] ?? '')
    if (Number.isFinite(value)) return value
  }
  return undefined
}

function statLinesFromSentence(sentence: string) {
  const lines: StatLine[] = []
  const add = (key: StatKey, value: number | undefined) => {
    if (value === undefined || lines.some((line) => line.key === key)) return
    lines.push({ key, value })
  }

  const allAttribute = percentFor(sentence, /(?:All-)?Attribute DMG Bonus/)
  if (allAttribute !== undefined) for (const key of elementDamageKeys) add(key, allAttribute)

  const combinedBasicHeavy = percentFor(sentence, /Basic Attack(?: DMG)? Bonus and Heavy Attack(?: DMG)? Bonus/)
    ?? percentFor(sentence, /Basic Attack and Heavy Attack DMG Bonus/)
  if (combinedBasicHeavy !== undefined) {
    add('basicDamage', combinedBasicHeavy)
    add('heavyDamage', combinedBasicHeavy)
  }

  add('hpPercent', percentFor(sentence, /(?:Max )?HP/))
  add('atkPercent', percentFor(sentence, /ATK/))
  add('defPercent', percentFor(sentence, /DEF/))
  add('critRate', percentFor(sentence, /Crit\. Rate/))
  add('critDamage', percentFor(sentence, /Crit\. DMG/))
  add('energyRegen', percentFor(sentence, /Energy Regen/))
  add('healingBonus', percentFor(sentence, /Healing Bonus/))
  add('basicDamage', percentFor(sentence, /Basic Attack(?: DMG)? Bonus/))
  add('heavyDamage', percentFor(sentence, /Heavy Attack(?: DMG)? Bonus/))
  add('skillDamage', percentFor(sentence, /Resonance Skill DMG Bonus/))
  add('liberationDamage', percentFor(sentence, /Resonance Liberation DMG Bonus/))
  add('spectroDamage', percentFor(sentence, /Spectro DMG(?: Bonus)?/))
  add('fusionDamage', percentFor(sentence, /Fusion DMG(?: Bonus)?/))
  add('glacioDamage', percentFor(sentence, /Glacio DMG(?: Bonus)?/))
  add('electroDamage', percentFor(sentence, /Electro DMG(?: Bonus)?/))
  add('aeroDamage', percentFor(sentence, /Aero DMG(?: Bonus)?/))
  add('havocDamage', percentFor(sentence, /Havoc DMG(?: Bonus)?/))
  return lines
}

export function passiveStatLines(description: string) {
  return effectSentences(description).flatMap(statLinesFromSentence)
}

export function alwaysOnPassiveStatLines(description: string) {
  return effectSentences(description)
    .filter((sentence) => !conditionalLanguage.test(sentence))
    .flatMap(statLinesFromSentence)
}

export function hasConditionalStatLines(description: string) {
  return effectSentences(description).some((sentence) => conditionalLanguage.test(sentence) && statLinesFromSentence(sentence).length > 0)
}

const sequenceStatSubject = String.raw`(?:Max HP|HP|ATK|DEF|Crit\. Rate|Crit\. DMG|Energy Regen|Healing Bonus|Basic Attack(?: DMG)? Bonus|Heavy Attack(?: DMG)? Bonus|Resonance Skill DMG Bonus|Resonance Liberation DMG Bonus|Spectro DMG(?: Bonus)?|Fusion DMG(?: Bonus)?|Glacio DMG(?: Bonus)?|Electro DMG(?: Bonus)?|Aero DMG(?: Bonus)?|Havoc DMG(?: Bonus)?|(?:All-)?Attribute DMG Bonus)`
const directSequenceStat = new RegExp(String.raw`^(?:(?:the\s+)?(?:wielder|resonator)(?:'s)?\s+|[A-Z][\w'-]*(?:'s)?\s+)?${sequenceStatSubject}\s+(?:is\s+)?(?:increased|\+)`, 'i')
const gainedSequenceStat = new RegExp(String.raw`^(?:all\s+(?:resonators|team members)(?:\s+in\s+the\s+team)?|(?:the\s+)?(?:wielder|resonator)|[A-Z][\w'-]*)?\s*(?:gain|gains|grant|grants)\s+[\d.]+%\s+${sequenceStatSubject}`, 'i')

export function alwaysOnSequenceStatLines(description: string) {
  return effectSentences(description)
    .filter((sentence) => !conditionalLanguage.test(sentence) && (directSequenceStat.test(sentence) || gainedSequenceStat.test(sentence)))
    .flatMap(statLinesFromSentence)
}

const skillTreeStatKeys: Array<[RegExp, StatKey]> = [
  [/crit\. rate/i, 'critRate'],
  [/crit\. dmg/i, 'critDamage'],
  [/healing bonus/i, 'healingBonus'],
  [/spectro dmg/i, 'spectroDamage'],
  [/fusion dmg/i, 'fusionDamage'],
  [/glacio dmg/i, 'glacioDamage'],
  [/electro dmg/i, 'electroDamage'],
  [/aero dmg/i, 'aeroDamage'],
  [/havoc dmg/i, 'havocDamage'],
  [/^hp/i, 'hpPercent'],
  [/^atk/i, 'atkPercent'],
  [/^def/i, 'defPercent']
]

export function skillTreeStatLine(name: string, description: string): StatLine | undefined {
  const value = Number.parseFloat(description.match(/([\d.]+)%/)?.[1] ?? '')
  const key = skillTreeStatKeys.find(([pattern]) => pattern.test(name))?.[1]
  return key && Number.isFinite(value) ? { key, value } : undefined
}
