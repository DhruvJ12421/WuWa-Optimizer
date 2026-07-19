import { useEffect, useMemo, useRef, useState } from 'react'
import { sonataNames, statLabels } from '../game-data'
import { setBuildEchoIds } from '../storage/database'
import type { Build, Echo, OptimizerObjective, OptimizerResult, OptimizerStatKey, OwnedCharacter, OwnedWeapon } from '../domain/types'
import { characterFormulaSheets, createBuildCalculationContext, FormulaCalculator, resolveRuntimeBuild } from '../domain/calculation'
import { createLocalId } from '../domain/id'
import { EchoMiniCard, formatStat, Icon, Panel } from './components'
import { CalculatedValue, traceCalculationDetail } from './CalculationDetails'
import { runtimeStatDetail } from './calculation-detail-model'

type WorkerResponse = { requestId: string; results?: OptimizerResult[]; error?: string }

export function OptimizerView({ echoes, builds, characters, ownedWeapons, refresh, openScanner, buildId, initialEnemyLevel = 100, initialEnemyResistance = 10 }: { echoes: Echo[]; builds: Build[]; characters: OwnedCharacter[]; ownedWeapons: OwnedWeapon[]; refresh: () => Promise<void>; openScanner: () => void; buildId: string; initialEnemyLevel?: number; initialEnemyResistance?: number }) {
  const [objective, setObjective] = useState<OptimizerObjective>('expected')
  const [attackId, setAttackId] = useState('')
  const [sonata, setSonata] = useState('')
  const [minCrit, setMinCrit] = useState(0)
  const [minEnergy, setMinEnergy] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState(initialEnemyLevel)
  const [enemyResistance, setEnemyResistance] = useState(initialEnemyResistance)
  const [results, setResults] = useState<OptimizerResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const workerRef = useRef<Worker | null>(null)
  const build = builds.find((item) => item.id === buildId) ?? builds[0]
  const runtime = useMemo(() => build ? resolveRuntimeBuild(build, characters, ownedWeapons) : undefined, [build, characters, ownedWeapons])
  const resonator = runtime?.resonator
  const weapon = runtime?.runtimeWeapon
  const formulaSheet = characterFormulaSheets.find((sheet) => sheet.id === resonator?.id)
  const attack = resonator?.attacks.find((item) => item.id === attackId) ?? resonator?.attacks[0]
  const formulaTarget = formulaSheet?.targets.find((target) => target.id === `${resonator?.id}:${attack?.id}`) ?? formulaSheet?.targets[0]
  const detailForResult = (result: OptimizerResult) => {
    const resultEchoes = result.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo))
    if (objective !== 'normal' && objective !== 'critical' && objective !== 'expected') return resonator && weapon
      ? runtimeStatDetail(resonator, weapon, resultEchoes, objective, result.score)
      : { title: String(objective), value: String(result.score), rows: [{ label: 'Optimizer result', value: String(result.score) }] }
    if (!build || !runtime || !formulaTarget) return { title: `${attack?.name ?? 'Formula target'} · ${objective}`, value: String(result.score), rows: [{ label: 'Optimizer result', value: String(result.score) }] }
    const enemy = { level: Math.min(200, Math.max(1, enemyLevel)), resistance: Math.min(100, Math.max(-100, enemyResistance)), damageReduction: 0 }
    const snapshot = new FormulaCalculator(createBuildCalculationContext({ build, character: runtime.character, weapon: runtime.weapon, echoes: resultEchoes, enemy })).evaluate(formulaTarget[objective])
    return traceCalculationDetail(snapshot.trace, `${formulaTarget.label} · ${objective}`)
  }

  useEffect(() => () => workerRef.current?.terminate(), [])
  useEffect(() => { setAttackId(resonator?.attacks[0]?.id ?? ''); setResults([]); setError('') }, [resonator?.id])

  const cancel = () => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false) }
  const run = () => {
    if (!build || !resonator || !weapon || !attack) return
    if (echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build.id)).length < 5) { setError('At least five available Echoes are required.'); return }
    cancel(); setResults([]); setError(''); setMessage(''); setRunning(true)
    const requestId = createLocalId()
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
    const enemy = { level: Math.min(200, Math.max(1, enemyLevel)), resistance: Math.min(100, Math.max(-100, enemyResistance)), damageReduction: 0 }
    const baseContext = runtime ? createBuildCalculationContext({ build, character: runtime.character, weapon: runtime.weapon, echoes: build.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo)), enemy }) : undefined
    const mode = objective === 'normal' || objective === 'critical' || objective === 'expected' ? objective : undefined
    worker.postMessage({
      requestId,
      echoes: echoes.map((echo) => echo.equippedBy === build.id ? { ...echo, equippedBy: undefined } : echo),
      resonator, weapon, attack, enemy,
      objective, minimumStats: { ...(minCrit ? { critRate: minCrit } : {}), ...(minEnergy ? { energyRegen: minEnergy } : {}) }, requiredSonata: sonata || undefined, limit: 20, includeEquippedBy: build.id,
      formula: mode && formulaTarget && baseContext ? { target: { id: formulaTarget.id, label: formulaTarget.label, kind: formulaTarget.kind, mode }, node: formulaTarget[mode], inputs: baseContext.inputs, entries: baseContext.entries } : undefined
    })
  }

  const apply = async (result: OptimizerResult) => {
    if (!build) return
    const unavailable = result.echoIds.some((id) => { const echo = echoes.find((item) => item.id === id); return !echo || (echo.equippedBy && echo.equippedBy !== build.id) })
    if (unavailable) { setError('Inventory assignments changed after this search. Run the optimizer again.'); return }
    await setBuildEchoIds(build.id, result.echoIds)
    await refresh(); setMessage('Optimizer result equipped.')
  }

  return <section className="tw-optimizer-workspace">
    <header className="tw-optimizer-heading tw-panel"><div><span className="eyebrow">Formula-driven search</span><h2>Echo optimizer</h2><p>Optimize this team member's build against the current team enemy. Completed searches are exact; capped searches are labeled best found.</p></div>{running ? <button className="danger" onClick={cancel}>Cancel search</button> : <button className="primary" onClick={run}><Icon name="optimize"/>Run optimization</button>}</header>
    <div className="optimizer-layout"><Panel className="optimizer-config"><div className="section-heading"><div><span className="eyebrow">Search target</span><h2>Configuration</h2></div></div><div className="optimizer-build-context"><span>Character build</span><strong>{build?.name ?? 'Unavailable build'}</strong></div><label>Formula target<select value={attack?.id} onChange={(event) => setAttackId(event.target.value)}>{resonator?.attacks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Objective<select value={objective} onChange={(event) => setObjective(event.target.value as OptimizerObjective)}><option value="expected">Average damage</option><option value="normal">Non-CRIT damage</option><option value="critical">CRIT damage</option><option value="atk">ATK</option><option value="hp">HP</option><option value="critRate">Crit. Rate</option><option value="critDamage">Crit. DMG</option><option value="energyRegen">Energy Regen</option></select></label><label>Required 5-piece Sonata<select value={sonata} onChange={(event) => setSonata(event.target.value)}><option value="">Any Sonata</option>{sonataNames.map((name) => <option key={name}>{name}</option>)}</select></label><div className="field-row"><label>Enemy level<input type="number" min="1" max="200" value={enemyLevel} onChange={(event) => setEnemyLevel(Number(event.target.value))}/></label><label>Resistance %<input type="number" min="-100" max="100" value={enemyResistance} onChange={(event) => setEnemyResistance(Number(event.target.value))}/></label></div><label>Minimum Crit. Rate <span>{minCrit}%</span><input type="range" min="0" max="100" value={minCrit} onChange={(event) => setMinCrit(Number(event.target.value))}/></label><label>Minimum Energy Regen <span>{minEnergy || 100}%</span><input type="range" min="0" max="250" value={minEnergy} onChange={(event) => setMinEnergy(Number(event.target.value))}/></label><div className="config-note"><strong>{echoes.filter((echo) => !echo.excluded && (!echo.equippedBy || echo.equippedBy === build?.id)).length}</strong><span>available candidates</span><small>All legal candidates are considered. Locked pieces are mandatory. Capped searches are explicitly marked best found.</small></div>{error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}</Panel>
      <div className="optimizer-results">{running && <Panel className="searching"><div className="orbit"><i/><i/><i/></div><h2>Evaluating loadouts</h2><p>The UI stays responsive while a dedicated worker explores candidates.</p></Panel>}{!running && !results.length && <Panel className="empty-state"><div className="empty-glyph">◎</div><h2>{echoes.length < 5 ? 'Your archive needs more Echoes' : 'Ready to search'}</h2><p>{echoes.length < 5 ? 'Scan or enter at least five available pieces.' : 'Configure constraints, then run the optimizer.'}</p>{echoes.length < 5 && <button className="secondary" onClick={openScanner}>Open scanner</button>}</Panel>}{results.map((result, index) => { const resultEchoes = result.echoIds.map((id) => echoes.find((echo) => echo.id === id)).filter((echo): echo is Echo => Boolean(echo)); return <Panel className="result-card" key={result.echoIds.join('-')}><div className="result-rank"><span>#{String(index + 1).padStart(2, '0')}</span><div><small>{objective === 'expected' ? 'EXPECTED DAMAGE' : String(objective).toUpperCase()}</small><CalculatedValue detail={detailForResult(result)}><strong>{Math.round(result.score).toLocaleString('en-US')}</strong></CalculatedValue></div><button className="secondary" onClick={() => apply(result)}>Equip build</button></div><div className="result-stats">{(['atk', 'critRate', 'critDamage', 'energyRegen'] as OptimizerStatKey[]).map((key) => <div key={key}><span>{statLabels[key]}</span>{resonator && weapon ? <CalculatedValue detail={runtimeStatDetail(resonator, weapon, resultEchoes, key, result.stats[key])}><b>{formatStat(key, result.stats[key])}</b></CalculatedValue> : <b>{formatStat(key, result.stats[key])}</b>}</div>)}</div><div className="result-echoes">{resultEchoes.map((echo) => <EchoMiniCard key={echo.id} echo={echo}/>)}</div></Panel> })}</div>
    </div>
  </section>
}
