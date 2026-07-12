import { generatedEchoCatalog } from './echoes.generated'

export interface EchoCatalogEntry {
  id?: string
  /** Exact English name shown at the top of the Echo detail panel. */
  name: string
  cost: 1 | 3 | 4
  /** A single Sonata can be resolved from the Echo identity without visible set text. */
  sonatas: string[]
  aliases?: string[]
  articleUrl?: string
  /** Provenance only; do not hotlink or bundle without checking the file's reuse rights. */
  rarities?: number[]
  intensity?: number
  iconPath?: string
  /** Provenance only; do not hotlink or bundle without checking the file's reuse rights. */
  iconSourceUrl?: string
}

/** Local aliases and OCR-only additions that are not supplied by the generated wiki catalog. */
const localEntries: EchoCatalogEntry[] = [
  { name: 'Cyan-Feathered Heron', cost: 3, sonatas: ['Celestial Light'], aliases: ['Cyan Feathered Heron'] },
  { name: 'Reminiscence - Nightmare: Adam Smasher', cost: 4, sonatas: ['Shadow of Shattered Dreams'], aliases: ['Reminiscence Nightmare Adam Smasher', 'Reminiscence: Nightmare - Adam Smasher'] }
]

export const echoCatalog: EchoCatalogEntry[] = [
  ...generatedEchoCatalog.map((entry) => {
    const local = localEntries.find((candidate) => candidate.name === entry.name)
    return { ...entry, aliases: local?.aliases }
  }),
  ...localEntries.filter((entry) => !generatedEchoCatalog.some((generated) => generated.name === entry.name))
]
