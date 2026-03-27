import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
export interface InvoiceSettings {
  company_name: string; tagline: string; address: string; city: string
  phone: string; email: string; website: string; tin: string; vrn: string
  primary_color: string; logo_url?: string
  bank_name: string; bank_account_name: string
  bank_account_number: string; bank_branch: string
  show_bank_details: boolean; show_salesperson: boolean
  show_vat_breakdown: boolean; show_outstanding_balance: boolean
  show_payment_terms: boolean; show_notes: boolean
  footer_note: string; payment_note: string
}

interface Voucher {
  ref: string; posting_date: string; due_date?: string
  payment_terms?: string; notes?: string
  total_amount: number; vat_amount: number; subtotal: number
  posted_by?: string
  customers: {
    name: string; company?: string; contact_person?: string
    whatsapp: string; address: string; balance: number
  } | null
  voucher_lines: {
    qty: number; unit_price: number; total: number
    discount_pct?: number; description: string
    products: { name: string; sku: string } | null
  }[]
}

const DEFAULT: InvoiceSettings = {
  company_name: 'Malkia Wellness Group Ltd', tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
  phone: '+255 700 000 000', email: 'hello@malkia.co.tz', website: 'www.malkia.co.tz',
  tin: '—', vrn: '—', primary_color: '#85c2be',
  bank_name: 'NMB Bank', bank_account_name: 'Malkia Wellness Group Ltd',
  bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
  show_bank_details: true, show_salesperson: true, show_vat_breakdown: true,
  show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
  footer_note: 'Thank you for your business. Payment is due by the date shown above.',
  payment_note: 'Please quote the invoice number as payment reference.',
}

