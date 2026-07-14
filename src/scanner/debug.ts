import type { DiagnosticScanCandidate, ScanEvidence, ScanFrame } from './types'

const withoutImage = (evidence: ScanEvidence) => ({
  region: evidence.region, rawOcr: evidence.rawOcr, confidence: evidence.confidence,
  parsedValue: evidence.parsedValue, validation: evidence.validation, workerId: evidence.workerId,
  jobId: evidence.jobId, processingMs: evidence.processingMs, preprocessing: evidence.preprocessing
})

export function createDiagnosticReport(candidate: DiagnosticScanCandidate, frame?: ScanFrame, includeImages = false) {
  const evidence = Object.fromEntries(Object.entries(candidate.evidence ?? {}).map(([key, value]) => [key, includeImages ? value : withoutImage(value)]))
  return JSON.stringify({
    reportVersion: 1, generatedAt: new Date().toISOString(), localOnly: true,
    candidate: { ...candidate, imageDataUrl: includeImages ? candidate.imageDataUrl : undefined, evidence: undefined },
    frame: frame ? { ...frame, panelImageDataUrl: includeImages ? frame.panelImageDataUrl : undefined } : undefined,
    evidence
  }, null, 2)
}

export async function copyDiagnosticReport(candidate: DiagnosticScanCandidate, includeImages = false, frame?: ScanFrame) {
  await navigator.clipboard.writeText(createDiagnosticReport(candidate, frame, includeImages))
}
