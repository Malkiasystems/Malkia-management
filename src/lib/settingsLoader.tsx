// ─── Settings Loader & Provider ────────────────────────────────────────────
// Single source of truth for app-wide settings. Runs once on app boot
// (after login), fetches every setting key in parallel from Supabase,
// merges with defaults, and exposes via React Context.
//
// Why this exists: before, every settings page fetched its own slice,
// applied its own DOM mutations, and the app's startup had no knowledge
// of what theme the user wanted. Refreshing on any page outside Display
// Settings lost the theme. This file fixes that by loading everything
// at the App level so the very first render already has the right theme.
// ───────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'
import {
  AllSettings, DEFAULT_ALL_SETTINGS, SETTING_KEYS,
  DEFAULT_COMPANY, DEFAULT_NUMBERING, DEFAULT_TAX, DEFAULT_NOTIFICATIONS,
  DEFAULT_SECURITY, DEFAULT_BACKUP, DEFAULT_REGIONAL, DEFAULT_DISPLAY,
} from './settingsDefaults'

// ─── Theme definitions (co-located so the loader can apply on boot) ────────
// These CSS var maps must match the THEMES object in DisplaySettings.tsx.
// Keeping them here too means we can apply the theme BEFORE DisplaySettings
// is ever rendered — fixes the "refresh drops back to default" bug.

export const THEME_VARS: Record<string, Record<string, string>> = {
  midnight: {
    '--bg': '#0a0b0f', '--surface': '#111318', '--surface2': '#181b22', '--surface3': '#1e2129',
    '--border': 'rgba(255,255,255,0.07)', '--border2': 'rgba(255,255,255,0.13)',
    '--accent': '#d4874a', '--accent2': '#b86d32', '--accent-dim': 'rgba(212,135,74,0.12)',
    '--text': '#e8eaf0', '--text2': '#9aa0b0', '--text3': '#5a6070',
  },
  malkia: {
    '--bg': '#0f1419', '--surface': '#1a2027', '--surface2': '#232b33', '--surface3': '#2c353f',
    '--border': 'rgba(133,194,190,0.12)', '--border2': 'rgba(133,194,190,0.22)',
    '--accent': '#85c2be', '--accent2': '#6ba8a4', '--accent-dim': 'rgba(133,194,190,0.12)',
    '--text': '#e8eaf0', '--text2': '#9aa0b0', '--text3': '#5a6070',
  },
  accountant: {
    '--bg': '#0d1117', '--surface': '#161b22', '--surface2': '#1c2128', '--surface3': '#22272e',
    '--border': 'rgba(48,54,61,0.8)', '--border2': 'rgba(48,54,61,1)',
    '--accent': '#58a6ff', '--accent2': '#388bfd', '--accent-dim': 'rgba(88,166,255,0.12)',
    '--text': '#c9d1d9', '--text2': '#8b949e', '--text3': '#6e7681',
  },
  obsidian: {
    '--bg': '#000000', '--surface': '#0d0d0d', '--surface2': '#171717', '--surface3': '#1f1f1f',
    '--border': 'rgba(255,255,255,0.06)', '--border2': 'rgba(255,255,255,0.12)',
    '--accent': '#a855f7', '--accent2': '#9333ea', '--accent-dim': 'rgba(168,85,247,0.12)',
    '--text': '#fafafa', '--text2': '#a1a1aa', '--text3': '#71717a',
  },
  // These four were offered in the Display Settings picker but were missing
  // here, so applyTheme fell through to midnight and choosing them appeared to
  // do nothing at all.
  forest: {
    '--bg': '#0c1210', '--surface': '#121a17', '--surface2': '#1a2520', '--surface3': '#223029',
    '--border': 'rgba(16,185,129,0.12)', '--border2': 'rgba(16,185,129,0.22)',
    '--accent': '#10b981', '--accent2': '#059669', '--accent-dim': 'rgba(16,185,129,0.12)',
    '--text': '#e8f0ec', '--text2': '#9aaca2', '--text3': '#5a706a',
  },
  light: {
    '--bg': '#f8fafc', '--surface': '#ffffff', '--surface2': '#f1f5f9', '--surface3': '#e2e8f0',
    '--border': 'rgba(0,0,0,0.08)', '--border2': 'rgba(0,0,0,0.15)',
    '--accent': '#0ea5e9', '--accent2': '#0284c7', '--accent-dim': 'rgba(14,165,233,0.12)',
    '--text': '#0f172a', '--text2': '#475569', '--text3': '#94a3b8',
  },
  sepia: {
    '--bg': '#f5f1e8', '--surface': '#fffbf5', '--surface2': '#ebe5d8', '--surface3': '#ddd6c8',
    '--border': 'rgba(0,0,0,0.08)', '--border2': 'rgba(0,0,0,0.15)',
    '--accent': '#b45309', '--accent2': '#92400e', '--accent-dim': 'rgba(180,83,9,0.12)',
    '--text': '#292524', '--text2': '#57534e', '--text3': '#a8a29e',
  },
  nord: {
    '--bg': '#2e3440', '--surface': '#3b4252', '--surface2': '#434c5e', '--surface3': '#4c566a',
    '--border': 'rgba(216,222,233,0.1)', '--border2': 'rgba(216,222,233,0.2)',
    '--accent': '#88c0d0', '--accent2': '#81a1c1', '--accent-dim': 'rgba(136,192,208,0.15)',
    '--text': '#eceff4', '--text2': '#d8dee9', '--text3': '#7b88a1',
  },
  // Daylight: the light theme carrying the Malkia teal rather than a generic
  // sky blue, so the brand survives the switch to white.
  daylight: {
    '--bg': '#f7faf9', '--surface': '#ffffff', '--surface2': '#eef4f3', '--surface3': '#dfe9e8',
    '--border': 'rgba(15,42,40,0.10)', '--border2': 'rgba(15,42,40,0.18)',
    '--accent': '#3f8a84', '--accent2': '#2f6f6a', '--accent-dim': 'rgba(63,138,132,0.14)',
    '--text': '#12211f', '--text2': '#4a5c5a', '--text3': '#849694',
  },
}

