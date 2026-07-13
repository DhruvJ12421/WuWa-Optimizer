import { useState } from 'react'
import { sonataNames, statLabels } from '../game-data'
import type { Echo, StatKey } from '../domain/types'
import { Panel } from './components'
import { mainStatError } from '../game-data/echo-main-stats'

const statKeys = Object.keys(statLabels) as StatKey[]

export function EchoEditModal({ echo, onClose, onSave }: { echo: Echo; onClose: () => void; onSave: (echo: Echo) => Promise<void> }) {
  const [draft, setDraft] = useState<Echo>(() => structuredClone(echo))
  const [error, setError] = useState('')
  const setSubStat = (index: number, patch: Partial<Echo['subStats'][number]>) => setDraft((current) => ({ ...current, subStats: current.subStats.map((stat, statIndex) => statIndex === index ? { ...stat, ...patch } : stat) }))
  const submit = async () => {
    if (!draft.name.trim() || !draft.sonata.trim()) { setError('Name and Sonata are required.'); return }
    if (draft.level < 0 || draft.level > 25) { setError('Level must be between 0 and 25.'); return }
    if ([draft.mainStat, ...draft.subStats].some((stat) => !Number.isFinite(stat.value) || stat.value < 0)) { setError('Stat values must be positive numbers.'); return }
    const invalidMainStat = mainStatError(draft.cost, draft.rarity, draft.level, draft.mainStat)
    if (invalidMainStat) { setError(invalidMainStat); return }
    await onSave({ ...draft, name: draft.name.trim(), sonata: draft.sonata.trim() })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><Panel className="settings-modal echo-edit-modal" onMouseDown={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">Inventory correction</span><h2>Edit Echo</h2></div><button className="close" onClick={onClose}>x</button></div><div className="edit-grid"><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>Sonata<input list="echo-edit-sonatas" value={draft.sonata} onChange={(event) => setDraft({ ...draft, sonata: event.target.value })}/><datalist id="echo-edit-sonatas">{sonataNames.map((name) => <option key={name} value={name}/>)}</datalist></label><label>Cost<select value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) as Echo['cost'] })}>{[1, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label><label>Rarity<select value={draft.rarity} onChange={(event) => setDraft({ ...draft, rarity: Number(event.target.value) as Echo['rarity'] })}>{[2, 3, 4, 5].map((value) => <option key={value}>{value} star</option>)}</select></label><label>Level<input type="number" min="0" max="25" value={draft.level} onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}/></label></div><div className="stat-editor main"><span>Main stat</span><select value={draft.mainStat.key} onChange={(event) => setDraft({ ...draft, mainStat: { ...draft.mainStat, key: event.target.value as StatKey } })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input type="number" min="0" step="0.1" value={draft.mainStat.value} onChange={(event) => setDraft({ ...draft, mainStat: { ...draft.mainStat, value: Number(event.target.value) } })}/></div><div className="substat-editor"><div className="substat-head"><span>Substats ({draft.subStats.length}/5)</span><button className="text-button" disabled={draft.subStats.length >= 5} onClick={() => setDraft({ ...draft, subStats: [...draft.subStats, { key: 'critRate', value: 0 }] })}>+ Add</button></div>{draft.subStats.map((stat, index) => <div className="stat-editor" key={index}><select value={stat.key} onChange={(event) => setSubStat(index, { key: event.target.value as StatKey })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input type="number" min="0" step="0.1" value={stat.value} onChange={(event) => setSubStat(index, { value: Number(event.target.value) })}/><button className="text-button" onClick={() => setDraft({ ...draft, subStats: draft.subStats.filter((_, statIndex) => statIndex !== index) })}>Remove</button></div>)}</div>{error && <div className="notice error">{error}</div>}<div className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Save Echo</button></div></Panel></div>
}
