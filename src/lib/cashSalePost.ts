/**
 * CashSale posting logic
 * Extracted from CashSale.tsx — contains post() and updateVoucher()
 * These are pure async functions that receive all data as arguments
 */

import { supabase } from './supabase'
import { nextRef } from './refs'
import { today } from './utils'
import { PAYMENT_METHODS } from './cashSaleTypes'
import type { DBProduct, SaleLine, SplitLine, PaymentMethod } from './cashSaleTypes'
import { logBundleSale } from './useBundles'
import type { Bundle } from './useBundles'

export interface PostParams {
  // Form state
  newCustName: string
  waInput: string
  lines: SaleLine[]
  dbProducts: DBProduct[]
  selectedCust: { id: string; crown_points: number; balance: number; whatsapp: string; pregnancy_stage: string; name: string } | null
  // Payment
  isPOD: boolean
  autoReceipt: boolean
  selectedMethod: string
  isSplit: boolean
  splitLines: SplitLine[]
  paymentRef: string
  accountMap: Record<string, string>
  // Delivery
  townDelivery: string
  upcountryShipping: string
  deliveryAccountId: string
  // Location
  locationCode: string
  locations: { id: string; code: string; name: string }[]
  // Settings
  invSettings: any
  // Auth
  userName: string
  // Bundle
  appliedBundle: Bundle | null
  // Computed
  subtotal: number
  total: number
  crownPoints: number
  deliveryTotal: number
  totalSplitPaid: number
}

export interface PostResult {
  success: boolean
  ref?: string
  error?: string
  receiptData?: any
  isPOD?: boolean
}

