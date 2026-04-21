import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapDisplayFromCache } from './lib/settingsLoader'

// Apply cached display settings BEFORE React mounts. Prevents theme flash
// on reload — the user-saved theme/font/radius is applied to the DOM
// synchronously from localStorage, then the real values load from Supabase
// in SettingsProvider and override if different.
bootstrapDisplayFromCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
