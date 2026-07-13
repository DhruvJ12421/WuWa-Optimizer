import { createWorker, type Worker } from 'tesseract.js'
import type { ScanCandidate } from '../domain/types'
import { parseEchoText } from './parser'
import { recognizeVisualFields } from './visual'

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

export async function warmEnglishOcr(onProgress?: (progress: number, status: string) => void) {
  await getWorker(onProgress)
}

export async function scanEnglishEcho(imageDataUrl: string, source: ScanCandidate['source'], onProgress?: (progress: number, status: string) => void) {
  const worker = await getWorker(onProgress)
  try {
    const [result, visual] = await Promise.all([worker.recognize(imageDataUrl), recognizeVisualFields(imageDataUrl)])
    const firstPass = await parseEchoText(result.data.text, imageDataUrl, source, visual)
    if (firstPass.fields.name.confidence >= .9 && firstPass.fields.equippedBy.value && firstPass.fields.sonata.value !== 'Unknown Sonata') return firstPass
    const image = new Image(); image.src = imageDataUrl; await image.decode()
    const header = await worker.recognize(imageDataUrl, { rectangle: { left: 0, top: 0, width: image.naturalWidth, height: Math.round(image.naturalHeight * .16) } })
    const footer = await worker.recognize(imageDataUrl, { rectangle: { left: 0, top: Math.round(image.naturalHeight * .78), width: image.naturalWidth, height: Math.round(image.naturalHeight * .22) } })
    return parseEchoText(`${header.data.text}\n${result.data.text}\n${footer.data.text}`, imageDataUrl, source, visual)
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
