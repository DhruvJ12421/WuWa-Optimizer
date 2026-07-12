import { sonataNames, statLabels } from '../game-data'
import { candidateErrors } from '../scanner/parser'
import type { ScanCandidate, StatKey } from '../domain/types'
import { Confidence, Panel } from './components'

const statKeys = Object.keys(statLabels) as StatKey[]

export function ScanReviewCard({ candidate, onChange, onDiscard, onSave }: {
  candidate: ScanCandidate
  onChange: (candidate: ScanCandidate) => void
  onDiscard: () => void
  onSave: () => void
}) {
  const errors = candidateErrors(candidate)
  const setField = (field: 'name' | 'sonata', value: string) => onChange({ ...candidate, fields: { ...candidate.fields, [field]: { ...candidate.fields[field], value, confidence: 1 } } })
  const setNumberField = (field: 'level' | 'cost' | 'rarity', value: number) => onChange({ ...candidate, fields: { ...candidate.fields, [field]: { ...candidate.fields[field], value, confidence: 1 } } } as ScanCandidate)
  const setMainStat = (patch: Partial<{ key: StatKey; value: number }>) => onChange({ ...candidate, fields: { ...candidate.fields, mainStat: { ...candidate.fields.mainStat, confidence: 1, value: { ...candidate.fields.mainStat.value, ...patch } } } })
  const setSubStat = (index: number, patch: Partial<{ key: StatKey; value: number }>) => onChange({ ...candidate, fields: { ...candidate.fields, subStats: candidate.fields.subStats.map((field, fieldIndex) => fieldIndex === index ? { ...field, confidence: 1, value: { ...field.value, ...patch } } : field) } })
  const removeSubStat = (index: number) => onChange({ ...candidate, fields: { ...candidate.fields, subStats: candidate.fields.subStats.filter((_, fieldIndex) => fieldIndex !== index) } })
  const addSubStat = () => onChange({ ...candidate, fields: { ...candidate.fields, subStats: [...candidate.fields.subStats, { value: { key: 'critRate', value: 0 }, confidence: 1 }] } })

  return <Panel className="review-card">
    {candidate.imageDataUrl ? <img src={candidate.imageDataUrl} alt="Captured Echo detail region"/> : <div className="manual-preview">MANUAL</div>}
    <div className="review-fields">
      <label>Name <Confidence value={candidate.fields.name.confidence}/><input value={candidate.fields.name.value} onChange={(event) => setField('name', event.target.value)}/></label>
      <div className="field-row">
        <label>Cost <Confidence value={candidate.fields.cost.confidence}/><select value={candidate.fields.cost.value} onChange={(event) => setNumberField('cost', Number(event.target.value))}><option value="1">1</option><option value="3">3</option><option value="4">4</option></select></label>
        <label>Level <Confidence value={candidate.fields.level.confidence}/><input type="number" min="0" max="25" value={candidate.fields.level.value} onChange={(event) => setNumberField('level', Number(event.target.value))}/></label>
        <label>Rarity <Confidence value={candidate.fields.rarity.confidence}/><select value={candidate.fields.rarity.value} onChange={(event) => setNumberField('rarity', Number(event.target.value))}>{[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} star</option>)}</select></label>
      </div>
      <label>Sonata <Confidence value={candidate.fields.sonata.confidence}/><input list={`sonata-options-${candidate.id}`} value={candidate.fields.sonata.value} onChange={(event) => setField('sonata', event.target.value)}/><datalist id={`sonata-options-${candidate.id}`}>{sonataNames.map((name) => <option key={name} value={name}/>)}</datalist></label>
      <div className="stat-editor main"><span>Main stat <Confidence value={candidate.fields.mainStat.confidence}/></span><select value={candidate.fields.mainStat.value.key} onChange={(event) => setMainStat({ key: event.target.value as StatKey })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input type="number" min="0" step="0.1" value={candidate.fields.mainStat.value.value} onChange={(event) => setMainStat({ value: Number(event.target.value) })}/></div>
      <div className="substat-editor"><div className="substat-head"><span>Substats ({candidate.fields.subStats.length}/5)</span><button type="button" className="text-button" disabled={candidate.fields.subStats.length >= 5} onClick={addSubStat}>+ Add substat</button></div>{candidate.fields.subStats.map((field, index) => <div className="stat-editor" key={`${candidate.id}-${index}`}><Confidence value={field.confidence}/><select value={field.value.key} onChange={(event) => setSubStat(index, { key: event.target.value as StatKey })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input type="number" min="0" step="0.1" value={field.value.value} onChange={(event) => setSubStat(index, { value: Number(event.target.value) })}/><button type="button" className="text-button" onClick={() => removeSubStat(index)}>Remove</button></div>)}</div>
      {candidate.duplicateOf && <div className="notice warning">Possible duplicate. Saving creates a separate inventory item.</div>}
      {errors.length > 0 && <div className="notice error">{errors.join(' ')}</div>}
    </div>
    <div className="review-actions"><button className="text-button" onClick={onDiscard}>Discard</button><button className="primary" disabled={errors.length > 0} onClick={onSave}>Approve & save</button></div>
  </Panel>
}
