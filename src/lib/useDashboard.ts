// ============================================================================
// useDashboard.ts
// Single data hook for the CEO dashboard. Current-month scoped. Sensitive
// (financial) queries are SKIPPED entirely when canViewFinancials is false, so
// that data never reaches an unauthorised browser. All financial figures come
// from the general ledger (journals + journal_lines + accounts), which is the
// trustworthy source after the balance rebuild.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { clampFrom } from './ledgerCutover'
import { localIso } from './utils'
import { supabase } from './supabase'
import type { DashboardData, FinancialData, OperationsData, MoneyDelta } from './dashboardTypes'

// Cash & loan accounts are read by category (accounts.category), not a
// hardcoded code list — hardcoded lists silently missed 1032, 1040 and the
// new 2150 SJ loan. Category is the source of truth.

function monthBounds(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth()
  // localIso, NOT toISOString: UTC conversion made every window start one day
  // early in UTC+3, so "this month" quietly wore the last day of the previous
  // month. Fourth sighting of this bug today (today(), Banks posting date,
  // getMonthPeriod, and now here).
  //
  // monthStart is additionally clamped to the ledger cutover: the accounts do
  // not count anything before it, so the dashboard must not either, or its
  // headline disagrees with the balance sheet one tab over.
  return {
    monthStart: clampFrom(localIso(new Date(y, m, 1))),
    prevStart: localIso(new Date(y, m - 1, 1)),
    prevEnd: localIso(new Date(y, m, 0)),
    today: localIso(d),
    label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  }
}

function delta(current: number, previous: number): MoneyDelta {
  const deltaPct = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null
  return { current, previous, deltaPct }
}

export function useDashboard(canViewFinancials: boolean) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const b = monthBounds()
    try {
      const [operations, financial] = await Promise.all([
        loadOperations(b),
        canViewFinancials ? loadFinancial(b) : Promise.resolve(null),
      ])
      setData({ monthLabel: b.label, operations, financial })
    } catch (err: any) {
      console.error('Dashboard load failed:', err)
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [canViewFinancials])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

