import type { ScanCandidate } from '../domain/types'
import { OcrPool } from './ocr-pool'
import { parseEchoText } from './parser'
import { recognizeVisualFields } from './visual'
import type { ScanRegion } from './types'

const fullPanel: ScanRegion = { id: 'legacy-full-panel', kind: 'name', label: 'Full panel', rect: { x: 0, y: 0, width: 1, height: 1 }, recognition: 'text' }
let progressListener: ((progress: number, status: string) => void) | undefined
let pool = new OcrPool({ onProgress: (progress, status) => progressListener?.(progress, status) })

export async function warmEnglishOcr(onProgress?: (progress: number, status: string) => void) {
  progressListener = onProgress
  await pool.warm()
}

// Compatibility path for callers that do not yet provide calibrated regions.
// The session scanner uses recognizeFrame() and keeps this full-panel path only as a fallback.
export async function scanEnglishEcho(imageDataUrl: string, source: ScanCandidate['source'], onProgress?: (progress: number, status: string) => void) {
  progressListener = onProgress
  try {
    const [result, visual] = await Promise.all([pool.recognize(imageDataUrl, fullPanel), recognizeVisualFields(imageDataUrl)])
    return parseEchoText(result.text, imageDataUrl, source, visual)
  } finally { progressListener = undefined }
}

export async function stopOcr() {
  await pool.terminate()
  pool = new OcrPool({ onProgress: (progress, status) => progressListener?.(progress, status) })
}

