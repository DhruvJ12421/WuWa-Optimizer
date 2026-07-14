import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Echo } from '../domain/types'
import { candidateErrors, candidateToEcho, parseEchoText } from '../scanner/parser'
import { db } from '../storage/database'
import { StableFrameDetector } from '../scanner/stability'
import { probeEchoPanel } from '../scanner/capture'
import { captureScreenFrame, requestScreenSource, stopScreenSource } from '../scanner/sources/screen-source'
import { readScreenshot } from '../scanner/sources/screenshot-source'
import { LocalVideoSource, videoSampleTimes, type VideoTrim } from '../scanner/sources/video-source'
import { prepareScanFrame } from '../scanner/frame'
import { loadLatestCalibrationProfile } from '../scanner/calibration'
import { ScanSessionController } from '../scanner/session'
import { copyDiagnosticReport } from '../scanner/debug'
import type { CalibrationProfile, DiagnosticScanCandidate, OcrWorkerPreference, ScanSession, ScanSource } from '../scanner/types'
import { Icon, PageHeader, Panel } from './components'
import { ScanReviewCard } from './ScanReviewCard'
import { ScannerDebugOverlay } from './ScannerDebugOverlay'
import { ScannerCalibration } from './ScannerCalibration'
import { ScanSessionSummary } from './ScanSessionSummary'

const manualText = `Unknown Echo\nCost 1\n5 Star\nLv. 0\nUnknown Sonata\nATK % 18.0%`
type ReviewFilter = 'all' | 'valid' | 'error' | 'duplicate'

function feedbackTone(kind: 'new' | 'duplicate' | 'error') {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass(), oscillator = context.createOscillator(), gain = context.createGain()
  oscillator.frequency.value = kind === 'new' ? 720 : kind === 'duplicate' ? 420 : 220
  gain.gain.setValueAtTime(.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .13)
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .14)
  oscillator.addEventListener('ended', () => void context.close())
}

