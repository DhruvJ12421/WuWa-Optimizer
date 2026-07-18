import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './pwa-update.css'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const [updating, setUpdating] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState('')
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_serviceWorkerUrl, registration) => {
      registrationRef.current = registration
      void registration?.update()
    },
    onRegisterError: (registrationError) => {
      console.error('Service worker registration failed.', registrationError)
    }
  })

  useEffect(() => {
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') void registrationRef.current?.update()
    }
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', checkForUpdate)
      window.removeEventListener('online', checkForUpdate)
    }
  }, [])

  if (!needRefresh || dismissed) return null

  const applyUpdate = async () => {
    setUpdating(true)
    setError('')
    try {
      await updateServiceWorker(true)
    } catch (updateError) {
      console.error('Service worker update failed.', updateError)
      setError('Update failed. Check your connection and try again.')
      setUpdating(false)
    }
  }

  return <aside className="pwa-update-toast" role="status" aria-live="polite">
    <div><strong>New version available</strong><span>Reload to update Tacet Lab. Saved inventory and settings stay safe; finish any unapproved scan first.</span>{error && <small>{error}</small>}</div>
    <div><button type="button" className="text-button" disabled={updating} onClick={() => { setDismissed(true); window.setTimeout(() => setDismissed(false), 30 * 60 * 1_000) }}>Later</button><button type="button" className="primary" disabled={updating} onClick={() => void applyUpdate()}>{updating ? 'Updating...' : 'Reload now'}</button></div>
  </aside>
}
