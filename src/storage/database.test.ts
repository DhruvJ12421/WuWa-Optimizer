import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSeedData, exportAccount, importAccount, validateAccount } from './database'

describe('local account persistence', () => {
  beforeEach(async () => {
    db.close()
    await db.delete()
    await db.open()
  })

  afterAll(() => db.close())

  it('repairs missing seed records even when settings already exist', async () => {
    await ensureSeedData()
    await db.builds.clear()
    await ensureSeedData()
    expect(await db.builds.count()).toBe(3)
    expect(await db.teams.count()).toBe(1)
  })

  it('round-trips a versioned account document atomically', async () => {
    await ensureSeedData()
    const exported = await exportAccount()
    expect(validateAccount(exported)).toBe(true)
    await importAccount(exported)
    expect((await exportAccount()).builds).toHaveLength(3)
  })

  it('rejects malformed nested records', () => {
    expect(validateAccount({ schemaVersion: 1, gameDataVersion: 'x', exportedAt: '', echoes: [{ id: 'broken' }], builds: [], teams: [], settings: {} })).toBe(false)
  })
})
