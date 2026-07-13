import { useDeferredValue, useMemo, useState } from 'react'
import { characterCatalog, echoCatalog, sonataCatalog, weaponCatalog } from '../game-data'
import { generatedSonataIconSources } from '../game-data/catalog.generated'
import { Icon, PageHeader, Panel } from './components'

type ArchiveTab = 'characters' | 'weapons' | 'sonatas' | 'echoes'

const tabs: Array<{ id: ArchiveTab; label: string; count: number }> = [
  { id: 'characters', label: 'Characters', count: characterCatalog.length },
  { id: 'weapons', label: 'Weapons', count: weaponCatalog.length },
  { id: 'sonatas', label: 'Sonatas', count: sonataCatalog.length },
  { id: 'echoes', label: 'Echoes', count: echoCatalog.length }
]

export function ArchiveView() {
  const [tab, setTab] = useState<ArchiveTab>('characters')
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState('all')
  const [category, setCategory] = useState('all')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const categories = useMemo(() => {
    if (tab === 'characters') return [...new Set(characterCatalog.map((item) => item.element))]
    if (tab === 'weapons') return [...new Set(weaponCatalog.map((item) => item.type))]
    if (tab === 'echoes') return ['1-cost', '3-cost', '4-cost']
    return []
  }, [tab])

  const changeTab = (next: ArchiveTab) => { setTab(next); setQuery(''); setRarity('all'); setCategory('all') }
  const matches = (text: string, itemRarity?: number, itemCategory?: string) =>
    (!deferredQuery || text.toLowerCase().includes(deferredQuery)) &&
    (rarity === 'all' || itemRarity === Number(rarity)) &&
    (category === 'all' || itemCategory === category)

  const characters = characterCatalog.filter((item) => matches(`${item.name} ${item.nickname} ${item.element} ${item.weaponType}`, item.rarity, item.element))
  const weapons = weaponCatalog.filter((item) => matches(`${item.name} ${item.type} ${item.secondaryStat}`, item.rarity, item.type))
  const sonatas = sonataCatalog.filter((item) => matches(item.name))
  const echoes = echoCatalog.filter((item) => matches(`${item.name} ${item.sonatas.join(' ')}`, Math.max(...(item.rarities ?? [])), `${item.cost}-cost`))
  const visibleCount = tab === 'characters' ? characters.length : tab === 'weapons' ? weapons.length : tab === 'sonatas' ? sonatas.length : echoes.length

  return <>
    <PageHeader eyebrow="Database / Nanoka 3.5" title="Wuthering Waves archive" description="Browse the complete imported character, weapon, Sonata, and Echo catalogs." />
    <div className="archive-tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)} key={item.id}><span>{item.label}</span><b>{item.count}</b></button>)}</div>
    <Panel className="archive-toolbar"><label className="search"><Icon name="scan"/><input aria-label="Search archive" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}...`}/></label>{tab !== 'sonatas' && <select aria-label="Rarity" value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="all">All rarities</option>{[5,4,3,2,1].map((value) => <option value={value} key={value}>{value} star</option>)}</select>}{categories.length > 0 && <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option value={value} key={value}>{value}</option>)}</select>}<span className="archive-count">{visibleCount} shown</span></Panel>

    {tab === 'characters' && <div className="catalog-grid characters">{characters.map((item) => <a className="catalog-card character" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/><span className={`element element-${item.element.toLowerCase()}`}>{item.element.slice(0,1)}</span></div><div className="catalog-copy"><h2>{item.name}</h2><p>{item.nickname}</p><footer><span>{item.element}</span><span>{item.weaponType}</span><b>{'★'.repeat(item.rarity)}</b></footer></div></a>)}</div>}
    {tab === 'weapons' && <div className="catalog-grid weapons">{weapons.map((item) => <a className="catalog-card weapon" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/></div><div className="catalog-copy"><h2>{item.name}</h2><p>{item.type}</p><footer><span>ATK {item.baseAtk}</span><span>{item.secondaryStat}</span><b>{'★'.repeat(item.rarity)}</b></footer></div></a>)}</div>}
    {tab === 'sonatas' && <div className="catalog-grid sonatas">{sonatas.map((item) => <article className="catalog-card sonata" key={item.id}><div className="sonata-heading"><div className="sonata-mark"><img src={generatedSonataIconSources[item.name]} alt={`${item.name} icon`} loading="lazy"/></div><div><h2>{item.name}</h2><span>{item.echoCount} compatible Echoes</span></div></div><div className="sonata-effects">{item.effects.map((effect) => <div key={effect.pieces}><b>{effect.pieces}-piece</b><p>{effect.description}</p></div>)}</div></article>)}</div>}
    {tab === 'echoes' && <div className="catalog-grid echoes">{echoes.map((item) => <a className="catalog-card echo-catalog" href={item.articleUrl} target="_blank" rel="noreferrer" key={item.id}><div className="catalog-art"><img src={item.iconSourceUrl} alt="" loading="lazy"/><span className={`cost cost-${item.cost}`}>{item.cost}</span></div><div className="catalog-copy"><h2>{item.name}</h2><p>{item.sonatas.join(' · ')}</p><footer><span>{item.cost} cost</span><b>{'★'.repeat(Math.max(...(item.rarities ?? [1])))}</b></footer></div></a>)}</div>}
    {visibleCount === 0 && <Panel className="empty-state"><h2>No archive entries match</h2><p>Clear a filter or try a broader search.</p></Panel>}
    <p className="archive-credit">Catalog metadata and artwork imported from Nanoka 3.5 with permission. Cards open the matching Nanoka entry.</p>
  </>
}
