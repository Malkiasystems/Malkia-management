import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Customer {
  id: string; customer_number: string; name: string; company: string; contact_person: string
  customer_type: 'cash' | 'debtor'; segment: string
  whatsapp: string; email: string; phone: string
  credit_limit: number; credit_period: number; payment_terms: string
  balance: number; crown_points: number; is_active: boolean
  last_purchase_date: string; last_purchase_amount: number; notes: string
  created_at: string
}

interface LedgerEntry {
  id: string; posting_date: string; document_type: string
  document_ref: string; description: string
  amount: number; remaining_amount: number; is_open: boolean; due_date: string
}

const SEGMENTS = { cash: ['Retail', 'Wholesale'], debtor: ['Corporate', 'Wholesale'] }
const PAYMENT_TERMS = ['COD', 'NET7', 'NET14', 'NET30', 'NET60', 'NET90']

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'user')    return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back')    return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'ledger')  return <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  if (n === 'edit')    return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'wa')      return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv')     return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const EMPTY_FORM = {
  name: '', company: '', contact_person: '', customer_type: 'cash' as 'cash'|'debtor', segment: 'Retail',
  whatsapp: '', email: '', phone: '', address: '',
  credit_limit: '0', credit_period: '0', payment_terms: 'COD', notes: ''
}

