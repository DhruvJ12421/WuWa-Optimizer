import type { Echo } from '../domain/types'
import type { VisualRecognition } from './parser'

function rgbToHsl(red: number, green: number, blue: number) {
  const [r, g, b] = [red, green, blue].map((value) => value / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2, delta = max - min
  if (!delta) return { hue: 0, saturation: 0, lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4)
  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness }
}

export function classifyRarityPixels(pixels: Uint8ClampedArray): VisualRecognition['rarity'] {
  const scores: Record<Echo['rarity'], number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 180) continue
    const { hue, saturation, lightness } = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2])
    if (lightness < 0.58) continue
    if (saturation < 0.18) scores[1] += 1
    else if (hue >= 75 && hue < 175) scores[2] += 1
    else if (hue >= 175 && hue < 250) scores[3] += 1
    else if (hue >= 250 && hue < 335) scores[4] += 1
    else if (hue >= 32 && hue < 75) scores[5] += 1
  }
  const ranked = (Object.entries(scores) as Array<[string, number]>).sort((left, right) => right[1] - left[1])
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0), best = ranked[0]
  if (!best || best[1] < 8 || total === 0) return
  return { value: Number(best[0]) as Echo['rarity'], confidence: Math.min(0.95, 0.55 + best[1] / total * 0.4) }
}

export async function recognizeVisualFields(imageDataUrl: string): Promise<VisualRecognition> {
  const image = new Image()
  image.src = imageDataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * 0.72))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * 0.075))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return {}
  context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return { rarity: classifyRarityPixels(context.getImageData(0, 0, canvas.width, canvas.height).data) }
}
