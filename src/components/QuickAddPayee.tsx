// ─── Quick Add Payee ───────────────────────────────────────────────────────
// Inline modal for creating a supplier or vendor without leaving the voucher.
// Rendered from a "+ Add new…" option pinned to the bottom of payee selects
// in CashPayment and PettyCash (and reusable by Purchase / ImportOrder for
// the handoff's 5a supplier quick-add).
//
// Deliberately minimal: name + phone + email. Payment terms, addresses and
// role changes belong on the full Suppliers page — the goal here is that a
// cashier mid-payment never has to abandon a half-filled voucher because the
// payee doesn't exist yet.
//
// Insert payload mirrors Suppliers.tsx save() exactly (same code generation,
// same columns) so the row is indistinguishable from one created there. The
// role that ISN'T being created is set false so the new row appears only in
// the list the user was looking at; both flags are editable later on the
// Suppliers page.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { FG } from './FormHelpers'

export type PayeeRole = 'supplier' | 'vendor'

interface Props {
  role: PayeeRole
  onClose: () => void
  // Fired after a successful insert. Parent reloads its list and selects id.
  onCreated: (id: string, name: string) => void
}

export default function QuickAddPayee({ role, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const label = role === 'supplier' ? 'Supplier' : 'Vendor'

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      // Same SUP-nnn sequence as the Suppliers page
      const { data: last } = await supabase.from('suppliers')
        .select('code').order('code', { ascending: false }).limit(1)
      const lastNum = last?.[0]?.code ? parseInt(last[0].code.replace('SUP-', '')) || 0 : 0
      const code = `SUP-${String(lastNum + 1).padStart(3, '0')}`

      const { data, error: iErr } = await supabase.from('suppliers').insert({
        code,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        is_supplier: role === 'supplier',
        is_vendor: role === 'vendor',
        is_active: true,
      }).select('id').single()
      if (iErr || !data) throw new Error(iErr?.message || 'Insert failed')

      onCreated(data.id, name.trim())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add new ${label.toLowerCase()}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--card-raised)', border: '1px solid var(--border2)',
        borderRadius: 14, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,.5)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Add new {label.toLowerCase()}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Saved instantly and selected on this voucher. Full details (terms, address, roles) can be added later under Purchases → Suppliers.
        </div>

        <FG label={`${label} name`} req>
          <input
            className="form-input" autoFocus
            placeholder={role === 'supplier' ? 'e.g. Meditech Tanzania Ltd' : 'e.g. Kariakoo Properties (landlord)'}
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
          />
        </FG>
        <FG label="Phone">
          <input className="form-input" placeholder="+255 7XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} />
        </FG>
        <FG label="Email">
          <input className="form-input" placeholder="optional" value={email} onChange={e => setEmail(e.target.value)} />
        </FG>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red, #dc2626)', marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : `Save ${label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
