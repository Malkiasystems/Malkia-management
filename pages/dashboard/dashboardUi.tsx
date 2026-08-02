// ============================================================================
// dashboardUi.tsx
// Presentation-only utilities shared by Dashboard.tsx and its two section
// components. No data fetching, no posting logic.
//   useCountUp  — rAF number tween, 800ms ease-out, reduced-motion aware
//   CountUp     — renders a tweened value through any formatter
//   Spark       — 7-point mini trend interpolated from previous→current,
//                 flat elegant baseline when there is no prior figure
//   DuoIcon     — custom inline icon set (1.8 stroke, rounded, 24 viewBox)
//                 inside a rounded square tinted at 12% of its tone
//   DeltaTag    — vs-last-month movement; "no prior month" as a muted pill
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Count-up ────────────────────────────────────────────────────────────────
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const raf = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return }
    const from = 0
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // easeOutCubic
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(from + (target - from) * ease(t))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return value
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const v = useCountUp(value)
  // Tween over the magnitude, keep the sign stable so negatives don't flicker.
  return <>{format(v)}</>
}

// ── Sparkline ───────────────────────────────────────────────────────────────
// prev === null/undefined → flat baseline. Otherwise a smooth 7-point ease
// between last month and this month (the only series the hook exposes).
export function Spark({ prev, current, tone }: { prev: number | null | undefined; current: number; tone: string }) {
  const W = 72, H = 20, PAD = 2
  const pts: number[] = []
  if (prev === null || prev === undefined || (prev === 0 && current === 0)) {
    for (let i = 0; i < 7; i++) pts.push(0.5)
  } else {
    const ease = (t: number) => t * t * (3 - 2 * t) // smoothstep
    for (let i = 0; i < 7; i++) pts.push(ease(i / 6))
    if (current < prev) pts.reverse() // downward month reads as a descent
  }
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1
  const xy = pts.map((p, i) => {
    const x = PAD + (i * (W - PAD * 2)) / 6
    const y = H - PAD - ((p - lo) / span) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block', opacity: 0.85 }}>
      <polyline points={xy} fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xy.split(' ').pop()!.split(',')[0]} cy={xy.split(' ').pop()!.split(',')[1]} r="1.8" fill={tone} />
    </svg>
  )
}

// ── Icon set ────────────────────────────────────────────────────────────────
const PATHS: Record<string, ReactNode> = {
  coins:    <><ellipse cx="9" cy="6.5" rx="6.5" ry="3.5"/><path d="M2.5 6.5v5c0 1.9 2.9 3.5 6.5 3.5s6.5-1.6 6.5-3.5v-5"/><path d="M2.5 11.5v5C2.5 18.4 5.4 20 9 20s6.5-1.6 6.5-3.5v-5"/><path d="M18.5 9.8c1.8.5 3 1.5 3 2.7 0 1.4-1.7 2.6-4 3.1"/></>,
  scale:    <><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7L2.5 13a3 3 0 0 0 5 0z"/><path d="M19 7l-2.5 6a3 3 0 0 0 5 0z"/><path d="M8 21h8"/></>,
  flame:    <><path d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5.2-3.5-7C14 6.6 13 4.7 13 2c-3 2-4.2 4.4-4 6.5.1 1.3-.8.9-1.5 0C5.8 10 5 12 5 15.5 5 19.3 8 22 12 22z"/><path d="M12 22c1.8 0 3-1.3 3-3 0-1.6-1-2.5-1.7-3.6-.5-.8-.8-1.6-.8-2.9-1.6 1.1-2.3 2.3-2.3 3.5-.6-.2-.9-.6-1.1-1.2-.7 1-1.1 2-1.1 3.2 0 2.7 2.2 4 4 4z"/></>,
  vault:    <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8.5V10M12 14v1.5M8.5 12H10M14 12h1.5"/><path d="M6 20v1.5M18 20v1.5"/></>,
  inflow:   <><path d="M20 4L8 16"/><path d="M16.5 16H8V7.5"/><path d="M3 20h18"/></>,
  outflow:  <><path d="M4 16L16 4"/><path d="M7.5 4H16v8.5"/><path d="M3 20h18"/></>,
  cart:     <><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 12.5a2 2 0 0 0 2 1.5h8a2 2 0 0 0 2-1.6L21.5 8H6"/></>,
  crate:    <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 12v9.2"/></>,
  people:   <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.6"/><path d="M17.5 14.4a6.5 6.5 0 0 1 4 5.6"/></>,
  heart:    <path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7l1.1 1.1L12 22l7.7-7.6 1.1-1.1a5.4 5.4 0 0 0 0-7.7z"/>,
  stamp:    <><path d="M12 3a3 3 0 0 0-3 3c0 1.6.8 2.6 1.4 3.8.3.7.1 1.2-.6 1.2H7a3 3 0 0 0-3 3v1h16v-1a3 3 0 0 0-3-3h-2.8c-.7 0-.9-.5-.6-1.2.6-1.2 1.4-2.2 1.4-3.8a3 3 0 0 0-3-3z"/><path d="M5 19h14v2H5z"/></>,
  bank:     <><path d="M3 9l9-6 9 6"/><path d="M4 9.5h16"/><path d="M6 13v5M10 13v5M14 13v5M18 13v5"/><path d="M3 21h18"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/></>,
  picture:  <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M21 15.5l-4.5-4.5L7 20"/></>,
  bolt:     <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>,
  chevron:  <path d="M9 6l6 6-6 6"/>,
  refresh:  <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
  till:     <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
}

export function Ic({ name, size = 16, tone = 'currentColor' }: { name: string; size?: number; tone?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? <circle cx="12" cy="12" r="9"/>}
    </svg>
  )
}

export function DuoIcon({ name, tone, size = 32 }: { name: string; tone: string; size?: number }) {
  return (
    <span className="duo-icon" style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone,
    }}>
      <Ic name={name} size={Math.round(size * 0.52)} tone={tone} />
    </span>
  )
}

// ── Delta ───────────────────────────────────────────────────────────────────
export function DeltaTag({ deltaPct, invert = false }: { deltaPct: number | null; invert?: boolean }) {
  if (deltaPct === null) {
    return (
      <span style={{
        fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px',
        display: 'inline-block', letterSpacing: '.2px',
      }}>no prior month</span>
    )
  }
  const good = invert ? deltaPct < 0 : deltaPct >= 0
  const tone = good ? 'var(--green)' : 'var(--red)'
  return (
    <span style={{ fontSize: 11, color: tone, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 600 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {deltaPct >= 0 ? <path d="M4 17l6-7 4 4 6-8"/> : <path d="M4 7l6 7 4-4 6 8"/>}
      </svg>
      {Math.abs(deltaPct).toFixed(0)}% vs last month
    </span>
  )
}
