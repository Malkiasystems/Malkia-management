// ============================================================================
// GuideMode.tsx
// First-run guidance layer. Explanatory captions under form fields and page
// sections, ON by default for every user, switchable off with a small toggle
// that remembers the choice per user and per company (localStorage — same
// mechanism as coach marks and the checklist dismiss).
//
//   useGuided()  → [on, toggle]   shared state, syncs across components
//   <GuideToggle />               the "Guided tips" switch for page headers
//   <GuideTip>text</GuideTip>     a caption that renders only when guided is on
// ============================================================================

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'

const EVT = 'atlas-guide-change'

function key(userId: string | undefined): string {
  return `malkia.guide.${userId || 'anon'}`
}

function readGuided(userId: string | undefined): boolean {
  // Absent = ON. Only an explicit '0' turns guidance off.
  try { return localStorage.getItem(key(userId)) !== '0' } catch { return true }
}

export function useGuided(): [boolean, () => void] {
  const { user } = useAuth()
  const uid = user?.id
  const [on, setOn] = useState(() => readGuided(uid))

  useEffect(() => {
    setOn(readGuided(uid))
    const sync = () => setOn(readGuided(uid))
    window.addEventListener(EVT, sync)
    return () => window.removeEventListener(EVT, sync)
  }, [uid])

  const toggle = useCallback(() => {
    try { localStorage.setItem(key(uid), readGuided(uid) ? '0' : '1') } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT))
  }, [uid])

  return [on, toggle]
}

// Until a user has pressed the toggle ONCE (ever, per browser), it breathes —
// a slow glow pulse so a new user notices the switch exists. First press
// calms it forever. prefers-reduced-motion never sees the pulse at all.
const SEEN_KEY = 'atlas.guide.toggleSeen'
const toggleSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true } }

export function GuideToggle() {
  const [on, toggle] = useGuided()
  const [seen, setSeen] = useState(toggleSeen)
  const press = () => {
    if (!seen) { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ } setSeen(true) }
    toggle()
  }
  const attract = !on   // tips off = breathe; tips on = rest. No memory.
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
    <button
      type="button"
      onClick={press}
      className={attract ? 'guide-toggle-breathe' : undefined}
      title={on ? 'Hide the explanatory tips on this page' : 'Show explanatory tips under each field'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: on ? 'var(--accent-dim)' : 'var(--surface2)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
        fontSize: 11, color: on ? 'var(--accent)' : 'var(--text3)', fontWeight: 600,
      }}
    >
      {attract && <style>{`
        @keyframes guideBreathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb),.45); }
          50% { box-shadow: 0 0 0 6px rgba(var(--accent-rgb),0); }
        }
        .guide-toggle-breathe { animation: guideBreathe 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .guide-toggle-breathe { animation: none; } }
      `}</style>}
      <span aria-hidden="true" style={{ fontFamily: 'Georgia, serif', fontSize: 15, lineHeight: 0, transform: 'translateY(3px)' }}>❝</span>
      Guided tips {on ? 'on' : 'off'}
    </button>
    {/* Until the first ever press: a small bobbing caption pointing at the
        switch, so a brand-new user knows this is where the guidance lives.
        Absolutely positioned so the page header never shifts; disappears
        forever once the toggle has been pressed once. */}
    {!seen && (
      <span className="guide-toggle-callout" aria-hidden="true">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        Not sure where to start? These tips explain each field.
      </span>
    )}
    {!seen && <style>{`
      .guide-toggle-callout {
        position: absolute; top: calc(100% + 5px); right: 0; z-index: 30;
        display: inline-flex; align-items: center; gap: 5px;
        white-space: nowrap; pointer-events: none;
        font-size: 10px; font-weight: 600; color: var(--accent);
        background: var(--surface); border: 1px solid var(--accent);
        border-radius: 7px; padding: 3px 8px;
        box-shadow: 0 4px 14px rgba(0,0,0,.35);
        animation: guideCalloutBob 1.6s ease-in-out infinite;
      }
      @keyframes guideCalloutBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
      @media (prefers-reduced-motion: reduce) { .guide-toggle-callout { animation: none; } }
      @media (max-width: 760px) { .guide-toggle-callout { white-space: normal; max-width: 200px; text-align: left; } }
    `}</style>}
    </span>
  )
}

export function GuideTip({ children }: { children: ReactNode }) {
  const [on, toggle] = useGuided()
  // ── Collapsed by default ─────────────────────────────────────────────────
  // Long tips used to occupy more screen than the fields they explained (see
  // the Inventory form, where two tips ran ~15 lines each). A tip now shows
  // its first two lines with a More control; short tips render whole and
  // never show the control. Expansion is per-tip, per-render — a page visited
  // fresh starts compact again, which is the point of a summary.
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const bodyRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    if (!on || expanded) return
    const el = bodyRef.current
    if (!el) return
    // scrollHeight > clientHeight means the clamp is actually hiding text.
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [on, expanded, children])

  if (!on) return null
  // Turning tips off from inside a tip counts as having discovered the
  // mechanism, so the header toggle stops breathing too.
  const turnOff = () => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
    toggle()
  }
  const collapsible = overflows || expanded
  return (
    <div className="guide-tip" style={{
      display: 'flex', gap: 7, alignItems: 'flex-start',
      fontSize: 11, lineHeight: 1.55, color: 'var(--text3)',
      background: 'var(--accent-dim)', borderLeft: '2px solid var(--accent)',
      borderRadius: '0 7px 7px 0', padding: '6px 10px', margin: '6px 0 2px',
    }}>
      <style>{`
        .guide-tip .guide-tip-off { opacity: 0; pointer-events: none; transition: opacity .15s ease; }
        .guide-tip:hover .guide-tip-off, .guide-tip:focus-within .guide-tip-off { opacity: 1; pointer-events: auto; }
        @media (prefers-reduced-motion: reduce) { .guide-tip .guide-tip-off { transition: none; } }
        .guide-tip .guide-tip-clamp {
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
      <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          ref={bodyRef}
          className={expanded ? undefined : 'guide-tip-clamp'}
          onClick={collapsible && !expanded ? () => setExpanded(true) : undefined}
          style={collapsible && !expanded ? { cursor: 'pointer' } : undefined}
          title={collapsible && !expanded ? 'Show the full tip' : undefined}
        >
          {children}
        </span>
        {collapsible && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'transparent', border: 'none', padding: '2px 0 0',
              cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--accent)',
            }}
          >
            {expanded ? 'Less' : 'More'}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}
      </span>
      {/* Revealed on hover (or keyboard focus): kills guided mode right where
          it became annoying, instead of making the user hunt for the header
          toggle. Same per-user, per-company switch — the header pill syncs. */}
      <button
        type="button"
        className="guide-tip-off"
        onClick={turnOff}
        title="Hide these explanatory tips on every page (the Guided tips switch in the header brings them back)"
        style={{
          flexShrink: 0, alignSelf: 'center',
          background: 'transparent', border: '1px solid var(--accent)',
          borderRadius: 999, padding: '1px 8px', cursor: 'pointer',
          fontSize: 10, fontWeight: 600, color: 'var(--accent)',
          whiteSpace: 'nowrap',
        }}
      >
        Turn tips off
      </button>
    </div>
  )
}
