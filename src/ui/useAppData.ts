import { useEffect, useState } from 'react'
import { db, ensureSeedData, getSettings, requestPersistentStorage } from '../storage/database'
import type { AppSettings, Build, Echo, OwnedCharacter, OwnedWeapon, Team } from '../domain/types'
import { defaultSettings } from '../game-data'

export function useAppData() {
  const [echoes, setEchoes] = useState<Echo[]>([])
  const [characters, setCharacters] = useState<OwnedCharacter[]>([])
  const [weapons, setWeapons] = useState<OwnedWeapon[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const [nextEchoes, nextCharacters, nextWeapons, nextBuilds, nextTeams, nextSettings] = await Promise.all([
      db.echoes.orderBy('createdAt').reverse().toArray(), db.characters.orderBy('createdAt').reverse().toArray(), db.weapons.orderBy('createdAt').reverse().toArray(), db.builds.toArray(), db.teams.toArray(), getSettings()
    ])
    setEchoes(nextEchoes)
    setCharacters(nextCharacters)
    setWeapons(nextWeapons)
    setBuilds(nextBuilds)
    setTeams(nextTeams)
    setSettings(nextSettings)
  }

  useEffect(() => {
    void requestPersistentStorage().catch(() => undefined)
    ensureSeedData().then(refresh).catch((caught) => setError(caught instanceof Error ? caught.message : 'The local archive could not be opened.')).finally(() => setReady(true))
  }, [])

  return { echoes, characters, weapons, builds, teams, settings, ready, error, refresh }
}
