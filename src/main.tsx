import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { registerSW } from 'virtual:pwa-register'
import './ui/styles.css'
import './ui/step3.css'

let refreshingForUpdate = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForUpdate) return
    refreshingForUpdate = true
    window.location.reload()
  })

  registerSW({
    immediate: true,
    onRegisteredSW: (_serviceWorkerUrl, registration) => { void registration?.update() },
    onRegisterError: (error) => { console.error('Service worker registration failed.', error) }
  })
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
