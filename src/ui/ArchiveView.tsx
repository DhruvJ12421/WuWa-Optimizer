import { useDeferredValue, useMemo, useState } from 'react'
import { generatedCharacterSummaries as characterCatalog } from '../game-data/character-summaries.generated'
import { echoCatalog } from '../game-data/echoes'
import { generatedSonataCatalog as sonataCatalog } from '../game-data/sonatas.generated'
import { generatedWeaponSummaries as weaponCatalog } from '../game-data/weapon-summaries.generated'
import { generatedSonataIconSources } from '../game-data/sonatas.generated'
import { Icon, PageHeader, Panel } from './components'
import { SonataPicker } from './SonataPicker'

type ArchiveTab = 'characters' | 'weapons' | 'sonatas' | 'echoes'

const tabs: Array<{ id: ArchiveTab; label: string; count: number }> = [
  { id: 'characters', label: 'Characters', count: characterCatalog.length },
  { id: 'weapons', label: 'Weapons', count: weaponCatalog.length },
  { id: 'sonatas', label: 'Sonatas', count: sonataCatalog.length },
  { id: 'echoes', label: 'Echoes', count: echoCatalog.length }
]
const weaponTypes = [...new Set(weaponCatalog.map((item) => item.type))]
const isSelectedGenderVariant = (entry: (typeof characterCatalog)[number], gender: 'male' | 'female') =>
  !entry.gender || !characterCatalog.some((candidate) => candidate.id !== entry.id && candidate.name === entry.name && candidate.gender !== entry.gender) || entry.gender === gender

const elementSonatas: Record<string, string> = {
  Glacio: sonataCatalog[0].name,
  Fusion: sonataCatalog[1].name,
  Electro: sonataCatalog[2].name,
  Aero: sonataCatalog[3].name,
  Spectro: sonataCatalog[4].name,
  Havoc: sonataCatalog[5].name
}

function ElementIcon({ element }: { element: string }) {
  const sonata = elementSonatas[element]
  return <span className={`element-icon element-${element.toLowerCase()}`} title={element}><img src={generatedSonataIconSources[sonata]} alt="" loading="lazy"/></span>
}

function ElementFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const elements = [...new Set(characterCatalog.map((item) => item.element))]
  return <div className="element-picker">
    <button type="button" className="element-picker-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{value === 'all' ? <span className="all-elements">All</span> : <ElementIcon element={value}/>}<b>{value === 'all' ? 'All elements' : value}</b><i>⌄</i></button>
    {open && <div className="element-picker-menu"><button type="button" className={value === 'all' ? 'active' : ''} onClick={() => { onChange('all'); setOpen(false) }}><span className="all-elements">All</span><b>All elements</b></button>{elements.map((element) => <button type="button" className={value === element ? 'active' : ''} onClick={() => { onChange(element); setOpen(false) }} key={element}><ElementIcon element={element}/><b>{element}</b></button>)}</div>}
  </div>
}

