export type StatKey = 'hp' | 'hpPercent' | 'atk' | 'atkPercent' | 'def' | 'defPercent' | 'critRate' | 'critDamage' | 'energyRegen' | 'basicDamage' | 'heavyDamage' | 'skillDamage' | 'liberationDamage' | 'spectroDamage' | 'fusionDamage' | 'glacioDamage' | 'electroDamage' | 'aeroDamage' | 'havocDamage' | 'healingBonus'
export type DamageType = 'basic' | 'heavy' | 'skill' | 'liberation' | 'echo' | 'healing'
export type Element = 'spectro' | 'fusion' | 'glacio'
export interface StatLine { key: StatKey; value: number }
export interface Echo { id: string; name: string; cost: 1 | 3 | 4; rarity: 1 | 2 | 3 | 4 | 5; level: number; sonata: string; mainStat: StatLine; subStats: StatLine[]; locked: boolean; excluded: boolean; equippedBy?: string; equippedByName?: string; createdAt: number; source: 'scan' | 'screenshot' | 'manual' | 'import' }
export interface AttackDefinition { id: string; name: string; type: DamageType; element: Element; multiplier: number; hits: number; scalesWith: 'atk' | 'hp' }
export interface Resonator { id: string; name: string; element: Element; role: string; accent: string; baseStats: Pick<AggregatedStats, 'hp' | 'atk' | 'def' | 'critRate' | 'critDamage'>; attacks: AttackDefinition[] }
export interface Weapon { id: string; name: string; type: 'sword' | 'pistols' | 'rectifier'; baseAtk: number; stat?: StatLine }
export interface OwnedCharacter { id: string; catalogId: string; level: number; sequence: number; locked: boolean; createdAt: number }
export interface OwnedWeapon { id: string; catalogId: string; level: number; rank: number; locked: boolean; equippedBy?: string; createdAt: number }
export interface Build { id: string; name: string; resonatorId: string; weaponId: string; echoIds: string[]; level: number; skillLevel: number }
export interface Team { id: string; name: string; buildIds: string[]; enemy: EnemyConfig; rotationDuration: number; actions: RotationAction[]; buffs?: BuffEffect[] }
export interface RotationAction { id: string; timestamp: number; buildId: string; attackId: string }
export interface BuffEffect { id: string; name: string; sourceBuildId: string; target: 'self' | 'next' | 'team'; triggerAttackId: string; duration: number; stat: StatKey | 'amplify'; value: number; stackingGroup: string }
export interface EnemyConfig { level: number; resistance: number; damageReduction: number }
export interface AggregatedStats { baseHp: number; baseAtk: number; baseDef: number; hp: number; atk: number; def: number; critRate: number; critDamage: number; energyRegen: number; basicDamage: number; heavyDamage: number; skillDamage: number; liberationDamage: number; spectroDamage: number; fusionDamage: number; glacioDamage: number; electroDamage: number; aeroDamage: number; havocDamage: number; healingBonus: number }
export interface DamageResult { normal: number; critical: number; expected: number; hits: number; attackId: string }
export interface RotationResult { total: number; dps: number; actions: Array<DamageResult & { timestamp: number; buildId: string }>; byBuild: Record<string, number>; byType: Partial<Record<DamageType, number>> }
export interface ScanField<T> { value: T; confidence: number; raw?: string }
export interface ScanCandidate { id: string; createdAt: number; imageDataUrl: string; fingerprint: string; fields: { name: ScanField<string>; cost: ScanField<1 | 3 | 4>; rarity: ScanField<1 | 2 | 3 | 4 | 5>; level: ScanField<number>; sonata: ScanField<string>; mainStat: ScanField<StatLine>; subStats: ScanField<StatLine>[]; equippedBy: ScanField<string>; locked: ScanField<boolean>; excluded: ScanField<boolean> }; source: 'screen' | 'screenshot' | 'manual'; duplicateOf?: string }
export type OptimizerStatKey = Exclude<keyof AggregatedStats, 'baseHp' | 'baseAtk' | 'baseDef'>
export type OptimizerObjective = 'expected' | 'normal' | 'critical' | OptimizerStatKey
export interface OptimizerRequest { requestId: string; echoes: Echo[]; resonator: Resonator; weapon: Weapon; attack: AttackDefinition; enemy: EnemyConfig; objective: OptimizerObjective; minimumStats: Partial<Record<OptimizerStatKey, number>>; requiredSonata?: string; limit: number }
export interface OptimizerResult { requestId: string; echoIds: string[]; score: number; stats: AggregatedStats; damage: DamageResult }
export interface AccountDocument { schemaVersion: 2; gameDataVersion: string; exportedAt: string; echoes: Echo[]; characters: OwnedCharacter[]; weapons: OwnedWeapon[]; builds: Build[]; teams: Team[]; settings: AppSettings }
export interface AppSettings { displayName: string; privacyMode: boolean; background: 'signal' | 'tacet' | 'plain'; scanIntervalMs: number; scoreWeights: Record<string, Partial<Record<StatKey, number>>> }
export type AppView = 'dashboard' | 'scanner' | 'echoes' | 'weapons' | 'characters' | 'teams' | 'builds' | 'optimizer'
