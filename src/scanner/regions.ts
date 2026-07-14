import type { ScanLayout, ScanRect, ScanRegion } from './types'

const region = (id: string, kind: ScanRegion['kind'], label: string, rect: ScanRect, recognition: ScanRegion['recognition'], index?: number): ScanRegion => ({ id, kind, label, rect, recognition, index })

// Source-image-relative panel defaults. Edit these separately from the
// panel-relative field boxes below.
export const DEFAULT_PANEL_RECTS: Record<Exclude<ScanLayout, 'unknown'>, ScanRect> = {
  'echo-detail': { x: 0.7783, y: 0.1437, width: 0.1918, height: 0.7575 }, // Character Menu
  'echo-management': { x: .60, y: .08, width: .39, height: .86 } // Backpack
}

export function defaultPanelRectForLayout(layout: Exclude<ScanLayout, 'unknown'>) {
  return { ...DEFAULT_PANEL_RECTS[layout] }
}

const substatRows = (x: number, y: number, width: number, rowHeight: number, gap: number) => Array.from({ length: 5 }, (_, index) =>
  region(`substat-${index + 1}`, 'substat-row', `Substat ${index + 1}`, { x, y: y + index * (rowHeight + gap), width, height: rowHeight }, 'text', index)
)

// Default calibration boxes for the Character Menu layout.
const CHARACTER_MENU_REGIONS: ScanRegion[] = [
  region('echo-name', 'name', 'Echo name', { x: 0, y: 0, width: 0.7797, height: 0.0713 }, 'text'),
  region('level', 'level', 'Level', { x: 0.7715, y: 0.027, width: 0.1192, height: 0.0367 }, 'number'),
  region('cost', 'cost', 'Cost', { x: 0.0278, y: 0.0752, width: 0.2406, height: 0.0314 }, 'number'),
  region('rarity', 'rarity', 'Rarity', { x: 0.0101, y: 0.016, width: 0.3196, height: 0.0422 }, 'visual'),
  region('sonata', 'sonata', 'Sonata icon', { x: 0.901, y: 0.0243, width: 0.0833, height: 0.0348 }, 'visual'),
  region('main-stat-label', 'main-stat-label', 'Main stat label', { x: 0.1142, y: 0.1326, width: 0.6583, height: 0.0293 }, 'text'),
  region('main-stat-value', 'main-stat-value', 'Main stat value', { x: 0.7763, y: 0.1326, width: 0.1875, height: 0.028 }, 'number'),
  region('substat-1', 'substat-row', 'Substat 1', { x: 0.1134, y: 0.2158, width: 0.8397, height: 0.0336 }, 'text', 0),
  region('substat-2', 'substat-row', 'Substat 2', { x: 0.1109, y: 0.2584, width: 0.8404, height: 0.0329 }, 'text', 1),
  region('substat-3', 'substat-row', 'Substat 3', { x: 0.115, y: 0.2996, width: 0.8382, height: 0.0332 }, 'text', 2),
  region('substat-4', 'substat-row', 'Substat 4', { x: 0.1172, y: 0.341, width: 0.8343, height: 0.0333 }, 'text', 3),
  region('substat-5', 'substat-row', 'Substat 5', { x: 0.1155, y: 0.3834, width: 0.8428, height: 0.0329 }, 'text', 4),
  region('equipped-character', 'equipped-character', 'Equipped character', { x: 0.1242, y: 0.9628, width: 0.8245, height: 0.0372 }, 'text'),
  region('locked', 'locked', 'Locked icon', { x: 0.8874, y: 0.068, width: 0.1038, height: 0.0426 }, 'visual'),
  region('discarded', 'discarded', 'Discarded icon', { x: 0.6677, y: 0.0695, width: 0.1006, height: 0.0439 }, 'visual'),
]

// Default calibration boxes for the Backpack layout.
const BACKPACK_REGIONS: ScanRegion[] = [
  region('echo-name', 'name', 'Echo name', { x: .07, y: .055, width: .52, height: .07 }, 'text'),
  region('level', 'level', 'Level', { x: .07, y: .16, width: .24, height: .055 }, 'number'),
  region('cost', 'cost', 'Cost', { x: .68, y: .13, width: .24, height: .06 }, 'number'),
  region('rarity', 'rarity', 'Rarity', { x: .04, y: .04, width: .60, height: .07 }, 'visual'),
  region('sonata', 'sonata', 'Sonata icon', { x: .21, y: .105, width: .11, height: .08 }, 'visual'),
  region('main-stat-label', 'main-stat-label', 'Main stat label', { x: .08, y: .31, width: .55, height: .055 }, 'text'),
  region('main-stat-value', 'main-stat-value', 'Main stat value', { x: .65, y: .31, width: .28, height: .055 }, 'number'),
  ...substatRows(.08, .405, .85, .05, .015),
  region('equipped-character', 'equipped-character', 'Equipped character', { x: .08, y: .82, width: .82, height: .06 }, 'text'),
  region('locked', 'locked', 'Locked icon', { x: .29, y: .255, width: .15, height: .11 }, 'visual'),
  region('discarded', 'discarded', 'Discarded icon', { x: .11, y: .255, width: .15, height: .11 }, 'visual')
]

export function regionsForLayout(layout: ScanLayout) {
  return (layout === 'echo-management' ? BACKPACK_REGIONS : CHARACTER_MENU_REGIONS).map((entry) => ({ ...entry, rect: { ...entry.rect } }))
}

export const regionColor = (region: ScanRegion) => ({
  text: '#75d7c8', number: '#e8bd67', visual: '#d98ee8'
}[region.recognition])

export function absoluteRect(rect: ScanRect, width: number, height: number): ScanRect {
  return { x: rect.x * width, y: rect.y * height, width: rect.width * width, height: rect.height * height }
}
