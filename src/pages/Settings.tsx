import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'

interface DBAccount { id: string; code: string; name: string; category: string }

interface Props { onNav: (p: import('../lib/types').Page) => void }
export default function Settings({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [allBankAccounts, setAllBankAccounts] = useState<DBAccount[]>([])
  const [autoReceipt, setAutoReceipt] = useState(true)
  const [allowedBanks, setAllowedBanks] = useState<string[]>([])

  useEffect(() => { loadBankAccounts() }, [])

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, category').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) {
      setAllBankAccounts(data)
      setAllowedBanks(data.map(a => a.code))
    }
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const toggleBank = (code: string) => {
    setAllowedBanks(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Settings</div><div className="page-sub">System configuration · Malkia Wellness Group Ltd</div></div>
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 20 }}>
        {/* Company */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Company Information</div>
          <FG label="Company Name"><input className="form-input" defaultValue="Malkia Wellness Group Ltd" /></FG>
          <FG label="TIN Number"><input className="form-input" defaultValue="123-456-789" /></FG>
          <FG label="VRN (VAT Reg No)"><input className="form-input" defaultValue="40-123456-E" /></FG>
          <div className="form-row">
            <FG label="Currency"><select className="form-input"><option>TZS — Tanzanian Shilling</option><option>USD</option></select></FG>
            <FG label="Financial Year"><select className="form-input"><option>July — June</option><option>January — December</option></select></FG>
          </div>
          <FG label="Default VAT Rate (%)"><input className="form-input" type="number" defaultValue="18" /></FG>
          <button className="btn btn-primary" onClick={() => showToast('Settings saved successfully')}>Save Changes</button>
        </div>

        {/* Users */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Users & Access</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Status</th></tr></thead>
              <tbody>
                {[
                  { n: 'Joe Gembe', r: 'Super Admin', b: 'DSM HQ', s: 'Active' },
                  { n: 'Jane Mwatonoka', r: 'Super Admin', b: 'DSM HQ', s: 'Active' },
                  { n: 'Barbra Kabendera', r: 'CRM Manager', b: 'DSM HQ', s: 'Pending' },
                  { n: 'Lilian Mallya', r: 'Sales Rep', b: 'DSM HQ', s: 'Pending' },
                  { n: 'Sophia Kipanta', r: 'Midwife', b: 'DSM HQ', s: 'Pending' },
                ].map((u, i) => (
                  <tr key={i}>
                    <td className="td-bold">{u.n}</td>
                    <td><span className={`pill ${u.r === 'Super Admin' ? 'pill-amber' : 'pill-blue'}`}>{u.r}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>{u.b}</td>
                    <td><span className={`pill ${u.s === 'Active' ? 'pill-green' : 'pill-gray'}`}>{u.s}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>+ Invite User</button>
        </div>
      </div>

      {/* Cash Sale Settings */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Cash Sale Settings</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>Control how cash sales behave at the counter</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Auto-Receipt on Full Payment</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>When ON — posting a cash sale automatically creates the receipt journal entry. When OFF — cashier must manually receipt each sale.</div>
          </div>
          <div onClick={() => setAutoReceipt(!autoReceipt)} style={{ width: 48, height: 26, background: autoReceipt ? 'var(--green)' : 'var(--surface3)', borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 20 }}>
            <div style={{ position: 'absolute', top: 3, left: autoReceipt ? 25 : 3, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}></div>
          </div>
        </div>

        <div style={{ paddingTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Payment Accounts Shown at Counter</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Choose which bank/cash accounts appear in the Cash Sale payment dropdown. Uncheck to hide from cashiers.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {allBankAccounts.map(a => (
              <div key={a.id} onClick={() => toggleBank(a.code)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: allowedBanks.includes(a.code) ? 'var(--green-dim)' : 'var(--surface2)', border: `1px solid ${allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--r)', cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--surface3)', border: `2px solid ${allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {allowedBanks.includes(a.code) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{a.code}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Receipt Template */}
      <div style={{ background: 'linear-gradient(135deg, rgba(247,166,173,.08) 0%, rgba(133,194,190,.06) 100%)', border: '1px solid rgba(247,166,173,.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(247,166,173,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#f7a6ad" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Receipt Template</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Branded cash sale receipt · Teal & blush · Malkia identity · PDF & WhatsApp ready</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Edit messages · Toggle sections · Set Konnect link · Brand colors</div>
          </div>
        </div>
        <button onClick={() => onNav('receipt-template')} className="btn btn-primary" style={{ background: '#85c2be', border: 'none', flexShrink: 0 }}>
          Edit Template →
        </button>
      </div>

      {/* Invoice Template */}
      <div style={{ background: 'linear-gradient(135deg, rgba(26,26,26,.06) 0%, rgba(133,194,190,.06) 100%)', border: '1px solid rgba(133,194,190,.2)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(26,26,26,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#85c2be" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Sales Invoice Template</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>B2B invoice · Classic layout · Logo + bank details · PDF ready</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Edit bank details · Toggle sections · Outstanding balance · Payment terms</div>
          </div>
        </div>
        <button onClick={() => onNav('invoice-template')} className="btn btn-primary" style={{ background: '#1a1a1a', border: 'none', flexShrink: 0 }}>
          Edit Template →
        </button>
      </div>

      {/* WhatsApp Integration */}
      <div style={{ background: 'linear-gradient(135deg, rgba(37,211,102,.08) 0%, rgba(37,211,102,.04) 100%)', border: '1px solid rgba(37,211,102,.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(37,211,102,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#25D366" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>WhatsApp Integration</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Send receipts and invoices directly to customers · Wati · Twilio · Infobip</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Configure API · Message templates · Send logs</div>
          </div>
        </div>
        <button onClick={() => onNav('whatsapp-settings')} className="btn btn-primary" style={{ background: '#25D366', border: 'none', flexShrink: 0 }}>
          Configure →
        </button>
      </div>

      {/* Accounting Settings */}
      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,.08) 0%, rgba(133,194,190,.06) 100%)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Accounting Settings</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Fiscal years · Accounting periods · Period locking · Posting rules</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Go-live date · Migration status · Backdate limits · EOD lock</div>
          </div>
        </div>
        <button onClick={() => onNav('accounting-settings')} className="btn btn-primary" style={{ background: '#6366f1', border: 'none', flexShrink: 0 }}>
          Configure →
        </button>
      </div>

      {/* Inventory Settings */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Inventory Settings</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Stock control · Valuation · Reorder alerts · Categories · Units · Stock taking</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Block negative stock · Min margin · USD rate · Visibility rules</div>
          </div>
        </div>
        <button onClick={() => onNav('inventory-settings')} className="btn btn-primary" style={{ flexShrink: 0 }}>
          Configure →
        </button>
      </div>

      {/* Price List */}
      <div style={{ background: 'linear-gradient(135deg, rgba(133,194,190,.08) 0%, rgba(247,166,173,.06) 100%)', border: '1px solid rgba(133,194,190,.2)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(133,194,190,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#85c2be" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Price List</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Branded price list · Print · PDF · CSV · Filter by category</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Malkia logo · Teal & blush · Template settings</div>
          </div>
        </div>
        <button onClick={() => onNav('pricelist-template')} className="btn btn-primary" style={{ background: '#85c2be', border: 'none', flexShrink: 0 }}>
          Open Price List →
        </button>
      </div>

      {/* Report Templates */}
      <div style={{ background: 'linear-gradient(135deg, rgba(133,194,190,.12) 0%, rgba(133,194,190,.04) 100%)', border: '1px solid rgba(133,194,190,.3)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="#85c2be" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Report Templates</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Customize PDF exports · Sales Day Book · Invoices · Receipts</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Upload logo · Choose colors · Toggle sections · Stats bar config</div>
          </div>
        </div>
        <button onClick={() => onNav('report-templates')} className="btn btn-primary" style={{ background: '#85c2be', border: 'none', flexShrink: 0 }}>
          Customize Templates →
        </button>
      </div>

      {/* Location Management */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Location Management</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Branches · Stock locations · 4-digit location codes · Voucher permissions</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Current: Branch 10 — DSM HQ · Locations: 1001 Front Office · 1002 Warehouse</div>
          </div>
        </div>
        <button onClick={() => onNav('location-settings')} className="btn btn-primary" style={{ flexShrink: 0 }}>
          Manage →
        </button>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
