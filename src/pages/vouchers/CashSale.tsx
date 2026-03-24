import { useState } from 'react'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { FG } from '../../components/FormHelpers'
import { PRODUCTS, CUSTOMERS } from '../../lib/data'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function CashSale({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [wa, setWa] = useState('')
  const [custName, setCustName] = useState('')
  const [foundCust, setFoundCust] = useState<typeof CUSTOMERS[string] | null>(null)
  const [payment, setPayment] = useState('cash')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [tendered, setTendered] = useState('')
  const [refNum, setRefNum] = useState(43)

  const lookupCust = (val: string) => {
    setWa(val)
    const c = CUSTOMERS[val.replace(/[\s+]/g, '')]
    if (c && val.replace(/[\s+]/g, '').length >= 9) { setFoundCust(c); setCustName(c.name) }
    else setFoundCust(null)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(subtotal * 0.18)
  const total = subtotal + vat
  const change = tendered ? parseInt(tendered) - total : 0

  const post = () => {
    if (!custName) { setToast('❌ Please enter customer name'); return }
    const ref = genRef('CS', refNum)
    setRefNum(n => n + 1)
    setToast(`✅ ${ref} posted · Dr Cash / Cr Revenue · Dr COGS / Cr Inventory · ${Math.round(total / 1000)} Crown pts · WA receipt sent`)
    setWa(''); setCustName(''); setFoundCust(null)
    setLines([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
    setTendered(''); setPayment('cash')
  }

  const RECENT = [
    { ref: 'CS-0042', customer: 'Amina Hassan', wa: '+255 712 345 678', products: 'Breast pump × 1', amount: 185000, payment: 'Cash' },
    { ref: 'CS-0041', customer: 'Grace Mwanza', wa: '+255 758 221 043', products: 'Nipple cream × 2', amount: 95000, payment: 'M-Pesa' },
    { ref: 'CS-0040', customer: 'Fatuma Iddi', wa: '+255 743 100 212', products: 'Belly binder, Pillow', amount: 340000, payment: 'Cash' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💵</div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter POS · WhatsApp receipt auto-sent · Crown points auto-awarded · Stock auto-deducted</div>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 20, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
        <span style={{ color: 'var(--accent)' }}>⚡ Auto-journal:</span> Dr Cash/MPesa · Cr Revenue (4010) · Dr COGS (5010) · Cr Inventory (1110) · VAT to 2020
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="step-header"><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
            <div className="form-row">
              <FG label="WhatsApp Number" req>
                <input className="form-input" value={wa} onChange={e => lookupCust(e.target.value)} placeholder="+255 7XX XXX XXX" style={{ borderColor: 'var(--accent)' }} />
              </FG>
              <FG label="Customer Name" req>
                <input className="form-input" value={custName} onChange={e => setCustName(e.target.value)} placeholder="e.g. Fatuma Said" />
              </FG>
            </div>
            {foundCust && (
              <div style={{ background: 'var(--surface3)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--green)', marginBottom: 6 }}>✓ EXISTING CUSTOMER FOUND</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{foundCust.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>Stage: {foundCust.stage}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Last: {foundCust.last}</div>
                <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4, fontFamily: 'var(--mono)' }}>👑 Crown Points: {foundCust.points.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6, fontStyle: 'italic' }}>{foundCust.ai}</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="step-header"><div className="step-num">2</div><div className="step-title">PAYMENT METHOD</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[{ id: 'cash', label: '💵 Cash' }, { id: 'mpesa', label: '📱 M-Pesa' }, { id: 'bank', label: '🏦 Bank Transfer' }, { id: 'pos', label: '💳 POS Card' }].map(pm => (
                <button key={pm.id} onClick={() => setPayment(pm.id)} className="btn" style={{ justifyContent: 'center', background: payment === pm.id ? 'var(--accent-dim)' : 'transparent', border: `1px solid ${payment === pm.id ? 'var(--accent)' : 'var(--border)'}`, color: payment === pm.id ? 'var(--accent)' : 'var(--text2)' }}>{pm.label}</button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <FG label="Amount Tendered (TZS)">
                <input className="form-input" type="number" placeholder="0" value={tendered} onChange={e => setTendered(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} />
              </FG>
              {tendered && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>Change</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="step-header"><div className="step-num">3</div><div className="step-title">PRODUCTS SOLD</div></div>
          <LineItemsTable lines={lines} setLines={setLines} />
          <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginTop: 14, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ color: 'var(--wa)' }}>💬 WhatsApp receipt auto-sent after posting</div>
            <div style={{ color: 'var(--text3)' }}>📦 Inventory deducted · Full journal auto-posted</div>
            <div style={{ color: 'var(--yellow)' }}>👑 Crown points: {Math.round(total / 1000)} pts will be awarded</div>
          </div>
          <button className="btn btn-primary" onClick={post} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '12px' }}>📤 Post Sale & Send Receipt</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Recent Cash Sales</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th className="td-right">Amount (TZS)</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>
              {RECENT.map((s, i) => (
                <tr key={i}>
                  <td className="td-mono td-amber">{s.ref}</td>
                  <td className="td-bold">{s.customer}</td>
                  <td className="td-mono" style={{ color: 'var(--wa)' }}>{s.wa}</td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.products}</td>
                  <td className="td-right td-mono td-green">{s.amount.toLocaleString()}</td>
                  <td><span className={`pill ${s.payment === 'Cash' ? 'pill-green' : 'pill-blue'}`}>{s.payment}</span></td>
                  <td><span className="pill pill-green">Posted</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <Toast message={toast} type={toast.startsWith('❌') ? 'error' : 'success'} onClose={() => setToast('')} />}
    </div>
  )
}