// ── Operational tier (always) ────────────────────────────────────────────────
async function loadOperations(b: ReturnType<typeof monthBounds>): Promise<OperationsData> {
  const todayIso = localIso(new Date())
  const [salesRes, prodRes, empRes, leaveRes, retailRes, b2bRes, apprRes, recentRes] = await Promise.all([
    supabase.from('vouchers').select('type, total_amount, posting_date, status')
      .in('type', ['cash_sale', 'sales_invoice']).eq('status', 'posted').gte('posting_date', b.monthStart),
    supabase.from('products').select('id, name, qty_on_hand, reorder_point, category, is_active').eq('is_active', true),
    // This used to select 'id, is_active, on_leave'. There is no on_leave column
    // on hrm_employees and there never has been, so PostgREST rejected the whole
    // query with "column hrm_employees.on_leave does not exist". Because these
    // run in a Promise.all, the error landed in empRes.error rather than
    // throwing, empRes.data came back null, and the dashboard quietly reported a
    // headcount of ZERO. Not just the leave count — the entire HRM widget.
    supabase.from('hrm_employees').select('id, is_active'),
    // Who is on leave is a fact about TODAY, not a flag on the employee record.
    // hrm_attendance already carries it: HRMAttendance.tsx writes status
    // 'on_leave' when entry_type is 'leave'. Read the real data rather than
    // adding a boolean column that nothing in the app would ever set.
    supabase.from('hrm_attendance').select('employee_id').eq('date', todayIso).eq('status', 'on_leave'),
    supabase.from('customers').select('id, customer_type, created_at').eq('customer_type', 'cash'),
    supabase.from('b2b_accounts').select('stage, next_action_date, won_at, is_archived'),
    supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('vouchers').select('ref, description, type, total_amount, status')
      .eq('status', 'posted').order('created_at', { ascending: false }).limit(5),
  ])

  // Sales
  const salesRows = (salesRes.data || []) as any[]
  const cash = salesRows.filter(v => v.type === 'cash_sale').reduce((s, v) => s + (v.total_amount || 0), 0)
  const credit = salesRows.filter(v => v.type === 'sales_invoice').reduce((s, v) => s + (v.total_amount || 0), 0)

  // Inventory counts + category breakdown
  const prods = (prodRes.data || []) as any[]
  const lowStock = prods.filter(p => p.qty_on_hand > 0 && p.qty_on_hand <= (p.reorder_point || 0)).length
  const outOfStock = prods.filter(p => (p.qty_on_hand || 0) <= 0).length
  const catMap: Record<string, { count: number; value: number }> = {}
  prods.forEach(p => {
    const c = p.category || 'Uncategorised'
    if (!catMap[c]) catMap[c] = { count: 0, value: 0 }
    catMap[c].count += 1
  })
  const categoryBreakdown = Object.entries(catMap)
    .map(([category, v]) => ({ category, count: v.count, value: v.value }))
    .sort((a, b) => b.count - a.count).slice(0, 6)

  // HRM
  const emps = (empRes.data || []) as any[]
  const headcount = emps.filter(e => e.is_active !== false).length
  // Distinct employees, in case a day ends up with more than one leave row.
  const onLeave = new Set(((leaveRes.data || []) as any[]).map(r => r.employee_id)).size

  // CRM retail
  const retail = (retailRes.data || []) as any[]
  const newRetailThisMonth = retail.filter(c => c.created_at && c.created_at >= b.monthStart).length

  // CRM B2B
  const b2b = (b2bRes.data || []) as any[]
  const live = b2b.filter(a => !a.is_archived && a.stage !== 'won' && a.stage !== 'lost')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const b2bOverdue = live.filter(a => a.next_action_date && new Date(a.next_action_date) < today).length
  const b2bWonThisMonth = b2b.filter(a => a.won_at && a.won_at >= b.monthStart).length

  // Stock alerts (lowest first)
  const stockAlerts = [...prods]
    .filter(p => p.qty_on_hand <= (p.reorder_point || 0))
    .sort((a, b) => (a.qty_on_hand || 0) - (b.qty_on_hand || 0))
    .slice(0, 5)
    .map(p => ({ name: p.name || p.category || 'Product', qty_on_hand: p.qty_on_hand || 0, reorder_point: p.reorder_point || 0 }))

  return {
    sales: { count: salesRows.length, total: cash + credit, cash, credit },
    inventory: { products: prods.length, lowStock, outOfStock },
    hrm: { headcount, onLeave },
    crm: {
      retailCustomers: retail.length,
      newRetailThisMonth,
      b2bProspects: live.length,
      b2bOverdue,
      b2bWonThisMonth,
    },
    approvalsPending: apprRes.count || 0,
    recentVouchers: (recentRes.data || []) as any[],
    stockAlerts,
    categoryBreakdown,
  }
}

