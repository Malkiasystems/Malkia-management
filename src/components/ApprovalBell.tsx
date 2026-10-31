// ============================================================================
// ApprovalBell.tsx — the Approver's conscience in the top bar (Joe, 29 Oct).
// Polls invoice_payment_holds for status='pending' and, when anything is
// waiting, shows a bell with a count badge and a soft pulsing ring that
// cannot be missed from any page. Click lands on Payment Approvals.
// Silent (no bell at all) when the queue is empty — the animation earns
// attention precisely because it only exists when action is owed.
// Polls every 60s, plus on window focus, so it notices new holds quickly
// without hammering the API.
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

export default function ApprovalBell({ onNav }: { onNav: (p: Page) => void }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { count: n } = await supabase
          .from('invoice_payment_holds')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        if (alive && typeof n === 'number') setCount(n)
      } catch { /* polling is best-effort */ }
    }
    load()
    const t = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

  if (count === 0) return null

  return (
    <>
      <style>{`
        @keyframes mk-bell-ping {
          0%   { transform: scale(1);   opacity: .55; }
          80%  { transform: scale(1.9); opacity: 0;   }
          100% { transform: scale(1.9); opacity: 0;   }
        }
        @keyframes mk-bell-swing {
          0%, 100% { transform: rotate(0deg); }
          12% { transform: rotate(14deg); }
          24% { transform: rotate(-11deg); }
          36% { transform: rotate(7deg); }
          48% { transform: rotate(-4deg); }
          60% { transform: rotate(0deg); }
        }
      `}</style>
      <button
        onClick={() => onNav('payment-approvals')}
        title={`${count} payment${count === 1 ? '' : 's'} awaiting your approval — click to review`}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border2)',
          background: 'var(--surface2)', cursor: 'pointer', padding: 0,
        }}
      >
        {/* pulsing ring — the "animated" part that catches the eye */}
        <span style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          border: '2px solid var(--yellow, #f59e0b)',
          animation: 'mk-bell-ping 1.8s cubic-bezier(0,0,.2,1) infinite',
          pointerEvents: 'none',
        }} />
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="var(--yellow, #f59e0b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ animation: 'mk-bell-swing 2.4s ease-in-out infinite', transformOrigin: '50% 2px' }}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18,
          borderRadius: 9, background: 'var(--red, #ef4444)', color: '#fff',
          fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '0 4px', fontFamily: 'var(--mono)',
          boxShadow: '0 0 0 2px var(--surface)',
        }}>{count > 99 ? '99+' : count}</span>
      </button>
    </>
  )
}