export async function postCashSale(params: PostParams): Promise<PostResult> {
  const {
    newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, autoReceipt, selectedMethod, isSplit, splitLines, paymentRef, accountMap,
    deliveryAccountId,
    locationCode, locations, invSettings, userName, appliedBundle,
    subtotal, total, crownPoints, deliveryTotal, totalSplitPaid,
  } = params

  const currentMethod = PAYMENT_METHODS.find(m => m.id === selectedMethod)!

  // Validations
  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product' }

  if (invSettings?.block_negative_stock) {
    for (const line of lines) {
      if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && prod.qty_on_hand < line.qty) return { success: false, error: `Insufficient stock for ${prod.name}. Available: ${prod.qty_on_hand} units` }
    }
  }
  if (invSettings?.block_sell_below_cost) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && line.price < prod.cost_price) return { success: false, error: `Selling ${prod.name} below cost price. Adjust price or change settings.` }
    }
  }
  if (invSettings?.warn_below_min_margin) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && prod.selling_price > 0) {
        const margin = ((line.price - prod.cost_price) / line.price) * 100
        if (margin < (invSettings.global_min_margin || 0)) return { success: false, error: `Warning: ${prod.name} margin is ${Math.round(margin)}% — below minimum ${invSettings.global_min_margin}%` }
      }
    }
  }
  if (!isPOD && !isSplit && currentMethod.showRef && !paymentRef.trim()) {
    return { success: false, error: `Please enter the ${currentMethod.label} transaction reference number` }
  }

  const ref = await nextRef('cash_sale')
  const postingDate = today()

  try {
    // Upsert customer
    const cleaned = waInput.replace(/[\s+\-()]/g, '')
    let customerId = selectedCust?.id || null

    let customerCode: string | undefined
    if (!selectedCust?.id) {
      const { data: maxCode } = await supabase
        .from('customers').select('code').like('code', 'CONT-%')
        .order('code', { ascending: false }).limit(1)
      const lastNum = maxCode?.[0]?.code ? parseInt(maxCode[0].code.replace('CONT-', '')) || 10000 : 10000
      customerCode = `CONT-${lastNum + 1}`
    }

    const { data: custData } = await supabase.from('customers').upsert({
      ...(customerCode ? { code: customerCode } : {}),
      name: newCustName.trim(), whatsapp: cleaned || null, customer_type: 'cash',
      segment: 'retail',
      crown_points: (selectedCust?.crown_points || 0) + crownPoints,
      last_purchase_date: postingDate,
      last_purchase_amount: subtotal,
      balance: isPOD ? (selectedCust?.balance || 0) + total : (selectedCust?.balance || 0),
    }, { onConflict: 'whatsapp' }).select('id').single()
    if (custData) customerId = custData.id

    // Get accounts
    const neededCodes = ['4010', '5010', '1110', '1050', '2085']
    const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
    const acct = (code: string) => acctData?.find(a => a.code === code)?.id
    const revenueId = acct('4010'); const cogsId = acct('5010')
    const inventoryId = acct('1110')
    const arId = acct('1050'); const delivFloatId = acct('2085') || deliveryAccountId
    if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found')

    // Build payment label
    const paymentLabel = isSplit
      ? splitLines.map(l => PAYMENT_METHODS.find(m => m.id === l.methodId)?.label || l.methodId).join(' + ') + ' + ' + currentMethod.label
      : currentMethod.label

    // Create journal
    const { data: journal, error: jErr } = await supabase.from('journals').insert({
      ref: 'JV-' + ref, posting_date: postingDate,
      description: `Cash Sale — ${newCustName} — ${ref}`,
      journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref,
      posted_by: userName, status: 'posted',
    }).select('id').single()
    if (jErr) throw new Error('Journal: ' + jErr.message)

    const cogsTotal = lines.reduce((s, l) => {
      const p = dbProducts.find(p => p.id === l.productId)
      return s + (p ? p.cost_price * l.qty : 0)
    }, 0)

    // Build journal lines
    const jLines: any[] = []
    let ln = 1

    if (!isPOD && autoReceipt) {
      const primaryAcctId = accountMap[currentMethod.accountCode]
      if (!primaryAcctId) throw new Error(`Payment account not found for ${currentMethod.label} (code: ${currentMethod.accountCode}). Check Chart of Accounts.`)
      const primaryAmount = isSplit ? total - totalSplitPaid : total
      jLines.push({
        journal_id: journal.id, line_number: ln++,
        account_id: primaryAcctId,
        description: `${currentMethod.label}${paymentRef ? ' · ' + paymentRef : ''} — ${newCustName}`,
        debit: primaryAmount > 0 ? primaryAmount : total, credit: 0
      })
      for (const sl of splitLines) {
        if (!sl.accountId || !sl.amount) continue
        const m = PAYMENT_METHODS.find(pm => pm.id === sl.methodId)
        jLines.push({
          journal_id: journal.id, line_number: ln++,
          account_id: sl.accountId,
          description: `${m?.label || sl.methodId}${sl.ref ? ' · ' + sl.ref : ''} — ${newCustName}`,
          debit: sl.amount, credit: 0
        })
      }
      if (deliveryTotal > 0 && delivFloatId) {
        const delivAcctId = accountMap[currentMethod.accountCode]
        if (delivAcctId) jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivAcctId, description: `Delivery collected — ${ref}`, debit: deliveryTotal, credit: 0 })
      }
    } else if (isPOD && arId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: arId, description: `POD — ${newCustName} — ${ref}`, debit: total, credit: 0 })
    }

    // Revenue, COGS, Inventory
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: subtotal })
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
    if (deliveryTotal > 0 && delivFloatId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
    }

    const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
    if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

    await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

    // Build payment split breakdown (actual amounts per method)
    const paymentSplitData: Record<string, number> = {}
    if (isSplit) {
      // Primary method gets the remainder
      const primaryAmount = total - totalSplitPaid
      if (primaryAmount > 0) paymentSplitData[currentMethod.label] = primaryAmount
      // Each split line
      for (const sl of splitLines) {
        if (!sl.amount) continue
        const m = PAYMENT_METHODS.find(pm => pm.id === sl.methodId)
        const label = m?.label || sl.methodId
        paymentSplitData[label] = (paymentSplitData[label] || 0) + sl.amount
      }
    } else {
      paymentSplitData[currentMethod.label] = total
    }

    // Create voucher
    const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
      ref, type: 'cash_sale', posting_date: postingDate,
      description: `Cash Sale — ${newCustName}`,
      subtotal, total_amount: total,
      status: isPOD ? 'draft' : 'posted', branch: 'DSM HQ',
      customer_id: customerId, journal_id: journal.id,
      payment_method: paymentLabel,
      payment_split: paymentSplitData,
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : ''
      ].filter(Boolean).join(' · ') || null,
      posted_by: userName,
    }).select('id').single()
    if (vErr) throw new Error('Voucher: ' + vErr.message)

    // Voucher lines + stock
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId); if (!prod) continue
      await supabase.from('voucher_lines').insert({ voucher_id: voucher.id, line_number: i + 1, product_id: line.productId, description: line.name, qty: line.qty, unit_cost: prod.cost_price, unit_price: line.price, subtotal: line.amount, total: line.amount })
      await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
      await supabase.from('item_ledger_entries').insert({ product_id: line.productId, entry_type: 'sale', document_type: 'cash_sale', document_ref: ref, posting_date: postingDate, qty: -line.qty, cost_amount: prod.cost_price * line.qty, location_code: locationCode })
      const locObj = locations.find(l => l.code === locationCode)
      if (locObj) {
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: locObj.id, location_code: locationCode, qty_on_hand: Math.max(0, (prod.qty_on_hand || 0) - line.qty), last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
      }
    }

    if (isPOD && customerId && arId) {
      await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
    }

    // AUTO-CREATE BANK RECEIPT VOUCHER for non-cash payments
    if (!isPOD && autoReceipt && currentMethod.id !== 'cash') {
      try {
        const receiptRef = await nextRef('cash_receipt')
        let bankAccountId = accountMap[currentMethod.accountCode]
        if (!bankAccountId) {
          const { data: bankAcct } = await supabase.from('accounts').select('id').eq('code', currentMethod.accountCode).single()
          bankAccountId = bankAcct?.id
        }
        if (bankAccountId) {
          const { data: receiptJournal, error: rjErr } = await supabase.from('journals').insert({
            ref: 'JV-' + receiptRef, posting_date: postingDate,
            description: `Auto Bank Receipt — ${currentMethod.label} — ${ref}`,
            journal_type: 'cash_receipt', source_type: 'cash_sale', source_ref: ref,
            posted_by: userName, status: 'posted',
          }).select('id').single()

          if (rjErr) {
            console.error('Receipt journal error:', rjErr)
          } else if (receiptJournal) {
            const receiptJLines: any[] = []
            const lineAmount = isSplit ? total - totalSplitPaid : total
            receiptJLines.push({ journal_id: receiptJournal.id, line_number: 1, account_id: bankAccountId, description: `${currentMethod.label}${paymentRef ? ' · ' + paymentRef : ''} — From ${ref}`, debit: lineAmount, credit: 0 })
            const primaryAcctId = accountMap[currentMethod.accountCode]
            if (primaryAcctId) {
              receiptJLines.push({ journal_id: receiptJournal.id, line_number: 2, account_id: primaryAcctId, description: `Deposit received — ${ref}`, debit: 0, credit: lineAmount })
            }
            const { error: rjlErr } = await supabase.from('journal_lines').insert(receiptJLines)
            if (!rjlErr) {
              await Promise.all(receiptJLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))
              await supabase.from('vouchers').insert({
                ref: receiptRef, type: 'cash_receipt', posting_date: postingDate,
                description: `Auto Receipt — ${currentMethod.label} — ${ref}`,
                subtotal: lineAmount, total_amount: lineAmount,
                status: 'posted', branch: 'DSM HQ',
                customer_id: customerId || null, journal_id: receiptJournal.id,
                payment_method: currentMethod.label,
                notes: `Auto-created from ${ref}${paymentRef ? ' · Ref: ' + paymentRef : ''}`,
                posted_by: userName,
              })
            }
          }
        }
      } catch (err: any) {
        console.error('Auto-receipt creation failed:', err)
      }
    }

    // Log bundle sale for analytics
    if (appliedBundle && voucher) {
      logBundleSale({
        bundleId: appliedBundle.id, voucherId: voucher.id, voucherRef: ref,
        customerId, customerName: newCustName,
        bundlePrice: appliedBundle.bundle_price, individualTotal: appliedBundle.individual_total,
        soldBy: userName, postingDate,
      }).catch(err => console.error('Bundle sale log failed:', err))
    }

    // Build receipt data
    if (!isPOD) {
      const receiptData = {
        ref, posting_date: postingDate,
        description: `Cash Sale — ${newCustName}`,
        total_amount: total, subtotal,
        payment_method: currentMethod.label, notes: '', posted_by: userName,
        customers: selectedCust ? { name: selectedCust.name, whatsapp: selectedCust.whatsapp, pregnancy_stage: selectedCust.pregnancy_stage, crown_points: (selectedCust.crown_points || 0) + crownPoints } : { name: newCustName, whatsapp: waInput, pregnancy_stage: '', crown_points: crownPoints },
        voucher_lines: lines.filter(l => l.productId).map(l => {
          const prod = dbProducts.find(p => p.id === l.productId)
          return { qty: l.qty, unit_price: l.price, total: l.amount, products: prod ? { name: prod.name, sku: prod.sku, category: '' } : null }
        }),
      }
      return { success: true, ref, receiptData, isPOD: false }
    }

    return { success: true, ref, isPOD: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Something went wrong' }
  }
}

