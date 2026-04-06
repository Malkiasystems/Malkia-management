import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, HRMAsset } from './hrmTypes'

export default function HRMAssets({ onNav: _onNav }: HRMProps) {
  const [assets, setAssets] = useState<HRMAsset[]>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({ asset_name: '', asset_tag: '', employee_id: '', issued_date: '', condition: 'good', value: '', notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [assetRes, empRes] = await Promise.all([
      supabase.from('hrm_assets').select('*, employee:hrm_employees(id, full_name, initials)').order('asset_name'),
      supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setAssets(assetRes.data || [])
    setEmployees(empRes.data || [])
    setLoading(false)
  }

  const save = async () => {
    if (!form.asset_name || !form.asset_tag) { setToast('Asset name and tag required'); setToastType('error'); return }
    const { error } = await supabase.from('hrm_assets').insert({
      asset_name: form.asset_name, asset_tag: form.asset_tag,
      employee_id: form.employee_id || null,
      assigned_to_name: form.employee_id ? employees.find(e => e.id === form.employee_id)?.full_name : 'Office Pool',
      issued_date: form.issued_date || null, condition: form.condition,
      value: parseFloat(form.value) || 0, status: form.employee_id ? 'assigned' : 'pool', notes: form.notes || null,
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Asset added'); setToastType('success'); setShowModal(false)
    setForm({ asset_name: '', asset_tag: '', employee_id: '', issued_date: '', condition: 'good', value: '', notes: '' })
    load()
  }

  const totalValue = assets.reduce((s, a) => s + (a.value || 0), 0)
  const assigned = assets.filter(a => a.status === 'assigned').length
  const pool = assets.filter(a => a.status === 'pool').length

  const conditionColor: Record<string, string> = { excellent: '#22c55e', good: '#22c55e', fair: '#f59e0b', poor: '#ef4444' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Asset Allocation</div><div className="page-sub">Company assets assigned to employees</div></div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Allocate Asset</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#6366f1' }}>{assets.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Assets</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #22c55e' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e' }}>{assigned}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Assigned</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b' }}>{pool}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Pool / Unassigned</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{totalValue >= 1000000 ? (totalValue / 1000000).toFixed(1) + 'M' : (totalValue / 1000).toFixed(0) + 'K'}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Value (TZS)</div></div>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Asset</th><th>Tag</th><th>Assigned To</th><th>Issued</th><th>Condition</th><th className="td-right">Value (TZS)</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 700 }}>{a.asset_name}</td>
                    <td className="td-mono" style={{ color: 'var(--accent)', fontSize: 11 }}>{a.asset_tag}</td>
                    <td style={{ fontWeight: 600 }}>{a.assigned_to_name || (a.employee as any)?.full_name || 'Office Pool'}</td>
                    <td style={{ color: 'var(--text3)' }}>{a.issued_date || 'N/A'}</td>
                    <td><span style={{ fontSize: 10, background: `${conditionColor[a.condition] || '#aaa'}22`, color: conditionColor[a.condition] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{a.condition}</span></td>
                    <td className="td-right td-mono">{(a.value || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: a.status === 'assigned' ? '#22c55e22' : '#f59e0b22', color: a.status === 'assigned' ? '#22c55e' : '#f59e0b', padding: '2px 7px', borderRadius: 4 }}>{a.status === 'assigned' ? 'Assigned' : 'Pool'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 460, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Allocate Asset</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Asset Name *</label><input style={inputStyle} value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })} placeholder="e.g. MacBook Pro 14" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Asset Tag *</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.asset_tag} onChange={e => setForm({ ...form, asset_tag: e.target.value })} placeholder="e.g. MALK-LT-003" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Assign To</label><select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}><option value="">Office Pool (unassigned)</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Issue Date</label><input type="date" style={inputStyle} value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Condition</label><select style={inputStyle} value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Value (TZS)</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="e.g. 3200000" /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Allocate Asset</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
