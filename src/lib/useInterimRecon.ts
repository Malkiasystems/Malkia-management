// ════════════════════════════════════════════════════════════════════════════
// useInterimRecon.ts
//
// Reads for the Interim Account (1121) reconciliation report. Read-only: this
// hook never writes. See interimReconTypes.ts for why the report exists.
//
// PAGINATION IS NOT OPTIONAL HERE.
// Supabase silently caps a select at 1,000 rows. On most screens that means a
// short list. On THIS screen it would mean a reconciliation report that is
// confidently wrong — it would under-report the exposure and give the reader
// false comfort, which is worse than showing nothing. Every fetch below walks
// the full range.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import type { ReconBucket, ReconLine, ReconResult, SupplierExposure, GrnRow } from './interimReconTypes'

const INTERIM_CODE = '1121'
const PAGE = 1000
const IN_CHUNK = 100   // keep .in() lists short enough not to blow the URL length

// Which flow wrote this line. journal_type is set at posting time by each
// voucher, so it is the honest discriminator — unlike the item ledger, where
// GRN and Purchase both write entry_type 'purchase' and can't be told apart.
function bucketOf(journalType: string, sourceType: string): ReconBucket {
  if (journalType === 'grn') return 'grn'
  if (journalType === 'purchase_invoice') return 'purchase_invoice'
  if (journalType === 'import_payment') return 'import_payment'
  if (journalType === 'import_receive') return 'import_receive'
  if (journalType === 'inventory_adjustment' && sourceType === 'import_order') return 'import_adjustment'
  return 'other'
}

async function fetchAllLines(accountId: string) {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select('id, journal_id, description, debit, credit')
      .eq('account_id', accountId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error('Journal lines: ' + error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

async function fetchJournalsByIds(ids: string[]) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('journals')
      .select('id, ref, posting_date, journal_type, source_type, source_ref, status')
      .in('id', ids.slice(i, i + IN_CHUNK))
    if (error) throw new Error('Journals: ' + error.message)
    if (data) out.push(...data)
  }
  return out
}

async function fetchAllGrnVouchers() {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('vouchers')
      .select('ref, supplier_id, posting_date, total_amount, posted_by')
      .eq('type', 'grn')
      .order('ref', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error('GRN vouchers: ' + error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export function useInterimRecon() {
  const [data, setData] = useState<ReconResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. The account itself.
      const { data: acct, error: aErr } = await supabase
        .from('accounts')
        .select('id, code, name, balance')
        .eq('code', INTERIM_CODE)
        .maybeSingle()
      if (aErr) throw new Error('Accounts: ' + aErr.message)
      if (!acct) throw new Error(`Account ${INTERIM_CODE} not found in the Chart of Accounts.`)

      // 2. Every line ever posted to it, and the journals that own them.
      const rawLines = await fetchAllLines(acct.id)
      const journalIds = [...new Set(rawLines.map(l => l.journal_id).filter(Boolean))]
      const journals = journalIds.length ? await fetchJournalsByIds(journalIds) : []
      const jMap: Record<string, any> = {}
      journals.forEach(j => { jMap[j.id] = j })

      // 3. GRN vouchers carry the supplier. The journal only carries source_ref
      //    (the GRN ref), so this is the only way to attribute the exposure.
      const grnVouchers = await fetchAllGrnVouchers()
      const { data: sups, error: sErr } = await supabase.from('suppliers').select('id, name')
      if (sErr) throw new Error('Suppliers: ' + sErr.message)
      const supMap: Record<string, string> = {}
      ;(sups || []).forEach((s: any) => { supMap[s.id] = s.name })
      const grnByRef: Record<string, any> = {}
      grnVouchers.forEach(v => { grnByRef[v.ref] = v })

      // 4. Shape the lines. Unposted journals are excluded from the totals: a
      //    draft or rejected journal has no business in a reconciliation.
      const lines: ReconLine[] = rawLines
        .map(l => {
          const j = jMap[l.journal_id]
          if (!j || j.status !== 'posted') return null
          return {
            id: l.id,
            journalId: l.journal_id,
            journalRef: j.ref || '',
            postingDate: j.posting_date,
            sourceRef: j.source_ref || j.ref || '',
            journalType: j.journal_type || '',
            bucket: bucketOf(j.journal_type || '', j.source_type || ''),
            description: l.description || '',
            debit: l.debit || 0,
            credit: l.credit || 0,
          } as ReconLine
        })
        .filter((l): l is ReconLine => l !== null)
        .sort((a, b) => a.postingDate.localeCompare(b.postingDate))

      // 5. Totals per bucket.
      const sum = (b: ReconBucket, f: 'debit' | 'credit') =>
        lines.filter(l => l.bucket === b).reduce((s, l) => s + l[f], 0)

      const grnCredit = sum('grn', 'credit')
      const purchaseInvoiceDebit = sum('purchase_invoice', 'debit')
      const importDebit = sum('import_payment', 'debit')
      const importCredit = sum('import_receive', 'credit') + sum('import_adjustment', 'credit')
      const otherDebit = sum('other', 'debit')
      const otherCredit = sum('other', 'credit')

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      const ledgerBalance = totalDebit - totalCredit

      // 6. GRN exposure by supplier. Purchase Invoices are NOT netted off per
      //    supplier here, and that is deliberate: PurchaseInvoice.tsx stores its
      //    "Related GRN Ref" as free text in the journal description and never
      //    writes a structured link, so there is no reliable way to say which
      //    GRN a given Purchase Invoice cleared. Per-supplier figures are
      //    therefore GROSS GRN credit. The net is shown at the top only.
      const bySupMap: Record<string, SupplierExposure> = {}
      const grnRows: GrnRow[] = []
      for (const l of lines) {
        if (l.bucket !== 'grn' || l.credit <= 0) continue
        const v = grnByRef[l.sourceRef]
        const sid = v?.supplier_id || null
        const sname = sid ? (supMap[sid] || 'Unknown supplier') : 'Unattributed'
        const key = sid || '__none__'
        if (!bySupMap[key]) bySupMap[key] = { supplierId: sid, supplierName: sname, grnCount: 0, amount: 0 }
        bySupMap[key].grnCount += 1
        bySupMap[key].amount += l.credit
        grnRows.push({
          ref: l.sourceRef,
          postingDate: l.postingDate,
          supplierName: sname,
          amount: l.credit,
          postedBy: v?.posted_by || '',
        })
      }

      setData({
        accountId: acct.id,
        accountCode: acct.code,
        accountName: acct.name,
        cachedBalance: acct.balance || 0,
        ledgerBalance,
        drift: (acct.balance || 0) - ledgerBalance,
        totalDebit,
        totalCredit,
        lineCount: lines.length,
        grnCredit,
        purchaseInvoiceDebit,
        grnExposure: grnCredit - purchaseInvoiceDebit,
        importDebit,
        importCredit,
        importExposure: importDebit - importCredit,
        otherDebit,
        otherCredit,
        otherNet: otherDebit - otherCredit,
        bySupplier: Object.values(bySupMap).sort((a, b) => b.amount - a.amount),
        grnRows: grnRows.sort((a, b) => b.postingDate.localeCompare(a.postingDate)),
        lines,
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to load the interim reconciliation')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}
