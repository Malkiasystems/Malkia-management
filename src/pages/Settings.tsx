import { useState } from 'react'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'

export default function Settings() {
  const [toast, setToast] = useState('')

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">⚙️ Settings</div><div className="page-sub">System configuration · Malkia Wellness Group Ltd</div></div>
      </div>

      <div className="grid g2">
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
          <button className="btn btn-primary" onClick={() => setToast('Settings saved successfully')}>Save Changes</button>
        </div>

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

      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </div>
  )
}
