import { candidateErrors, parseEchoText } from './parser'
import { recognizeVisualFields } from './visual'
import type { CalibrationProfile, DiagnosticScanCandidate, ScanEvidence, ScanFrame, ScanRegion } from './types'
import { PreprocessClient } from './preprocess'
import { OcrPool } from './ocr-pool'

const syntheticFullPanelRegion: ScanRegion = {
  id: 'full-panel-fallback', kind: 'name', label: 'Full panel fallback',
  rect: { x: 0, y: 0, width: 1, height: 1 }, recognition: 'text'
}

function assembledRegionalText(profile: CalibrationProfile, rawByRegion: Map<string, string>) {
  const lines: string[] = []
  for (const region of profile.regions) {
    if (region.kind === 'main-stat-value') continue
    if (region.kind === 'main-stat-label') {
      const label = rawByRegion.get(region.id)?.trim(), value = rawByRegion.get('main-stat-value')?.trim()
      if (label || value) lines.push(`${label ?? ''} ${value ?? ''}`.trim())
      continue
    }
    const text = rawByRegion.get(region.id)?.trim(); if (text) lines.push(text)
  }
  return lines.join('\n')
}

const parsedValueFor = (candidate: DiagnosticScanCandidate, region: ScanRegion): unknown => {
  if (region.kind === 'name') return candidate.fields.name.value
  if (region.kind === 'level') return candidate.fields.level.value
  if (region.kind === 'cost') return candidate.fields.cost.value
  if (region.kind === 'rarity') return candidate.fields.rarity.value
  if (region.kind === 'sonata') return candidate.fields.sonata.value
  if (region.kind === 'main-stat-label') return candidate.fields.mainStat.value.key
  if (region.kind === 'main-stat-value') return candidate.fields.mainStat.value.value
  if (region.kind === 'substat-row') return candidate.fields.subStats[region.index ?? 0]?.value
  if (region.kind === 'equipped-character') return candidate.fields.equippedBy.value
  if (region.kind === 'locked') return candidate.fields.locked.value
  if (region.kind === 'discarded') return candidate.fields.excluded.value
}

const confidenceFor = (candidate: DiagnosticScanCandidate, region: ScanRegion) => {
  if (region.kind === 'name') return candidate.fields.name.confidence
  if (region.kind === 'level') return candidate.fields.level.confidence
  if (region.kind === 'cost') return candidate.fields.cost.confidence
  if (region.kind === 'rarity') return candidate.fields.rarity.confidence
  if (region.kind === 'sonata') return candidate.fields.sonata.confidence
  if (region.kind === 'main-stat-label' || region.kind === 'main-stat-value') return candidate.fields.mainStat.confidence
  if (region.kind === 'substat-row') return candidate.fields.subStats[region.index ?? 0]?.confidence ?? 0
  if (region.kind === 'equipped-character') return candidate.fields.equippedBy.confidence
  if (region.kind === 'locked') return candidate.fields.locked.confidence
  return candidate.fields.excluded.confidence
}

function validateEvidence(candidate: DiagnosticScanCandidate, region: ScanRegion) {
  const value = parsedValueFor(candidate, region)
  const messages: string[] = []
  if (value === undefined || value === '' || value === 'Unknown Echo' || value === 'Unknown Sonata') messages.push(`${region.label} was not recognized.`)
  if (confidenceFor(candidate, region) < .55) messages.push(`${region.label} has low confidence.`)
  return { valid: messages.length === 0, messages }
}

export interface RecognizeFrameOptions {
  onStage?: (progress: number, status: string) => void
}

