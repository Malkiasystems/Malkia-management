import { useState, useEffect, type CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps } from './hrmTypes'
import type { KpiTemplate, KpiKra, KpiKpi, KpiAssignment, KpiAssignmentLine, KpiValueType } from '../../lib/kpiTypes'
import { toDisplay, fromInput, formatValue } from '../../lib/kpiTypes'
import { computeScorecard, type ScoringLine } from '../../lib/kpiScoring'

const input: CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
const num: CSSProperties = { ...input, textAlign: 'right', fontFamily: 'var(--mono)' }
const lbl: CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

const scoreColor = (s: number) => s >= 0.9 ? 'var(--accent)' : s >= 0.75 ? '#22c55e' : s >= 0.6 ? '#f59e0b' : '#ef4444'
const VALUE_TYPES: KpiValueType[] = ['percent', 'currency', 'number']

// Turn assignment lines into engine input. useFinal = use admin 'actual', else self_actual.
function toScoring(lines: KpiAssignmentLine[], useFinal: boolean): ScoringLine[] {
  return lines.map(l => ({
    kra: l.kra, kra_weight: l.kra_weight, kpi: l.kpi, direction: l.direction,
    target: l.target, actual: useFinal ? (l.actual ?? l.self_actual) : l.self_actual,
  }))
}

