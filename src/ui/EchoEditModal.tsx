import { useState } from 'react'
import { sonataNames, statLabels } from '../game-data'
import { mainStatError } from '../game-data/echo-main-stats'
import type { Echo, StatKey } from '../domain/types'
import { EchoMiniCard, Panel } from './components'

const statKeys = Object.keys(statLabels) as StatKey[]
const levelStops = [0, 5, 10, 15, 20, 25]

export function EchoEditModal({ echo, onClose, onSave }: { echo: Echo; onClose: () => void; onSave: (echo: Echo) => Promise<void> }) {
  const [draft, setDraft] = useState<Echo>(() => structuredClone(echo))
  const [error, setError] = useState('')
  const setSubStat = (index: number, patch: Partial<Echo['subStats'][number]>) => setDraft((current) => ({ ...current, subStats: current.subStats.map((stat, statIndex) => statIndex === index ? { ...stat, ...patch } : stat) }))
  const setState = (key: 'locked' | 'excluded', value: boolean) => setDraft((current) => ({ ...current, [key]: value, ...(value ? { [key === 'locked' ? 'excluded' : 'locked']: false } : {}) }))
  const submit = async () => {
    if (!draft.name.trim() || !draft.sonata.trim()) { setError('Name and Sonata are required.'); return }
    if (draft.level < 0 || draft.level > 25) { setError('Level must be between 0 and 25.'); return }
    if ([draft.mainStat, ...draft.subStats].some((stat) => !Number.isFinite(stat.value) || stat.value < 0)) { setError('Stat values must be positive numbers.'); return }
    const invalidMainStat = mainStatError(draft.cost, draft.rarity, draft.level, draft.mainStat)
    if (invalidMainStat) { setError(invalidMainStat); return }
    await onSave({ ...draft, name: draft.name.trim(), sonata: draft.sonata.trim() })
  }

  return <div className="modal-backdrop echo-editor-backdrop" onMouseDown={onClose}>
    <Panel className="echo-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header className="echo-editor-header"><div><span className="eyebrow">Local inventory</span><h2>Echo Editor</h2></div><button className="close" aria-label="Close Echo editor" onClick={onClose}>×</button></header>
      <div className="echo-editor-layout">
        <section className="echo-editor-fields">
          <div className="echo-editor-identity">
            <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
            <label>Sonata<input list="echo-edit-sonatas" value={draft.sonata} onChange={(event) => setDraft({ ...draft, sonata: event.target.value })}/><datalist id="echo-edit-sonatas">{sonataNames.map((name) => <option key={name} value={name}/>)}</datalist></label>
            <label>Cost<select value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) as Echo['cost'] })}>{[1, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Rarity<select value={draft.rarity} onChange={(event) => setDraft({ ...draft, rarity: Number(event.target.value) as Echo['rarity'] })}>{[2, 3, 4, 5].map((value) => <option key={value}>{value} star</option>)}</select></label>
          </div>
          <div className="echo-level-editor"><label>Level <strong>+{draft.level}</strong><input type="range" min="0" max="25" value={draft.level} onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}/></label><div>{levelStops.map((level) => <button type="button" className={draft.level === level ? 'active' : ''} onClick={() => setDraft({ ...draft, level })} key={level}>+{level}</button>)}</div></div>
          <div className="echo-stat-line main"><span>Main stat</span><select value={draft.mainStat.key} onChange={(event) => setDraft({ ...draft, mainStat: { ...draft.mainStat, key: event.target.value as StatKey } })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input aria-label="Main stat value" type="number" min="0" step="0.1" value={draft.mainStat.value} onChange={(event) => setDraft({ ...draft, mainStat: { ...draft.mainStat, value: Number(event.target.value) } })}/></div>
          <div className="echo-editor-substats"><header><div><span className="eyebrow">Roll values</span><h3>Substats</h3></div><b>{draft.subStats.length}/5</b></header>{draft.subStats.map((stat, index) => <div className="echo-stat-line" key={index}><span>#{index + 1}</span><select value={stat.key} onChange={(event) => setSubStat(index, { key: event.target.value as StatKey })}>{statKeys.map((key) => <option key={key} value={key}>{statLabels[key]}</option>)}</select><input aria-label={`Substat ${index + 1} value`} type="number" min="0" step="0.1" value={stat.value} onChange={(event) => setSubStat(index, { value: Number(event.target.value) })}/><button type="button" className="text-button" onClick={() => setDraft({ ...draft, subStats: draft.subStats.filter((_, statIndex) => statIndex !== index) })}>Remove</button></div>)}<button type="button" className="secondary add-substat" disabled={draft.subStats.length >= 5} onClick={() => setDraft({ ...draft, subStats: [...draft.subStats, { key: 'critRate', value: 0 }] })}>+ Add substat</button></div>
          <div className="echo-editor-states"><label><input type="checkbox" checked={draft.locked} onChange={(event) => setState('locked', event.target.checked)}/>Locked</label><label><input type="checkbox" checked={draft.excluded} onChange={(event) => setState('excluded', event.target.checked)}/>Discarded</label></div>
          {error && <div className="notice error">{error}</div>}
        </section>
        <aside className="echo-editor-previews"><div><span className="eyebrow">Before edit</span><EchoMiniCard echo={echo}/></div><div><span className="eyebrow">Live preview</span><EchoMiniCard echo={draft}/></div></aside>
      </div>
      <footer className="echo-editor-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" onClick={() => void submit()}>Save Echo</button></footer>
    </Panel>
  </div>
}
