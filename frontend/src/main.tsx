import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { offlineEnabled } from './offline/platform'

async function start() {
  if (offlineEnabled) {
    const { bootOffline } = await import('./offline/boot')
    await bootOffline()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
