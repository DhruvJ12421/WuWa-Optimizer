import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureSeedData, exportAccount, importAccount, requestPersistentStorage, validateAccount } from './database'

describe('local account persistence', () => {
  beforeEach(async () => {
    db.close()
    await db.delete()
    await db.open()
  })

  afterAll(() => db.close())

  it('creates settings without seeding fabricated builds or teams', async () => {
    await ensureSeedData()
    await db.builds.clear()
    await ensureSeedData()
    expect(await db.builds.count()).toBe(0)
    expect(await db.teams.count()).toBe(0)
  })

  it('round-trips a versioned account document atomically', async () => {
    await ensureSeedData()
    const exported = await exportAccount()
    expect(validateAccount(exported)).toBe(true)
    await importAccount(exported)
    expect((await exportAccount()).builds).toHaveLength(0)
  })

  it('rejects malformed nested records', () => {
    expect(validateAccount({ schemaVersion: 1, gameDataVersion: 'x', exportedAt: '', echoes: [{ id: 'broken' }], builds: [], teams: [], settings: {} })).toBe(false)
  })

  it('requests persistent browser storage when it is not already granted', async () => {
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persisted, persist } })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persisted).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