// ── Sensitive tier (only when permitted) ─────────────────────────────────────
async function loadFinancial(b: ReturnType<typeof monthBounds>): Promise<FinancialData> {
  const [curRes, prevRes, acctRes, arRes, supRes] = await Promise.all([
    // Server-side P&L aggregation (migration 033). Aggregating in the DB avoids
    // the silent 1000-row cap that zeroed the dashboard as July grew, treats
    // NULL journal status as posted (matching every other report), and
    // classifies by code prefix so COGS is not misfiled as opex.
    supabase.rpc('dashboard_pnl', { p_from: b.monthStart, p_to: b.today }),
    supabase.rpc('dashboard_pnl', { p_from: b.prevStart, p_to: b.prevEnd }),
    supabase.from('accounts').select('code, name, category, balance'),
    supabase.from('customer_ledger_entries').select('customer_id, remaining_amount, posting_date').eq('is_open', true),
    supabase.from('suppliers').select('balance_tzs'),
  ])

  // ---- Month P&L from the RPC ----
  type PnlRow = { bucket: string; code: string; name: string; amount: number }
  const cur = ((curRes.data || []) as PnlRow[])
  const prev = ((prevRes.data || []) as PnlRow[])
  if (curRes.error) throw new Error('P&L query failed: ' + curRes.error.message)
  const sumB = (rows: PnlRow[], bucket: string) =>
    rows.filter(r => r.bucket === bucket).reduce((s, r) => s + Number(r.amount), 0)

  const revCur = sumB(cur, 'revenue'), revPrev = sumB(prev, 'revenue')
  const cogsCur = sumB(cur, 'cogs'),   cogsPrev = sumB(prev, 'cogs')
  const expCur = sumB(cur, 'opex'),    expPrev = sumB(prev, 'opex')
  const payrollCost = cur.filter(r => r.code.startsWith('60')).reduce((s, r) => s + Number(r.amount), 0)

  const gpCur = revCur - cogsCur, gpPrev = revPrev - cogsPrev
  const netCur = gpCur - expCur, netPrev = gpPrev - expPrev

  const breakdownOf = (bucket: string) =>
    cur.filter(r => r.bucket === bucket)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .map(r => ({ code: r.code, name: r.name, value: Number(r.amount) }))
  const pnlBreakdown = {
    revenue: breakdownOf('revenue'),
    cogs: breakdownOf('cogs'),
    expenses: breakdownOf('opex'),
  }

  // ---- Snapshot balances ----
  const accts = (acctRes.data || []) as { code: string; name: string; category: string; balance: number }[]
  const bal = (code: string) => accts.find(a => a.code === code)?.balance || 0
  const cashPosition = accts.filter(a => a.category === 'Cash & Bank').reduce((s, a) => s + (a.balance || 0), 0)
  const inventoryValue = bal('1110')
  const loans = accts.filter(a => a.category === 'Loans').reduce((s, a) => s + Math.abs(a.balance || 0), 0)

  // ---- AR aging + top debtors ----
  const arRows = (arRes.data || []) as any[]
  const now = Date.now()
  const aging = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
  const byCustomer: Record<string, number> = {}
  arRows.forEach(e => {
    const amt = e.remaining_amount || 0
    const age = e.posting_date ? Math.floor((now - new Date(e.posting_date).getTime()) / 86400000) : 0
    if (age <= 30) aging.current += amt
    else if (age <= 60) aging.d31_60 += amt
    else if (age <= 90) aging.d61_90 += amt
    else aging.d90plus += amt
    if (e.customer_id) byCustomer[e.customer_id] = (byCustomer[e.customer_id] || 0) + amt
  })
  const arTotal = aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus
  const topIds = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 5)
  let top: { name: string; amount: number }[] = []
  if (topIds.length) {
    const { data: custs } = await supabase.from('customers')
      .select('id, name, company').in('id', topIds.map(t => t[0]))
    const nameOf = (id: string) => {
      const c = (custs || []).find((x: any) => x.id === id)
      return c ? (c.company || c.name || 'Customer') : 'Customer'
    }
    top = topIds.map(([id, amount]) => ({ name: nameOf(id), amount }))
  }

  const suppliersTotal = ((supRes.data || []) as any[]).reduce((s, x) => s + (x.balance_tzs || 0), 0)

  return {
    revenue: delta(revCur, revPrev),
    grossProfit: delta(gpCur, gpPrev),
    marginPct: revCur > 0 ? (gpCur / revCur) * 100 : 0,
    expenses: delta(expCur, expPrev),
    netProfit: delta(netCur, netPrev),
    pnlBreakdown,
    cashPosition,
    inventoryValue,
    payrollCost,
    ar: { total: arTotal, customerCount: Object.keys(byCustomer).length, aging, top },
    ap: { suppliers: suppliersTotal, loans },
  }
}
