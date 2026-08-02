// src/hooks/useCashCenter.ts
// Data layer for the Cash Command Center (Scaling Up cash tools).
// Four tools, one hook: Daily Position, 13-Week Forecast, Cash Conversion
// Cycle, Power of One. All reads, no writes. Handles the 1000-row cap with
// .range() where result sets can be large.

import { useCallback, useEffect, useState } from 'react'
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'

// ---------- types ----------
export interface CashAccountPos {
  id: string; code: string; name: string; balance: number
}
export interface DailyPosition {
  totalNow: number
  accounts: CashAccountPos[]
  byDay: { date: string; net: number; runningTotal: number }[] // last 30 days
  biggestInWeek: { desc: string; amount: number; date: string } | null
  biggestOutWeek: { desc: string; amount: number; date: string } | null
}
export interface ForecastWeek {
  weekStart: string; weekEnd: string
  inflow: number; outflow: number; net: number; endingCash: number
  detail: { label: string; amount: number; kind: 'in' | 'out' }[]
}
export interface CycleMetrics {
  stockDays: number | null
  debtorDays: number | null
  creditorDays: number | null
  cycleDays: number | null
  stockValue: number
  arBalance: number
  apBalance: number
  dailyCOGS: number | null
  dailyCreditSales: number | null
  slowMovers: { name: string; qty: number; value: number; daysOfStock: number | null }[]
}
export interface PowerOfOne {
  monthlyRevenue: number
  monthlyCOGS: number
  monthlyOverheads: number
  price1pct: number
  volume1pct: number
  cogs1pct: number
  overheads1pct: number
  debtorDay1: number
  stockDay1: number
  creditorDay1: number
}

const CASHBANK = 'Cash & Bank'

// paginated fetch to beat the 1000-row cap
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < page) break
  }
  return out
}

