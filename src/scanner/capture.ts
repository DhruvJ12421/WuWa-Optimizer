export interface CapturedPanel {
  dataUrl: string
  fingerprint: number[]
  sourceWidth: number
  sourceHeight: number
  calibrated: boolean
}

const ECHO_CROP = { x: 0.5, y: 0.04, width: 0.49, height: 0.92 }

function cropForSize(width: number, height: number) {
  const calibrated = Math.abs(width / height - 16 / 9) < 0.08
  return { calibrated, crop: calibrated ? ECHO_CROP : { x: 0, y: 0, width: 1, height: 1 } }
}

export async function requestGameWindow() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported in this browser.')
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 12 } }, audio: false })
}

export function stopGameWindow(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

export function captureEchoPanel(video: HTMLVideoElement): CapturedPanel | undefined {
  if (!video.videoWidth || !video.videoHeight) return
  const { calibrated, crop } = cropForSize(video.videoWidth, video.videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * crop.width)
  canvas.height = Math.round(video.videoHeight * crop.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  context.drawImage(video, video.videoWidth * crop.x, video.videoHeight * crop.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)

  const sample = document.createElement('canvas')
  sample.width = 16
  sample.height = 16
  const sampleContext = sample.getContext('2d', { willReadFrequently: true })
  if (!sampleContext) return
  sampleContext.drawImage(canvas, 0, 0, 16, 16)
  const pixels = sampleContext.getImageData(0, 0, 16, 16).data
  const fingerprint = Array.from({ length: 256 }, (_, index) => {
    const offset = index * 4
    return Math.round((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 / 16)
  })
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), fingerprint, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, calibrated }
}

export function fingerprintDistance(left: number[], right: number[]) {
  if (left.length !== right.length) return 1
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / (left.length * 16)
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, or WebP screenshot.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Screenshot must be smaller than 20 MB.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The screenshot could not be read.'))
    reader.readAsDataURL(file)
  })
}

export async function cropScreenshot(dataUrl: string): Promise<{ dataUrl: string; calibrated: boolean }> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const { calibrated, crop } = cropForSize(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * crop.width)
  canvas.height = Math.round(image.naturalHeight * crop.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The screenshot could not be prepared for OCR.')
  context.drawImage(image, image.naturalWidth * crop.x, image.naturalHeight * crop.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), calibrated }
}