export interface UpdateParams {
  editVoucherData: any
  newCustName: string
  waInput: string
  lines: SaleLine[]
  dbProducts: DBProduct[]
  selectedCust: { id: string } | null
  isPOD: boolean
  selectedMethod: string
  isSplit: boolean
  splitLines: SplitLine[]
  paymentRef: string
  townDelivery: string
  upcountryShipping: string
  currentMethod: PaymentMethod
}

export async function updateCashSale(params: UpdateParams): Promise<{ success: boolean; error?: string }> {
  const {
    editVoucherData, newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, isSplit, splitLines, paymentRef, townDelivery, upcountryShipping, currentMethod,
  } = params

  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product' }

  try {
    const lineItems = lines.filter(l => l.productId && l.amount > 0)
    const newSubtotal = lineItems.reduce((sum, l) => sum + l.amount, 0)
    const deliveryTotal = (parseInt(townDelivery) || 0) + (parseInt(upcountryShipping) || 0)
    const newTotal = newSubtotal + deliveryTotal

    const paymentLabel = isSplit
      ? splitLines.map(l => PAYMENT_METHODS.find(m => m.id === l.methodId)?.label || l.methodId).join(' + ') + ' + ' + currentMethod.label
      : currentMethod.label

    const cleaned = waInput.replace(/[\s+\-()]/g, '')
    if (selectedCust) {
      await supabase.from('customers').update({ name: newCustName.trim(), whatsapp: cleaned || null }).eq('id', selectedCust.id)
    }

    const { error: vErr } = await supabase.from('vouchers').update({
      subtotal: newSubtotal, total_amount: newTotal, payment_method: paymentLabel,
      status: isPOD ? 'draft' : 'posted',
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : ''
      ].filter(Boolean).join(' · ') || null,
    }).eq('id', editVoucherData.id)
    if (vErr) throw new Error('Voucher update: ' + vErr.message)

    const oldLines = editVoucherData.voucher_lines || []
    for (const oldLine of oldLines) {
      if (!oldLine.product_id) continue
      const prod = dbProducts.find(p => p.id === oldLine.product_id)
      if (prod) {
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand + oldLine.qty }).eq('id', oldLine.product_id)
      }
    }

    await supabase.from('voucher_lines').delete().eq('voucher_id', editVoucherData.id)

    for (let i = 0; i < lineItems.length; i++) {
      const line = lineItems[i]
      const prod = dbProducts.find(p => p.id === line.productId)
      if (!prod) continue
      await supabase.from('voucher_lines').insert({
        voucher_id: editVoucherData.id, line_number: i + 1, product_id: line.productId,
        description: line.name, qty: line.qty, unit_cost: prod.cost_price,
        unit_price: line.price, subtotal: line.amount, total: line.amount,
      })
      const currentQty = prod.qty_on_hand + (oldLines.find((ol: any) => ol.product_id === line.productId)?.qty || 0)
      await supabase.from('products').update({ qty_on_hand: currentQty - line.qty }).eq('id', line.productId)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Update failed' }
  }
}