export default function Customers({ onNav }: { onNav?: (p: Page) => void }) {
  const [tab, setTab] = useState<'cash'|'debtors'>('cash')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')

  // Views: list | ledger | form
  const [view, setView] = useState<'list'|'ledger'|'form'>('list')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  // Form
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { load() }, [tab])

  const load = async () => {
    setLoading(true)
    const type = tab === 'cash' ? 'cash' : 'debtor'
    const { data } = await supabase.from('customers')
      .select('*').eq('customer_type', type).eq('is_active', true)
      .order('name')
    if (data) setCustomers(data as Customer[])
    setLoading(false)
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const openLedger = async (c: Customer) => {
    setSelected(c); setView('ledger'); setLoadingLedger(true)
    const { data } = await supabase.from('customer_ledger_entries')
      .select('*').eq('customer_id', c.id)
      .order('posting_date', { ascending: false })
    if (data) setLedger(data as LedgerEntry[])
    setLoadingLedger(false)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, customer_type: tab === 'cash' ? 'cash' : 'debtor', segment: tab === 'cash' ? 'Retail' : 'Corporate' })
    setSelected(null); setView('form')
  }

  const openEdit = (c: Customer) => {
    setSelected(c)
    setForm({
      name: c.name, company: c.company || '', contact_person: c.contact_person || '', customer_type: c.customer_type,
      segment: c.segment, whatsapp: c.whatsapp || '', email: c.email || '',
      phone: (c as any).phone || '', address: (c as any).address || '',
      credit_limit: String(c.credit_limit || 0), credit_period: String(c.credit_period || 0),
      payment_terms: c.payment_terms || 'COD', notes: c.notes || ''
    })
    setView('form')
  }

  const generateNumber = async (type: 'cash'|'debtor'): Promise<string> => {
    if (type === 'cash') {
      const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('customer_type', 'cash')
      return `CONT-${String((count || 0) + 10001)}`
    } else {
      const { data } = await supabase.from('customers').select('customer_number').eq('customer_type', 'debtor').order('customer_number', { ascending: false }).limit(1)
      const last = data?.[0]?.customer_number
      const lastNum = last ? parseInt(last.replace('DEB-10-', '')) || 0 : 0
      return `DEB-10-${String(lastNum + 1).padStart(4, '0')}`
    }
  }

  const save = async () => {
    const isDebtor = form.customer_type === 'debtor'
    const displayName = isDebtor ? form.company.trim() : form.name.trim()
    if (!displayName) { showToast(isDebtor ? 'Company name required' : 'Customer name required', 'error'); return }
    if (isDebtor && !(form as any).contact_person?.trim()) { showToast('Contact person required', 'error'); return }
    if (form.customer_type === 'cash' && !form.whatsapp.trim()) { showToast('WhatsApp number required for cash contacts', 'error'); return }
    setSaving(true)
    try {
      const customerNumber = selected?.customer_number || await generateNumber(form.customer_type)
      const payload: any = {
        // For debtors: name = company name for searching; for cash: name = person name
        name: isDebtor ? form.company.trim() : form.name.trim(),
        company: form.company.trim() || null,
        contact_person: (form as any).contact_person?.trim() || null,
        customer_type: form.customer_type, segment: form.segment.toLowerCase(),
        whatsapp: form.whatsapp.trim() || null, email: form.email.trim() || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        credit_period: parseInt(form.credit_period) || 0,
        payment_terms: form.payment_terms, notes: form.notes.trim() || null,
        customer_number: customerNumber, is_active: true,
      }
      if (selected) {
        const { error } = await supabase.from('customers').update(payload).eq('id', selected.id)
        if (error) throw new Error(error.message)
        showToast(`${displayName} updated`)
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${displayName} added — ${customerNumber}`)
      }
      setView('list'); load()
    } catch (err: any) { showToast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  // Stats
  const totalBalance = customers.reduce((s, c) => s + (c.balance || 0), 0)
  const totalCredit = customers.reduce((s, c) => s + (c.credit_limit || 0), 0)

  const filtered = customers.filter(c => {
    if (segFilter !== 'all' && c.segment !== segFilter.toLowerCase()) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.whatsapp || '').includes(search) && !(c.customer_number || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Running balance for ledger
  const ledgerWithBalance = () => {
    let bal = 0
    return [...ledger].reverse().map(e => {
      bal += e.amount
      return { ...e, runningBalance: bal }
    }).reverse()
  }

  const openInvoices = ledger.filter(e => e.is_open && e.amount > 0)
  const totalOutstanding = openInvoices.reduce((s, e) => s + e.remaining_amount, 0)

  // ── LEDGER VIEW ─────────────────────────────────────────────────────────
  if (view === 'ledger' && selected) {
    const rows = ledgerWithBalance()
    const creditUsedPct = selected.credit_limit > 0 ? Math.min(100, Math.round((selected.balance / selected.credit_limit) * 100)) : 0

    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Customers
            </button>
            <div style={{ width:1,height:24,background:'var(--border)' }}></div>
            <div>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',background:'var(--accent-dim)',padding:'2px 8px',borderRadius:4 }}>{selected.customer_number}</span>
                <div className="page-title" style={{ margin:0 }}>{selected.name}</div>
                <span className="pill pill-gray" style={{ fontSize:9,textTransform:'uppercase' }}>{selected.segment}</span>
              </div>
              <div className="page-sub">{selected.company || (selected.customer_type === 'cash' ? 'Cash Customer' : 'Debtor')} · {ledger.length} entries</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => openEdit(selected)}>
              <Ic n="edit" s={13} /> Edit
            </button>
            {selected.whatsapp && (
              <a href={`https://wa.me/${selected.whatsapp.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6,color:'#25D366' }}>
                <Ic n="wa" s={13} c="#25D366" /> WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Customer summary */}
        <div style={{ background:'linear-gradient(135deg,rgba(10,10,10,1) 0%,rgba(25,25,25,1) 100%)',border:'1px solid rgba(255,255,255,.06)',borderRadius:14,padding:'18px 24px',marginBottom:20,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16 }}>
          {[
            { label:'Outstanding Balance', val: tzs(selected.balance || 0), color: (selected.balance||0) > 0 ? 'var(--red)' : 'var(--green)' },
            { label:'Credit Limit', val: selected.credit_limit > 0 ? tzs(selected.credit_limit) : 'Unlimited', color:'var(--text)' },
            { label:'Credit Period', val: selected.credit_period > 0 ? `${selected.credit_period} days` : 'COD', color:'var(--text)' },
            { label:'Crown Points', val: (selected.crown_points||0).toLocaleString(), color:'var(--yellow)' },
            { label:'Last Purchase', val: selected.last_purchase_date || '—', color:'var(--text3)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize:9,fontFamily:'var(--mono)',color:'#666',textTransform:'uppercase',letterSpacing:1,marginBottom:6 }}>{item.label}</div>
              <div style={{ fontFamily:'var(--mono)',fontSize:14,fontWeight:700,color:item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Credit usage bar — debtors only */}
        {selected.customer_type === 'debtor' && selected.credit_limit > 0 && (
          <div style={{ marginBottom:16,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:12 }}>
              <span style={{ color:'var(--text3)' }}>Credit Used</span>
              <span style={{ fontFamily:'var(--mono)',fontWeight:700,color:creditUsedPct > 80 ? 'var(--red)' : 'var(--accent)' }}>{creditUsedPct}%</span>
            </div>
            <div style={{ height:6,background:'var(--surface3)',borderRadius:3,overflow:'hidden' }}>
              <div style={{ height:'100%',width:`${creditUsedPct}%`,background:creditUsedPct>80?'var(--red)':creditUsedPct>60?'var(--yellow)':'var(--green)',borderRadius:3,transition:'width .3s' }}></div>
            </div>
            <div style={{ display:'flex',justifyContent:'space-between',marginTop:6,fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)' }}>
              <span>Used: {tzs(selected.balance||0)}</span>
              <span>Available: {tzs(Math.max(0,selected.credit_limit-(selected.balance||0)))}</span>
            </div>
          </div>
        )}

        {/* Open invoices summary */}
        {openInvoices.length > 0 && (
          <div style={{ background:'rgba(255,71,87,.06)',border:'1px solid rgba(255,71,87,.2)',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13,fontWeight:600,color:'var(--red)' }}>{openInvoices.length} Open Invoice{openInvoices.length>1?'s':''}</div>
              <div style={{ fontSize:11,color:'var(--text3)',marginTop:2 }}>Total outstanding: <span style={{ fontFamily:'var(--mono)',fontWeight:700,color:'var(--red)' }}>{tzs(totalOutstanding)}</span></div>
            </div>
            <div style={{ fontSize:10,color:'var(--text3)' }}>Highlighted below</div>
          </div>
        )}

        {/* Ledger table */}
        <div className="card">
          {loadingLedger ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading ledger…</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>No ledger entries yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Ref</th><th>Type</th><th>Description</th>
                    <th className="td-right">Debit</th>
                    <th className="td-right">Credit</th>
                    <th className="td-right">Balance</th>
                    <th>Due Date</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const isOpen = e.is_open && e.amount > 0
                    const isOverdue = e.due_date && new Date(e.due_date) < new Date() && e.is_open
                    return (
                      <tr key={i} style={{ background: isOverdue ? 'rgba(255,71,87,.04)' : isOpen ? 'rgba(212,135,74,.04)' : 'transparent' }}>
                        <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{e.posting_date}</td>
                        <td className="td-mono td-amber" style={{ fontSize:11,fontWeight:700 }}>{e.document_ref}</td>
                        <td><span className={`pill ${e.document_type==='invoice'?'pill-amber':e.document_type==='payment'?'pill-green':e.document_type==='cash_sale'?'pill-blue':'pill-gray'}`} style={{ fontSize:9 }}>{e.document_type?.replace('_',' ')}</span></td>
                        <td style={{ fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{e.description}</td>
                        <td className="td-right td-mono" style={{ color:'var(--red)',fontSize:12 }}>{e.amount > 0 ? tzs(e.amount) : '—'}</td>
                        <td className="td-right td-mono" style={{ color:'var(--green)',fontSize:12 }}>{e.amount < 0 ? tzs(Math.abs(e.amount)) : '—'}</td>
                        <td className="td-right td-mono" style={{ fontWeight:700,fontSize:13,color:(e as any).runningBalance > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {tzs(Math.abs((e as any).runningBalance))}
                          <span style={{ fontSize:9,marginLeft:4,color:'var(--text3)' }}>{(e as any).runningBalance > 0 ? 'DR' : 'CR'}</span>
                        </td>
                        <td className="td-mono" style={{ fontSize:10,color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>{e.due_date || '—'}</td>
                        <td>
                          {e.is_open && e.amount > 0
                            ? <span className="pill pill-amber" style={{ fontSize:9 }}>{isOverdue ? 'Overdue' : 'Open'}</span>
                            : e.amount < 0
                            ? <span className="pill pill-green" style={{ fontSize:9 }}>Payment</span>
                            : <span className="pill pill-gray" style={{ fontSize:9 }}>Closed</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                    <td colSpan={4} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',textTransform:'uppercase' }}>Closing Balance</td>
                    <td colSpan={3} className="td-right td-mono" style={{ color: (selected.balance||0) > 0 ? 'var(--red)' : 'var(--green)',fontSize:15,padding:'12px 14px',fontWeight:800 }}>
                      {tzs(Math.abs(selected.balance||0))} {(selected.balance||0) > 0 ? 'DR' : 'CR'}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── FORM VIEW ────────────────────────────────────────────────────────────
  if (view === 'form') {
    const isDebtor = form.customer_type === 'debtor'
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Customers
            </button>
            <div style={{ width:1,height:24,background:'var(--border)' }}></div>
            <div className="page-title">{selected ? `Edit — ${selected.name}` : `Add ${isDebtor ? 'Debtor' : 'Cash Contact'}`}</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : selected ? 'Save Changes' : 'Add Customer'}</button>
          </div>
        </div>

        <div className="grid g2" style={{ gap:20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom:16 }}>Customer Details</div>
            <div className="form-row">
              <FG label="Customer Type" req>
                <select className="form-input" value={form.customer_type} onChange={e => { setF('customer_type', e.target.value); setF('segment', e.target.value==='cash'?'Retail':'Corporate') }}>
                  <option value="cash">Cash Contact (Dar HQ)</option>
                  <option value="debtor">Debtor (Credit Account)</option>
                </select>
              </FG>
              <FG label="Segment" req>
                <select className="form-input" value={form.segment} onChange={e => setF('segment', e.target.value)}>
                  {SEGMENTS[form.customer_type].map(s => <option key={s}>{s}</option>)}
                </select>
              </FG>
            </div>
            {isDebtor ? (
              <>
                <FG label="Company / Organization" req><input className="form-input" placeholder="e.g. Aga Khan Health Services" value={form.company} onChange={e => setF('company', e.target.value)} /></FG>
                <FG label="Contact Person" req><input className="form-input" placeholder="e.g. Dr. Sarah Kimani" value={(form as any).contact_person || ''} onChange={e => setF('contact_person', e.target.value)} /></FG>
              </>
            ) : (
              <FG label="Full Name" req><input className="form-input" placeholder="e.g. Mama Fatuma Hassan" value={form.name} onChange={e => setF('name', e.target.value)} /></FG>
            )}
            <div className="form-row">
              <FG label={`WhatsApp Number${!isDebtor?' (required)':''}`}>
                <input className="form-input" placeholder="+255 7XX XXX XXX" value={form.whatsapp} onChange={e => setF('whatsapp', e.target.value)} />
              </FG>
              <FG label="Email"><input className="form-input" placeholder="email@example.com" value={form.email} onChange={e => setF('email', e.target.value)} /></FG>
            </div>
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize:'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></FG>
          </div>

          <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
            {isDebtor && (
              <div className="card">
                <div className="card-title" style={{ marginBottom:14 }}>Credit Terms</div>
                <div className="form-row">
                  <FG label="Credit Limit (TZS)">
                    <input type="number" className="form-input" style={{ fontFamily:'var(--mono)' }} value={form.credit_limit} onChange={e => setF('credit_limit', e.target.value)} placeholder="0 = unlimited" />
                  </FG>
                  <FG label="Credit Period (days)">
                    <input type="number" className="form-input" style={{ fontFamily:'var(--mono)' }} value={form.credit_period} onChange={e => setF('credit_period', e.target.value)} />
                  </FG>
                </div>
                <FG label="Payment Terms">
                  <select className="form-input" value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)}>
                    {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </FG>
                <div style={{ background:'var(--surface2)',borderRadius:8,padding:'10px 12px',fontSize:11,color:'var(--text3)',marginTop:8 }}>
                  Set credit limit to 0 for unlimited credit (configurable in Settings).
                </div>
              </div>
            )}

            {!isDebtor && (
              <div className="card" style={{ background:'rgba(37,211,102,.06)',border:'1px solid rgba(37,211,102,.15)' }}>
                <div className="card-title" style={{ marginBottom:8 }}>Cash Contact Note</div>
                <div style={{ fontSize:12,color:'var(--text3)',lineHeight:1.7 }}>
                  This contact is linked to the <strong>Dar HQ Cash Sales (DAR502)</strong> master account.<br/>
                  WhatsApp number is the unique identifier — used for CRM, receipt sending, and loyalty tracking.<br/>
                  No credit terms needed — all transactions are cash at point of sale.
                </div>
              </div>
            )}

            {selected && (
              <div className="card">
                <div className="card-title" style={{ marginBottom:12 }}>Account Info</div>
                {[
                  { label:'Customer Number', val: selected.customer_number },
                  { label:'Balance', val: tzs(selected.balance||0) },
                  { label:'Crown Points', val: (selected.crown_points||0).toLocaleString() },
                  { label:'Last Purchase', val: selected.last_purchase_date||'—' },
                ].map(item => (
                  <div key={item.label} style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:12 }}>
                    <span style={{ color:'var(--text3)' }}>{item.label}</span>
                    <span style={{ fontFamily:'var(--mono)',fontWeight:600 }}>{item.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-sub">AR · Cash contacts · Debtors · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={openAdd}><Ic n="plus" s={13} /> Add {tab==='cash'?'Contact':'Debtor'}</button>
        </div>
      </div>

      {/* SHORTCUTS */}
      {onNav && (
        <div className="shortcut-bar">
          {[
            { icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', label: 'Cash Sale', page: 'cash-sale' as Page },
            { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Sales Invoice', page: 'sales-invoice' as Page },
            { icon: 'M18 20V10M12 20V4M6 20v-6', label: 'AR Aging', page: 'ar-aging' as Page },
            { icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', label: 'Sales Register', page: 'sales-register' as Page },
            { icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', label: 'CRM Hub', page: 'crm-hub' as Page },
          ].map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* Master account banner */}
      <div style={{ background:'linear-gradient(135deg,rgba(133,194,190,.08) 0%,rgba(133,194,190,.04) 100%)',border:'1px solid rgba(133,194,190,.2)',borderRadius:12,padding:'14px 20px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div>
          <div style={{ fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4 }}>
            {tab==='cash' ? 'Master AR Account' : 'AR — Debtors Control Account'}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <span style={{ fontFamily:'var(--mono)',fontSize:16,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'3px 10px',borderRadius:6 }}>
              {tab==='cash' ? 'DAR502' : '1050-DEB'}
            </span>
            <span style={{ fontFamily:'var(--display)',fontSize:15,fontWeight:700 }}>
              {tab==='cash' ? 'Dar HQ Cash Sales' : 'Accounts Receivable — Debtors'}
            </span>
          </div>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,textAlign:'right' }}>
          {[
            { label:'Total Customers', val: customers.length },
            { label:'Total AR Balance', val: tzs(totalBalance), color: totalBalance>0?'var(--red)':'var(--green)' },
            tab==='debtors' ? { label:'Total Credit Extended', val: tzs(totalCredit), color:'var(--accent)' } : { label:'With Balance', val: customers.filter(c=>(c.balance||0)>0).length },
          ].map((item,i) => (
            <div key={i}>
              <div style={{ fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',marginBottom:4 }}>{item.label}</div>
              <div style={{ fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:(item as any).color||'var(--text)' }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:4,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:4,marginBottom:20,width:'fit-content' }}>
        {[{ id:'cash',label:'Cash Contacts (DAR502)' },{ id:'debtors',label:'Debtors' }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as any); setSegFilter('all'); setSearch('') }}
            style={{ padding:'8px 20px',fontSize:12,fontWeight:600,background:tab===t.id?'var(--accent)':'transparent',color:tab===t.id?'#fff':'var(--text3)',border:'none',cursor:'pointer',borderRadius:'var(--r)',transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:10,marginBottom:16,alignItems:'center' }}>
        <input className="form-input" style={{ width:220,padding:'7px 10px',fontSize:12 }} placeholder={tab==='cash'?'Search name, WA, or CONT…':'Search name, DEB number…'} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ fontSize:12,padding:'7px 10px',width:150 }} value={segFilter} onChange={e => setSegFilter(e.target.value)}>
          <option value="all">All Segments</option>
          {SEGMENTS[tab==='cash'?'cash':'debtor'].map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
        </select>
        <div style={{ fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',marginLeft:'auto' }}>{filtered.length} of {customers.length} shown</div>
      </div>

      {/* Customer table */}
      {loading ? (
        <div className="card" style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div>
      ) : (
        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>
              No {tab==='cash'?'cash contacts':'debtors'} found. Click + to add one.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>{tab==='cash'?'Contact Name':'Customer / Company'}</th>
                    <th>Segment</th>
                    {tab==='cash' ? <th>WhatsApp</th> : <th>Payment Terms</th>}
                    {tab==='debtors' && <th className="td-right">Credit Limit</th>}
                    <th className="td-right">Balance</th>
                    <th>Last Purchase</th>
                    {tab==='cash' && <th className="td-right">Crown Pts</th>}
                    <th style={{ width:80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={i} style={{ cursor:'pointer' }}
                      onClick={() => openLedger(c)}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <td className="td-mono" style={{ fontSize:11,fontWeight:700,color:'var(--accent)' }}>{c.customer_number||'—'}</td>
                      <td>
                        <div style={{ fontWeight:600,fontSize:13 }}>{tab==='debtors' ? (c.company || c.name) : c.name}</div>
                        {tab==='debtors' ? <div style={{ fontSize:10,color:'var(--text3)' }}>{(c as any).contact_person || c.company || '—'}</div> : c.company && <div style={{ fontSize:10,color:'var(--text3)' }}>{c.company}</div>}
                      </td>
                      <td><span className="pill pill-gray" style={{ fontSize:9,textTransform:'capitalize' }}>{c.segment}</span></td>
                      {tab==='cash'
                        ? <td className="td-mono" style={{ fontSize:11,color:'#25D366' }}>{c.whatsapp||'—'}</td>
                        : <td style={{ fontSize:11,color:'var(--text3)' }}>{c.payment_terms||'COD'}</td>
                      }
                      {tab==='debtors' && (
                        <td className="td-right td-mono" style={{ fontSize:11 }}>{c.credit_limit>0?tzs(c.credit_limit):'Unlimited'}</td>
                      )}
                      <td className="td-right td-mono" style={{ fontWeight:700,color:(c.balance||0)>0?'var(--red)':'var(--text3)',fontSize:12 }}>
                        {(c.balance||0)>0 ? tzs(c.balance) : '—'}
                      </td>
                      <td style={{ fontSize:11,color:'var(--text3)' }}>{c.last_purchase_date||'—'}</td>
                      {tab==='cash' && <td className="td-right td-mono" style={{ fontSize:11,color:'var(--yellow)' }}>{(c.crown_points||0).toLocaleString()}</td>}
                      <td onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(c)} style={{ background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:11,color:'var(--text3)',display:'flex',alignItems:'center',gap:4 }}>
                          <Ic n="edit" s={11} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
