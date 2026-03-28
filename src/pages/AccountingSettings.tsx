import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { getPostedBy } from '../lib/utils'

interface FiscalYear {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'open' | 'closed'
  is_current: boolean
  created_at: string
}

interface AccountingPeriod {
  id: string
  fiscal_year_id: string
  name: string
  period_number: number
  start_date: string
  end_date: string
  status: 'open' | 'locked' | 'closed'
  locked_by: string | null
  locked_at: string | null
  closed_by: string | null
  closed_at: string | null
}

interface PeriodLockLogEntry {
  id: string
  period_id: string
  action: string
  previous_status: string
  new_status: string
  performed_by: string
  performed_at: string
  reason: string | null
  period?: { name: string }
}

interface AcctSettings {
  fiscal_year_start_month: number
  go_live_date: string | null
  opening_balance_status: 'draft' | 'confirmed' | 'locked'
  allow_posting_to_locked: boolean
  max_backdate_days: number
  require_narration: boolean
  eod_lock_enabled: boolean
}

const DEFAULT_SETTINGS: AcctSettings = {
  fiscal_year_start_month: 1,
  go_live_date: null,
  opening_balance_status: 'draft',
  allow_posting_to_locked: false,
  max_backdate_days: 30,
  require_narration: false,
  eod_lock_enabled: false
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
]

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'calendar') return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  if (n === 'lock')     return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  if (n === 'unlock')   return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
  if (n === 'settings') return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  if (n === 'history')  return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  if (n === 'file')     return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (n === 'plus')     return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'check')    return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'x')        return <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const Toggle = ({ label, desc, val, onChange }: { label: string; desc: string; val: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div></div>
    <div onClick={() => onChange(!val)} style={{ width: 44, height: 24, background: val ? 'var(--green)' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 16 }}>
      <div style={{ position: 'absolute', top: 2, left: val ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
    </div>
  </div>
)

const Section = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic n={icon} s={16} c="var(--accent)" />
      </div>
      <div className="card-title" style={{ margin: 0 }}>{title}</div>
    </div>
    {children}
  </div>
)

const Pill = ({ status }: { status: string }) => {
  const colors: Record<string, { bg: string; fg: string }> = {
    open: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e' },
    locked: { bg: 'rgba(234, 179, 8, 0.15)', fg: '#eab308' },
    closed: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#ef4444' },
    draft: { bg: 'rgba(156, 163, 175, 0.15)', fg: '#9ca3af' },
    confirmed: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e' }
  }
  const c = colors[status] || colors.draft
  return (
    <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
      {status}
    </span>
  )
}

function generateMonthlyPeriods(fiscalYearId: string, startMonth: number, year: number) {
  const periods: any[] = []
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  for (let i = 0; i < 12; i++) {
    const monthIndex = (startMonth - 1 + i) % 12
    const actualYear = monthIndex < startMonth - 1 && startMonth !== 1 ? year + 1 : year
    
    const startDate = new Date(actualYear, monthIndex, 1)
    const endDate = new Date(actualYear, monthIndex + 1, 0)

    periods.push({
      fiscal_year_id: fiscalYearId,
      name: `${monthNames[monthIndex]} ${actualYear}`,
      period_number: i + 1,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: 'open'
    })
  }

  return periods
}

export default function AccountingSettings() {
  const [activeTab, setActiveTab] = useState<'fiscal' | 'golive' | 'rules' | 'log'>('fiscal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [selectedFY, setSelectedFY] = useState<FiscalYear | null>(null)
  const [periods, setPeriods] = useState<AccountingPeriod[]>([])
  const [settings, setSettings] = useState<AcctSettings>(DEFAULT_SETTINGS)
  const [lockLog, setLockLog] = useState<PeriodLockLogEntry[]>([])

  const [showNewFY, setShowNewFY] = useState(false)
  const [newFYYear, setNewFYYear] = useState(new Date().getFullYear())

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (selectedFY) loadPeriods(selectedFY.id) }, [selectedFY])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  async function loadData() {
    setLoading(true)
    try {
      const { data: fyData } = await supabase
        .from('fiscal_years')
        .select('*')
        .order('start_date', { ascending: false })

      if (fyData) {
        setFiscalYears(fyData)
        const current = fyData.find(y => y.is_current) || fyData[0]
        setSelectedFY(current || null)
      }

      const { data: sysData } = await supabase
        .from('system_settings')
        .select('fiscal_year_start_month, go_live_date, opening_balance_status, allow_posting_to_locked, max_backdate_days, require_narration, eod_lock_enabled')
        .single()

      if (sysData) {
        setSettings({ ...DEFAULT_SETTINGS, ...sysData })
      }

      await loadLockLog()
    } catch (err) {
      console.error('Error loading accounting settings:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadPeriods(fyId: string) {
    const { data } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('fiscal_year_id', fyId)
      .order('period_number')

    if (data) setPeriods(data)
  }

  async function loadLockLog() {
    const { data } = await supabase
      .from('period_lock_log')
      .select('*, period:accounting_periods(name)')
      .order('performed_at', { ascending: false })
      .limit(50)

    if (data) setLockLog(data as PeriodLockLogEntry[])
  }

  async function createFiscalYear() {
    if (!newFYYear) return
    setSaving(true)

    try {
      const startMonth = settings.fiscal_year_start_month
      const fyStartDate = `${newFYYear}-${String(startMonth).padStart(2, '0')}-01`
      const fyEndYear = startMonth === 1 ? newFYYear : newFYYear + 1
      const fyEndMonth = startMonth === 1 ? 12 : startMonth - 1
      const fyEndDate = new Date(fyEndYear, fyEndMonth, 0).toISOString().split('T')[0]

      const fyName = startMonth === 1 ? `FY ${newFYYear}` : `FY ${newFYYear}/${String(newFYYear + 1).slice(-2)}`

      if (fiscalYears.find(fy => fy.name === fyName)) {
        showToast(`Fiscal year ${fyName} already exists`, 'error')
        setSaving(false)
        return
      }

      const { data: newFY, error: fyError } = await supabase
        .from('fiscal_years')
        .insert({
          name: fyName,
          start_date: fyStartDate,
          end_date: fyEndDate,
          status: 'open',
          is_current: fiscalYears.length === 0,
          created_by: getPostedBy()
        })
        .select()
        .single()

      if (fyError) throw fyError

      const periodsToInsert = generateMonthlyPeriods(newFY.id, startMonth, newFYYear)
      const { error: periodsError } = await supabase.from('accounting_periods').insert(periodsToInsert)
      if (periodsError) throw periodsError

      showToast(`Created ${fyName} with 12 monthly periods`)
      setShowNewFY(false)
      await loadData()
    } catch (err: any) {
      showToast(err.message || 'Failed to create fiscal year', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function setCurrentFiscalYear(fyId: string) {
    setSaving(true)
    try {
      await supabase.from('fiscal_years').update({ is_current: false }).neq('id', fyId)
      await supabase.from('fiscal_years').update({ is_current: true }).eq('id', fyId)
      showToast('Current fiscal year updated')
      await loadData()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePeriodAction(period: AccountingPeriod, action: 'lock' | 'unlock' | 'close') {
    if (action === 'close' && !confirm(`Are you sure you want to CLOSE ${period.name}? This cannot be undone.`)) return

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const user = getPostedBy()

      if (action === 'lock') {
        await supabase.from('accounting_periods').update({ status: 'locked', locked_by: user, locked_at: now }).eq('id', period.id)
      } else if (action === 'unlock') {
        await supabase.from('accounting_periods').update({ status: 'open', locked_by: null, locked_at: null }).eq('id', period.id)
      } else if (action === 'close') {
        await supabase.from('accounting_periods').update({ status: 'closed', closed_by: user, closed_at: now }).eq('id', period.id)
      }

      await supabase.from('period_lock_log').insert({
        period_id: period.id,
        action: action === 'lock' ? 'locked' : action === 'unlock' ? 'unlocked' : 'closed',
        previous_status: period.status,
        new_status: action === 'lock' ? 'locked' : action === 'unlock' ? 'open' : 'closed',
        performed_by: user
      })

      showToast(`Period ${period.name} ${action}ed successfully`)
      await loadPeriods(selectedFY!.id)
      await loadLockLog()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const { data: existing } = await supabase.from('system_settings').select('id').limit(1).single()
      if (existing) {
        await supabase.from('system_settings').update({
          fiscal_year_start_month: settings.fiscal_year_start_month,
          go_live_date: settings.go_live_date,
          opening_balance_status: settings.opening_balance_status,
          allow_posting_to_locked: settings.allow_posting_to_locked,
          max_backdate_days: settings.max_backdate_days,
          require_narration: settings.require_narration,
          eod_lock_enabled: settings.eod_lock_enabled
        }).eq('id', existing.id)
      }
      showToast('Settings saved')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: 'fiscal' | 'golive' | 'rules' | 'log'; label: string; icon: string }[] = [
    { id: 'fiscal', label: 'Fiscal Year & Periods', icon: 'calendar' },
    { id: 'golive', label: 'Go-Live / Migration', icon: 'file' },
    { id: 'rules', label: 'Posting Rules', icon: 'settings' },
    { id: 'log', label: 'Lock Log', icon: 'history' }
  ]

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div><div className="page-title">Accounting Settings</div><div className="page-sub">Loading...</div></div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Accounting Settings</div>
          <div className="page-sub">Fiscal years, periods, and posting controls</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text3)',
              fontWeight: activeTab === tab.id ? 600 : 400, fontSize: 13, transition: 'all .15s'
            }}
          >
            <Ic n={tab.icon} s={14} c={activeTab === tab.id ? 'var(--accent)' : 'var(--text3)'} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fiscal' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <FG label="Select Fiscal Year">
              <select
                className="form-input"
                value={selectedFY?.id || ''}
                onChange={(e) => {
                  const fy = fiscalYears.find(f => f.id === e.target.value)
                  setSelectedFY(fy || null)
                }}
                style={{ minWidth: 200 }}
              >
                {fiscalYears.length === 0 && <option value="">No fiscal years</option>}
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.id}>{fy.name} {fy.is_current ? '(Current)' : ''}</option>
                ))}
              </select>
            </FG>

            {selectedFY && !selectedFY.is_current && (
              <button className="btn" onClick={() => setCurrentFiscalYear(selectedFY.id)} disabled={saving}>
                Set as Current
              </button>
            )}

            <button className="btn btn-primary" onClick={() => setShowNewFY(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic n="plus" s={14} c="#fff" /> New Fiscal Year
            </button>
          </div>

          {showNewFY && (
            <Section icon="calendar" title="Create New Fiscal Year">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <FG label="Year">
                  <input type="number" className="form-input" value={newFYYear} onChange={(e) => setNewFYYear(parseInt(e.target.value))} min={2020} max={2030} style={{ width: 100 }} />
                </FG>
                <FG label="Start Month">
                  <select className="form-input" value={settings.fiscal_year_start_month} onChange={(e) => setSettings({ ...settings, fiscal_year_start_month: parseInt(e.target.value) })} style={{ width: 140 }}>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </FG>
                <button className="btn btn-primary" onClick={createFiscalYear} disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
                <button className="btn btn-ghost" onClick={() => setShowNewFY(false)}>Cancel</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                This will create a fiscal year starting {MONTHS.find(m => m.value === settings.fiscal_year_start_month)?.label} {newFYYear} with 12 monthly periods.
              </div>
            </Section>
          )}

          {selectedFY && (
            <Section icon="calendar" title={`Accounting Periods - ${selectedFY.name}`}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Period</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Status</th>
                      <th>Locked By</th>
                      <th>Locked At</th>
                      <th style={{ width: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No periods. Create a fiscal year first.</td></tr>
                    ) : (
                      periods.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.period_number}</td>
                          <td className="td-bold">{p.name}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.start_date}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.end_date}</td>
                          <td><Pill status={p.status} /></td>
                          <td style={{ fontSize: 11, color: 'var(--text3)' }}>{p.locked_by || '-'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.locked_at ? new Date(p.locked_at).toLocaleDateString() : '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {p.status === 'open' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => handlePeriodAction(p, 'lock')} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                  <Ic n="lock" s={12} /> Lock
                                </button>
                              )}
                              {p.status === 'locked' && (
                                <>
                                  <button className="btn btn-ghost btn-sm" onClick={() => handlePeriodAction(p, 'unlock')} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                    <Ic n="unlock" s={12} /> Unlock
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => handlePeriodAction(p, 'close')} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ef4444' }}>
                                    <Ic n="x" s={12} c="#ef4444" /> Close
                                  </button>
                                </>
                              )}
                              {p.status === 'closed' && (
                                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Closed</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {activeTab === 'golive' && (
        <div className="grid g2" style={{ gap: 16 }}>
          <Section icon="file" title="Go-Live Date">
            <FG label="Go-Live Date">
              <input
                type="date"
                className="form-input"
                value={settings.go_live_date || ''}
                onChange={(e) => setSettings({ ...settings, go_live_date: e.target.value || null })}
                style={{ maxWidth: 200 }}
              />
            </FG>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              The date MalkiaOS takes over as the system of record. Historical data before this date will be imported from Tally.
            </div>
          </Section>

          <Section icon="check" title="Opening Balance Status">
            <FG label="Status">
              <select
                className="form-input"
                value={settings.opening_balance_status}
                onChange={(e) => setSettings({ ...settings, opening_balance_status: e.target.value as any })}
                style={{ maxWidth: 200 }}
              >
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="locked">Locked</option>
              </select>
            </FG>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              Draft: Still importing. Confirmed: Ready for review. Locked: Final, no changes allowed.
            </div>
          </Section>
        </div>
      )}

      {activeTab === 'rules' && (
        <div style={{ maxWidth: 600 }}>
          <Section icon="settings" title="Posting Rules">
            <Toggle
              label="Allow posting to locked periods"
              desc="When enabled, Super Admins can post to locked periods. Not recommended for production use."
              val={settings.allow_posting_to_locked}
              onChange={(v) => setSettings({ ...settings, allow_posting_to_locked: v })}
            />

            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
              <FG label="Maximum Backdating (days)">
                <input
                  type="number"
                  className="form-input"
                  value={settings.max_backdate_days}
                  onChange={(e) => setSettings({ ...settings, max_backdate_days: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={365}
                  style={{ width: 100 }}
                />
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                How many days back users can post. Set to 0 to disable backdating.
              </div>
            </div>

            <Toggle
              label="Require narration on journal entries"
              desc="Journal vouchers must have a description before posting."
              val={settings.require_narration}
              onChange={(v) => setSettings({ ...settings, require_narration: v })}
            />

            <Toggle
              label="Enable end-of-day lock"
              desc="When enabled, posting for previous days is blocked after EOD process runs."
              val={settings.eod_lock_enabled}
              onChange={(v) => setSettings({ ...settings, eod_lock_enabled: v })}
            />
          </Section>
        </div>
      )}

      {activeTab === 'log' && (
        <Section icon="history" title="Period Lock Log">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Period</th>
                  <th>Action</th>
                  <th>Previous</th>
                  <th>New</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {lockLog.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No lock/unlock actions recorded yet.</td></tr>
                ) : (
                  lockLog.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{new Date(entry.performed_at).toLocaleString()}</td>
                      <td className="td-bold">{entry.period?.name || 'Unknown'}</td>
                      <td>
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                          background: entry.action === 'locked' ? 'rgba(234,179,8,.15)' : entry.action === 'unlocked' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                          color: entry.action === 'locked' ? '#eab308' : entry.action === 'unlocked' ? '#22c55e' : '#ef4444'
                        }}>
                          {entry.action}
                        </span>
                      </td>
                      <td><Pill status={entry.previous_status} /></td>
                      <td><Pill status={entry.new_status} /></td>
                      <td style={{ fontSize: 11 }}>{entry.performed_by}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.reason || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