// ─── Day / night ────────────────────────────────────────────────────────────
// 'auto' is not a palette, it is a rule: daylight while the sun is up, the
// user's chosen dark theme after it sets. Local clock, not UTC, and no
// geolocation: Dar es Salaam sits close enough to the equator that 06:00-18:00
// holds all year to within about twenty minutes.
export const AUTO_THEME_KEY = 'auto'
const DAY_START_HOUR = 6
const DAY_END_HOUR = 18
export const AUTO_DAY_THEME = 'daylight'
export const AUTO_NIGHT_THEME = 'malkia'

export function isDaytime(d = new Date()): boolean {
  const h = d.getHours()
  return h >= DAY_START_HOUR && h < DAY_END_HOUR
}

/** Turn a stored preference into a palette key. Only 'auto' resolves. */
export function resolveTheme(themeKey: string): string {
  if (themeKey !== AUTO_THEME_KEY) return themeKey
  return isDaytime() ? AUTO_DAY_THEME : AUTO_NIGHT_THEME
}

// ─── Apply functions (pure DOM mutations, callable from anywhere) ──────────

let autoTimer: ReturnType<typeof setInterval> | null = null

export function applyTheme(themeKey: string) {
  const resolved = resolveTheme(themeKey)
  const theme = THEME_VARS[resolved] || THEME_VARS.midnight
  Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))

  // A till screen stays open all day. Without this, a browser opened at 09:00
  // would still be showing daylight at 21:00. Checked every ten minutes, which
  // is cheap and lands the switch within ten minutes of the boundary.
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
  if (themeKey === AUTO_THEME_KEY) {
    let last = resolved
    autoTimer = setInterval(() => {
      const next = resolveTheme(AUTO_THEME_KEY)
      if (next === last) return
      last = next
      const vars = THEME_VARS[next] || THEME_VARS.midnight
      Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
    }, 10 * 60 * 1000)
  }
}