export function ScannerView({ echoes, refresh, scanIntervalMs, onSessionRiskChange }: { echoes: Echo[]; refresh: () => Promise<void>; scanIntervalMs: number; onSessionRiskChange?: (atRisk: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null), screenshotRef = useRef<HTMLInputElement>(null), videoFileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null), controllerRef = useRef<ScanSessionController | null>(null), detector = useRef(new StableFrameDetector())
  const videoSource = useRef(new LocalVideoSource()), candidatesRef = useRef<DiagnosticScanCandidate[]>([]), echoesRef = useRef(echoes)
  const [streaming, setStreaming] = useState(false), [videoScanning, setVideoScanning] = useState(false), [dropActive, setDropActive] = useState(false)
  const [candidates, setCandidates] = useState<DiagnosticScanCandidate[]>([]), [session, setSession] = useState<ScanSession>()
  const [progress, setProgress] = useState(0), [status, setStatus] = useState('Idle'), [error, setError] = useState('')
  const [workerPreference, setWorkerPreference] = useState<OcrWorkerPreference>('auto'), [debugVisible, setDebugVisible] = useState(false)
  const [profile, setProfile] = useState<CalibrationProfile | undefined>(() => loadLatestCalibrationProfile()), [calibrationImage, setCalibrationImage] = useState(''), [calibrating, setCalibrating] = useState(false)
  const [filter, setFilter] = useState<ReviewFilter>('all'), [audioFeedback, setAudioFeedback] = useState(false)
  const [videoTrim, setVideoTrim] = useState<VideoTrim>({ start: 0, end: 0, fps: 2 }), [videoDuration, setVideoDuration] = useState(0)
  const [videoEta, setVideoEta] = useState('')

  useEffect(() => { candidatesRef.current = candidates }, [candidates])
  useEffect(() => { echoesRef.current = echoes }, [echoes])
  useLayoutEffect(() => { onSessionRiskChange?.(streaming || videoScanning || candidates.length > 0 || session?.status === 'running' || session?.status === 'stopping') })

  const acceptCandidate = (candidate: DiagnosticScanCandidate) => {
    setCandidates((current) => [...current, candidate].sort((left, right) => (left.frameSequence ?? Number.MAX_SAFE_INTEGER) - (right.frameSequence ?? Number.MAX_SAFE_INTEGER)))
    if (audioFeedback) feedbackTone(candidate.duplicateOf ? 'duplicate' : candidateErrors(candidate).length ? 'error' : 'new')
  }
  const createController = async (source: ScanSource) => {
    if (controllerRef.current) await controllerRef.current.cancel()
    const controller = new ScanSessionController(source, {
      onCandidate: acceptCandidate, onSession: setSession,
      onProgress: (value, nextStatus) => { setProgress(value); setStatus(nextStatus) },
      getEchoes: () => echoesRef.current, getPending: () => candidatesRef.current
    }, workerPreference)
    controllerRef.current = controller
    return controller
  }

  const prepareCalibration = async (dataUrl: string, source: ScanSource) => {
    const prepared = await prepareScanFrame(dataUrl, source, controllerRef.current?.session.id ?? crypto.randomUUID(), 0, profile)
    setCalibrationImage(dataUrl); setProfile(prepared.profile)
    if (prepared.needsCalibration) setError(`No compatible ${prepared.frame.width}x${prepared.frame.height} ${prepared.frame.layout} calibration was found. Review and save the detected panel.`)
    return prepared.profile
  }

  const stopScreen = () => {
    if (streamRef.current) stopScreenSource(streamRef.current)
    streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null
    detector.current.reset(); setStreaming(false); controllerRef.current?.requestCompletion(); setStatus('Share ended')
  }
  const startScreen = async () => {
    setError('')
    try {
      const controller = await createController('screen'), stream = await requestScreenSource(); streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      const dataUrl = videoRef.current ? captureScreenFrame(videoRef.current) : undefined
      if (dataUrl) await prepareCalibration(dataUrl, 'screen')
      stream.getVideoTracks()[0].addEventListener('ended', stopScreen)
      detector.current.reset(); setStreaming(true); setStatus('Watching for stable Echo panels'); void controller
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Window sharing was cancelled.') }
  }

  useEffect(() => {
    if (!streaming) return
    const timer = window.setInterval(() => {
      const video = videoRef.current, controller = controllerRef.current; if (!video || !controller) return
      const probe = probeEchoPanel(video); if (!probe || !detector.current.observe(probe.fingerprint)) return
      const dataUrl = captureScreenFrame(video); if (dataUrl) void controller.enqueue(dataUrl, 'screen', profile).catch((caught) => setError(caught instanceof Error ? caught.message : 'Live scan failed.'))
    }, scanIntervalMs)
    return () => window.clearInterval(timer)
  }, [streaming, scanIntervalMs, profile])

  const scanCurrentFrame = async () => {
    const dataUrl = videoRef.current ? captureScreenFrame(videoRef.current) : undefined; if (!dataUrl) return
    const controller = controllerRef.current ?? await createController('screen'); await controller.enqueue(dataUrl, 'screen', profile)
  }
  const acceptScreenshot = async (file?: File) => {
    if (!file) return
    try {
      if (streaming) stopScreen()
      const dataUrl = await readScreenshot(file)
      const controller = controllerRef.current?.session.source === 'screenshot' && controllerRef.current.session.status === 'running' ? controllerRef.current : await createController('screenshot')
      const selectedProfile = await prepareCalibration(dataUrl, 'screenshot')
      setStatus('Screenshot queued'); await controller.enqueue(dataUrl, 'screenshot', selectedProfile)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid screenshot.') }
  }
  const openVideo = async (file?: File) => {
    if (!file) return
    try {
      if (streaming) stopScreen()
      const metadata = await videoSource.current.open(file); setVideoDuration(metadata.duration); setVideoTrim({ start: 0, end: metadata.duration, fps: 2 })
      const preview = await videoSource.current.seek(0); await prepareCalibration(preview, 'video'); setStatus('Video ready')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid video.') }
  }
  const scanVideo = async () => {
    setError(''); setVideoScanning(true); videoSource.current.resetCancellation()
    const controller = await createController('video'), times = videoSampleTimes(videoTrim), started = performance.now()
    try {
      for (let index = 0; index < times.length; index += 1) {
        if (!controllerRef.current || controllerRef.current.session.id !== controller.session.id) break
        const dataUrl = await videoSource.current.seek(times[index])
        await controller.enqueue(dataUrl, 'video', profile)
        const fraction = (index + 1) / Math.max(1, times.length), elapsed = performance.now() - started
        setProgress(fraction); setStatus(`Video frame ${index + 1} of ${times.length}`); setVideoEta(`${Math.max(0, elapsed / fraction - elapsed) / 1000 < 1 ? '<1' : Math.round((elapsed / fraction - elapsed) / 1000)}s remaining`)
      }
      controller.requestCompletion(); setStatus('Video scan complete')
    } catch (caught) { if (controller.session.status !== 'cancelled') setError(caught instanceof Error ? caught.message : 'Video scan failed.') }
    finally { setVideoScanning(false) }
  }
  const cancelVideo = () => { videoSource.current.cancel(); void controllerRef.current?.cancel(); setVideoScanning(false); setStatus('Video scan cancelled') }

  const addManual = async () => {
    const candidate = await parseEchoText(manualText, '', 'manual') as DiagnosticScanCandidate
    setCandidates((current) => [...current, candidate])
  }
  const updateCandidate = (updated: DiagnosticScanCandidate) => setCandidates((current) => current.map((candidate) => candidate.id === updated.id ? { ...updated, reviewState: candidate.reviewState === 'new' ? 'corrected' : candidate.reviewState } : candidate))
  const discard = (candidate: DiagnosticScanCandidate) => { controllerRef.current?.markRejected(); setCandidates((current) => current.filter((item) => item.id !== candidate.id)) }
  const save = async (candidate: DiagnosticScanCandidate) => {
    if (candidateErrors(candidate).length) return
    await db.echoes.add(candidateToEcho(candidate)); controllerRef.current?.markApproved(); setCandidates((current) => current.filter((item) => item.id !== candidate.id)); await refresh()
  }
  const selectedCandidates = candidates.filter((candidate) => candidate.selected)
  const approveSelected = async () => {
    for (const candidate of selectedCandidates.filter((item) => candidateErrors(item).length === 0 && !item.duplicateOf)) { await db.echoes.add(candidateToEcho(candidate)); controllerRef.current?.markApproved() }
    const approvedIds = new Set(selectedCandidates.filter((item) => candidateErrors(item).length === 0 && !item.duplicateOf).map((item) => item.id))
    setCandidates((current) => current.filter((item) => !approvedIds.has(item.id))); if (approvedIds.size) await refresh()
  }
  const discardSelected = () => { const ids = new Set(selectedCandidates.map((candidate) => candidate.id)); selectedCandidates.forEach(() => controllerRef.current?.markRejected()); setCandidates((current) => current.filter((candidate) => !ids.has(candidate.id))) }
  const rerunField = async (candidate: DiagnosticScanCandidate, regionId: string) => {
    try { const rescanned = await controllerRef.current?.rerunField(candidate, regionId); if (rescanned) updateCandidate({ ...rescanned, id: candidate.id, selected: candidate.selected }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Field retry failed.') }
  }

  useEffect(() => () => { if (streamRef.current) stopScreenSource(streamRef.current); videoSource.current.close(); void controllerRef.current?.cancel() }, [])

  const visibleCandidates = candidates.filter((candidate) => filter === 'all'
    || filter === 'duplicate' && Boolean(candidate.duplicateOf)
    || filter === 'error' && candidateErrors(candidate).length > 0
    || filter === 'valid' && !candidate.duplicateOf && candidateErrors(candidate).length === 0)

  return <>
    <PageHeader eyebrow="Capture lab / English only" title="Decode Echo details" description="Screenshots, game-window frames, videos, OCR evidence, and diagnostics stay on this device." actions={<div className="header-actions">{streaming ? <button className="danger" onClick={stopScreen}>Stop sharing</button> : <button className="primary" onClick={() => void startScreen()}><Icon name="scan"/>Share WuWa window</button>}<button className="secondary" onClick={() => screenshotRef.current?.click()}><Icon name="upload"/>Screenshot</button><button className="secondary" onClick={() => videoFileRef.current?.click()}>Video</button><input ref={screenshotRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void acceptScreenshot(file) }}/><input ref={videoFileRef} hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void openVideo(file) }}/></div>}/>
    <div className="scanner-controls"><label>OCR workers<select value={workerPreference} onChange={(event) => { const value = event.target.value === 'auto' ? 'auto' : Number(event.target.value) as 1 | 2 | 4; setWorkerPreference(value); controllerRef.current?.setWorkerPreference(value) }}><option value="auto">Auto</option><option value="1">1</option><option value="2">2</option><option value="4">4</option></select></label><label className="check"><input type="checkbox" checked={debugVisible} onChange={(event) => setDebugVisible(event.target.checked)}/>Debug boxes</label><label className="check"><input type="checkbox" checked={audioFeedback} onChange={(event) => setAudioFeedback(event.target.checked)}/>Local audio feedback</label>{profile && calibrationImage && <button className="text-button" onClick={() => setCalibrating((value) => !value)}>{calibrating ? 'Close calibration' : 'Calibrate panel'}</button>}</div>
    {calibrating && profile && calibrationImage && <ScannerCalibration imageDataUrl={calibrationImage} profile={profile} onChange={setProfile} onSaved={(saved) => { setProfile(saved); setError(''); setCalibrating(false); setStatus('Calibration profile saved locally') }}/>} 
    <div className="scanner-layout">
      <Panel className="capture-panel"><div className="capture-head"><div><span className={`live-dot ${streaming ? 'on' : ''}`}/><strong>{streaming ? 'Live window share' : 'Capture inactive'}</strong></div><span>{status}</span></div><div className={`video-stage ${streaming ? 'active' : ''}`}><video ref={videoRef} muted playsInline/>{streaming && profile && <div className="live-panel-overlay" style={{ left: `${profile.panelRect.x * 100}%`, top: `${profile.panelRect.y * 100}%`, width: `${profile.panelRect.width * 100}%`, height: `${profile.panelRect.height * 100}%` }}><ScannerDebugOverlay regions={profile.regions} visible={debugVisible}/></div>}{!streaming && <div className="stage-empty"><div className="scan-corners">⌗</div><h3>Select the WuWa window</h3><p>Chrome or Edge will ask what to share. Audio capture is disabled.</p></div>}</div><div className="capture-status"><div className="progress"><i style={{ width: `${progress * 100}%` }}/></div><span>{Math.round(progress * 100)}%</span><button className="text-button" disabled={!streaming} onClick={() => void scanCurrentFrame()}>Scan current frame</button></div>{error && <div className="notice error">{error}</div>}<div className="privacy-strip"><strong>Privacy boundary</strong><span>Frames → browser memory → local English OCR → mandatory review. No scan data is uploaded.</span></div></Panel>
      <Panel className={`drop-panel ${dropActive ? 'active' : ''}`} onDragOver={(event) => { event.preventDefault(); setDropActive(true) }} onDragLeave={() => setDropActive(false)} onDrop={(event) => { event.preventDefault(); setDropActive(false); const file = event.dataTransfer.files[0]; void (file?.type.startsWith('video/') ? openVideo(file) : acceptScreenshot(file)) }}><Icon name="upload"/><h3>Drop screenshot or video</h3><p>Images up to 20 MB. Videos are decoded and sampled locally.</p><button className="secondary" onClick={() => screenshotRef.current?.click()}>Choose screenshot</button><button className="text-button" onClick={() => void addManual()}>or enter an Echo manually</button></Panel>
    </div>
    {videoDuration > 0 && <Panel className="video-scan-controls"><header><div><span className="eyebrow">Local video scan</span><h3>Trim and sample</h3></div><span>{videoEta}</span></header><div className="video-trim"><label>Start {videoTrim.start.toFixed(1)}s<input type="range" min="0" max={videoDuration} step=".1" value={videoTrim.start} onChange={(event) => setVideoTrim((value) => ({ ...value, start: Math.min(Number(event.target.value), value.end) }))}/></label><label>End {videoTrim.end.toFixed(1)}s<input type="range" min="0" max={videoDuration} step=".1" value={videoTrim.end} onChange={(event) => setVideoTrim((value) => ({ ...value, end: Math.max(Number(event.target.value), value.start) }))}/></label><label>Sampling<select value={videoTrim.fps} onChange={(event) => setVideoTrim((value) => ({ ...value, fps: Number(event.target.value) as VideoTrim['fps'] }))}>{[1, 2, 5, 10].map((fps) => <option value={fps} key={fps}>{fps} fps</option>)}</select></label>{videoScanning ? <button className="danger" onClick={cancelVideo}>Cancel immediately</button> : <button className="primary" onClick={() => void scanVideo()}>Scan video</button>}</div></Panel>}
    <ScanSessionSummary session={session}/>
    <div className="section-heading review-heading"><div><span className="eyebrow">Human checkpoint</span><h2>Review queue <b>{candidates.length}</b></h2></div><p>Every result remains local and requires approval.</p></div>
    <div className="batch-review-toolbar"><div>{(['all', 'valid', 'error', 'duplicate'] as ReviewFilter[]).map((value) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div><span>{selectedCandidates.length} selected</span><button className="secondary" disabled={!selectedCandidates.length} onClick={() => void approveSelected()}>Approve selected</button><button className="text-button" disabled={!selectedCandidates.length} onClick={discardSelected}>Discard selected</button></div>
    {visibleCandidates.length ? <div className="review-list">{visibleCandidates.map((candidate) => <ScanReviewCard key={candidate.id} candidate={candidate} selected={candidate.selected} onSelect={(selected) => updateCandidate({ ...candidate, selected })} onChange={updateCandidate} onDiscard={() => discard(candidate)} onSave={() => void save(candidate)} onRerunField={(regionId) => void rerunField(candidate, regionId)} onMarkDuplicate={() => { controllerRef.current?.markDuplicate(); updateCandidate({ ...candidate, duplicateOf: candidate.duplicateOf ?? 'marked-local', reviewState: 'duplicate' }) }} onCopyDiagnostic={(includeImages) => void copyDiagnosticReport(candidate, includeImages)}/>)}</div> : <Panel className="empty-state compact"><h3>No scans in this filter</h3><p>New stable panels, screenshots, and video frames appear here.</p></Panel>}
  </>
}
