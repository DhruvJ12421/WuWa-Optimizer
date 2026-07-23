import type { WeaponCatalogEntry } from './catalog'

export type WeaponConditionStat =
  | 'atkPercent' | 'hpPercent' | 'defPercent' | 'critRate' | 'critDamage' | 'energyRegen'
  | 'elementDamage' | 'basicDamage' | 'heavyDamage' | 'skillDamage' | 'liberationDamage'
  | 'amplification' | 'defenseIgnore'

export interface WeaponConditionEffect {
  stat: WeaponConditionStat
  value: number
  attackType?: 'basic' | 'heavy' | 'skill' | 'liberation'
}

export interface WeaponPassiveCondition {
  id: string
  label: string
  description: string
  type: 'boolean' | 'stack'
  min: number
  max: number
  defaultValue: boolean | number
  alwaysOn: boolean
  effects: WeaponConditionEffect[]
}


const triggerPattern = /\b(?:after|when|while|upon|casting|obtaining|dealing|using|if|whenever|once|in the)\b/i
const continuationPattern = /^(?:this|the|each|these|during|at \d+ stacks?)/i

function passiveSentences(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean)
  return sentences.reduce<string[]>((groups, sentence) => {
    if (groups.length && continuationPattern.test(sentence)) groups[groups.length - 1] += ` ${sentence}`
    else groups.push(sentence)
    return groups
  }, [])
}

function effectLabel(description: string, index: number) {
  const named = description.match(/\b(?:gives?|grants?) (?:the equipper )?([A-Z][A-Za-z' -]{2,40}), which\b/)
  if (named) return named[1].trim()
  const trigger = description.split(/\b(?:increases?|grants?|allows?|reduces?|ignores?)\b/i)[0].replace(/[,.]$/, '').trim()
  return trigger.length >= 4 && trigger.length <= 70 ? trigger : `Passive effect ${index + 1}`
}

function attackType(description: string): WeaponConditionEffect['attackType'] {
  if (/Basic Attack/i.test(description)) return 'basic'
  if (/Heavy Attack/i.test(description)) return 'heavy'
  if (/Resonance Skill/i.test(description)) return 'skill'
  if (/Resonance Liberation/i.test(description)) return 'liberation'
  return undefined
}

function effectsFromDescription(description: string): WeaponConditionEffect[] {
  const effects: WeaponConditionEffect[] = []
  const add = (stat: WeaponConditionStat, pattern: RegExp, scoped = false) => {
    const match = description.match(pattern)
    const value = match?.slice(1).find((part) => part !== undefined)
    if (value !== undefined) effects.push({ stat, value: Number(value), ...(scoped ? { attackType: attackType(description) } : {}) })
  }
  add('atkPercent', /\bATK (?:is )?(?:increased )?by (\d+(?:\.\d+)?)%/i)
  add('hpPercent', /\b(?:Max )?HP (?:is )?(?:increased )?by (\d+(?:\.\d+)?)%/i)
  add('defPercent', /\bDEF (?:is )?(?:increased )?by (\d+(?:\.\d+)?)%/i)
  add('critRate', /\bCrit(?:\.|ical)? Rate by (\d+(?:\.\d+)?)%/i)
  add('critDamage', /\bCrit(?:\.|ical)? DMG by (\d+(?:\.\d+)?)%/i)
  add('energyRegen', /\bEnergy Regen by (\d+(?:\.\d+)?)%/i)
  add('elementDamage', /(?:(\d+(?:\.\d+)?)% (?:Attribute|All-Attribute|Elemental) DMG Bonus|(?:Aero|Electro|Fusion|Glacio|Havoc|Spectro|Attribute|Elemental) DMG Bonus (?:is )?increased by (\d+(?:\.\d+)?)%)/i)
  add('basicDamage', /(?:Basic Attack DMG by (\d+(?:\.\d+)?)%|(\d+(?:\.\d+)?)% Basic Attack DMG Bonus)/i, true)
  add('heavyDamage', /(?:Heavy Attack DMG by (\d+(?:\.\d+)?)%|(\d+(?:\.\d+)?)% Heavy Attack DMG Bonus)/i, true)
  add('skillDamage', /(?:Resonance Skill(?: DMG)? (?:is )?(?:increased )?by (\d+(?:\.\d+)?)%|(\d+(?:\.\d+)?)% Resonance Skill DMG Bonus)/i, true)
  add('liberationDamage', /(?:Resonance Liberation(?: DMG)? (?:is )?(?:increased )?by (\d+(?:\.\d+)?)%|(\d+(?:\.\d+)?)% Resonance Liberation DMG Bonus)/i, true)
  add('amplification', /(?:DMG (?:is )?Amplified by|damage dealt is additionally increased by) (\d+(?:\.\d+)?)%/i, true)
  add('defenseIgnore', /ignore (\d+(?:\.\d+)?)% of (?:the )?target'?s DEF/i, true)
  return effects
}

export function weaponPassiveConditions(weapon: WeaponCatalogEntry, rank: number): WeaponPassiveCondition[] {
  const description = weapon.passiveEffects[Math.max(0, Math.min(weapon.passiveEffects.length - 1, rank - 1))] ?? ''
  return passiveConditionsFromText(`weapon:${weapon.id}`, description)
}

function passiveConditionsFromText(sourceId: string, description: string): WeaponPassiveCondition[] {
  return passiveSentences(description).map((sentence, index) => {
    const cleanSentence = sentence.replace(/<[^>]+>/g, '')
    const max = Number(cleanSentence.match(/stacking up to (\d+)/i)?.[1] ?? 0)
    const alwaysOn = !triggerPattern.test(cleanSentence)
    return {
      id: `${sourceId}:${index}`,
      label: alwaysOn ? 'Always active' : effectLabel(cleanSentence, index),
      description: cleanSentence,
      type: max > 0 ? 'stack' : 'boolean',
      min: 0,
      max,
      defaultValue: alwaysOn ? true : max > 0 ? 0 : false,
      alwaysOn,
      effects: effectsFromDescription(cleanSentence)
    }
  })
}
