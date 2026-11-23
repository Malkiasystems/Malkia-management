import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/* MalkiaOS notifications store (migration 097).

   One poller shared by the bell and its pop-up. The list is worked out on the
   server each time from the live tables (os_notifications), so a notice goes
   away by itself the moment the work is done, and the server decides what
   each person may see from their permissions. Nothing is decided here.

   To add a new kind of notice: add a branch in os_notifications() in the
   database, then a row in OS_KIND_META below. Nothing else changes. */

export type OsKind = 'circle_question' | 'expert_application' | 'review' | 'approval' | 'payment_hold'

export interface OsNotification {
  key: string
  kind: OsKind | string
  urgent: boolean
  title: string
  detail: string | null
  page: string | null
  url: string | null
  since: string | null
}

export interface OsPrefs { off: boolean; muted_kinds: string[]; hidden_items: number }

export interface OsNotifState { items: OsNotification[]; allowed: boolean; loaded: boolean; error: string | null }

/** Label, icon and tint per kind. The icon is an SVG path (stroke style). */
export const OS_KIND_META: Record<string, { label: string; icon: string; tint: string }> = {
  circle_question: {
    label: 'Circle questions waiting for a midwife',
    icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z M9.9 9.4a2.3 2.3 0 1 1 3.3 2.1c-.6.3-1 .8-1 1.4 M12.2 15.6h.01',
    tint: '#D9628F',
  },
  expert_application: {
    label: 'Circle expert applications',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 11l2 2 4-4',
    tint: '#2E6A64',
  },
  review: {
    label: 'Hospital reviews reported or held',
    icon: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
    tint: '#B8933E',
  },
  approval: {
    label: 'Approvals waiting for my decision',
    icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    tint: '#3d8bff',
  },
  payment_hold: {
    label: 'Payments waiting for approval',
    icon: 'M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M1 10h22',
    tint: '#d4874a',
  },
}
export const OS_KIND_FALLBACK = {
  label: 'Other notices',
  icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  tint: '#5a6070',
}
export const osKindMeta = (kind: string) => OS_KIND_META[kind] || OS_KIND_FALLBACK

const POLL_MS = 60000

let state: OsNotifState = { items: [], allowed: false, loaded: false, error: null }
let signature = ''
const listeners = new Set<() => void>()
let timer: number | null = null

const emit = () => listeners.forEach(l => l())

export async function refreshOsNotifications(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('os_notifications')
    if (error) {
      // 42501 = not signed in as active staff. That is an answer, not an outage.
      if (error.code === '42501') {
        if (state.allowed || !state.loaded) { state = { items: [], allowed: false, loaded: true, error: null }; signature = ''; emit() }
        return
      }
      // Anything else: keep the last known list and keep the real message for the panel.
      if (state.error !== error.message) { state = { ...state, loaded: true, error: error.message }; emit() }
      return
    }
    const items = (data || []) as OsNotification[]
    const sig = JSON.stringify(items)
    if (sig !== signature || !state.allowed || !state.loaded || state.error) {
      signature = sig
      state = { items, allowed: true, loaded: true, error: null }
      emit()
    }
  } catch { /* network blip: keep the last known list */ }
}

const onWake = () => { if (document.visibilityState !== 'hidden') refreshOsNotifications() }

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) {
    refreshOsNotifications()
    timer = window.setInterval(refreshOsNotifications, POLL_MS)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) {
      if (timer !== null) { window.clearInterval(timer); timer = null }
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }
}

const getSnapshot = () => state

export function useOsNotifications(): OsNotifState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/* ── per-user switches. Each returns the database's own error message, or null. ── */

/** key: 'all' | 'kind:<kind>' | 'item:<notification key>'. on = true mutes it. */
export async function osMute(key: string, on: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('os_notification_mute', { p_key: key, p_on: on })
  if (error) return error.message
  await refreshOsNotifications()
  return null
}

export async function osUnhideAll(): Promise<string | null> {
  const { error } = await supabase.rpc('os_notification_unhide_all')
  if (error) return error.message
  await refreshOsNotifications()
  return null
}

export async function osLoadPrefs(): Promise<{ prefs: OsPrefs | null; error: string | null }> {
  const { data, error } = await supabase.rpc('os_notification_prefs')
  if (error) return { prefs: null, error: error.message }
  const p = (data || {}) as Partial<OsPrefs>
  return {
    prefs: {
      off: p.off === true,
      muted_kinds: Array.isArray(p.muted_kinds) ? p.muted_kinds : [],
      hidden_items: Number(p.hidden_items) || 0,
    },
    error: null,
  }
}

/** "waiting 3 h 20 min" style age. */
export const osWaited = (since: string | null): string => {
  if (!since) return ''
  const m = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return `${d} d${h ? ` ${h} h` : ''}`
}
