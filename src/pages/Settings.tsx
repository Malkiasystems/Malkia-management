import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'

interface DBAccount { id: string; code: string; name: string; category: string }

export default function Settings() {
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
        <div><div className="page-title">⚙️ Settings</div><div className="page-sub">System configuration · Malkia Wellness Group Ltd</div></div>
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
        <div className="card-title" style={{ marginBottom: 6 }}>💵 Cash Sale Settings</div>
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
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{a.code}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => showToast('Cash sale settings saved')}>Save Cash Sale Settings</button>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
