import type { ScanLayout, ScanRect, ScanRegion } from './types'

const region = (id: string, kind: ScanRegion['kind'], label: string, rect: ScanRect, recognition: ScanRegion['recognition'], index?: number): ScanRegion => ({ id, kind, label, rect, recognition, index })

// Source-image-relative panel defaults. Edit these separately from the
// panel-relative field boxes below.
export const DEFAULT_PANEL_RECTS: Record<Exclude<ScanLayout, 'unknown'>, ScanRect> = {
  'echo-detail': { x: 0.7814648090309528, y: 0.12119504852729009, width: 0.18818307539319679, height: 0.7792011904489758 }, // Character Menu
  'echo-management': { x: 0.6795682336434711, y: 0.11407459372205966, width: 0.29127383898363207, height: 0.7388013943499553 } // Backpack
}

export function defaultPanelRectForLayout(layout: Exclude<ScanLayout, 'unknown'>) {
  return { ...DEFAULT_PANEL_RECTS[layout] }
}

export const SUBSTAT_BLOCK_ID = 'substats-block'

export function substatBlockFromRegions(regions: ScanRegion[]): ScanRegion | undefined {
  const configured = regions.find((entry) => entry.kind === 'substats-block' || entry.id === SUBSTAT_BLOCK_ID)
  if (configured) return { ...configured, id: SUBSTAT_BLOCK_ID, kind: 'substats-block', label: 'Substats block', rect: { ...configured.rect }, recognition: 'text' }
  const rows = regions.filter((entry) => entry.kind === 'substat-row').sort((left, right) => left.rect.y - right.rect.y)
  if (!rows.length) return
  const left = Math.min(...rows.map((entry) => entry.rect.x)), top = rows[0].rect.y
  const right = Math.max(...rows.map((entry) => entry.rect.x + entry.rect.width))
  const configuredBottom = Math.max(...rows.map((entry) => entry.rect.y + entry.rect.height))
  const rowStep = rows.length > 1 ? Math.max(...rows.slice(1).map((entry, index) => entry.rect.y - rows[index].rect.y)) : rows[0].rect.height
  const bottom = Math.min(1, configuredBottom + Math.max(rows[0].rect.height, rowStep))
  return region(SUBSTAT_BLOCK_ID, 'substats-block', 'Substats block', { x: left, y: top, width: right - left, height: bottom - top }, 'text')
}

export function normalizeSubstatRegions(regions: ScanRegion[]) {
  const block = substatBlockFromRegions(regions)
  if (!block) return regions.map((entry) => ({ ...entry, rect: { ...entry.rect } }))
  const firstIndex = regions.findIndex((entry) => entry.kind === 'substats-block' || entry.kind === 'substat-row')
  const remaining = regions.filter((entry) => entry.kind !== 'substats-block' && entry.kind !== 'substat-row').map((entry) => ({ ...entry, rect: { ...entry.rect } }))
  remaining.splice(Math.max(0, firstIndex), 0, block)
  return remaining
}

// Default calibration boxes for the Character Menu layout.
const CHARACTER_MENU_REGIONS: ScanRegion[] = [
  region('echo-name', 'name', 'Echo name', { x: 0, y: 0, width: 0.7702441368523355, height: 0.06092530316069473 }, 'text'),
  region('level', 'level', 'Level', { x: 0.7757026058434064, y: 0.017978524487560633, width: 0.1192, height: 0.0367 }, 'number'),
  region('cost', 'cost', 'Cost', { x: 0.018259667132357407, y: 0.06466804364373077, width: 0.2406, height: 0.0314 }, 'number'),
  region('rarity', 'rarity', 'Rarity', { x: 0.002745439774038753, y: 0.01645107377562197, width: 0.3196, height: 0.0422 }, 'visual'),
  region('sonata', 'sonata', 'Sonata icon', { x: 0.88, y: 0.008, width: 0.115, height: 0.065 }, 'visual'),
  region('main-stat-label', 'main-stat-label', 'Main stat label', { x: 0.10054153100892911, y: 0.12402959826318259, width: 0.6583, height: 0.0293 }, 'text'),
  region('main-stat-value', 'main-stat-value', 'Main stat value', { x: 0.7805026058434064, y: 0.12357852448756063, width: 0.1875, height: 0.028 }, 'number'),
  region(SUBSTAT_BLOCK_ID, 'substats-block', 'Substats block', { x: 0.10249478831318715, y: 0.2099360409169144, width: 0.8469986970782968, height: 0.24650859020497576 }, 'text'),
  region('equipped-character', 'equipped-character', 'Equipped character', { x: 0.109, y: 0.96, width: 0.8245, height: 0.0372 }, 'text'),
  region('locked', 'locked', 'Locked icon', { x: 0.892653257304258, y: 0.059880672038804574, width: 0.1038, height: 0.0426 }, 'visual'),
  region('discarded', 'discarded', 'Discarded icon', { x: 0.6634973941565936, y: 0.059576376936316705, width: 0.10375195438255481, height: 0.0439 }, 'visual'),
]

// Default calibration boxes for the Backpack layout.
const BACKPACK_REGIONS: ScanRegion[] = [
  region('echo-name', 'name', 'Echo name', { x: 0.037202645494859125, y: 0, width: 0.9424581322109724, height: 0.0848 }, 'text'),
  region('level', 'level', 'Level', { x: 0.04345000882976219, y: 0.09213376797710895, width: 0.10959238383957302, height: 0.0380334319216382 }, 'number'),
  region('cost', 'cost', 'Cost', { x: 0.04855090112628535, y: 0.15371033421607258, width: 0.20251765952437012, height: 0.03974953671232499 }, 'number'),
  region('rarity', 'rarity', 'Rarity', { x: 0.038437929224550665, y: 0, width: 0.28296064378777175, height: 0.04482382820020904 }, 'visual'),
  region('sonata', 'sonata', 'Sonata icon', { x: 0.145, y: 0.075, width: 0.11, height: 0.075 }, 'visual'),
  region('main-stat-label', 'main-stat-label', 'Main stat label', { x: 0.10673394454909348, y: 0.4195416417402426, width: 0.6744156414331686, height: 0.04058667132532937 }, 'text'),
  region('main-stat-value', 'main-stat-value', 'Main stat value', { x: 0.7888109130955184, y: 0.4181002873844789, width: 0.2050195971666274, height: 0.04274863570804797 }, 'number'),
  region(SUBSTAT_BLOCK_ID, 'substats-block', 'Substats block', { x: 0.10570595175025509, y: 0.5289550241356548, width: 0.8807481138646887, height: 0.36735557071196745 }, 'text'),
  region('equipped-character', 'equipped-character', 'Equipped character', { x: 0.10364935297464878, y: 0.9432343066672166, width: 0.8128022108743427, height: 0.04558651016310476 }, 'text'),
  region('locked', 'locked', 'Locked icon', { x: 0.2560685729142139, y: 0.2744580554896581, width: 0.09756010370065143, height: 0.06820120716952718 }, 'visual'),
  region('discarded', 'discarded', 'Discarded icon', { x: 0.04110884644062475, y: 0.27589935612468025, width: 0.09550411810297464, height: 0.06603924278680859 }, 'visual')
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
