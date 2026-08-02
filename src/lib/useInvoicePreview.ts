// ─── useInvoicePreview ─────────────────────────────────────────────────────
// Loads a full sales invoice (voucher + lines + products + customer) so it
// can be rendered by <MalkiaInvoice />.
//
// Extracted from SalesInvoicesList.openPreview() so the customer ledger can
// reuse exactly the same load path. One loader, one set of bugs.
//
// Lookup by REF, not by id: customer_ledger_entries stores document_ref
// ('SI-10-0130'), never a voucher UUID. Verified 1:1 against vouchers.ref.
//
// Schema notes (verified, not inferred):
//   vouchers.type          — NOT voucher_type
//   vouchers.ref           — text, resolves 1:1 from ledger document_ref
//   ledger document_type   'invoice' → vouchers.type 'sales_invoice'
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { localIso } from './utils'
import { supabase } from './supabase'

export const FALLBACK_INVOICE_SETTINGS = {
  company_name: 'Malkia Wellness Group Ltd', tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
  phone: '+255 700 000 000', email: 'hello@malkia.co.tz', website: 'www.malkia.co.tz',
  tin: '—', vrn: '—', primary_color: '#85c2be',
  bank_name: 'NMB Bank', bank_account_name: 'Malkia Wellness Group Ltd',
  bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
  show_bank_details: true, show_salesperson: true, show_vat_breakdown: true,
  show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
  footer_note: 'Thank you for your business. Payment is due by the date shown above.',
  payment_note: 'Please quote the invoice number as payment reference.',
}

export function useInvoicePreview() {
  const [voucher, setVoucher] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Template settings load once per mount. Failure is non-fatal — the
  // fallback above keeps the invoice renderable.
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
      .then(({ data }) => { if (data?.value) { try { setSettings(JSON.parse(data.value)) } catch { /* keep fallback */ } } })
  }, [])

  const close = useCallback(() => { setVoucher(null); setError('') }, [])

  const openByRef = useCallback(async (ref: string) => {
    setLoading(true); setError('')

    const { data: v, error: vErr } = await supabase
      .from('vouchers')
      .select(`
        *,
        customers (id, name, company, contact_person, whatsapp, address, balance, credit_limit, credit_period, payment_terms, customer_number),
        voucher_lines (id, product_id, qty, unit_price, unit_cost, total, products (id, sku, name, category))
      `)
      .eq('ref', ref)
      .maybeSingle()

    if (vErr || !v) {
      setError(vErr?.message || `Invoice ${ref} could not be found.`)
      setLoading(false)
      return
    }

    // What is still owed on THIS invoice specifically — not the customer's
    // whole balance. Read live rather than trusting the amount at posting.
    const { data: led } = await supabase
      .from('customer_ledger_entries')
      .select('remaining_amount, is_open')
      .eq('document_ref', ref)
      .eq('document_type', 'invoice')
      .maybeSingle()

    const remaining = led?.remaining_amount ?? v.total_amount

    setVoucher({
      ...v,
      _viewMode: true,
      _invoiceRemaining: remaining,
      _invoicePaid: (v.total_amount || 0) - remaining,
      _statementDate: localIso(new Date()),
    })
    setLoading(false)
  }, [])

  return {
    voucher,
    settings: settings || FALLBACK_INVOICE_SETTINGS,
    loading,
    error,
    openByRef,
    close,
  }
}
