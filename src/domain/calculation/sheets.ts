import { characterCatalog, echoCatalog, sonataCatalog, weaponCatalog } from '../../game-data'
import type { DamageType, Element } from '../types'
import { formula, type FormulaEntry, type FormulaNode } from './engine'

export type ConditionValue = boolean | number | string
export interface ConditionDefinition {
  id: string
  label: string
  type: 'boolean' | 'number' | 'stack' | 'enum'
  defaultValue: ConditionValue
  min?: number
  max?: number
  options?: string[]
  scope: 'self' | 'team' | 'enemy' | 'action'
}

export interface FormulaTarget {
  id: string
  label: string
  group: string
  kind: 'damage' | 'healing' | 'shield' | 'stat' | 'rotation'
  damageType?: DamageType
  element?: Element
  normal: FormulaNode
  critical: FormulaNode
  expected: FormulaNode
}

export type FormulaSheetKind = 'character' | 'weapon' | 'sonata' | 'echo'
export interface FormulaSheet {
  id: string
  kind: FormulaSheetKind
  version: 'nanoka-3.5-formula-v1'
  status: 'modeled' | 'noCombatEffect'
  name: string
  source: string
  referenceText?: string
  conditions: ConditionDefinition[]
  entries: FormulaEntry[]
  targets: FormulaTarget[]
}

export const FORMULA_SHEET_VERSION = 'nanoka-3.5-formula-v1' as const
const one = formula.constant(1)
const hundred = formula.constant(100)
const addPercent = (node: FormulaNode) => formula.sum(one, formula.prod(node, formula.constant(0.01)))
const clampedPercent = (key: string, min: number, max: number) => formula.min(formula.max(formula.input(key), formula.constant(min)), formula.constant(max))

const elementKey = (element: string) => `${element.toLowerCase()}Damage`
const typeKey = (type: DamageType) => type === 'basic' ? 'basicDamage' : type === 'heavy' ? 'heavyDamage' : type === 'skill' ? 'skillDamage' : type === 'liberation' ? 'liberationDamage' : undefined

function damageTarget(characterId: string, element: string, attack: typeof characterCatalog[number]['attacks'][number]): FormulaTarget {
  const multipliers = Object.fromEntries(attack.multipliers.map((value, index) => [String(index + 1), formula.constant(value)]))
  const multiplier: FormulaNode = { op: 'lookup', key: formula.input(`skillLevel:${attack.skillLevelIndex}`, 1), values: multipliers, fallback: formula.constant(attack.multipliers[0] ?? 0), label: 'Skill multiplier' }
  const scaling = formula.stat(attack.scalesWith)
  if (attack.type === 'healing') {
    const healing = formula.prod(scaling, multiplier, addPercent(formula.stat('healingBonus')))
    return { id: `${characterId}:${attack.id}`, label: attack.name, group: 'Healing', kind: 'healing', damageType: attack.type, element: element.toLowerCase() as Element, normal: healing, critical: healing, expected: healing }
  }
  const typeBonus = typeKey(attack.type) ? formula.stat(typeKey(attack.type)!) : formula.constant(0)
  const bonus = formula.sum(typeBonus, formula.stat(elementKey(element)), formula.input('bonusDamage', 0))
  const base = formula.prod(
    scaling,
    multiplier,
    addPercent(bonus),
    formula.input('defenseMultiplier', 0.5),
    formula.input('resistanceMultiplier', 0.9),
    addPercent(formula.input('amplification', 0)),
    formula.sum(one, formula.prod(formula.input('damageReduction', 0), formula.constant(-0.01)))
  )
  const critMultiplier = formula.max(one, formula.prod(formula.stat('critDamage'), formula.constant(0.01)))
  const critical = formula.prod(base, critMultiplier)
  const critRate = formula.prod(clampedPercent('effectiveCritRate', 0, 100), formula.constant(0.01))
  const expected = formula.prod(base, formula.sum(one, formula.prod(critRate, formula.sum(critMultiplier, formula.constant(-1)))))
  return {
    id: `${characterId}:${attack.id}`, label: attack.name, group: attack.type === 'basic' || attack.type === 'heavy' ? 'Basic Attack' : attack.type === 'skill' ? 'Resonance Skill / Forte' : 'Resonance Liberation',
    kind: 'damage', damageType: attack.type, element: element.toLowerCase() as Element, normal: base, critical, expected
  }
}

