import { useEffect, useRef, useState } from 'react'
import { resonators, sonataNames, statLabels, weapons } from '../game-data'
import { db } from '../storage/database'
import type { Build, Echo, OptimizerObjective, OptimizerResult, OptimizerStatKey } from '../domain/types'
import { EchoMiniCard, formatStat, Icon, PageHeader, Panel } from './components'

type WorkerResponse = { requestId: string; results?: OptimizerResult[]; error?: string }

export function OptimizerView({ echoes, builds, refresh, openScanner }: { echoes: Echo[]; builds: Build[]; refresh: () => Promise<void>; openScanner: () => void }) {
  const [buildId, setBuildId] = useState(builds[0]?.id ?? '')
  const [objective, setObjective] = useState<OptimizerObjective>('expected')
  const [attackId, setAttackId] = useState('')
  const [sonata, setSonata] = useState('')
  const [minCrit, setMinCrit] = useState(0)
  const [minEnergy, setMinEnergy] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState(100)
  const [enemyResistance, setEnemyResistance] = useState(10)
  const [results, setResults] = useState<OptimizerResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const workerRef = useRef<Worker | null>(null)
  const build = builds.find((item) => item.id === buildId) ?? builds[0]
  const resonator = resonators.find((item) => item.id === build?.resonatorId)
  const weapon = weapons.find((item) => item.id === build?.weaponId)
  const attack = resonator?.attacks.find((item) => item.id === attackId) ?? resonator?.attacks[0]

  useEffect(() => () => workerRef.current?.terminate(), [])
  useEffect(() => { setAttackId(resonator?.attacks[0]?.id ?? ''); setResults([]); setError('') }, [resonator?.id])

  const cancel = () => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false) }
  const run = () => {
    if (!build || !resonator || !weapon || !attack) return
    if (echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build.id)).length < 5) { setError('At least five available Echoes are required.'); return }
    cancel(); setResults([]); setError(''); setMessage(''); setRunning(true)
    const requestId = crypto.randomUUID()
    const worker = new Worker(new URL('../workers/optimizer.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId) return
      if (event.data.error) setError(event.data.error)
      const nextResults = event.data.results ?? []
      if (!event.data.error && !nextResults.length) setError('No loadout satisfies the current cost, lock, Sonata, and minimum-stat constraints.')
      setResults(nextResults); setRunning(false); worker.terminate(); workerRef.current = null
    }
    worker.onerror = () => { setError('The optimizer worker stopped unexpectedly.'); setRunning(false); worker.terminate(); workerRef.current = null }
    worker.postMessage({
      requestId,
      echoes: echoes.map((echo) => echo.equippedBy === build.id ? { ...echo, equippedBy: undefined } : echo),
      resonator, weapon, attack, enemy: { level: Math.min(200, Math.max(1, enemyLevel)), resistance: Math.min(100, Math.max(-100, enemyResistance)), damageReduction: 0 },
      objective, minimumStats: { ...(minCrit ? { critRate: minCrit } : {}), ...(minEnergy ? { energyRegen: minEnergy } : {}) }, requiredSonata: sonata || undefined, limit: 20
    })
  }

  const apply = async (result: OptimizerResult) => {
    if (!build) return
    const unavailable = result.echoIds.some((id) => { const echo = echoes.find((item) => item.id === id); return !echo || (echo.equippedBy && echo.equippedBy !== build.id) })
    if (unavailable) { setError('Inventory assignments changed after this search. Run the optimizer again.'); return }
    await db.transaction('rw', db.builds, db.echoes, async () => {
      for (const id of build.echoIds) await db.echoes.update(id, { equippedBy: undefined })
      for (const id of result.echoIds) await db.echoes.update(id, { equippedBy: build.id })
      await db.builds.update(build.id, { echoIds: result.echoIds })
    })
    await refresh(); setMessage('Optimizer result equipped.')
  }

  return <>
    <PageHeader eyebrow="Combinatorial engine" title="Echo optimizer" description="Search a bounded candidate pool off the main thread, enforce account constraints, and compare the strongest complete loadouts." actions={running ? <button className="danger" onClick={cancel}>Cancel search</button> : <button className="primary" onClick={run}><Icon name="optimize"/>Run optimization</button>} />
    <div className="optimizer-layout"><Panel className="optimizer-config"><div className="section-heading"><div><span className="eyebrow">Search target</span><h2>Configuration</h2></div></div><label>Character build<select value={build?.id} onChange={(event) => setBuildId(event.target.value)}>{builds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Damage action<select value={attack?.id} onChange={(event) => setAttackId(event.target.value)}>{resonator?.attacks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Objective<select value={objective} onChange={(event) => setObjective(event.target.value as OptimizerObjective)}><option value="expected">Expected hit damage</option><option value="normal">Normal hit damage</option><option value="critical">Critical hit damage</option><option value="atk">ATK</option><option value="hp">HP</option><option value="critRate">Crit. Rate</option><option value="critDamage">Crit. DMG</option><option value="energyRegen">Energy Regen</option></select></label><label>Required 5-piece Sonata<select value={sonata} onChange={(event) => setSonata(event.target.value)}><option value="">Any Sonata</option>{sonataNames.map((name) => <option key={name}>{name}</option>)}</select></label><div className="field-row"><label>Enemy level<input type="number" min="1" max="200" value={enemyLevel} onChange={(event) => setEnemyLevel(Number(event.target.value))}/></label><label>Resistance %<input type="number" min="-100" max="100" value={enemyResistance} onChange={(event) => setEnemyResistance(Number(event.target.value))}/></label></div><label>Minimum Crit. Rate <span>{minCrit}%</span><input type="range" min="0" max="100" value={minCrit} onChange={(event) => setMinCrit(Number(event.target.value))}/></label><label>Minimum Energy Regen <span>{minEnergy || 100}%</span><input type="range" min="0" max="250" value={minEnergy} onChange={(event) => setMinEnergy(Number(event.target.value))}/></label><div className="config-note"><strong>{echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build?.id)).length}</strong><span>available candidates</span><small>Top 28 pieces per cost enter the bounded search. Locked pieces are mandatory. Results are deterministic but the bounded pool is not a proof of the global optimum.</small></div>{error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}</Panel>
      <div className="optimizer-results">{running && <Panel className="searching"><div className="orbit"><i/><i/><i/></div><h2>Evaluating loadouts</h2><p>The UI stays responsive while a dedicated worker explores candidates.</p></Panel>}{!running && !results.length && <Panel className="empty-state"><div className="empty-glyph">◎</div><h2>{echoes.length < 5 ? 'Your archive needs more Echoes' : 'Ready to search'}</h2><p>{echoes.length < 5 ? 'Scan or enter at least five available pieces.' : 'Configure constraints, then run the optimizer.'}</p>{echoes.length < 5 && <button className="secondary" onClick={openScanner}>Open scanner</button>}</Panel>}{results.map((result, index) => <Panel className="result-card" key={result.echoIds.join('-')}><div className="result-rank"><span>#{String(index + 1).padStart(2, '0')}</span><div><small>{objective === 'expected' ? 'EXPECTED DAMAGE' : String(objective).toUpperCase()}</small><strong>{Math.round(result.score).toLocaleString('en-US')}</strong></div><button className="secondary" onClick={() => apply(result)}>Equip build</button></div><div className="result-stats">{(['atk', 'critRate', 'critDamage', 'energyRegen'] as OptimizerStatKey[]).map((key) => <div key={key}><span>{statLabels[key]}</span><b>{formatStat(key, result.stats[key])}</b></div>)}</div><div className="result-echoes">{result.echoIds.map((id) => { const echo = echoes.find((item) => item.id === id); return echo ? <EchoMiniCard key={id} echo={echo}/> : null })}</div></Panel>)}</div>
    </div>
  </>
}
