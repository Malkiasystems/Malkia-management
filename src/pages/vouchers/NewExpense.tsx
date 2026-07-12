// ─── NewExpense (chooser) ──────────────────────────────────────────────────
// The doorway to logging an expense. It doesn't post anything itself — it
// routes you to the right voucher. There are only two real expense vouchers:
//   • Petty Cash   — small office spends, up to the configured ceiling
//   • Cash Payment — everything above that, and supplier / bank payments
//
// The ceiling (what amount stops being petty cash) is set in
// Accounting Settings → Rules and shown here as guidance.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { tzs } from '../../lib/utils'
import { getPettyCashCeiling } from '../../lib/expenseSettings'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function NewExpense({ onNav }: Props) {
  const [ceiling, setCeiling] = useState<number | null>(null)

  useEffect(() => { getPettyCashCeiling().then(setCeiling) }, [])

  const options = [
    {
      page: 'petty-cash' as Page,
      title: 'Petty Cash',
      rule: ceiling != null ? `Small spends up to ${tzs(ceiling)}` : 'Small office spends',
      desc: 'Office cash: airtime, transport, tea, small supplies.',
      color: 'rgba(255,211,42,.12)', accent: '#e6b800',
      icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    },
    {
      page: 'cash-payment' as Page,
      title: 'Cash Payment',
      rule: ceiling != null ? `${tzs(ceiling)} and above` : 'Larger payments',
      desc: 'Suppliers, rent, bills, and anything paid from cash or bank.',
      color: 'rgba(255,71,87,.12)', accent: '#ff4757',
      icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    },
  ]

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <div className="page-title">New Expense</div>
          <div className="page-sub" style={{ color: 'var(--text3)', fontSize: 13 }}>
            Choose how this expense was paid.
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ gap: 16, marginTop: 20 }}>
        {options.map(o => (
          <div key={o.page} onClick={() => onNav(o.page)}
            className="card"
            style={{ cursor: 'pointer', padding: 22, background: o.color, border: '1px solid var(--border)', transition: 'transform .12s' }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(.99)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <svg width="30" height="30" fill="none" stroke={o.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: 14 }}>
              <path d={o.icon} />
            </svg>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{o.title}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: o.accent, margin: '4px 0 10px', fontFamily: 'var(--mono)' }}>{o.rule}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{o.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
        The {ceiling != null ? tzs(ceiling) : ''} cut-off is set in Accounting Settings → Rules.
      </div>
    </div>
  )
}
