import type { DiagnosticScanCandidate } from './types'
import { candidateToEcho } from './parser'
import { characterCatalog, weaponCatalog } from '../game-data'
import { db } from '../storage/database'
import { createLocalId } from '../domain/id'

const normalizedIdentity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const initializedBuildCards = new Set<string>()

export async function saveScannedCandidate(candidate: DiagnosticScanCandidate) {
  const characterName = candidate.buildCard?.character.value.trim() || candidate.fields.equippedBy.value.trim()
  const characterEntry = characterCatalog.find((entry) => entry.id === candidate.buildCard?.characterCatalogId)
    ?? characterCatalog.find((entry) => normalizedIdentity(entry.name) === normalizedIdentity(characterName))
  const weaponEntry = weaponCatalog.find((entry) => entry.id === candidate.buildCard?.weaponCatalogId)
    ?? weaponCatalog.find((entry) => normalizedIdentity(entry.name) === normalizedIdentity(candidate.buildCard?.weapon.value ?? ''))

  const initializeBuildCard = Boolean(candidate.buildCard && !initializedBuildCards.has(candidate.buildCard.id))
  const saved = await db.transaction('rw', [db.echoes, db.characters, db.weapons, db.builds], async () => {
    let ownedCharacter = characterEntry ? await db.characters.where('catalogId').equals(characterEntry.id).first() : undefined
    if (characterEntry && !ownedCharacter) {
      ownedCharacter = {
        id: createLocalId(), catalogId: characterEntry.id,
        level: candidate.buildCard?.characterLevel.value ?? 1,
        sequence: candidate.buildCard?.sequence.value ?? 0,
        skillLevels: candidate.buildCard?.skillLevels.map((field) => field.value) ?? [1, 1, 1, 1, 1],
        locked: false, favorite: false, createdAt: Date.now()
      }
      await db.characters.add(ownedCharacter)
    } else if (ownedCharacter && candidate.buildCard) {
      await db.characters.update(ownedCharacter.id, {
        level: candidate.buildCard.characterLevel.value,
        skillLevels: candidate.buildCard.skillLevels.map((field) => field.value)
      })
    }

    let ownedWeapon = weaponEntry && ownedCharacter
      ? (await db.weapons.where('catalogId').equals(weaponEntry.id).toArray()).find((weapon) => weapon.equippedBy === ownedCharacter.id)
        ?? (await db.weapons.where('catalogId').equals(weaponEntry.id).toArray()).find((weapon) => !weapon.equippedBy)
      : undefined
    if (weaponEntry && !ownedWeapon) {
      ownedWeapon = { id: createLocalId(), catalogId: weaponEntry.id, level: candidate.buildCard?.weaponLevel.value ?? 1, rank: 1, locked: false, equippedBy: ownedCharacter?.id, createdAt: Date.now() }
      await db.weapons.add(ownedWeapon)
    } else if (ownedWeapon && ownedCharacter && candidate.buildCard) {
      await db.weapons.update(ownedWeapon.id, { level: candidate.buildCard.weaponLevel.value, equippedBy: ownedCharacter.id })
    }

    let build = characterEntry ? await db.builds.where('resonatorId').equals(characterEntry.id).first() : undefined
    if (characterEntry && ownedCharacter && !build) {
      build = {
        id: createLocalId(), name: `${characterEntry.name} build`, resonatorId: characterEntry.id,
        weaponId: ownedWeapon?.id ?? '', echoIds: [], level: ownedCharacter.level,
        skillLevel: candidate.buildCard?.skillLevels[1]?.value ?? 1
      }
      await db.builds.add(build)
    } else if (build && candidate.buildCard) {
      const patch = { weaponId: ownedWeapon?.id ?? build.weaponId, level: candidate.buildCard.characterLevel.value, skillLevel: candidate.buildCard.skillLevels[1]?.value ?? build.skillLevel }
      await db.builds.update(build.id, patch)
      build = { ...build, ...patch }
    }
    if (build && initializeBuildCard) {
      await db.echoes.where('equippedBy').equals(build.id).modify({ equippedBy: undefined, equippedByName: undefined })
      await db.builds.update(build.id, { echoIds: [] })
      build = { ...build, echoIds: [] }
    }

    const echo = candidateToEcho(candidate)
    const assignedToBuild = Boolean(build && build.echoIds.length < 5)
    echo.equippedByName = assignedToBuild || !build ? characterEntry?.name ?? (characterName || undefined) : undefined
    if (assignedToBuild && build) echo.equippedBy = build.id
    await db.echoes.add(echo)
    if (build && echo.equippedBy === build.id) await db.builds.update(build.id, { echoIds: [...build.echoIds, echo.id] })
    return echo
  })
  if (candidate.buildCard) initializedBuildCards.add(candidate.buildCard.id)
  return saved
}
