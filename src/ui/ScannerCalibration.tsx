import { useRef, useState } from 'react'
import { saveCalibrationProfile } from '../scanner/calibration'
import type { CalibrationProfile, ScanRect } from '../scanner/types'
import { defaultPanelRectForLayout, regionColor, regionsForLayout } from '../scanner/regions'

const clampPanelRect = (rect: ScanRect): ScanRect => ({
  x: Math.max(0, Math.min(.96, rect.x)), y: Math.max(0, Math.min(.96, rect.y)),
  width: Math.max(.08, Math.min(1 - rect.x, rect.width)), height: Math.max(.10, Math.min(1 - rect.y, rect.height))
})

const clampFieldRect = (rect: ScanRect): ScanRect => {
  const x = Math.max(0, Math.min(.98, rect.x)), y = Math.max(0, Math.min(.98, rect.y))
  return { x, y, width: Math.max(.02, Math.min(1 - x, rect.width)), height: Math.max(.02, Math.min(1 - y, rect.height)) }
}

export function ScannerCalibration({ imageDataUrl, profile, onChange, onSaved }: {
  imageDataUrl: string; profile: CalibrationProfile; onChange: (profile: CalibrationProfile) => void; onSaved?: (profile: CalibrationProfile) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null)
  const [selectedRegionId, setSelectedRegionId] = useState(profile.regions[0]?.id ?? '')
  const selectedRegion = profile.regions.find((region) => region.id === selectedRegionId) ?? profile.regions[0]

  const updateRegion = (regionId: string, rect: ScanRect) => onChange({
    ...profile, regions: profile.regions.map((region) => region.id === regionId ? { ...region, rect: clampFieldRect(rect) } : region), updatedAt: Date.now()
  })

  const beginPanelDrag = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    const bounds = stageRef.current?.getBoundingClientRect(); if (!bounds) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, startY = event.clientY, initial = { ...profile.panelRect }
    const move = (next: PointerEvent) => {
      const dx = (next.clientX - startX) / bounds.width, dy = (next.clientY - startY) / bounds.height
      const panelRect = mode === 'move' ? clampPanelRect({ ...initial, x: initial.x + dx, y: initial.y + dy }) : clampPanelRect({ ...initial, width: initial.width + dx, height: initial.height + dy })
      onChange({ ...profile, panelRect, updatedAt: Date.now() })
    }
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }

  const beginFieldDrag = (event: React.PointerEvent, regionId: string, mode: 'move' | 'resize') => {
    const bounds = panelRef.current?.getBoundingClientRect(), region = profile.regions.find((entry) => entry.id === regionId)
    if (!bounds || !region) return
    event.preventDefault(); event.stopPropagation(); setSelectedRegionId(regionId); event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, startY = event.clientY, initial = { ...region.rect }, initialRegions = profile.regions
    const move = (next: PointerEvent) => {
      const dx = (next.clientX - startX) / bounds.width, dy = (next.clientY - startY) / bounds.height
      const rect = mode === 'move' ? clampFieldRect({ ...initial, x: initial.x + dx, y: initial.y + dy }) : clampFieldRect({ ...initial, width: initial.width + dx, height: initial.height + dy })
      onChange({ ...profile, regions: initialRegions.map((entry) => entry.id === regionId ? { ...entry, rect } : entry), updatedAt: Date.now() })
    }
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }

  const setCoordinate = (key: keyof ScanRect, value: number) => {
    if (!selectedRegion || !Number.isFinite(value)) return
    updateRegion(selectedRegion.id, { ...selectedRegion.rect, [key]: value })
  }

  return <div className="scanner-calibration">
    <div className="calibration-toolbar"><div><strong>Calibration</strong><span>{profile.name}</span></div><label>Layout<select value={profile.layout} onChange={(event) => { const layout = event.target.value as CalibrationProfile['layout'], regions = regionsForLayout(layout); setSelectedRegionId(regions[0]?.id ?? ''); onChange({ ...profile, layout, panelRect: defaultPanelRectForLayout(layout), regions, updatedAt: Date.now() }) }}><option value="echo-detail">Character Menu</option><option value="echo-management">Backpack</option></select></label><label>UI scale<input type="number" min=".5" max="2" step=".05" value={profile.uiScale} onChange={(event) => onChange({ ...profile, uiScale: Number(event.target.value), updatedAt: Date.now() })}/></label><button type="button" className="secondary" onClick={() => { const saved = saveCalibrationProfile(profile); onChange(saved); onSaved?.(saved) }}>Save profile</button></div>
    <div className="calibration-workspace">
      <div className="calibration-stage" ref={stageRef}>
        <img src={imageDataUrl} alt="Calibration source"/>
        <div ref={panelRef} className="calibration-panel-box" style={{ left: `${profile.panelRect.x * 100}%`, top: `${profile.panelRect.y * 100}%`, width: `${profile.panelRect.width * 100}%`, height: `${profile.panelRect.height * 100}%` }} onPointerDown={(event) => beginPanelDrag(event, 'move')}>
          <span>Panel</span>
          <div className="calibration-region-preview">{profile.regions.map((region) => <div
            role="button" tabIndex={0} aria-label={`Calibrate ${region.label}`} title={`${region.label}: drag to move; use the corner to resize`}
            className={`calibration-field-box ${selectedRegion?.id === region.id ? 'selected' : ''}`} key={region.id}
            style={{ left: `${region.rect.x * 100}%`, top: `${region.rect.y * 100}%`, width: `${region.rect.width * 100}%`, height: `${region.rect.height * 100}%`, borderColor: regionColor(region), color: regionColor(region) }}
            onPointerDown={(event) => beginFieldDrag(event, region.id, 'move')} onFocus={() => setSelectedRegionId(region.id)}
          ><span>{region.label}</span><button type="button" aria-label={`Resize ${region.label}`} onPointerDown={(event) => beginFieldDrag(event, region.id, 'resize')}/></div>)}</div>
          <button type="button" className="panel-resize-handle" aria-label="Resize panel" onPointerDown={(event) => { event.stopPropagation(); beginPanelDrag(event, 'resize') }}/>
        </div>
      </div>
      <aside className="calibration-field-inspector">
        <span className="eyebrow">Selected field</span><h3>{selectedRegion?.label ?? 'None'}</h3><p>Drag the field box to move it. Drag its lower-right square to resize it.</p>
        {selectedRegion && <div>{(['x', 'y', 'width', 'height'] as Array<keyof ScanRect>).map((key) => <label key={key}>{key}<input type="number" min="0" max="1" step=".001" value={Number(selectedRegion.rect[key].toFixed(4))} onChange={(event) => setCoordinate(key, Number(event.target.value))}/></label>)}</div>}
        <small>Coordinates are normalized from 0 to 1 and relative to the calibrated panel.</small>
      </aside>
    </div>
  </div>
}
