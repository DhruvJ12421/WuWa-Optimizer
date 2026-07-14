import { regionColor } from '../scanner/regions'
import type { ScanRegion } from '../scanner/types'

export function ScannerDebugOverlay({ regions, visible = true }: { regions: ScanRegion[]; visible?: boolean }) {
  if (!visible) return null
  return <div className="scanner-debug-overlay" aria-hidden="true">
    {regions.map((region) => <div className={`debug-region ${region.recognition}`} key={region.id} style={{
      left: `${region.rect.x * 100}%`, top: `${region.rect.y * 100}%`, width: `${region.rect.width * 100}%`, height: `${region.rect.height * 100}%`, borderColor: regionColor(region), color: regionColor(region)
    }}><span>{region.label}</span></div>)}
  </div>
}