export async function recognizeFrame(
  frame: ScanFrame,
  profile: CalibrationProfile,
  pool: OcrPool,
  preprocess: PreprocessClient,
  options: RecognizeFrameOptions = {}
): Promise<DiagnosticScanCandidate> {
  const started = performance.now()
  const textResults = new Map<string, { text: string; confidence: number; workerId: string; jobId: string; processingMs: number }>()
  const crops = new Map<string, { original: string; processed: string; preprocessing: string }>()
  let completed = 0
  const sonataRect = profile.regions.find((region) => region.kind === 'sonata')?.rect
  const visualPromise = recognizeVisualFields(frame.panelImageDataUrl, sonataRect)
  await Promise.all(profile.regions.map(async (region) => {
    const original = await preprocess.process(frame.panelImageDataUrl, { ...region, recognition: 'visual' })
    const processed = region.recognition === 'visual' ? original : await preprocess.process(frame.panelImageDataUrl, region)
    crops.set(region.id, { original: original.dataUrl, processed: processed.dataUrl, preprocessing: processed.strategy })
    if (region.recognition !== 'visual') textResults.set(region.id, await pool.recognize(processed.blob, region, `${frame.sessionId}:${frame.sequence}:${region.id}`))
    completed += 1
    options.onStage?.(completed / profile.regions.length * .82, `Recognized ${region.label}`)
  }))

  const orderedText = assembledRegionalText(profile, new Map([...textResults].map(([key, value]) => [key, value.text])))
  const visual = await visualPromise
  let candidate = await parseEchoText(orderedText, frame.panelImageDataUrl, frame.source === 'manual' ? 'manual' : frame.source, visual) as DiagnosticScanCandidate
  if (candidateErrors(candidate).length || candidate.fields.name.confidence < .7) {
    options.onStage?.(.86, 'Running full-panel fallback')
    const fallback = await pool.recognize(frame.panelImageDataUrl, syntheticFullPanelRegion, `${frame.sessionId}:${frame.sequence}:fallback`)
    candidate = await parseEchoText(`${orderedText}\n${fallback.text}`, frame.panelImageDataUrl, frame.source === 'manual' ? 'manual' : frame.source, visual) as DiagnosticScanCandidate
  }
  candidate.sessionId = frame.sessionId
  candidate.frameSequence = frame.sequence
  candidate.reviewState = 'new'
  candidate.evidence = {}
  for (const region of profile.regions) {
    const result = textResults.get(region.id)
    const crop = crops.get(region.id)
    const evidence: ScanEvidence = {
      region, originalCrop: crop?.original ?? '', processedCrop: crop?.processed ?? '', rawOcr: result?.text ?? '',
      confidence: confidenceFor(candidate, region), parsedValue: parsedValueFor(candidate, region), validation: validateEvidence(candidate, region),
      workerId: result?.workerId ?? 'visual-classifier', jobId: result?.jobId ?? `${frame.sessionId}:${frame.sequence}:${region.id}`,
      processingMs: result?.processingMs ?? Math.max(0, performance.now() - started), preprocessing: crop?.preprocessing ?? 'visual'
    }
    candidate.evidence[region.id] = evidence
  }
  options.onStage?.(1, 'Candidate ready for review')
  return candidate
}

export async function rerunRegion(
  frame: ScanFrame,
  profile: CalibrationProfile,
  candidate: DiagnosticScanCandidate,
  regionId: string,
  pool: OcrPool,
  preprocess: PreprocessClient,
  onStage?: (progress: number, status: string) => void
) {
  const region = profile.regions.find((entry) => entry.id === regionId)
  if (!region) throw new Error('The selected field region is not available in this calibration profile.')
  onStage?.(.1, `Reprocessing ${region.label}`)
  const original = await preprocess.process(frame.panelImageDataUrl, { ...region, recognition: 'visual' })
  const processed = region.recognition === 'visual' ? original : await preprocess.process(frame.panelImageDataUrl, region)
  const recognition = region.recognition === 'visual' ? undefined : await pool.recognize(processed.blob, region, `${frame.sessionId}:${frame.sequence}:${region.id}:retry`)
  const rawByRegion = new Map(profile.regions.map((entry) => [entry.id, candidate.evidence?.[entry.id]?.rawOcr ?? '']))
  if (recognition) rawByRegion.set(region.id, recognition.text)
  const visual = region.recognition === 'visual' ? await recognizeVisualFields(frame.panelImageDataUrl, profile.regions.find((entry) => entry.kind === 'sonata')?.rect) : {
    rarity: candidate.fields.rarity, sonata: candidate.fields.sonata, locked: candidate.fields.locked, excluded: candidate.fields.excluded
  }
  const reparsed = await parseEchoText(assembledRegionalText(profile, rawByRegion), frame.panelImageDataUrl, candidate.source, visual) as DiagnosticScanCandidate
  const fields = { ...candidate.fields }
  if (region.kind === 'name') fields.name = reparsed.fields.name
  else if (region.kind === 'level') fields.level = reparsed.fields.level
  else if (region.kind === 'cost') fields.cost = reparsed.fields.cost
  else if (region.kind === 'rarity') fields.rarity = reparsed.fields.rarity
  else if (region.kind === 'sonata') fields.sonata = reparsed.fields.sonata
  else if (region.kind === 'main-stat-label' || region.kind === 'main-stat-value') fields.mainStat = reparsed.fields.mainStat
  else if (region.kind === 'equipped-character') fields.equippedBy = reparsed.fields.equippedBy
  else if (region.kind === 'locked') fields.locked = reparsed.fields.locked
  else if (region.kind === 'discarded') fields.excluded = reparsed.fields.excluded
  else if (region.kind === 'substat-row') {
    const subStats = [...candidate.fields.subStats], replacement = reparsed.fields.subStats[region.index ?? 0]
    if (replacement) subStats[region.index ?? 0] = replacement
    fields.subStats = subStats
  }
  const updated = { ...candidate, fields, reviewState: 'corrected' as const, evidence: { ...candidate.evidence } }
  updated.evidence![region.id] = {
    region, originalCrop: original.dataUrl, processedCrop: processed.dataUrl, rawOcr: recognition?.text ?? '',
    confidence: confidenceFor(updated, region), parsedValue: parsedValueFor(updated, region), validation: validateEvidence(updated, region),
    workerId: recognition?.workerId ?? 'visual-classifier', jobId: recognition?.jobId ?? `${frame.sessionId}:${frame.sequence}:${region.id}:retry`,
    processingMs: recognition?.processingMs ?? 0, preprocessing: processed.strategy
  }
  onStage?.(1, `${region.label} updated`)
  return updated
}
