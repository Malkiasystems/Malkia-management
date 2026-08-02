// ============================================================================
// EmptyState.tsx
// Shared teaching empty state for first-run pages. Instead of "No X found",
// it explains WHAT this page is for, WHY it matters, and gives one primary
// action (usually "create your first X") plus an optional secondary nav and
// an optional "Load demo data" action for playground exploration.
//
// Also exports the localStorage "seen key" helpers used by CoachMark and the
// OnboardingChecklist dismiss state. Keys are scoped per user AND company so
// multi-company users get fresh guidance in each tenant.
// ============================================================================

import type { ReactNode } from 'react'

// ── Per-user, per-company local flags ───────────────────────────────────────
export function seenKey(userId: string | undefined, key: string): string {
  return `malkia.seen.${userId || 'anon'}.${key}`
}
export function hasSeen(userId: string | undefined, key: string): boolean {
  try { return localStorage.getItem(seenKey(userId, key)) === '1' } catch { return false }
}
export function markSeen(userId: string | undefined, key: string): void {
  try { localStorage.setItem(seenKey(userId, key), '1') } catch { /* private mode */ }
}
export function clearSeen(userId: string | undefined, key: string): void {
  try { localStorage.removeItem(seenKey(userId, key)) } catch { /* private mode */ }
}

// ── Component ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: ReactNode
  /** Big line: what this page is ("Your product catalogue") */
  title: string
  /** Teaching copy: why it matters and what happens after the first record. */
  body: string
  /** Primary call to action, e.g. "+ Add your first product" */
  actionLabel?: string
  onAction?: () => void
  /** Optional secondary link-style action, e.g. "Post opening stock instead" */
  secondaryLabel?: string
  onSecondary?: () => void
  /** Optional demo-data affordance. Only rendered when provided. */
  demoLabel?: string
  onDemo?: () => void
  demoBusy?: boolean
  /** compact = fits inside an existing card section (no outer card chrome) */
  compact?: boolean
}

export default function EmptyState({
  icon, title, body,
  actionLabel, onAction,
  secondaryLabel, onSecondary,
  demoLabel, onDemo, demoBusy,
  compact,
}: EmptyStateProps) {
  const inner = (
    <div style={{ textAlign: 'center', padding: compact ? '28px 16px' : '48px 24px', maxWidth: 460, margin: '0 auto' }}>
      {icon && (
        <div style={{
          width: 48, height: 48, borderRadius: 12, margin: '0 auto 14px',
          background: 'var(--accent-dim)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
      )}
      <div style={{ fontFamily: 'var(--display)', fontSize: compact ? 14 : 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text3)', marginBottom: (actionLabel || demoLabel) ? 18 : 0 }}>
        {body}
      </div>
      {(actionLabel || demoLabel) && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {actionLabel && onAction && (
            <button className="btn btn-primary btn-sm" onClick={onAction}>{actionLabel}</button>
          )}
          {demoLabel && onDemo && (
            <button className="btn btn-ghost btn-sm" onClick={onDemo} disabled={!!demoBusy}>
              {demoBusy ? 'Loading demo data…' : demoLabel}
            </button>
          )}
        </div>
      )}
      {secondaryLabel && onSecondary && (
        <button
          onClick={onSecondary}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', marginTop: 12,
            fontSize: 11, color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >{secondaryLabel}</button>
      )}
    </div>
  )
  if (compact) return inner
  return <div className="card">{inner}</div>
}
