import { defaultPanelRectForLayout, normalizeSubstatRegions, regionsForLayout } from './regions'
import type { CalibrationProfile, ScanLayout, ScanRect } from './types'

// v2 uses the source image's true rendered aspect ratio. Profiles created by
// the clipped v1 calibration surface used a different vertical coordinate basis.
const STORAGE_KEY = 'tacet-lab-scanner-calibration-v2'
export const SAFE_FALLBACK_PANEL: ScanRect = defaultPanelRectForLayout('echo-detail')

export function detectLayout(panel: ScanRect): ScanLayout {
  return panel.width >= .30 ? 'echo-management' : 'echo-detail'
}

export function detectRightPanel(source: CanvasImageSource, width: number, height: number): { panelRect: ScanRect; layout: ScanLayout; confidence: number } {
  const sample = document.createElement('canvas')
  sample.width = 384
  sample.height = 112
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return { panelRect: SAFE_FALLBACK_PANEL, layout: 'unknown', confidence: 0 }
  context.drawImage(source, 0, 0, width, height, 0, 0, sample.width, sample.height)
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data
  const lightness = (x: number) => {
    let total = 0
    for (let y = 12; y < sample.height - 10; y += 1) {
      const offset = (y * sample.width + x) * 4
      total += pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722
    }
    return total / (sample.height - 22)
  }
  let best = { x: 0, score: 0 }
  for (let x = Math.round(sample.width * .55); x <= Math.round(sample.width * .86); x += 1) {
    const center = (lightness(x - 1) + lightness(x) + lightness(x + 1)) / 3
    const sides = (lightness(x - 6) + lightness(x + 6)) / 2
    if (sides - center > best.score) best = { x, score: sides - center }
  }
  if (best.score < 6) return { panelRect: SAFE_FALLBACK_PANEL, layout: 'unknown', confidence: Math.max(0, best.score / 6) }
  const divider = best.x / sample.width
  const panelRect = divider < .70
    ? { x: Math.max(.60, divider + .004), y: .08, width: Math.min(.39, .99 - divider), height: .86 }
    : { x: divider + .004, y: .10, width: .986 - divider, height: .88 }
  return { panelRect, layout: detectLayout(panelRect), confidence: Math.min(.98, .6 + best.score / 30) }
}

export function profileKey(width: number, height: number, layout: ScanLayout, uiScale = 1) {
  return `${width}x${height}:${layout}:${uiScale.toFixed(2)}`
}

export function loadCalibrationProfiles(): CalibrationProfile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.map((profile) => ({ ...profile, regions: normalizeSubstatRegions(profile.regions ?? []) })) : []
  } catch { return [] }
}

export function loadLatestCalibrationProfile() {
  return loadCalibrationProfiles().sort((left, right) => right.updatedAt - left.updatedAt)[0]
}

export function saveCalibrationProfile(profile: CalibrationProfile) {
  const persisted = { ...profile, regions: normalizeSubstatRegions(profile.regions), id: profileKey(profile.sourceWidth, profile.sourceHeight, profile.layout, profile.uiScale), updatedAt: Date.now() }
  const profiles = loadCalibrationProfiles().filter((entry) => entry.id !== persisted.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...profiles, persisted]))
  return persisted
}

export function deleteCalibrationProfile(profile: CalibrationProfile) {
  const id = profileKey(profile.sourceWidth, profile.sourceHeight, profile.layout, profile.uiScale)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadCalibrationProfiles().filter((entry) => entry.id !== id)))
}

const isRect = (value: unknown): value is ScanRect => {
  if (!value || typeof value !== 'object') return false
  const rect = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
}

function normalizeImportedProfile(input: unknown): CalibrationProfile {
  const value = input as Partial<CalibrationProfile>
  if (!value || typeof value !== 'object'
    || (value.layout !== 'echo-detail' && value.layout !== 'echo-management')
    || typeof value.sourceWidth !== 'number' || !Number.isFinite(value.sourceWidth)
    || typeof value.sourceHeight !== 'number' || !Number.isFinite(value.sourceHeight)
    || typeof value.uiScale !== 'number' || !Number.isFinite(value.uiScale)
    || !isRect(value.panelRect) || !Array.isArray(value.regions)
    || value.regions.some((region) => !region || typeof region.id !== 'string' || typeof region.kind !== 'string'
      || typeof region.label !== 'string' || !isRect(region.rect)
      || !['text', 'number', 'visual'].includes(region.recognition))) {
    throw new Error('This file is not a valid Tacet Lab calibration profile.')
  }
  const now = Date.now()
  return {
    ...value,
    id: profileKey(value.sourceWidth, value.sourceHeight, value.layout, value.uiScale),
    name: typeof value.name === 'string' ? value.name : `${value.sourceWidth}x${value.sourceHeight} - ${value.layout === 'echo-detail' ? 'Character Menu' : 'Backpack'}`,
    regions: normalizeSubstatRegions(value.regions),
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: now
  } as CalibrationProfile
}

export function parseCalibrationProfiles(json: string): CalibrationProfile[] {
  const parsed = JSON.parse(json) as { profiles?: unknown[] }
  const inputs = parsed && typeof parsed === 'object' && Array.isArray(parsed.profiles) ? parsed.profiles : [parsed]
  if (!inputs.length) throw new Error('This calibration bundle does not contain any profiles.')
  return inputs.map(normalizeImportedProfile)
}

export function parseCalibrationProfile(json: string): CalibrationProfile {
  return parseCalibrationProfiles(json)[0]
}

export function calibrationExportProfiles(current: CalibrationProfile) {
  const stored = loadCalibrationProfiles()
  return (['echo-detail', 'echo-management'] as const).map((layout) => {
    if (current.layout === layout) return current
    return stored.filter((profile) => profile.layout === layout
      && Math.abs(profile.sourceWidth - current.sourceWidth) <= 2
      && Math.abs(profile.sourceHeight - current.sourceHeight) <= 2
      && Math.abs(profile.uiScale - current.uiScale) <= .02)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      ?? createCalibrationProfile(current.sourceWidth, current.sourceHeight, defaultPanelRectForLayout(layout), layout, current.uiScale)
  })
}

export function findCompatibleProfile(width: number, height: number, layout: ScanLayout, uiScale?: number) {
  return loadCalibrationProfiles().filter((profile) => profile.layout === layout
    && Math.abs(profile.sourceWidth - width) <= 2 && Math.abs(profile.sourceHeight - height) <= 2
    && (uiScale === undefined || Math.abs(profile.uiScale - uiScale) <= .02))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
}

export function createCalibrationProfile(width: number, height: number, panelRect: ScanRect, layout: Exclude<ScanLayout, 'unknown'>, uiScale = 1): CalibrationProfile {
  const now = Date.now()
  return {
    id: profileKey(width, height, layout, uiScale), name: `${width}x${height} - ${layout === 'echo-detail' ? 'Character Menu' : 'Backpack'}`,
    layout, sourceWidth: width, sourceHeight: height, uiScale, panelRect: { ...panelRect }, regions: regionsForLayout(layout), createdAt: now, updatedAt: now
  }
}

export function calibrationCompatible(profile: CalibrationProfile, width: number, height: number) {
  return Math.abs(profile.sourceWidth - width) <= 2 && Math.abs(profile.sourceHeight - height) <= 2
}
