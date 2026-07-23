import type { GeneratedCharacterCatalogEntry } from './catalog.generated'
import {
  generatedCharacterConditions,
  characterConditionProvenance,
  type GeneratedCharacterCondition,
  type GeneratedCharacterConditionModifier
} from './character-conditions.generated'

export type CharacterSkillCardKey = keyof GeneratedCharacterCatalogEntry['skillIcons'] | 'outroSkill'
export type CharacterCondition = GeneratedCharacterCondition
export type CharacterConditionModifier = GeneratedCharacterConditionModifier

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
const conditionCatalogByKey = new Map(Object.entries(generatedCharacterConditions).map(([key, conditions]) => [normalized(key), conditions]))

export const characterConditionId = (condition: CharacterCondition) => `wt:${condition.key}`
export const characterConditionStackId = (condition: CharacterCondition) => `${characterConditionId(condition)}:stacks`
export const characterConditionModeId = 'wt:mode'

export function characterConditionCatalogKey(character: GeneratedCharacterCatalogEntry) {
  if (/^rover\b/i.test(character.name)) {
    const gender = character.gender === 'female' ? 'Female' : 'Male'
    return `Rover${character.element}${gender}`
  }
  return character.name.replace(/[^a-z0-9]+/gi, '')
}

export function characterConditions(character: GeneratedCharacterCatalogEntry): CharacterCondition[] {
  return conditionCatalogByKey.get(normalized(characterConditionCatalogKey(character))) ?? []
}

export function characterConditionModes(character: GeneratedCharacterCatalogEntry) {
  return [...new Set(characterConditions(character).flatMap((condition) => condition.stance ? [condition.stance] : []))]
}

export function characterConditionRequiresToggle(condition: CharacterCondition) {
  return condition.hasStacks || /\b(?:after|when|while|upon|casting|obtaining|dealing|using|if|whenever|once|in the)\b/i.test(condition.description)
}

export function characterConditionInherentSkillIndex(condition: CharacterCondition, character: GeneratedCharacterCatalogEntry) {
  if (!/^inherent skill\b/i.test(condition.name)) return undefined
  const conditionName = normalized(condition.name.replace(/^inherent skill\s*:?\s*/i, ''))
  const conditionKey = normalized(condition.key)
  const index = character.skillTreeExtras.inherentSkills.findIndex((skill) => {
    const skillName = normalized(skill.name)
    return skillName.length > 3 && (conditionName.includes(skillName) || conditionKey.includes(skillName))
  })
  return index >= 0 ? index : undefined
}

export function characterConditionCard(condition: CharacterCondition, character: GeneratedCharacterCatalogEntry): CharacterSkillCardKey {
  const conditionName = normalized(condition.name)
  const direct = Object.entries(character.skillIcons).find(([, skill]) => {
    const skillName = normalized(skill.name)
    return skillName.length > 3 && (conditionName.includes(skillName) || skillName.includes(conditionName))
  })
  if (direct) return direct[0] as keyof GeneratedCharacterCatalogEntry['skillIcons']
  const text = `${condition.key} ${condition.name} ${condition.description}`
  if (/\boutro\b/i.test(text)) return 'outroSkill'
  if (/\bintro\b/i.test(text)) return 'introSkill'
  if (/resonance liberation|\bliberation\b/i.test(text)) return 'resonanceLiberation'
  if (/forte circuit|\bforte\b/i.test(text)) return 'forteCircuit'
  if (/resonance skill|\bskill\b/i.test(text)) return 'resonanceSkill'
  if (/normal attack|basic attack|heavy attack|dodge counter|mid-air|plunging/i.test(text)) return 'normalAttack'
  return 'forteCircuit'
}

export function conditionTargetsAttack(condition: CharacterCondition, attackName: string) {
  const targets = condition.modifiers.flatMap((modifier) => modifier.modifySpecificTalents ?? [])
  if (!targets.length) return true
  const attack = normalized(attackName)
  return targets.some((target) => {
    const candidate = normalized(target)
    return candidate.length > 2 && (attack.includes(candidate) || candidate.includes(attack))
  })
}

export { characterConditionProvenance }