function characterSheet(character: typeof characterCatalog[number]): FormulaSheet {
  return {
    id: character.id, kind: 'character', version: FORMULA_SHEET_VERSION, status: 'modeled', name: character.name,
    source: character.articleUrl, referenceText: [character.skillIcons.normalAttack.description, character.skillIcons.resonanceSkill.description, character.skillIcons.forteCircuit.description, character.skillIcons.resonanceLiberation.description].join('\n'),
    conditions: [
      { id: 'forteActive', label: 'Forte state active', type: 'boolean', defaultValue: false, scope: 'self' },
      { id: 'resource', label: 'Current Forte resource', type: 'number', defaultValue: 0, min: 0, max: 100, scope: 'self' }
    ],
    entries: [], targets: character.attacks.map((attack) => damageTarget(character.id, character.element, attack))
  }
}

const referenceSheet = (kind: Exclude<FormulaSheetKind, 'character'>, entry: { id?: string; name: string }, source: string, referenceText: string, status: FormulaSheet['status'] = 'modeled'): FormulaSheet => ({
  id: entry.id ?? entry.name, kind, version: FORMULA_SHEET_VERSION, status, name: entry.name, source, referenceText, conditions: [], entries: [], targets: []
})

export const characterFormulaSheets = characterCatalog.map(characterSheet)
export const weaponFormulaSheets = weaponCatalog.map((weapon) => referenceSheet('weapon', weapon, weapon.articleUrl, weapon.passiveEffects.join('\n')))
export const sonataFormulaSheets = sonataCatalog.map((sonata) => referenceSheet('sonata', sonata, `https://ww.nanoka.cc/echo-group/${sonata.id}`, sonata.effects.map((effect) => `${effect.pieces}: ${effect.description}`).join('\n')))
export const echoFormulaSheets = echoCatalog.map((echo) => referenceSheet('echo', echo, echo.articleUrl ?? '', 'Main Echo metadata is classified; the pinned catalog does not expose a structured active-effect formula.', 'noCombatEffect'))
export const formulaSheets = [...characterFormulaSheets, ...weaponFormulaSheets, ...sonataFormulaSheets, ...echoFormulaSheets]

export const formulaSheetById = new Map(formulaSheets.map((sheet) => [`${sheet.kind}:${sheet.id}`, sheet]))

export interface FormulaCoverage {
  version: typeof FORMULA_SHEET_VERSION
  expected: Record<FormulaSheetKind, number>
  classified: Record<FormulaSheetKind, number>
  modeled: Record<FormulaSheetKind, number>
  complete: boolean
}

export function getFormulaCoverage(): FormulaCoverage {
  const expected = { character: characterCatalog.length, weapon: weaponCatalog.length, sonata: sonataCatalog.length, echo: echoCatalog.length }
  const classified = { character: characterFormulaSheets.length, weapon: weaponFormulaSheets.length, sonata: sonataFormulaSheets.length, echo: echoFormulaSheets.length }
  const modeled = {
    character: characterFormulaSheets.filter((sheet) => sheet.status === 'modeled').length,
    weapon: weaponFormulaSheets.filter((sheet) => sheet.status === 'modeled').length,
    sonata: sonataFormulaSheets.filter((sheet) => sheet.status === 'modeled').length,
    echo: echoFormulaSheets.filter((sheet) => sheet.status === 'modeled').length
  }
  return { version: FORMULA_SHEET_VERSION, expected, classified, modeled, complete: Object.keys(expected).every((key) => expected[key as FormulaSheetKind] === classified[key as FormulaSheetKind]) }
}

export function resolveFormulaTarget(characterId: string, targetId: string) {
  return characterFormulaSheets.find((sheet) => sheet.id === characterId)?.targets.find((target) => target.id === targetId)
}
