import { createWorker, type Worker } from 'tesseract.js'
import type { ScanCandidate } from '../domain/types'
import { parseEchoText } from './parser'

let workerPromise: Promise<Worker> | undefined
let progressListener: ((progress: number, status: string) => void) | undefined

function getWorker(onProgress?: (progress: number, status: string) => void) {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { logger: (message) => progressListener?.(message.progress, message.status) })
      .catch((error) => { workerPromise = undefined; throw error })
  }
  progressListener = onProgress
  return workerPromise
}

export async function scanEnglishEcho(imageDataUrl: string, source: ScanCandidate['source'], onProgress?: (progress: number, status: string) => void) {
  const worker = await getWorker(onProgress)
  try {
    const result = await worker.recognize(imageDataUrl)
    return parseEchoText(result.data.text, imageDataUrl, source)
  } finally {
    progressListener = undefined
  }
}

export async function stopOcr() {
  if (!workerPromise) return
  const worker = await workerPromise
  await worker.terminate()
  workerPromise = undefined
}