// ── Invoice Component ─────────────────────────────────────────────────────────
export function MalkiaInvoice({ voucher, settings }: { voucher: Voucher; settings?: Partial<InvoiceSettings> }) {
  const s: InvoiceSettings = { ...DEFAULT, ...(settings || {}) }
  const p = s.primary_color
  const cust = voucher.customers
  const net = voucher.subtotal || 0
  const vat = voucher.vat_amount || 0
  const total = voucher.total_amount || 0
  // Previous outstanding balance BEFORE this invoice
  const prevBalance = cust?.balance || 0
  // Total now owed = previous balance + this invoice
  const totalNowOwed = prevBalance + total

  const mono = "'DM Mono', 'Courier New', monospace"
  const display = "'Syne', 'Georgia', serif"
  const body = "'Instrument Sans', 'Helvetica Neue', sans-serif"

  return (
    <div style={{
      width: 794, background: '#ffffff', fontFamily: body,
      boxShadow: '0 4px 32px rgba(0,0,0,.12)', borderRadius: 2,
    }}>

      {/* ── HEADER BAND ──────────────────────────────────────────────────── */}
      <div style={{ background: '#1a1a1a', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: display, fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
            {s.company_name}
          </div>
          <div style={{ fontSize: 11, color: p, marginTop: 4, fontFamily: mono, letterSpacing: 1 }}>
            {s.tagline.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 10, lineHeight: 1.7 }}>
            {s.address}<br />
            {s.phone} · {s.email}<br />
            <span style={{ color: '#666' }}>TIN: {s.tin} · VRN: {s.vrn}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Tax Invoice</div>
          <div style={{ fontFamily: display, fontSize: 32, fontWeight: 800, color: p, letterSpacing: '-0.5px' }}>{voucher.ref}</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.8 }}>
            <div>Date: <span style={{ color: '#ddd' }}>{voucher.posting_date}</span></div>
            {s.show_payment_terms && voucher.due_date && (
              <div>Due: <span style={{ color: '#ff6b6b', fontWeight: 700 }}>{voucher.due_date}</span></div>
            )}
            {s.show_payment_terms && voucher.payment_terms && (
              <div>Terms: <span style={{ color: '#ddd' }}>{voucher.payment_terms}</span></div>
            )}
            {s.show_salesperson && voucher.posted_by && (
              <div>Invoiced by: <span style={{ color: '#ddd' }}>{voucher.posted_by}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* ── ACCENT LINE ─────────────────────────────────────────────────── */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${p} 0%, ${p}40 100%)` }} />

      {/* ── BILL TO + ACCOUNT SUMMARY ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: cust && s.show_outstanding_balance && prevBalance > 0 ? '1fr 1fr' : '1fr', borderBottom: '1px solid #f0f0f0' }}>

        {/* Bill To */}
        <div style={{ padding: '24px 40px' }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>Bill To</div>
          <div style={{ fontFamily: display, fontSize: 17, fontWeight: 800, color: '#1a1a1a', marginBottom: 3 }}>
            {cust?.company || cust?.name || '—'}
          </div>
          {cust?.contact_person && (
            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Attn: {cust.contact_person}</div>
          )}
          {cust?.address && (
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>{cust.address}</div>
          )}
          {cust?.whatsapp && (
            <div style={{ fontSize: 10, color: '#aaa', fontFamily: mono, marginTop: 6 }}>{cust.whatsapp}</div>
          )}
        </div>

        {/* Account Summary — only if there is a previous outstanding balance */}
        {cust && s.show_outstanding_balance && prevBalance > 0 && (
          <div style={{ padding: '24px 40px', background: '#fff8f4', borderLeft: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>Account Statement</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
              <span>Previous Outstanding</span>
              <span style={{ fontFamily: mono }}>{prevBalance.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
              <span>+ This Invoice</span>
              <span style={{ fontFamily: mono }}>{total.toLocaleString()}</span>
            </div>
            <div style={{ height: 1, background: '#f0d0c0', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c0392b' }}>Total Now Owed</span>
              <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 800, color: '#c0392b' }}>
                TZS {totalNowOwed.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 9, color: '#aaa', marginTop: 6, fontStyle: 'italic' }}>
              Includes this invoice + unpaid prior balance
            </div>
          </div>
        )}
      </div>

      {/* ── LINE ITEMS TABLE ─────────────────────────────────────────────── */}
      <div style={{ padding: '0 40px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
              {['#', 'Item / Description', 'Qty', 'Unit Price', 'Disc', 'Amount (TZS)'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 12px', textAlign: i >= 2 ? 'right' : i === 0 ? 'center' : 'left',
                  fontFamily: mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
                  color: '#ccc', fontWeight: 500,
                  width: i === 0 ? 36 : i === 2 ? 50 : i === 3 ? 110 : i === 4 ? 60 : i === 5 ? 130 : 'auto'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {voucher.voucher_lines.map((line, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: mono, color: p, fontSize: 11, fontWeight: 600 }}>{String(i+1).padStart(2,'0')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 12 }}>{line.products?.name || line.description || '—'}</div>
                  {line.products?.sku && <div style={{ fontSize: 9, color: '#bbb', fontFamily: mono, marginTop: 2 }}>SKU: {line.products.sku}</div>}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{line.qty}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{(line.unit_price||0).toLocaleString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: '#aaa' }}>
                  {line.discount_pct ? `${line.discount_pct}%` : '—'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
                  {(line.total||0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS + BANK ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '24px 40px 0' }}>

        {/* Bank details */}
        {s.show_bank_details && (
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>Payment Details</div>
            <div style={{ background: `${p}12`, border: `1px solid ${p}30`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1a1a1a', marginBottom: 8 }}>{s.bank_name}</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 2, fontFamily: mono }}>
                <div>A/C Name: <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{s.bank_account_name}</span></div>
                <div>A/C No: <span style={{ color: '#1a1a1a', fontWeight: 800, fontSize: 13 }}>{s.bank_account_number}</span></div>
                <div>Branch: {s.bank_branch}</div>
              </div>
              {s.payment_note && (
                <div style={{ fontSize: 10, color: p, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${p}30`, fontStyle: 'italic' }}>
                  {s.payment_note}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invoice Totals — THIS invoice only */}
        <div style={{ borderLeft: s.show_bank_details ? '1px solid #f0f0f0' : 'none', paddingLeft: s.show_bank_details ? 24 : 0 }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>This Invoice</div>

          {s.show_vat_breakdown && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', color: '#888', borderBottom: '1px solid #f5f5f5' }}>
                <span>Net Amount (excl. VAT)</span>
                <span style={{ fontFamily: mono }}>{net.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', color: '#888', borderBottom: '1px solid #f5f5f5' }}>
                <span>VAT @ 18% (inclusive)</span>
                <span style={{ fontFamily: mono }}>{vat.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* Invoice Total — the big number */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: p + '18', borderRadius: 8, marginTop: 10, border: `1.5px solid ${p}40` }}>
            <span style={{ fontFamily: display, fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>Invoice Total</span>
            <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>TZS {total.toLocaleString()}</span>
          </div>

          {/* Previous balance note — informational only, no new total */}
          {cust && s.show_outstanding_balance && prevBalance > 0 && (
            <div style={{ marginTop: 8, padding: '8px 14px', background: '#fff3f3', borderRadius: 6, border: '1px solid #f5c0c0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#c0392b' }}>+ Prior outstanding balance</span>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: '#c0392b' }}>TZS {prevBalance.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── NOTES ────────────────────────────────────────────────────────── */}
      {s.show_notes && voucher.notes && (
        <div style={{ margin: '20px 40px 0', padding: '12px 16px', background: '#f9f9f9', borderLeft: `3px solid ${p}`, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontWeight: 600 }}>Notes</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{voucher.notes}</div>
        </div>
      )}

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <div style={{ margin: '24px 40px 0', padding: '16px 0', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic' }}>{s.footer_note}</div>
        <div style={{ fontFamily: mono, fontSize: 9, color: '#ccc', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: p }}>{s.company_name}</div>
          <div>This is a computer-generated invoice · No signature required</div>
        </div>
      </div>

      {/* Bottom color band */}
      <div style={{ height: 6, background: `linear-gradient(90deg, #1a1a1a 0%, ${p} 50%, #1a1a1a 100%)`, marginTop: 16 }} />
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
const Toggle = ({ label, desc, k, settings, onToggle }: { label: string; desc: string; k: keyof InvoiceSettings; settings: InvoiceSettings; onToggle: (k: keyof InvoiceSettings, v: boolean) => void }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
    </div>
    <button onClick={() => onToggle(k, !settings[k])} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: settings[k] ? 'var(--accent)' : 'var(--surface3)', transition: 'background .2s',
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: settings[k] ? 21 : 3, transition: 'left .2s' }} />
    </button>
  </div>
)

const Field = ({ label, k, settings, onChange, placeholder }: { label: string; k: keyof InvoiceSettings; settings: InvoiceSettings; onChange: (k: keyof InvoiceSettings, v: string) => void; placeholder?: string }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    <input className="form-input" value={String(settings[k] || '')} placeholder={placeholder}
      onChange={e => onChange(k, e.target.value)} />
  </div>
)

export function InvoiceTemplateSettings({ settings, onChange }: { settings: InvoiceSettings; onChange: (s: InvoiceSettings) => void }) {
  const set = (k: keyof InvoiceSettings, v: string | boolean) => onChange({ ...settings, [k]: v })
  const [tab, setTab] = useState<'company'|'bank'|'display'>('company')

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface2)', padding: 4, borderRadius: 8 }}>
        {(['company', 'bank', 'display'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 16px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderRadius: 6, background: tab === t ? 'var(--accent)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--text3)', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'company' && (
        <div>
          <Field label="Company Name" k="company_name" settings={settings} onChange={set} />
          <Field label="Tagline" k="tagline" settings={settings} onChange={set} />
          <Field label="Address" k="address" settings={settings} onChange={set} />
          <Field label="Phone" k="phone" settings={settings} onChange={set} />
          <Field label="Email" k="email" settings={settings} onChange={set} />
          <Field label="Website" k="website" settings={settings} onChange={set} />
          <Field label="TIN" k="tin" settings={settings} onChange={set} placeholder="Tax ID Number" />
          <Field label="VRN" k="vrn" settings={settings} onChange={set} placeholder="VAT Registration Number" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Brand Colour</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
              <input className="form-input" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ fontFamily: 'var(--mono)', width: 120 }} />
            </div>
          </div>
        </div>
      )}

      {tab === 'bank' && (
        <div>
          <Field label="Bank Name" k="bank_name" settings={settings} onChange={set} />
          <Field label="Account Name" k="bank_account_name" settings={settings} onChange={set} />
          <Field label="Account Number" k="bank_account_number" settings={settings} onChange={set} />
          <Field label="Branch" k="bank_branch" settings={settings} onChange={set} />
          <Field label="Payment Note" k="payment_note" settings={settings} onChange={set} placeholder="e.g. Please quote invoice number as reference" />
          <Field label="Footer Note" k="footer_note" settings={settings} onChange={set} />
        </div>
      )}

      {tab === 'display' && (
        <div>
          <Toggle label="Bank Details" desc="Show payment/bank info" k="show_bank_details" settings={settings} onToggle={set} />
          <Toggle label="VAT Breakdown" desc="Show net amount and VAT line" k="show_vat_breakdown" settings={settings} onToggle={set} />
          <Toggle label="Outstanding Balance" desc="Show prior balance in account statement" k="show_outstanding_balance" settings={settings} onToggle={set} />
          <Toggle label="Payment Terms" desc="Show due date and terms" k="show_payment_terms" settings={settings} onToggle={set} />
          <Toggle label="Salesperson" desc="Show who issued the invoice" k="show_salesperson" settings={settings} onToggle={set} />
          <Toggle label="Notes" desc="Show notes / payment instructions" k="show_notes" settings={settings} onToggle={set} />
        </div>
      )}
    </div>
  )
}
