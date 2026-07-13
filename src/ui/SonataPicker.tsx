import { useState } from 'react'
import { sonataNames } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'

export function SonataPicker({ value, onChange, allowAll = false, id }: { value: string; onChange: (value: string) => void; allowAll?: boolean; id: string }) {
  const [open, setOpen] = useState(false)
  const selectedIcon = value !== 'all' ? generatedSonataIconSources[value] : undefined
  return <div className="sonata-picker" id={id}>
    <button type="button" className="sonata-picker-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{selectedIcon ? <img src={selectedIcon} alt=""/> : <span>◎</span>}<b>{value === 'all' ? 'All Sonatas' : value}</b><i>⌄</i></button>
    {open && <div className="sonata-picker-menu">{allowAll && <button type="button" className={value === 'all' ? 'active' : ''} onClick={() => { onChange('all'); setOpen(false) }}><span>◎</span><b>All Sonatas</b></button>}{sonataNames.map((name) => <button type="button" className={value === name ? 'active' : ''} onClick={() => { onChange(name); setOpen(false) }} key={name}><img src={generatedSonataIconSources[name]} alt="" loading="lazy"/><b>{name}</b></button>)}</div>}
  </div>
}
