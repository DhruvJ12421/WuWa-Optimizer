const fixedSkillValuePattern = /\b(?:sta(?:mina)?\s+cost|concerto\s+(?:regen|regeneration|recovery)|cooldown|duration|resonance(?:\s+energy)?\s+cost)\b/i

export function isFixedSkillValueName(name: string) {
  return fixedSkillValuePattern.test(name)
}