export default function HRMKpi({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const isSelf = hrmMode === 'self' || !canManage
  const [tab, setTab] = useState<'templates' | 'assign' | 'review'>('templates')
  const [toast, setToast] = useState(''); const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const notify = (m: string, t: 'success' | 'error' = 'success') => { setToast(m); setToastType(t) }
  const [loading, setLoading] = useState(true)

  // shared
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [templates, setTemplates] = useState<KpiTemplate[]>([])
  const [assignments, setAssignments] = useState<KpiAssignment[]>([])

  useEffect(() => { init() }, [hrmMode, linkedEmployeeId])

  const init = async () => {
    setLoading(true)
    const reqs: any[] = [
      supabase.from('hrm_kpi_templates').select('*').order('created_at'),
      supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ]
    const [tplRes, empRes] = await Promise.all(reqs)
    setTemplates(tplRes.data || [])
    setEmployees(empRes.data || [])
    await loadAssignments()
    setLoading(false)
  }

  const loadAssignments = async () => {
    let q = supabase.from('hrm_kpi_assignments').select('*, employee:hrm_employees(id, full_name, job_title, department)').order('created_at', { ascending: false })
    if (isSelf) {
      if (!linkedEmployeeId) { setAssignments([]); return }
      q = q.eq('employee_id', linkedEmployeeId)
    }
    const { data } = await q
    setAssignments(data || [])
  }

  // ─────────────────────────── SELF VIEW ───────────────────────────
  if (isSelf) {
    return <SelfView loading={loading} assignments={assignments} linkedEmployeeId={linkedEmployeeId || null} reload={loadAssignments} notify={notify} />
  }

  // ─────────────────────────── ADMIN VIEW ──────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">KPI Scorecards</div><div className="page-sub">Templates, allocation, and review/approval</div></div>
        <div className="page-actions">
          <button onClick={() => setTab('templates')} className={tab === 'templates' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Templates</button>
          <button onClick={() => setTab('assign')} className={tab === 'assign' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Assign</button>
          <button onClick={() => setTab('review')} className={tab === 'review' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Review</button>
        </div>
      </div>
      {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        : tab === 'templates' ? <TemplatesTab templates={templates} reload={init} notify={notify} />
        : tab === 'assign' ? <AssignTab templates={templates} employees={employees} reloadAssignments={loadAssignments} notify={notify} />
        : <ReviewTab assignments={assignments} reload={loadAssignments} notify={notify} />}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ═══════════════════════ TEMPLATES TAB ═══════════════════════
function TemplatesTab({ templates, reload, notify }: { templates: KpiTemplate[]; reload: () => void; notify: (m: string, t?: 'success' | 'error') => void }) {
  const [editing, setEditing] = useState<KpiTemplate | null>(null)
  const [kras, setKras] = useState<(KpiKra & { kpis: KpiKpi[] })[]>([])

  const openTemplate = async (tpl: KpiTemplate) => {
    setEditing(tpl)
    const { data: kraRows } = await supabase.from('hrm_kpi_kras').select('*').eq('template_id', tpl.id).order('sort_order')
    const kraList = (kraRows || []) as KpiKra[]
    const ids = kraList.map(k => k.id)
    const { data: kpiRows } = ids.length ? await supabase.from('hrm_kpi_kpis').select('*').in('kra_id', ids).order('sort_order') : { data: [] as KpiKpi[] }
    setKras(kraList.map(k => ({ ...k, kpis: (kpiRows || []).filter((p: KpiKpi) => p.kra_id === k.id) })))
  }

  const createTemplate = async () => {
    const { data, error } = await supabase.from('hrm_kpi_templates').insert({ name: 'New Template', prp_pool: 500000, payout_cap: 1.0, sales_gate: 0 }).select().single()
    if (error) return notify(error.message, 'error')
    reload(); openTemplate(data as KpiTemplate); notify('Template created')
  }

  const saveTemplate = async () => {
    if (!editing) return
    const { error } = await supabase.from('hrm_kpi_templates').update({
      name: editing.name, role_label: editing.role_label, prp_pool: editing.prp_pool,
      payout_cap: editing.payout_cap, sales_gate: editing.sales_gate, sales_kra: editing.sales_kra,
      is_active: editing.is_active, notes: editing.notes,
    }).eq('id', editing.id)
    if (error) return notify(error.message, 'error')
    notify('Template saved'); reload()
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template and its KRAs/KPIs? Assigned scorecards already issued are NOT affected (they are snapshots).')) return
    const { error } = await supabase.from('hrm_kpi_templates').delete().eq('id', id)
    if (error) return notify(error.message, 'error')
    setEditing(null); reload(); notify('Template deleted')
  }

  const addKra = async () => {
    if (!editing) return
    const { data, error } = await supabase.from('hrm_kpi_kras').insert({ template_id: editing.id, name: 'New KRA', weight: 0, sort_order: kras.length + 1 }).select().single()
    if (error) return notify(error.message, 'error')
    setKras([...kras, { ...(data as KpiKra), kpis: [] }])
  }
  const updateKra = async (id: string, patch: Partial<KpiKra>) => {
    setKras(kras.map(k => k.id === id ? { ...k, ...patch } : k))
    await supabase.from('hrm_kpi_kras').update(patch).eq('id', id)
  }
  const deleteKra = async (id: string) => {
    if (!confirm('Delete this KRA and its KPIs?')) return
    await supabase.from('hrm_kpi_kras').delete().eq('id', id)
    setKras(kras.filter(k => k.id !== id))
  }
  const addKpi = async (kraId: string, count: number) => {
    const { data, error } = await supabase.from('hrm_kpi_kpis').insert({ kra_id: kraId, name: 'New KPI', direction: 'H', value_type: 'percent', default_target: 1, sort_order: count + 1 }).select().single()
    if (error) return notify(error.message, 'error')
    setKras(kras.map(k => k.id === kraId ? { ...k, kpis: [...k.kpis, data as KpiKpi] } : k))
  }
  const updateKpi = async (kraId: string, id: string, patch: Partial<KpiKpi>) => {
    setKras(kras.map(k => k.id === kraId ? { ...k, kpis: k.kpis.map(p => p.id === id ? { ...p, ...patch } : p) } : k))
    await supabase.from('hrm_kpi_kpis').update(patch).eq('id', id)
  }
  const deleteKpi = async (kraId: string, id: string) => {
    await supabase.from('hrm_kpi_kpis').delete().eq('id', id)
    setKras(kras.map(k => k.id === kraId ? { ...k, kpis: k.kpis.filter(p => p.id !== id) } : k))
  }

  const weightTotal = kras.reduce((s, k) => s + (Number(k.weight) || 0), 0)

  if (editing) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); reload() }}>← Back</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => deleteTemplate(editing.id)} style={{ color: '#ef4444' }}>Delete</button>
            <button className="btn btn-primary btn-sm" onClick={saveTemplate}>Save settings</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
          <div><label style={lbl}>Template name</label><input style={input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><label style={lbl}>Role label</label><input style={input} value={editing.role_label || ''} onChange={e => setEditing({ ...editing, role_label: e.target.value })} /></div>
          <div><label style={lbl}>PRP pool (TZS)</label><input type="number" style={num} value={editing.prp_pool} onChange={e => setEditing({ ...editing, prp_pool: parseFloat(e.target.value) || 0 })} /></div>
          <div><label style={lbl}>Payout cap (1.0 / 1.2)</label><input type="number" step="0.05" style={num} value={editing.payout_cap} onChange={e => setEditing({ ...editing, payout_cap: parseFloat(e.target.value) || 1 })} /></div>
          <div><label style={lbl}>Sales gate % (0 = off)</label><input type="number" style={num} value={+(editing.sales_gate * 100).toFixed(1)} onChange={e => setEditing({ ...editing, sales_gate: (parseFloat(e.target.value) || 0) / 100 })} /></div>
          <div><label style={lbl}>Sales-gate KRA</label><select style={input} value={editing.sales_kra || ''} onChange={e => setEditing({ ...editing, sales_kra: e.target.value || null })}><option value="">(none)</option>{kras.map(k => <option key={k.id} value={k.name}>{k.name}</option>)}</select></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>KRAs & KPIs</div>
          <div style={{ fontSize: 11, color: Math.abs(weightTotal - 1) < 0.001 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>Weights total: {(weightTotal * 100).toFixed(0)}%{Math.abs(weightTotal - 1) < 0.001 ? ' ✓' : ' (must = 100%)'}</div>
        </div>

        {kras.map(k => (
          <div key={k.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 40px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input style={{ ...input, fontWeight: 700 }} value={k.name} onChange={e => updateKra(k.id, { name: e.target.value })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="number" style={num} value={+(k.weight * 100).toFixed(1)} onChange={e => updateKra(k.id, { weight: (parseFloat(e.target.value) || 0) / 100 })} /><span style={{ fontSize: 11, color: 'var(--text3)' }}>%</span></div>
              <button onClick={() => deleteKra(k.id)} style={{ background: 'none', border: '1px solid var(--border)', color: '#ef4444', borderRadius: 6, cursor: 'pointer', height: 30 }}>✕</button>
            </div>
            {k.kpis.map(p => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={input} value={p.name} onChange={e => updateKpi(k.id, p.id, { name: e.target.value })} placeholder="KPI name" />
                <select style={input} value={p.direction} onChange={e => updateKpi(k.id, p.id, { direction: e.target.value as any })}><option value="H">Higher</option><option value="L">Lower</option></select>
                <select style={input} value={p.value_type} onChange={e => updateKpi(k.id, p.id, { value_type: e.target.value as KpiValueType })}>{VALUE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}</select>
                <input type="number" style={num} value={p.value_type === 'percent' ? toDisplay(p.default_target, 'percent') : (p.default_target ?? '')} onChange={e => updateKpi(k.id, p.id, { default_target: fromInput(e.target.value, p.value_type) })} placeholder="target" />
                <button onClick={() => deleteKpi(k.id, p.id)} style={{ background: 'none', border: '1px solid var(--border)', color: '#ef4444', borderRadius: 6, cursor: 'pointer', height: 30 }}>✕</button>
              </div>
            ))}
            <button onClick={() => addKpi(k.id, k.kpis.length)} style={{ width: '100%', marginTop: 2, background: 'none', border: '1px dashed var(--border)', color: 'var(--text3)', padding: 5, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>+ Add KPI</button>
          </div>
        ))}
        <button onClick={addKra} style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', color: 'var(--text3)', padding: 8, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>+ Add KRA</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button className="btn btn-primary btn-sm" onClick={createTemplate}>+ New Template</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {templates.map(t => (
          <div key={t.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openTemplate(t)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div><div style={{ fontWeight: 800 }}>{t.name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{t.role_label || '—'}</div></div>
              {!t.is_active && <span style={{ fontSize: 10, color: '#ef4444' }}>inactive</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Pool {Math.round(t.prp_pool).toLocaleString()} TZS · cap {t.payout_cap}× · gate {t.sales_gate > 0 ? `${(t.sales_gate * 100).toFixed(0)}%` : 'off'}</div>
          </div>
        ))}
        {templates.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No templates yet. Create one to define a role's KRAs and KPIs.</div>}
      </div>
    </div>
  )
}

// ═══════════════════════ ASSIGN TAB ═══════════════════════
function AssignTab({ templates, employees, reloadAssignments, notify }: { templates: KpiTemplate[]; employees: { id: string; full_name: string }[]; reloadAssignments: () => void; notify: (m: string, t?: 'success' | 'error') => void }) {
  const [templateId, setTemplateId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [period, setPeriod] = useState('Q3 2026')
  const [busy, setBusy] = useState(false)

  const assign = async () => {
    if (!templateId || !employeeId) return notify('Pick a template and an employee', 'error')
    setBusy(true)
    const tpl = templates.find(t => t.id === templateId)!
    const { data: kraRows } = await supabase.from('hrm_kpi_kras').select('*').eq('template_id', templateId).order('sort_order')
    const kraList = (kraRows || []) as KpiKra[]
    const ids = kraList.map(k => k.id)
    const { data: kpiRows } = ids.length ? await supabase.from('hrm_kpi_kpis').select('*').in('kra_id', ids).order('sort_order') : { data: [] as KpiKpi[] }
    const { data: asg, error } = await supabase.from('hrm_kpi_assignments').insert({
      template_id: tpl.id, template_name: tpl.name, employee_id: employeeId, period,
      prp_pool: tpl.prp_pool, payout_cap: tpl.payout_cap, sales_gate: tpl.sales_gate, sales_kra: tpl.sales_kra, status: 'draft',
    }).select().single()
    if (error) { setBusy(false); return notify(error.message, 'error') }
    const lines = kraList.flatMap((k, ki) => (kpiRows || []).filter((p: KpiKpi) => p.kra_id === k.id).map((p: KpiKpi, pi: number) => ({
      assignment_id: asg.id, kra: k.name, kra_weight: k.weight, kpi: p.name, direction: p.direction,
      value_type: p.value_type, target: p.default_target, sort_order: ki * 100 + pi,
    })))
    if (lines.length) {
      const { error: e2 } = await supabase.from('hrm_kpi_assignment_lines').insert(lines)
      if (e2) { setBusy(false); return notify(e2.message, 'error') }
    }
    setBusy(false); notify('Scorecard assigned'); reloadAssignments()
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div style={{ fontWeight: 800, marginBottom: 14 }}>Allocate a scorecard</div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Template</label><select style={input} value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">Select...</option>{templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Employee</label><select style={input} value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Select...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
      <div style={{ marginBottom: 16 }}><label style={lbl}>Period</label><input style={input} value={period} onChange={e => setPeriod(e.target.value)} placeholder="Q3 2026 or 2026-07" /></div>
      <button className="btn btn-primary" disabled={busy} onClick={assign}>{busy ? 'Assigning...' : 'Assign scorecard'}</button>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>The KPIs and targets are copied (snapshot) onto the assignment, so later edits to the template won't change this issued card.</div>
    </div>
  )
}

// ═══════════════════════ REVIEW TAB (admin) ═══════════════════════
function ReviewTab({ assignments, reload, notify }: { assignments: KpiAssignment[]; reload: () => void; notify: (m: string, t?: 'success' | 'error') => void }) {
  const [open, setOpen] = useState<KpiAssignment | null>(null)
  const [lines, setLines] = useState<KpiAssignmentLine[]>([])
  const [mgrNotes, setMgrNotes] = useState('')

  const openCard = async (a: KpiAssignment) => {
    const { data } = await supabase.from('hrm_kpi_assignment_lines').select('*').eq('assignment_id', a.id).order('sort_order')
    setLines(data || []); setMgrNotes(a.manager_notes || ''); setOpen(a)
  }
  const setActual = (id: string, raw: string, vt: KpiValueType) => setLines(lines.map(l => l.id === id ? { ...l, actual: fromInput(raw, vt) } : l))

  const result = open ? computeScorecard(toScoring(lines, true), { pool: open.prp_pool, cap: open.payout_cap, salesGate: open.sales_gate, salesKra: open.sales_kra }) : null

  const approve = async () => {
    if (!open || !result) return
    // persist any admin actual overrides
    for (const l of lines) await supabase.from('hrm_kpi_assignment_lines').update({ actual: l.actual ?? l.self_actual }).eq('id', l.id)
    const { error } = await supabase.from('hrm_kpi_assignments').update({
      status: 'approved', overall_score: result.overall, rating: result.rating, gross_prp: result.grossPrp,
      final_prp: result.finalPrp, gate_pass: result.gatePass, manager_notes: mgrNotes,
      approved_at: new Date().toISOString(),
    }).eq('id', open.id)
    if (error) return notify(error.message, 'error')
    notify('Approved & locked'); setOpen(null); reload()
  }
  const reject = async () => {
    if (!open) return
    const { error } = await supabase.from('hrm_kpi_assignments').update({ status: 'rejected', manager_notes: mgrNotes }).eq('id', open.id)
    if (error) return notify(error.message, 'error')
    notify('Sent back / rejected'); setOpen(null); reload()
  }

  if (open && result) {
    const byKra = result.kras
    return (
      <div className="card">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(null)} style={{ marginBottom: 12 }}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{(open.employee as any)?.full_name} · {open.period}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>{open.template_name} · status: {open.status}</div>
        {byKra.map(kr => (
          <div key={kr.kra} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}><span>{kr.kra} ({(kr.weight * 100).toFixed(0)}%)</span><span style={{ color: kr.score !== null ? scoreColor(kr.score) : 'var(--text3)' }}>{kr.score !== null ? `${(kr.score * 100).toFixed(1)}%` : '—'}</span></div>
            {lines.filter(l => l.kra === kr.kra).map(l => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                <span>{l.kpi}</span>
                <span style={{ color: 'var(--text3)', textAlign: 'right' }}>T: {formatValue(l.target, l.value_type)}</span>
                <span style={{ color: 'var(--text3)', textAlign: 'right' }}>self: {formatValue(l.self_actual, l.value_type)}</span>
                <input type="number" style={num} value={l.value_type === 'percent' ? toDisplay(l.actual ?? l.self_actual, 'percent') : (l.actual ?? l.self_actual ?? '')} onChange={e => setActual(l.id, e.target.value, l.value_type)} placeholder="final" />
              </div>
            ))}
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 900 }}><span>Overall: <span style={{ color: scoreColor(result.overall) }}>{(result.overall * 100).toFixed(1)}%</span> · {result.rating}</span></div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Gate: {open.sales_gate > 0 ? (result.gatePass ? 'PASS' : 'FAIL — PRP held') : 'off'} · Gross PRP {Math.round(result.grossPrp).toLocaleString()} TZS · <b>Final PRP {Math.round(result.finalPrp).toLocaleString()} TZS</b></div>
        </div>
        <div style={{ marginTop: 12 }}><label style={lbl}>Manager notes</label><textarea style={{ ...input, height: 60, resize: 'none' }} value={mgrNotes} onChange={e => setMgrNotes(e.target.value)} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={reject} style={{ color: '#ef4444' }}>Reject / send back</button>
          <button className="btn btn-primary" onClick={approve}>Approve & lock</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
      {assignments.map(a => (
        <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openCard(a)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div><div style={{ fontWeight: 800 }}>{(a.employee as any)?.full_name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.template_name} · {a.period}</div></div>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, height: 'fit-content', background: a.status === 'approved' ? '#22c55e22' : a.status === 'self_rated' ? '#f59e0b22' : a.status === 'rejected' ? '#ef444422' : 'var(--border)', color: a.status === 'approved' ? '#22c55e' : a.status === 'self_rated' ? '#f59e0b' : a.status === 'rejected' ? '#ef4444' : 'var(--text3)' }}>{a.status}</span>
          </div>
          {a.status === 'approved' && a.overall_score !== null && <div style={{ fontSize: 12, marginTop: 8 }}>Overall {(a.overall_score * 100).toFixed(0)}% · Final PRP {Math.round(a.final_prp || 0).toLocaleString()} TZS</div>}
        </div>
      ))}
      {assignments.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No scorecards assigned yet. Use the Assign tab.</div>}
    </div>
  )
}

// ═══════════════════════ SELF VIEW (staff) ═══════════════════════
function SelfView({ loading, assignments, linkedEmployeeId, reload, notify }: { loading: boolean; assignments: KpiAssignment[]; linkedEmployeeId: string | null; reload: () => void; notify: (m: string, t?: 'success' | 'error') => void }) {
  const [open, setOpen] = useState<KpiAssignment | null>(null)
  const [lines, setLines] = useState<KpiAssignmentLine[]>([])
  const [notes, setNotes] = useState('')

  const openCard = async (a: KpiAssignment) => {
    const { data } = await supabase.from('hrm_kpi_assignment_lines').select('*').eq('assignment_id', a.id).order('sort_order')
    setLines(data || []); setNotes(a.employee_notes || ''); setOpen(a)
  }
  const setSelf = (id: string, raw: string, vt: KpiValueType) => setLines(lines.map(l => l.id === id ? { ...l, self_actual: fromInput(raw, vt) } : l))

  const result = open ? computeScorecard(toScoring(lines, false), { pool: open.prp_pool, cap: open.payout_cap, salesGate: open.sales_gate, salesKra: open.sales_kra }) : null
  const editable = open?.status === 'draft' || open?.status === 'rejected'

  const saveDraft = async () => {
    if (!open) return
    for (const l of lines) await supabase.from('hrm_kpi_assignment_lines').update({ self_actual: l.self_actual }).eq('id', l.id)
    await supabase.from('hrm_kpi_assignments').update({ employee_notes: notes }).eq('id', open.id)
    notify('Saved')
  }
  const submit = async () => {
    if (!open) return
    for (const l of lines) await supabase.from('hrm_kpi_assignment_lines').update({ self_actual: l.self_actual }).eq('id', l.id)
    const { error } = await supabase.from('hrm_kpi_assignments').update({ status: 'self_rated', employee_notes: notes, self_submitted_at: new Date().toISOString() }).eq('id', open.id)
    if (error) return notify(error.message, 'error')
    notify('Submitted for approval'); setOpen(null); reload()
  }

  if (loading) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div></div>
  if (!linkedEmployeeId) return <div className="page"><div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Your login isn't linked to an employee record yet. Ask an admin to set your email on your employee profile.</div></div>

  if (open && result) {
    return (
      <div className="page">
        <div className="page-header"><div><div className="page-title">My Scorecard</div><div className="page-sub">{open.template_name} · {open.period}</div></div><button className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>← Back</button></div>
        <div className="card">
          {result.kras.map(kr => (
            <div key={kr.kra} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}><span>{kr.kra} ({(kr.weight * 100).toFixed(0)}%)</span><span style={{ color: kr.score !== null ? scoreColor(kr.score) : 'var(--text3)' }}>{kr.score !== null ? `${(kr.score * 100).toFixed(1)}%` : '—'}</span></div>
              {lines.filter(l => l.kra === kr.kra).map(l => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                  <span>{l.kpi} <span style={{ color: 'var(--text3)' }}>({l.direction === 'L' ? 'lower better' : 'higher better'})</span></span>
                  <span style={{ color: 'var(--text3)', textAlign: 'right' }}>Target: {formatValue(l.target, l.value_type)}</span>
                  {editable
                    ? <input type="number" style={num} value={l.value_type === 'percent' ? toDisplay(l.self_actual, 'percent') : (l.self_actual ?? '')} onChange={e => setSelf(l.id, e.target.value, l.value_type)} placeholder="my actual" />
                    : <span style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatValue(l.self_actual, l.value_type)}</span>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>Overall (preview): <span style={{ color: scoreColor(result.overall) }}>{(result.overall * 100).toFixed(1)}%</span> · {result.rating}</div>
            {open.status === 'approved' && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text3)' }}>Approved · Final PRP {Math.round(open.final_prp || 0).toLocaleString()} TZS</div>}
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>My notes</label><textarea style={{ ...input, height: 56, resize: 'none' }} value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} /></div>
          {editable && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}><button className="btn btn-ghost" onClick={saveDraft}>Save draft</button><button className="btn btn-primary" onClick={submit}>Submit for approval</button></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header"><div><div className="page-title">My Scorecards</div><div className="page-sub">Your KPIs, set by admin. Rate yourself, then submit for approval.</div></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {assignments.map(a => (
          <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openCard(a)}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><div style={{ fontWeight: 800 }}>{a.period}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.template_name}</div></div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, height: 'fit-content', background: a.status === 'approved' ? '#22c55e22' : a.status === 'self_rated' ? '#f59e0b22' : a.status === 'rejected' ? '#ef444422' : 'var(--border)', color: a.status === 'approved' ? '#22c55e' : a.status === 'self_rated' ? '#f59e0b' : a.status === 'rejected' ? '#ef4444' : 'var(--text3)' }}>{a.status === 'draft' ? 'to rate' : a.status === 'self_rated' ? 'awaiting approval' : a.status}</span>
            </div>
            {a.status === 'approved' && a.overall_score !== null && <div style={{ fontSize: 12, marginTop: 8 }}>Overall {(a.overall_score * 100).toFixed(0)}% · {a.rating}</div>}
          </div>
        ))}
        {assignments.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No scorecards assigned to you yet.</div>}
      </div>
    </div>
  )
}
