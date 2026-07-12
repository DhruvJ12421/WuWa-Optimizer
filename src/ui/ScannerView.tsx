import { useEffect, useRef, useState } from 'react'
import { captureEchoPanel, cropScreenshot, fileToDataUrl, requestGameWindow, stopGameWindow } from '../scanner/capture'
import { scanEnglishEcho } from '../scanner/ocr'
import { candidateErrors, candidateToEcho, parseEchoText } from '../scanner/parser'
import { StableFrameDetector } from '../scanner/stability'
import { db } from '../storage/database'
import type { Echo, ScanCandidate } from '../domain/types'
import { Icon, PageHeader, Panel } from './components'
import { ScanReviewCard } from './ScanReviewCard'

const manualText = `Unknown Echo\nCost 1\n5 Star\nLv. 0\nUnknown Sonata\nATK % 18.0%`

export function ScannerView({ echoes, refresh, scanIntervalMs }: { echoes: Echo[]; refresh: () => Promise<void>; scanIntervalMs: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detector = useRef(new StableFrameDetector())
  const scanning = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [candidates, setCandidates] = useState<ScanCandidate[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Idle')
  const [error, setError] = useState('')
  const [dropActive, setDropActive] = useState(false)

  const markDuplicate = (candidate: ScanCandidate) => {
    const duplicate = echoes.find((echo) => echo.name === candidate.fields.name.value && echo.level === candidate.fields.level.value && echo.cost === candidate.fields.cost.value && echo.mainStat.key === candidate.fields.mainStat.value.key && echo.mainStat.value === candidate.fields.mainStat.value.value)
    return duplicate ? { ...candidate, duplicateOf: duplicate.id } : candidate
  }

  const runOcr = async (dataUrl: string, source: ScanCandidate['source']) => {
    if (scanning.current) { setError('Wait for the current English OCR pass to finish.'); return }
    scanning.current = true; setError(''); setProgress(0); setStatus('Loading English OCR...')
    try {
      const candidate = await scanEnglishEcho(dataUrl, source, (value, nextStatus) => { setProgress(value); setStatus(nextStatus) })
      setCandidates((current) => [markDuplicate(candidate), ...current])
      setStatus('Review required')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'OCR failed.'); setStatus('Scan failed') }
    finally { scanning.current = false }
  }

  const scanCurrentFrame = async () => {
    const video = videoRef.current
    if (!video) return
    const panel = captureEchoPanel(video)
    if (!panel) return
    if (!panel.calibrated) setError('The shared window is not 16:9. OCR will use the full frame; use screenshot import for better results.')
    detector.current.markScanned(panel.fingerprint)
    await runOcr(panel.dataUrl, 'screen')
  }

  useEffect(() => {
    if (!streaming) return
    const timer = window.setInterval(() => {
      if (scanning.current || !videoRef.current) return
      const panel = captureEchoPanel(videoRef.current)
      if (!panel) return
      if (detector.current.observe(panel.fingerprint)) void runOcr(panel.dataUrl, 'screen')
    }, Math.max(250, scanIntervalMs))
    return () => window.clearInterval(timer)
  }, [streaming, scanIntervalMs])

  useEffect(() => () => { if (streamRef.current) stopGameWindow(streamRef.current) }, [])

  const start = async () => {
    setError('')
    try {
      const stream = await requestGameWindow(); streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      stream.getVideoTracks()[0].addEventListener('ended', () => { setStreaming(false); setStatus('Share ended') })
      setStreaming(true); setStatus('Watching for a stable Echo panel')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Window sharing was cancelled.') }
  }
  const stop = () => { if (streamRef.current) stopGameWindow(streamRef.current); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; detector.current.reset(); setStreaming(false); setStatus('Share ended') }
  const acceptFile = async (file?: File) => {
    if (!file) return
    try {
      const prepared = await cropScreenshot(await fileToDataUrl(file))
      if (!prepared.calibrated) setError('This screenshot is not 16:9, so OCR is using the full image.')
      await runOcr(prepared.dataUrl, 'screenshot')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid screenshot.') }
  }
  const addManual = async () => {
    const candidate = await parseEchoText(manualText, '', 'manual')
    setCandidates((current) => [candidate, ...current])
  }
  const save = async (candidate: ScanCandidate) => {
    if (candidateErrors(candidate).length) return
    const duplicate = markDuplicate(candidate)
    await db.echoes.add(candidateToEcho(duplicate)); setCandidates((current) => current.filter((item) => item.id !== candidate.id)); await refresh()
  }
  const updateCandidate = (updated: ScanCandidate) => setCandidates((current) => current.map((candidate) => candidate.id === updated.id ? markDuplicate({ ...updated, duplicateOf: undefined }) : candidate))

  return <>
    <PageHeader eyebrow="Capture lab / English only" title="Decode Echo details" description="Share the game window or import screenshots. Every frame is processed locally and every result waits for your approval." actions={<div className="header-actions">{streaming ? <button className="danger" onClick={stop}>Stop sharing</button> : <button className="primary" onClick={() => void start()}><Icon name="scan"/>Share WuWa window</button>}<button className="secondary" onClick={() => fileRef.current?.click()}><Icon name="upload"/>Import</button><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void acceptFile(file) }}/></div>} />
    <div className="scanner-layout">
      <Panel className="capture-panel"><div className="capture-head"><div><span className={`live-dot ${streaming ? 'on' : ''}`}/><strong>{streaming ? 'Live window share' : 'Capture inactive'}</strong></div><span>{status}</span></div><div className={`video-stage ${streaming ? 'active' : ''}`}><video ref={videoRef} muted playsInline/><div className="crop-guide"><span>English Echo detail region</span></div>{!streaming && <div className="stage-empty"><div className="scan-corners">⌗</div><h3>Select the WuWa window</h3><p>Chrome or Edge will ask what to share. Audio is always disabled.</p></div>}</div><div className="capture-status"><div className="progress"><i style={{ width: `${progress * 100}%` }}/></div><span>{Math.round(progress * 100)}%</span><button className="text-button" disabled={!streaming || scanning.current} onClick={() => void scanCurrentFrame()}>Scan current frame</button></div>{error && <div className="notice error">{error}</div>}<div className="privacy-strip"><strong>Privacy boundary</strong><span>Frames → browser memory → English OCR → review. Nothing leaves this device.</span></div></Panel>
      <Panel className={`drop-panel ${dropActive ? 'active' : ''}`} onDragOver={(event) => { event.preventDefault(); setDropActive(true) }} onDragLeave={() => setDropActive(false)} onDrop={(event) => { event.preventDefault(); setDropActive(false); void acceptFile(event.dataTransfer.files[0]) }}><Icon name="upload"/><h3>Drop a screenshot</h3><p>PNG, JPEG, or WebP up to 20 MB.</p><button className="secondary" onClick={() => fileRef.current?.click()}>Choose file</button><button className="text-button" onClick={() => void addManual()}>or enter an Echo manually</button></Panel>
    </div>
    <div className="section-heading review-heading"><div><span className="eyebrow">Human checkpoint</span><h2>Review queue <b>{candidates.length}</b></h2></div><p>Low-confidence fields require correction before saving.</p></div>
    {candidates.length ? <div className="review-list">{candidates.map((candidate) => <ScanReviewCard key={candidate.id} candidate={candidate} onChange={updateCandidate} onDiscard={() => setCandidates((current) => current.filter((item) => item.id !== candidate.id))} onSave={() => save(candidate)}/>)}</div> : <Panel className="empty-state compact"><h3>No scans awaiting review</h3><p>New stable panels and imported screenshots appear here.</p></Panel>}
  </>
}
