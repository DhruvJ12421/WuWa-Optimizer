import { useEffect, useState } from 'react'
import { db, ensureSeedData, getSettings } from '../storage/database'
import type { AppSettings, Build, Echo, Team } from '../domain/types'
import { defaultSettings } from '../game-data'

export function useAppData() {
  const [echoes, setEchoes] = useState<Echo[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const [nextEchoes, nextBuilds, nextTeams, nextSettings] = await Promise.all([
      db.echoes.orderBy('createdAt').reverse().toArray(), db.builds.toArray(), db.teams.toArray(), getSettings()
    ])
    setEchoes(nextEchoes)
    setBuilds(nextBuilds)
    setTeams(nextTeams)
    setSettings(nextSettings)
  }

  useEffect(() => {
    ensureSeedData().then(refresh).catch((caught) => setError(caught instanceof Error ? caught.message : 'The local archive could not be opened.')).finally(() => setReady(true))
  }, [])

  return { echoes, builds, teams, settings, ready, error, refresh }
}
