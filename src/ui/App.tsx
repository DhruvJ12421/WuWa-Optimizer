import { useRef, useState } from 'react'
import type { AppView } from '../domain/types'
import { clearAccount, exportAccount, importAccount, saveSettings, validateAccount } from '../storage/database'
import { DashboardView } from './DashboardView'
import { InventoryView } from './InventoryView'
import { ScannerView } from './ScannerView'
import { BuildsView } from './BuildsView'
import { TeamsView } from './TeamsView'
import { OptimizerView } from './OptimizerView'
import { Icon, Panel } from './components'
import { useAppData } from './useAppData'

const nav: Array<{ view: AppView; label: string; icon: Parameters<typeof Icon>[0]['name'] }> = [
  { view: 'dashboard', label: 'Overview', icon: 'home' }, { view: 'scanner', label: 'Scanner', icon: 'scan' },
  { view: 'inventory', label: 'Echoes', icon: 'echo' }, { view: 'builds', label: 'Builds', icon: 'build' },
  { view: 'teams', label: 'Teams', icon: 'team' }, { view: 'optimizer', label: 'Optimizer', icon: 'optimize' }
]

export default function App() {
  const [view, setView] = useState<AppView>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const data = useAppData()

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const backup = async () => {
    const account = await exportAccount(); const blob = new Blob([JSON.stringify(account, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `tacet-lab-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000); notify('Backup exported')
  }
  const restore = async (file?: File) => {
    if (!file) return
    try { const document: unknown = JSON.parse(await file.text()); if (!validateAccount(document)) throw new Error('Unsupported backup format.'); await importAccount(document); await data.refresh(); notify('Backup restored') }
    catch (error) { notify(error instanceof Error ? error.message : 'Import failed') }
  }
  const savePreferences = async (form: HTMLFormElement) => {
    const values = new FormData(form)
    const scanIntervalMs = Math.min(10_000, Math.max(250, Number(values.get('scanIntervalMs')) || 900))
    await saveSettings({ ...data.settings, displayName: String(values.get('displayName') || 'Resonator'), privacyMode: values.get('privacyMode') === 'on', background: String(values.get('background')) as typeof data.settings.background, scanIntervalMs })
    await data.refresh(); setSettingsOpen(false); notify('Preferences saved')
  }

  if (!data.ready) return <div className="boot"><div className="brand-mark"><i/><i/><i/></div><span>INITIALIZING LOCAL ARCHIVE</span></div>
  if (data.error) return <div className="boot"><div className="brand-mark"><i/><i/><i/></div><strong>LOCAL ARCHIVE UNAVAILABLE</strong><span>{data.error}</span><button className="secondary" onClick={() => location.reload()}>Retry</button></div>

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setView('dashboard')}><div className="brand-mark"><i/><i/><i/></div><div><strong>TACET LAB</strong><span>WUWA OPTIMIZER</span></div></button><nav>{nav.map((item) => <button key={item.view} className={view === item.view ? 'active' : ''} onClick={() => setView(item.view)}><Icon name={item.icon}/><span>{item.label}</span>{item.view === 'scanner' && <b>EN</b>}</button>)}</nav><div className="side-bottom"><div className="local-status"><i/><div><strong>Local archive</strong><span>{data.echoes.length} Echoes indexed</span></div></div><button onClick={() => setSettingsOpen(true)}>⚙<span>Settings & data</span></button></div></aside>
    <main><div className="topbar"><div><span className="pulse"/>PRIVATE SESSION</div><div><button onClick={() => importRef.current?.click()}><Icon name="upload"/>Import</button><button onClick={backup}><Icon name="download"/>Backup</button><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => restore(event.target.files?.[0])}/><button className="user-button" onClick={() => setSettingsOpen(true)}>{data.settings.privacyMode ? 'P' : data.settings.displayName[0]?.toUpperCase()}</button></div></div><div className="content">
      {view === 'dashboard' && <DashboardView echoes={data.echoes} builds={data.builds} teams={data.teams} navigate={setView}/>} {view === 'scanner' && <ScannerView echoes={data.echoes} refresh={data.refresh} scanIntervalMs={data.settings.scanIntervalMs}/>} {view === 'inventory' && <InventoryView echoes={data.echoes} refresh={data.refresh} openScanner={() => setView('scanner')}/>} {view === 'builds' && <BuildsView echoes={data.echoes} builds={data.builds} settings={data.settings} refresh={data.refresh}/>} {view === 'teams' && <TeamsView echoes={data.echoes} builds={data.builds} teams={data.teams} refresh={data.refresh}/>} {view === 'optimizer' && <OptimizerView echoes={data.echoes} builds={data.builds} refresh={data.refresh} openScanner={() => setView('scanner')}/>} 
    </div><footer className="site-footer"><span>Fan-made tool. Not affiliated with Kuro Games.</span><span>Game values marked MVP require in-game verification.</span></footer></main>
    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><Panel className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">Local preferences</span><h2>Settings & data</h2></div><button className="close" onClick={() => setSettingsOpen(false)}>x</button></div><form onSubmit={(event) => { event.preventDefault(); void savePreferences(event.currentTarget) }}><label>Build-card display name<input name="displayName" defaultValue={data.settings.displayName}/></label><label>Card atmosphere<select name="background" defaultValue={data.settings.background}><option value="signal">Signal grid</option><option value="tacet">Tacet bloom</option><option value="plain">Plain black</option></select></label><label>Stable-frame interval (ms)<input name="scanIntervalMs" type="number" min="250" max="10000" step="50" defaultValue={data.settings.scanIntervalMs}/></label><label className="check"><input name="privacyMode" type="checkbox" defaultChecked={data.settings.privacyMode}/>Hide display name on exported cards</label><div className="modal-actions"><button type="button" className="danger text" onClick={async () => { if (confirm('Delete all local Echoes, builds, teams, and settings?')) { await clearAccount(); await data.refresh(); setSettingsOpen(false); notify('Local data cleared') } }}>Delete local data</button><button className="primary" type="submit">Save preferences</button></div></form></Panel></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}