export function ArchiveView({ roverGender }: { roverGender: 'male' | 'female' }) {
  const [tab, setTab] = useState<ArchiveTab>('characters')
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState('all')
  const [category, setCategory] = useState('all')
  const [weaponType, setWeaponType] = useState('all')
  const [sonata, setSonata] = useState('all')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const categories = useMemo(() => {
    if (tab === 'characters') return [...new Set(characterCatalog.map((item) => item.element))]
    if (tab === 'weapons') return [...new Set(weaponCatalog.map((item) => item.secondaryStat))].filter((value) => value !== 'Unreleased')
    if (tab === 'echoes') return ['1-cost', '3-cost', '4-cost']
    return []
  }, [tab])

  const changeTab = (next: ArchiveTab) => { setTab(next); setQuery(''); setRarity('all'); setCategory('all'); setWeaponType('all'); setSonata('all') }
  const matches = (text: string, itemRarity?: number, itemCategory?: string) =>
    (!deferredQuery || text.toLowerCase().includes(deferredQuery)) &&
    (rarity === 'all' || itemRarity === Number(rarity)) &&
    (category === 'all' || itemCategory === category)

  const characters = characterCatalog.filter((item) => isSelectedGenderVariant(item, roverGender) && matches(`${item.name} ${item.nickname} ${item.element} ${item.weaponType}`, item.rarity, item.element))
  const weapons = weaponCatalog.filter((item) => matches(`${item.name} ${item.type} ${item.secondaryStat}`, item.rarity, item.secondaryStat) && (weaponType === 'all' || item.type === weaponType))
  const sonatas = sonataCatalog.filter((item) => matches(item.name))
  const echoes = echoCatalog.filter((item) => matches(`${item.name} ${item.sonatas.join(' ')}`, undefined, `${item.cost}-cost`) && (sonata === 'all' || item.sonatas.includes(sonata)))
  const visibleCount = tab === 'characters' ? characters.length : tab === 'weapons' ? weapons.length : tab === 'sonatas' ? sonatas.length : echoes.length
  const rarityOptions = tab === 'characters' ? [5, 4] : [5, 4, 3, 2, 1]

  return <section className="archive-view">
    <PageHeader eyebrow="Database / Nanoka 3.5" title="Wuthering Waves Archive" description="Browse the complete imported character, weapon, Sonata, and Echo catalogs." />
    <div className="archive-tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)} key={item.id}><span>{item.label}</span><b>{item.count}</b></button>)}</div>
    <Panel className="archive-toolbar"><label className="search"><Icon name="scan"/><input aria-label="Search archive" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}...`}/></label>{tab !== 'sonatas' && tab !== 'echoes' && <select aria-label="Rarity" value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="all">All rarities</option>{rarityOptions.map((value) => <option value={value} key={value}>{value} star</option>)}</select>}{tab === 'characters' && <ElementFilter value={category} onChange={setCategory}/>} {tab === 'weapons' && <select aria-label="Weapon type" value={weaponType} onChange={(event) => setWeaponType(event.target.value)}><option value="all">All weapon types</option>{weaponTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select>}{tab === 'echoes' && <SonataPicker id="archive-sonata-filter" value={sonata} onChange={setSonata} allowAll/>}{categories.length > 0 && tab !== 'characters' && <select aria-label={tab === 'weapons' ? 'Weapon substat' : 'Echo cost'} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{tab === 'weapons' ? 'All substats' : 'All costs'}</option>{categories.map((value) => <option value={value} key={value}>{value}</option>)}</select>}<span className="archive-count">{visibleCount} shown</span></Panel>

    {tab === 'characters' && <div className="catalog-grid characters">{characters.map((item) => <a className="catalog-card character" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/></div><div className="catalog-copy"><div className="character-name"><h2>{item.name}</h2><ElementIcon element={item.element}/></div><p>{item.title}</p><footer><span>{item.element}</span><span>{item.weaponType}</span><b>{'★'.repeat(item.rarity)}</b></footer></div></a>)}</div>}
    {tab === 'weapons' && <div className="catalog-grid weapons">{weapons.map((item) => <a className="catalog-card weapon" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/></div><div className="catalog-copy"><h2>{item.name}</h2><p>{item.type}</p><footer><span>ATK <strong>{item.baseAtk}</strong></span><span>{item.secondaryStat} <strong>{item.secondaryStatValue}</strong></span><b>{'★'.repeat(item.rarity)}</b></footer></div></a>)}</div>}
    {tab === 'sonatas' && <div className="catalog-grid sonatas">{sonatas.map((item) => <article className="catalog-card sonata" key={item.id}><div className="sonata-heading"><div className="sonata-mark"><img src={generatedSonataIconSources[item.name]} alt={`${item.name} icon`} loading="lazy"/></div><div><h2>{item.name}</h2><span>{item.echoCount} compatible Echoes</span></div></div><div className="sonata-effects">{item.effects.map((effect) => <div key={effect.pieces}><b>{effect.pieces}-piece</b><p>{effect.description}</p></div>)}</div></article>)}</div>}
    {tab === 'echoes' && <div className="catalog-grid echoes">{echoes.map((item) => <a className="catalog-card echo-catalog" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/><span className={`cost cost-${item.cost}`}>{item.cost}</span></div><div className="catalog-copy"><h2>{item.name}</h2><p>{item.sonatas.join(' · ')}</p><footer><span>{item.cost} cost</span><b>{'★'.repeat(Math.max(...(item.rarities ?? [1])))}</b></footer></div></a>)}</div>}
    {visibleCount === 0 && <Panel className="empty-state"><h2>No archive entries match</h2><p>Clear a filter or try a broader search.</p></Panel>}
    <p className="archive-credit">Catalog metadata and artwork imported from Nanoka 3.5 with permission. Cards open the matching Nanoka entry.</p>
  </section>
}