export function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`
}

export function applyBorderRadius(r: number) {
  document.documentElement.style.setProperty('--r', `${r}px`)
  document.documentElement.style.setProperty('--rl', `${r + 6}px`)
}

export function applyDisplaySettings(d: typeof DEFAULT_DISPLAY) {
  applyTheme(d.theme)
  applyFontSize(d.font_size)
  applyBorderRadius(d.border_radius)
}

// ─── Core loader ────────────────────────────────────────────────────────────
// Fetches all keys in one round-trip. Falls back silently to defaults for
// any key that doesn't exist yet in system_settings.

export async function loadAllSettings(): Promise<AllSettings> {
  const keys = [
    SETTING_KEYS.COMPANY_FINANCE,
    SETTING_KEYS.NUMBERING,
    SETTING_KEYS.TAX,
    SETTING_KEYS.NOTIFICATIONS,
    SETTING_KEYS.SECURITY,
    SETTING_KEYS.BACKUP,
    SETTING_KEYS.REGIONAL,
    SETTING_KEYS.DISPLAY,
  ]

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', keys)

  if (error) {
    // Don't block the app — just return defaults.
    // (Common when the user is offline or the table hasn't been created yet.)
    console.warn('[settings] load failed, using defaults:', error.message)
    return DEFAULT_ALL_SETTINGS
  }

  // Build a map of what came back
  const map: Record<string, any> = {}
  for (const row of data || []) {
    try {
      map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    } catch {
      // Malformed JSON — fall back to default for that key
      console.warn(`[settings] malformed JSON for key "${row.key}", using default`)
    }
  }

  // Merge each slice with its default, so any missing fields in stored
  // data (e.g. after we add a new field) get sensible fallbacks.
  return {
    company:       { ...DEFAULT_COMPANY,       ...(map[SETTING_KEYS.COMPANY_FINANCE] || {}) },
    numbering:     { ...DEFAULT_NUMBERING,     ...(map[SETTING_KEYS.NUMBERING]       || {}) },
    tax:           { ...DEFAULT_TAX,           ...(map[SETTING_KEYS.TAX]             || {}) },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(map[SETTING_KEYS.NOTIFICATIONS]   || {}) },
    security:      { ...DEFAULT_SECURITY,      ...(map[SETTING_KEYS.SECURITY]        || {}) },
    backup:        { ...DEFAULT_BACKUP,        ...(map[SETTING_KEYS.BACKUP]          || {}) },
    regional:      { ...DEFAULT_REGIONAL,      ...(map[SETTING_KEYS.REGIONAL]        || {}) },
    display:       { ...DEFAULT_DISPLAY,       ...(map[SETTING_KEYS.DISPLAY]         || {}) },
  }
}

// ─── Save helpers ───────────────────────────────────────────────────────────

export async function saveSettingSlice(key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('system_settings').upsert(
    { key, value: JSON.stringify(value) },
    { onConflict: 'key' }
  )
  if (error) {
    console.error(`[settings] save failed for ${key}:`, error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ─── React Context ─────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: AllSettings
  loading: boolean
  // Update one slice. Writes to DB and updates the in-memory copy.
  updateSlice: <K extends keyof AllSettings>(slice: K, value: AllSettings[K]) => Promise<boolean>
  // Force a reload from DB (useful after external changes)
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AllSettings>(DEFAULT_ALL_SETTINGS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const loaded = await loadAllSettings()
    setSettings(loaded)
    // Apply display settings to DOM immediately so the UI reflects them
    // on first render, not only after the user visits Display Settings.
    applyDisplaySettings(loaded.display)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateSlice = useCallback(async <K extends keyof AllSettings>(
    slice: K, value: AllSettings[K]
  ): Promise<boolean> => {
    // Map slice name → DB key
    const sliceKeyMap: Record<keyof AllSettings, string> = {
      company: SETTING_KEYS.COMPANY_FINANCE,
      numbering: SETTING_KEYS.NUMBERING,
      tax: SETTING_KEYS.TAX,
      notifications: SETTING_KEYS.NOTIFICATIONS,
      security: SETTING_KEYS.SECURITY,
      backup: SETTING_KEYS.BACKUP,
      regional: SETTING_KEYS.REGIONAL,
      display: SETTING_KEYS.DISPLAY,
    }
    const dbKey = sliceKeyMap[slice]
    const result = await saveSettingSlice(dbKey, value)
    if (!result.success) return false

    // Update in-memory state
    setSettings(prev => ({ ...prev, [slice]: value }))

    // Special case: if this was the display slice, apply to DOM too
    if (slice === 'display') applyDisplaySettings(value as typeof DEFAULT_DISPLAY)
    return true
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSlice, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used inside <SettingsProvider>')
  }
  return ctx
}

// ─── Pre-render display bootstrap ──────────────────────────────────────────
// Call this BEFORE React mounts (from main.tsx), so the first paint
// already has the right theme. Uses localStorage as a fast synchronous
// cache so we don't flash the default theme while Supabase loads.

const LOCAL_CACHE_KEY = 'malkia_display_cache'

export function bootstrapDisplayFromCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    if (!raw) return
    const cached = JSON.parse(raw)
    if (cached && typeof cached === 'object') {
      applyDisplaySettings({ ...DEFAULT_DISPLAY, ...cached })
    }
  } catch {
    // ignore — defaults will render
  }
}

export function cacheDisplayLocally(d: typeof DEFAULT_DISPLAY) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(d))
  } catch {
    // ignore — cache is best-effort
  }
}