export function useCashCenter() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [daily, setDaily] = useState<DailyPosition | null>(null)
  const [forecast, setForecast] = useState<ForecastWeek[]>([])
  const [cycle, setCycle] = useState<CycleMetrics | null>(null)
  const [power, setPower] = useState<PowerOfOne | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // ---------- shared: cash & bank accounts ----------
      const { data: cashAccts, error: e1 } = await supabase
        .from('accounts').select('id, code, name, balance')
        .eq('category', CASHBANK).eq('account_type', 'posting').eq('is_active', true)
        .order('code')
      if (e1) throw new Error(e1.message)
      const cashIds = (cashAccts ?? []).map(a => a.id)
      const totalNow = (cashAccts ?? []).reduce((s, a) => s + Number(a.balance), 0)

      // ---------- 1. DAILY POSITION: last 30 days of movements through cash ----------
      const since30 = new Date(); since30.setDate(since30.getDate() - 30)
      const since30s = localIso(since30)
      type Mv = { posting_date: string; debit: number; credit: number; description: string | null }
      const moves = await fetchAll<Mv>((from, to) =>
        supabase.from('journal_lines')
          .select('debit, credit, description, journals!inner(posting_date, status)')
          .in('account_id', cashIds)
          .gte('journals.posting_date', since30s)
          .neq('journals.status', 'void')
          .range(from, to)
          .then((r: any) => ({
            data: r.data?.map((x: any) => ({
              posting_date: x.journals.posting_date,
              debit: Number(x.debit), credit: Number(x.credit),
              description: x.description,
            })),
            error: r.error,
          }))
      )

      const byDayMap = new Map<string, number>()
      for (const m of moves) {
        byDayMap.set(m.posting_date, (byDayMap.get(m.posting_date) ?? 0) + (m.debit - m.credit))
      }
      const days = [...byDayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      // reconstruct running total backwards from totalNow
      let run = totalNow
      const byDayRev: { date: string; net: number; runningTotal: number }[] = []
      for (let i = days.length - 1; i >= 0; i--) {
        byDayRev.push({ date: days[i][0], net: days[i][1], runningTotal: run })
        run -= days[i][1]
      }
      const byDay = byDayRev.reverse()

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      const weekAgoS = localIso(weekAgo)
      const weekMoves = moves.filter(m => m.posting_date >= weekAgoS)
      const biggestIn = weekMoves.filter(m => m.debit > 0).sort((a, b) => b.debit - a.debit)[0] ?? null
      const biggestOut = weekMoves.filter(m => m.credit > 0).sort((a, b) => b.credit - a.credit)[0] ?? null

      setDaily({
        totalNow,
        accounts: (cashAccts ?? []).map(a => ({ id: a.id, code: a.code, name: a.name, balance: Number(a.balance) })),
        byDay,
        biggestInWeek: biggestIn ? { desc: biggestIn.description ?? 'Receipt', amount: biggestIn.debit, date: biggestIn.posting_date } : null,
        biggestOutWeek: biggestOut ? { desc: biggestOut.description ?? 'Payment', amount: biggestOut.credit, date: biggestOut.posting_date } : null,
      })

      // ---------- shared: sales velocity (last 8 weeks of cash inflows from sales) ----------
      const since56 = new Date(); since56.setDate(since56.getDate() - 56)
      const since56s = localIso(since56)
      const { data: salesV, error: e2 } = await supabase
        .from('vouchers').select('posting_date, total_amount, type')
        .in('type', ['cash_sale', 'sales_invoice'])
        .gte('posting_date', since56s).eq('status', 'posted')
        .limit(5000)
      if (e2) throw new Error(e2.message)
      const totalSales8w = (salesV ?? []).reduce((s, v) => s + Number(v.total_amount), 0)
      const weeklySalesRate = totalSales8w / 8
      const creditSales8w = (salesV ?? []).filter(v => v.type === 'sales_invoice')
        .reduce((s, v) => s + Number(v.total_amount), 0)
      const dailyCreditSales = creditSales8w / 56 || null

      // ---------- 2. 13-WEEK FORECAST ----------
      // inflows: weekly sales run-rate + AR due within horizon (customers w/ terms)
      // outflows: recurring_expenses schedule + loans (no schedule -> shown as note) 
      const { data: recur, error: e3 } = await supabase
        .from('recurring_expenses')
        .select('name, amount, frequency, next_due_date, day_of_month, is_active')
        .eq('is_active', true)
      if (e3) throw new Error(e3.message)

      // AR expected receipts: balance spread over debtor terms (simple model)
      const { data: arAcct } = await supabase
        .from('accounts').select('balance').eq('code', '1050').single()
      const arBalance = Number(arAcct?.balance ?? 0)

      const weeks: ForecastWeek[] = []
      let endingCash = totalNow
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)) // this week's Monday
      for (let w = 0; w < 13; w++) {
        const ws = new Date(monday); ws.setDate(ws.getDate() + w * 7)
        const we = new Date(ws); we.setDate(we.getDate() + 6)
        const wsS = localIso(ws)
        const weS = localIso(we)
        const detail: ForecastWeek['detail'] = []

        // inflow: sales run-rate
        let inflow = weeklySalesRate
        detail.push({ label: 'Sales (8-week run-rate)', amount: weeklySalesRate, kind: 'in' })
        // AR collection: assume collected evenly over first 4 weeks
        if (w < 4 && arBalance > 0) {
          const arSlice = arBalance / 4
          inflow += arSlice
          detail.push({ label: 'AR collections (est.)', amount: arSlice, kind: 'in' })
        }

        // outflow: recurring expenses due in this week
        let outflow = 0
        for (const r of recur ?? []) {
          const due = r.next_due_date ? new Date(r.next_due_date) : null
          if (!due) continue
          const freqWeeks = r.frequency === 'weekly' ? 1 : r.frequency === 'monthly' ? 4.33 : r.frequency === 'quarterly' ? 13 : 4.33
          // does an occurrence fall in this week?
          let occ = new Date(due)
          while (occ < ws) occ = new Date(occ.getTime() + freqWeeks * 7 * 86400000)
          if (occ >= ws && occ <= we) {
            outflow += Number(r.amount)
            detail.push({ label: r.name, amount: Number(r.amount), kind: 'out' })
          }
        }

        const net = inflow - outflow
        endingCash += net
        weeks.push({ weekStart: wsS, weekEnd: weS, inflow, outflow, net, endingCash, detail })
      }
      setForecast(weeks)

      // ---------- 3. CASH CONVERSION CYCLE ----------
      // stock: qty_on_hand * cost_price per product
      const { data: prods, error: e4 } = await supabase
        .from('products').select('name, qty_on_hand, cost_price, is_active')
        .eq('is_active', true).limit(2000)
      if (e4) throw new Error(e4.message)
      const stockValue = (prods ?? []).reduce((s, p) => s + Number(p.qty_on_hand ?? 0) * Number(p.cost_price ?? 0), 0)

      // COGS rate: last 8 weeks COGS from ledger (5xxx accounts)
      const { data: cogsRows } = await supabase
        .from('journal_lines')
        .select('debit, credit, accounts!inner(code), journals!inner(posting_date, status)')
        .gte('journals.posting_date', since56s)
        .neq('journals.status', 'void')
        .like('accounts.code', '5%')
        .limit(5000)
      const cogs8w = (cogsRows ?? []).reduce((s: number, r: any) => s + Number(r.debit) - Number(r.credit), 0)
      const dailyCOGS = cogs8w > 0 ? cogs8w / 56 : null

      const { data: apAcct } = await supabase
        .from('accounts').select('balance').eq('code', '2010').single()
      const apBalance = -Number(apAcct?.balance ?? 0) // liability negative -> positive owed

      const stockDays = dailyCOGS ? stockValue / dailyCOGS : null
      const debtorDays = dailyCreditSales ? arBalance / dailyCreditSales : null
      const creditorDays = dailyCOGS && apBalance > 0 ? apBalance / dailyCOGS : (apBalance === 0 ? 0 : null)
      const cycleDays = stockDays !== null && debtorDays !== null && creditorDays !== null
        ? stockDays + debtorDays - creditorDays : null

      const slowMovers = (prods ?? [])
        .map(p => {
          const v = Number(p.qty_on_hand ?? 0) * Number(p.cost_price ?? 0)
          return { name: p.name, qty: Number(p.qty_on_hand ?? 0), value: v, daysOfStock: null as number | null }
        })
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)

      setCycle({ stockDays, debtorDays, creditorDays, cycleDays, stockValue, arBalance, apBalance, dailyCOGS, dailyCreditSales, slowMovers })

      // ---------- 4. POWER OF ONE ----------
      const monthlyRevenue = (totalSales8w / 8) * 4.33
      const monthlyCOGS = dailyCOGS ? dailyCOGS * 30 : 0
      // overheads: 6xxx expenses last 8 weeks
      const { data: ovhRows } = await supabase
        .from('journal_lines')
        .select('debit, credit, accounts!inner(code), journals!inner(posting_date, status)')
        .gte('journals.posting_date', since56s)
        .neq('journals.status', 'void')
        .like('accounts.code', '6%')
        .limit(5000)
      const ovh8w = (ovhRows ?? []).reduce((s: number, r: any) => s + Number(r.debit) - Number(r.credit), 0)
      const monthlyOverheads = (ovh8w / 8) * 4.33

      setPower({
        monthlyRevenue, monthlyCOGS, monthlyOverheads,
        price1pct: monthlyRevenue * 0.01,           // straight to cash/profit
        volume1pct: (monthlyRevenue - monthlyCOGS) * 0.01, // margin on extra volume
        cogs1pct: monthlyCOGS * 0.01,
        overheads1pct: monthlyOverheads * 0.01,
        debtorDay1: dailyCreditSales ?? 0,          // 1 day fewer AR = one day's credit sales freed
        stockDay1: dailyCOGS ?? 0,                  // 1 day less stock = one day's COGS freed
        creditorDay1: dailyCOGS ?? 0,               // 1 day more to pay = one day's COGS financed free
      })
    } catch (e: any) {
      setError(e.message ?? 'Failed to load cash data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { loading, error, daily, forecast, cycle, power, reload: load }
}
