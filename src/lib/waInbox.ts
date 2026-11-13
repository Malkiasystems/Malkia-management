import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/* WhatsApp inbox "needs reply" store (migration 060).

   One poller, shared by the sidebar badge, the global alert and the Command
   Centre, so they always agree. The server decides who may see the queue:
   wa_inbox_waiting() only answers for users holding the WhatsApp Inbox
   permission (crm.inbox) or super admins. Everyone else gets `allowed: false`
   and nothing is shown. */

export type WaPriority = 'high' | 'normal' | 'low'

export interface WaWaiting {
  phone: string
  name: string | null
  needs_reply_since: string
  reply_priority: WaPriority
  last_inbound_at: string | null
  last_inbound_body: string | null
  unanswered?: number
}

export interface WaInboxState { items: WaWaiting[]; allowed: boolean; loaded: boolean }

export const WA_PRIORITY_META: Record<WaPriority, { label: string; color: string; bg: string }> = {
  high:   { label: 'High',   color: '#B42318', bg: '#FDECEC' },
  normal: { label: 'Normal', color: '#9A6700', bg: '#FFF4D6' },
  low:    { label: 'Low',    color: '#3F6B4F', bg: '#EAF6EC' },
}

let state: WaInboxState = { items: [], allowed: false, loaded: false }
let signature = ''
const listeners = new Set<() => void>()
let timer: number | null = null
let pollMs = 30000
// Live channel: any change to a contact row (a new customer message, a reply,
// a "handled" tap on another screen) refreshes the queue within about a second.
// Polling stays on as a safety net in case the live connection drops.
let channel: ReturnType<typeof supabase.channel> | null = null
let nudgeTimer: number | null = null
const nudge = () => {
  if (nudgeTimer !== null) window.clearTimeout(nudgeTimer)
  nudgeTimer = window.setTimeout(() => { nudgeTimer = null; refreshWaInbox() }, 400)
}

const emit = () => listeners.forEach(l => l())

export async function refreshWaInbox(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('wa_inbox_waiting')
    if (error) {
      // 42501 = no WhatsApp Inbox permission. That is an answer, not an outage.
      if (error.code === '42501' && (state.allowed || !state.loaded)) {
        state = { items: [], allowed: false, loaded: true }; signature = ''; emit()
      }
      return // any other error: keep the last known queue rather than flashing empty
    }
    const items = (data || []) as WaWaiting[]
    const sig = JSON.stringify(items)
    if (sig !== signature || !state.allowed || !state.loaded) {
      signature = sig
      state = { items, allowed: true, loaded: true }
      emit()
    }
  } catch { /* network blip: keep last known state */ }
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) {
    refreshWaInbox()
    timer = window.setInterval(refreshWaInbox, pollMs)
    try {
      channel = supabase
        .channel('wa-inbox-queue')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_contacts' }, nudge)
        .subscribe()
    } catch { channel = null /* polling still covers it */ }
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) {
      if (timer !== null) { window.clearInterval(timer); timer = null }
      if (channel) { try { supabase.removeChannel(channel) } catch { /* ignore */ } channel = null }
    }
  }
}

const getSnapshot = () => state

const noopSubscribe = () => () => {}

/** Pass `enabled = false` for users without the WhatsApp Inbox permission so
 *  they never poll the server. */
export function useWaInbox(enabled: boolean = true): WaInboxState {
  return useSyncExternalStore(enabled ? subscribe : noopSubscribe, getSnapshot, getSnapshot)
}

export function setWaInboxPollSeconds(seconds: number) {
  const ms = Math.min(300, Math.max(10, Math.round(seconds))) * 1000
  if (ms === pollMs) return
  pollMs = ms
  if (timer !== null) { window.clearInterval(timer); timer = window.setInterval(refreshWaInbox, pollMs) }
}

/* ── helpers shared by the alert and the Command Centre ── */

export const waWindowLeftMs = (lastInboundAt: string | null): number =>
  lastInboundAt ? new Date(lastInboundAt).getTime() + 24 * 3600e3 - Date.now() : 0

export const waDuration = (ms: number): string => {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 1) return 'under 1 min'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return `${d} d${h ? ` ${h} h` : ''}`
}

export const waWaitedFor = (sinceIso: string): string => waDuration(Date.now() - new Date(sinceIso).getTime())

export async function waMarkHandled(phone: string): Promise<void> {
  const { error } = await supabase.rpc('wa_inbox_mark_handled', { p_phone: phone })
  if (error) throw new Error(error.message)
  await refreshWaInbox()
}

export async function waMarkHandledBulk(priority: WaPriority): Promise<number> {
  const { data, error } = await supabase.rpc('wa_inbox_mark_handled_bulk', { p_priority: priority })
  if (error) throw new Error(error.message)
  await refreshWaInbox()
  return typeof data === 'number' ? data : 0
}

export async function waSetPriority(phone: string, priority: WaPriority): Promise<void> {
  const { error } = await supabase.rpc('wa_inbox_set_priority', { p_phone: phone, p_priority: priority })
  if (error) throw new Error(error.message)
  await refreshWaInbox()
}
