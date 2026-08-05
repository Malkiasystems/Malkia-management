/**
 * CashSale posting logic
 * Extracted from CashSale.tsx — contains post() and updateVoucher()
 * These are pure async functions that receive all data as arguments
 *
 * EDIT BEHAVIOUR (important):
 * Editing a cash sale follows the "reverse + repost" pattern.
 * On every update we:
 *   1. Reverse the old journal lines (subtract their balance impact)
 *   2. Delete the old journal_lines and voucher_lines
 *   3. Restore old stock, then re-deduct based on new lines
 *   4. Update the voucher header — payment_method AND payment_split together
 *   5. Re-post fresh journal_lines and re-roll account balances
 * This keeps the trial balance, payment_split, and the displayed
 * payment_method label permanently in sync — none of them can drift
 * independently when a cashier edits a voucher.
 */

import { supabase } from './supabase'
import { postingError } from './postingError'
import { nextRef, insertJournalWithRetry } from './refs'
import { today } from './utils'
import { postLedgerEntry } from './itemLedger'
import { computeCartVat, loadTaxSettings } from './vatEngine'
import { computeShortages, evaluateStockPolicy, resolveNegativeStockPolicy, shortageLabel } from './stockPolicy'
import { PAYMENT_METHODS } from './cashSaleTypes'
import type { DBProduct, SaleLine, SplitLine, PaymentMethod } from './cashSaleTypes'
import { logBundleSale } from './useBundles'
import type { Bundle } from './useBundles'

// ─── Shared helpers (single source of truth for create + edit) ─────────────

/**
 * Build the payment_method display label.
 *
 * For a single-method sale we use the method's own label ("Cash", "M-Pesa").
 * For a split, we prefix "SPLIT: " and list every unique method that
 * actually received money, joined with " + ". Primary is included only if
 * its residual amount is > 0 — otherwise the customer paid nothing on that
 * method and it shouldn't clutter the label. Duplicates (e.g. two split
 * lines on M-Pesa) collapse to one entry so the label matches the count
 * of columns a cashier or accountant would count.
 *
 * The full per-method amount breakdown lives in payment_split (JSONB);
 * this label is display only, capped by vouchers.payment_method(200).
 */
// Resolve a method's display label: the tenant's live account name (passed in
// via accountNames, keyed by account code) beats the hardcoded preset label.
// Keeps stored payment_method / payment_split labels consistent with what the
// cashier saw on screen after renaming a till in Banks.
export function labelOf(m: PaymentMethod, accountNames?: Record<string, string>): string {
  return accountNames?.[m.accountCode] || m.label
}

export function buildPaymentLabel(
  isSplit: boolean,
  splitLines: SplitLine[],
  currentMethod: PaymentMethod,
  primaryAmount: number,
  accountNames?: Record<string, string>,
  // Tile list used to resolve split methodIds. Defaults to the hardcoded
  // presets so every existing caller/test behaves exactly as before; the
  // Cash Sale page passes its dynamically built list so synthetic
  // acct_<code> tiles resolve to their tenant account names.
  methodList: PaymentMethod[] = PAYMENT_METHODS
): string {
  if (!isSplit) return labelOf(currentMethod, accountNames)
  const methods = new Set<string>()
  for (const sl of splitLines) {
    if (!sl.amount || sl.amount <= 0) continue
    const m = methodList.find(pm => pm.id === sl.methodId)
    methods.add(m ? labelOf(m, accountNames) : sl.methodId)
  }
  if (primaryAmount > 0) methods.add(labelOf(currentMethod, accountNames))
  if (methods.size === 0) return labelOf(currentMethod, accountNames)
  if (methods.size === 1) return Array.from(methods)[0]
  return 'SPLIT: ' + Array.from(methods).join(' + ')
}

/**
 * Build the payment_split JSONB { methodLabel: amount }.
 * Used by both create and edit. Never call inline — always use this
 * so that payment_split and payment_method can never desync.
 */
export function buildPaymentSplit(
  isSplit: boolean,
  total: number,
  totalSplitPaid: number,
  splitLines: SplitLine[],
  currentMethod: PaymentMethod,
  accountNames?: Record<string, string>,
  // See buildPaymentLabel — same default, same reason.
  methodList: PaymentMethod[] = PAYMENT_METHODS
): Record<string, number> {
  const result: Record<string, number> = {}
  if (isSplit) {
    const primaryAmount = total - totalSplitPaid
    if (primaryAmount > 0) result[labelOf(currentMethod, accountNames)] = primaryAmount
    for (const sl of splitLines) {
      if (!sl.amount) continue
      const m = methodList.find(pm => pm.id === sl.methodId)
      const label = (m ? labelOf(m, accountNames) : sl.methodId)
      result[label] = (result[label] || 0) + sl.amount
    }
  } else {
    result[labelOf(currentMethod, accountNames)] = total
  }
  return result
}

/**
 * Build the cash-receipt journal lines for a sale (debits to cash/bank/M-Pesa).
 * Excludes revenue, COGS, inventory — those are appended by the caller.
 */
export function buildReceiptJournalLines(args: {
  journalId: string
  startLineNumber: number
  isPOD: boolean
  autoReceipt: boolean
  isSplit: boolean
  total: number
  totalSplitPaid: number
  splitLines: SplitLine[]
  currentMethod: PaymentMethod
  accountMap: Record<string, string>
  accountNames?: Record<string, string>
  paymentRef: string
  custName: string
  ref: string
  deliveryTotal: number
  delivFloatId: string | null | undefined
  arId: string | undefined
  /** Tile list for resolving split methodIds; defaults to presets. */
  methods?: PaymentMethod[]
}): { lines: any[]; nextLineNumber: number } {
  const methodList = args.methods && args.methods.length ? args.methods : PAYMENT_METHODS
  const lines: any[] = []
  let ln = args.startLineNumber

  if (!args.isPOD && args.autoReceipt) {
    const primaryAcctId = args.accountMap[args.currentMethod.accountCode]
    if (!primaryAcctId) {
      throw new Error(
        `${labelOf(args.currentMethod, (args as { accountNames?: Record<string, string> }).accountNames)} is not set up on this account. ` +
        `A Cash & Bank account with code ${args.currentMethod.accountCode} is required. ` +
        `Open Banks & Cash, activate the tile for ${args.currentMethod.label}, then try the sale again.`
      )
    }

    // primaryAmount = what the PRIMARY payment method actually received.
    // Non-split  → the whole total goes to the primary method.
    // Split      → total minus what the secondary split lines collected.
    //
    // IMPORTANT: args.total already includes deliveryTotal (computed upstream
    // as `subtotal + deliveryTotal`). The credit side of this journal posts a
    // separate `Delivery float (2085)` line for deliveryTotal, which exactly
    // balances the delivery portion already inside `total` on the debit side.
    // We must NOT push an additional delivery debit line here — doing so was
    // the bug that left every cash sale with a delivery fee out of balance by
    // exactly `deliveryTotal`.
    const primaryAmount = args.isSplit ? args.total - args.totalSplitPaid : args.total

    // Only push a primary-method debit if it actually received money.
    // Previously the fallback `primaryAmount > 0 ? primaryAmount : args.total`
    // re-debited the full total when a split fully allocated to secondary
    // methods (primaryAmount === 0), producing a debit side that was double
    // the credit side. We now skip the line entirely in that case.
    if (primaryAmount > 0) {
      lines.push({
        journal_id: args.journalId, line_number: ln++,
        account_id: primaryAcctId,
        description: `${args.currentMethod.label}${args.paymentRef ? ' · ' + args.paymentRef : ''} — ${args.custName}`,
        debit: primaryAmount, credit: 0,
      })
    }

    for (const sl of args.splitLines) {
      if (!sl.accountId || !sl.amount) continue
      const m = methodList.find(pm => pm.id === sl.methodId)
      lines.push({
        journal_id: args.journalId, line_number: ln++,
        account_id: sl.accountId,
        description: `${m?.label || sl.methodId}${sl.ref ? ' · ' + sl.ref : ''} — ${args.custName}`,
        debit: sl.amount, credit: 0,
      })
    }
  } else if (args.isPOD && args.arId) {
    lines.push({
      journal_id: args.journalId, line_number: ln++,
      account_id: args.arId,
      description: `POD — ${args.custName} — ${args.ref}`,
      debit: args.total, credit: 0,
    })
  }

  return { lines, nextLineNumber: ln }
}

// ─── Types ─────────────────────────────────────────────────────────────────

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
  accountNames?: Record<string, string>
  /** The tile list the page built (presets + synthetic acct_<code> tiles
   *  from buildPaymentMethods). Optional — omitted (legacy callers, tests)
   *  falls back to the hardcoded presets, preserving old behaviour. */
  methods?: PaymentMethod[]
  /** Branch NAME of the selling location — stamped on the voucher for
   *  branch reporting. Replaces the old hardcoded 'DSM HQ'. */
  branchName?: string
  // Delivery
  townDelivery: string
  upcountryShipping: string
  deliveryAccountId: string
  // Location
  locationCode: string
  locations: { id: string; code: string; name: string }[]
  // Settings
  invSettings: any
  /** Present when a permission holder authorised posting past available
   *  stock (negative-stock policy 'permission'). Never set under 'block'. */
  stockOverride?: { reason: string; by: string }
  // Auth
  userName: string
  userId?: string
  // Bundle
  appliedBundle: Bundle | null
  // Computed
  subtotal: number
  total: number
  crownPoints: number
  deliveryTotal: number
  totalSplitPaid: number
  // Optional customer context (TTC / pregnancy / postpartum) captured at till.
  // Skipped fields are not written; not provided = no change to existing.
  customerContext?: {
    stage_path?:    'ttc' | 'pregnant' | 'postpartum' | null
    ttc_duration?:  string | null
    edd?:           string | null
    delivery_date?: string | null
    notes?:         string | null
  }
  // Optional Ambassador referral applied at the till.
  // referralCode is the trimmed/uppercased code; referralBenefit is the
  // preview returned by apply_referral_code (shape + amount + referrer).
  // When present, cashSalePost will:
  //   - add a discount journal line (Dr 4040 Sales Discounts) for percent/flat
  //   - add a giveaway voucher_line + Dr 5081 Marketing Expense for free-item
  //   - call record_referral_use(...) after the voucher posts to:
  //       atomically increment uses_count, create the credited referrals row,
  //       and award Crown points to the referrer
  referralCode?: string | null
  referralBenefit?: {
    referrer_id: string
    referrer_name: string
    benefit_shape: 'discount_pct' | 'discount_tzs' | 'free_item'
    benefit_amount?: number
    benefit_percent?: number
    free_product_id?: string
    free_product_name?: string
  } | null
}

export interface PostResult {
  success: boolean
  ref?: string
  error?: string
  /** True when the failure was an insufficient-stock shortage — lets the
   *  page offer the override dialog instead of a dead-end toast. */
  shortage?: boolean
  /** Human shortage lines for the override dialog */
  shortageDetails?: string[]
  receiptData?: any
  isPOD?: boolean
}

// ─── CREATE ────────────────────────────────────────────────────────────────

export async function postCashSale(params: PostParams): Promise<PostResult> {
  const {
    newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, autoReceipt, selectedMethod, isSplit, splitLines, paymentRef, accountMap, accountNames,
    deliveryAccountId,
    locationCode, locations, invSettings, userName, userId, appliedBundle,
    subtotal, total, crownPoints, deliveryTotal, totalSplitPaid,
    customerContext,
    referralCode, referralBenefit,
  } = params

  // Resolve the selected method against the page's dynamic tile list when
  // provided (covers synthetic acct_<code> tiles); presets otherwise.
  const methodList = params.methods && params.methods.length ? params.methods : PAYMENT_METHODS
  const currentMethod = methodList.find(m => m.id === selectedMethod)
  if (!currentMethod) {
    return { success: false, error: `Unknown payment method "${selectedMethod}". Reselect the payment tile and try again.` }
  }

  // Validations
  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product or service' }

  // Scope preflight at the SOURCE OF TRUTH. The picker and hard stop enforce
  // scope in the UI, but a stale tab running a pre-deploy bundle can still
  // submit an out-of-scope location. Since migration 061 the database
  // silently rejects the location-level stock writes for such a sale, which
  // produced the worst possible outcome (CS-10-0006, 23 Jul): voucher and
  // journal posted, stock and ledger untouched, UI reporting success. Asking
  // the DB up front turns that half-post into a clean refusal before any
  // write happens. On RPC error we proceed: the checks below and the DB
  // policies remain the backstop.
  try {
    const { data: scopeOk, error: scopeErr } = await supabase.rpc('can_operate_location_code', { p_code: locationCode })
    if (!scopeErr && scopeOk === false) {
      return { success: false, error: `Your scope does not allow selling from location ${locationCode}. Refresh the page and pick a location inside your branch.` }
    }
  } catch { /* advisory only */ }

  // Stock check — UNCONDITIONAL and location-aware. Previously gated on
  // invSettings?.block_negative_stock, which meant cash sales could post
  // unbacked stock during the brief async window before invSettings loaded,
  // or any time the setting was off. We always block. We also check the
  // SELECTED location's bin qty (not just the global products.qty_on_hand),
  // because picking from an empty bin corrupts product_locations and the
  // cashier may have left the location picker on its default value.
  // Stock check — location-aware, governed by the tenant's negative-stock
  // policy (stockPolicy.ts): 'block' fails shortages for everyone (the
  // historical behaviour), 'permission' fails unless a typed-reason
  // stockOverride accompanies the params (the page enforces the permission
  // before attaching one), 'allow' proceeds and lets stock go negative.
  // Phantom-stock guard (064): a service has no bin and no quantity, so it
  // must never enter the shortage maths — a service would otherwise always
  // read as qty 0 and block the sale. isService() resolves per product id.
  const isService = (productId: string) =>
    !!dbProducts.find(p => p.id === productId)?.is_service

  const selectedLocForCheck = locations.find(l => l.code === locationCode)
  let locStockMap: Map<string, number> | null = null
  if (selectedLocForCheck) {
    const productIds = lines.filter(l => l.productId && !isService(l.productId)).map(l => l.productId)
    const { data: locStocks } = await supabase
      .from('product_locations')
      .select('product_id, qty_on_hand')
      .eq('location_id', selectedLocForCheck.id)
      .in('product_id', productIds)
    locStockMap = new Map((locStocks || []).map(r => [r.product_id, r.qty_on_hand || 0]))
  }

  const stockLines = lines
    .filter(l => l.productId && !isService(l.productId))
    .map(l => {
      const prod = dbProducts.find(p => p.id === l.productId)
      return { productId: l.productId, name: prod?.name || l.name, qty: l.qty }
    })
  const globalQtyMap = new Map(dbProducts.map(p => [p.id, p.qty_on_hand || 0]))
  const shortages = computeShortages(
    stockLines, globalQtyMap, locStockMap,
    selectedLocForCheck ? `${selectedLocForCheck.code} (${selectedLocForCheck.name})` : '—'
  )

  const negStockPolicy = resolveNegativeStockPolicy(invSettings)
  let allowNegative = false
  if (shortages.length > 0) {
    const outcome = evaluateStockPolicy(shortages, negStockPolicy, false, !!params.stockOverride)
    if (outcome !== 'proceed') {
      return {
        success: false, shortage: true, shortageDetails: shortages.map(shortageLabel),
        error: `Insufficient stock — ${shortages.map(shortageLabel).join(' · ')}` +
          (negStockPolicy === 'permission' ? '. Posting past stock requires the negative-stock override permission.'
            : '. Transfer stock first or change location.'),
      }
    }
    allowNegative = true
  }
  if (invSettings?.block_sell_below_cost) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      if (isService(line.productId)) continue   // services carry no cost in v1
      const prod = dbProducts.find(p => p.id === line.productId)
      // Effective price = net amount per unit AFTER any line-level discount.
      // We check this rather than line.price so a deep discount that pushes
      // the unit price below cost is also caught.
      const effectivePrice = line.qty > 0 ? line.amount / line.qty : line.price
      if (prod && effectivePrice < prod.cost_price) return { success: false, error: `Selling ${prod.name} below cost price (effective TZS ${Math.round(effectivePrice).toLocaleString()} vs cost TZS ${prod.cost_price.toLocaleString()}). Adjust price/discount or change settings.` }
    }
  }
  if (invSettings?.warn_below_min_margin) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      if (isService(line.productId)) continue   // margin maths is meaningless at cost 0
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && prod.selling_price > 0) {
        // Same reasoning — check the effective unit price after discount.
        const effectivePrice = line.qty > 0 ? line.amount / line.qty : line.price
        const margin = effectivePrice > 0 ? ((effectivePrice - prod.cost_price) / effectivePrice) * 100 : 0
        if (margin < (invSettings.global_min_margin || 0)) return { success: false, error: `Warning: ${prod.name} margin is ${Math.round(margin)}% — below minimum ${invSettings.global_min_margin}%` }
      }
    }
  }
  if (!isPOD && !isSplit && currentMethod.showRef && !paymentRef.trim()) {
    // labelOf resolves the tenant's live account name (what the cashier saw
    // on the tile) over the preset label — otherwise a tenant whose bank
    // tile reads "Akiba Commercial Bank" is told to enter an "NMB Bank"
    // reference, because the underlying preset kept its Malkia-era label.
    return { success: false, error: `Please enter the ${labelOf(currentMethod, accountNames)} transaction reference number` }
  }

  const ref = await nextRef('cash_sale')
  const postingDate = today()

  try {
    // Upsert customer. waInput may be null when an existing customer
    // record has no whatsapp number saved and was picked from the
    // dropdown, so coerce to '' before touching string methods.
    const cleaned = (waInput || '').replace(/[\s+\-()]/g, '')
    let customerId = selectedCust?.id || null

    let customerCode: string | undefined
    if (!selectedCust?.id) {
      const { data: maxCode } = await supabase
        .from('customers').select('code').like('code', 'CONT-%')
        .order('code', { ascending: false }).limit(1)
      const lastNum = maxCode?.[0]?.code ? parseInt(maxCode[0].code.replace('CONT-', '')) || 10000 : 10000
      customerCode = `CONT-${lastNum + 1}`
    }

    // Build context fields if cashier captured anything this sale.
    // Stage_path null/undefined = nothing captured; leave existing fields as-is.
    const ctxPayload: Record<string, any> = {}
    if (customerContext?.stage_path) {
      // Mark as captured + stamp who/when
      ctxPayload.context_status      = 'captured'
      ctxPayload.context_captured_at = new Date().toISOString()
      if (userId) ctxPayload.context_captured_by = userId

      if (customerContext.stage_path === 'ttc' && customerContext.ttc_duration) {
        ctxPayload.ttc_duration  = customerContext.ttc_duration
        ctxPayload.edd           = null
        ctxPayload.delivery_date = null
      } else if (customerContext.stage_path === 'pregnant' && customerContext.edd) {
        ctxPayload.edd               = customerContext.edd
        ctxPayload.edd_source        = 'first_purchase'
        ctxPayload.edd_captured_at   = new Date().toISOString()
        ctxPayload.ttc_duration      = null
        ctxPayload.delivery_date     = null
      } else if (customerContext.stage_path === 'postpartum' && customerContext.delivery_date) {
        ctxPayload.delivery_date = customerContext.delivery_date
        ctxPayload.ttc_duration  = null
        // Don't clear edd — historical EDD has audit value even after birth
      }

      // Notes only carried for the edit view (per Joe's preference: notes are
      // back-office responsibility for first-time captures)
      if (customerContext.notes !== undefined) {
        ctxPayload.internal_notes = customerContext.notes
      }
    }

    // Update existing customer OR insert a new walk-in. Two paths so that
    // an existing customer (e.g. a wholesale/debtor row that somehow gets
    // routed through here) keeps their identifying attributes intact.
    // Only NEW customers get customer_type='cash' + segment='retail' +
    // a fresh CONT-* code. Existing rows only receive transactional
    // updates: crown points, last purchase, balance, and any freshly
    // captured maternal context.
    if (selectedCust?.id) {
      const updatePayload: Record<string, any> = {
        crown_points: (selectedCust.crown_points || 0) + crownPoints,
        last_purchase_date: postingDate,
        last_purchase_amount: subtotal,
        balance: isPOD ? (selectedCust.balance || 0) + total : (selectedCust.balance || 0),
        ...ctxPayload,
      }
      await supabase.from('customers').update(updatePayload).eq('id', selectedCust.id)
      customerId = selectedCust.id
    } else {
      // This was an upsert on (company_id, whatsapp). Two problems with that.
      //
      // 1. DATA LOSS: on conflict it rewrote an existing customer's name,
      //    whatsapp, segment and code with whatever the cashier typed this
      //    time, so a repeat walk-in saved as "Jawabu Abdallah" silently
      //    became "jawabu". It also OVERWROTE balance with this sale's total
      //    instead of adding to it, wiping any outstanding POD debt.
      // 2. PERMISSIONS: name/whatsapp/segment/code are guarded columns, so
      //    once retail rows are guarded too (112) that conflict path would
      //    fail the sale outright for a cashier without customers.edit.
      //
      // Look first, then either top up the EXISTING row using only
      // transactional (unguarded) columns, or insert a genuinely new one.
      // Identity of an existing customer is never touched by a sale.
      const existing = cleaned
        ? (await supabase.from('customers')
            .select('id, crown_points, balance')
            .eq('whatsapp', cleaned).maybeSingle()).data
        : null
      if (existing) {
        await supabase.from('customers').update({
          crown_points: (existing.crown_points || 0) + crownPoints,
          last_purchase_date: postingDate,
          last_purchase_amount: subtotal,
          balance: isPOD ? (existing.balance || 0) + total : (existing.balance || 0),
          ...ctxPayload,
        }).eq('id', existing.id)
        customerId = existing.id
      } else {
        const { data: custData } = await supabase.from('customers').insert({
          ...(customerCode ? { code: customerCode } : {}),
          name: newCustName.trim(),
          whatsapp: cleaned || null,
          customer_type: 'cash',
          segment: 'retail',
          crown_points: crownPoints,
          last_purchase_date: postingDate,
          last_purchase_amount: subtotal,
          balance: isPOD ? total : 0,
          ...ctxPayload,
        }).select('id').single()
        if (custData) customerId = custData.id
      }
    }

    // Get accounts
    const neededCodes = ['4010', '4200', '5010', '1110', '1050', '2085', '4040', '5081', '2020']
    const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
    const acct = (code: string) => acctData?.find(a => a.code === code)?.id
    const revenueId = acct('4010'); const cogsId = acct('5010')
    const serviceRevenueId = acct('4200')
    const inventoryId = acct('1110')
    const arId = acct('1050'); const delivFloatId = acct('2085') || deliveryAccountId
    const salesDiscountsId = acct('4040')    // Dr for referral discounts
    const vatId = acct('2020')               // Cr for output VAT (076)
    const marketingExpId = acct('5081')      // Dr for referral free items
    if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found')
    // Revenue split (064): service lines credit 4200 Service Revenue, product
    // lines credit 4010. Only demand 4200 when the cart actually has a
    // service — an all-product sale on a tenant missing 4200 still posts.
    const serviceSubtotal = lines.reduce((s, l) =>
      (l.productId && isService(l.productId)) ? s + l.amount : s, 0)

    // ── VAT (076) ──────────────────────────────────────────────────────────
    // Cash sales posted NO VAT before this. The full gross went to 4010 and
    // 2020 was never credited, so output VAT was understated by the whole
    // till. Priced per line off each product's own tax_code, so a cart can
    // mix standard, zero-rated and exempt items freely.
    const taxCfg = await loadTaxSettings()
    const cart = computeCartVat(
      lines.filter(l => l.productId).map(l => ({
        amount: l.amount,
        product: dbProducts.find(p => p.id === l.productId),
        isService: isService(l.productId),
      })),
      taxCfg
    )
    const vatTotal = cart.vat
    const productSubtotal = cart.productNet
    const serviceNetTotal = cart.serviceNet
    if (vatTotal > 0 && !vatId) {
      throw new Error('VAT Payable account (2020) not found in the Chart of Accounts. Run migration 076 or add it, then post again.')
    }
    if (serviceSubtotal > 0 && !serviceRevenueId) {
      throw new Error('Service Revenue account (4200) not found in the Chart of Accounts. Run migration 064 or add it, then post again.')
    }
    // A POD sale's entire debit side is Accounts Receivable. Without 1050,
    // buildReceiptJournalLines pushes no line at all (its POD branch is
    // `else if (isPOD && arId)`) and the customer_ledger_entries insert is
    // skipped too, so the debt would exist nowhere. The 076 balance guard
    // does catch the resulting imbalance, but it reports the generic "journal
    // does not balance" instead of naming the one account that is missing.
    // Every other required account here says which one it is; this is the
    // only voucher where AR is the whole point, so it should too.
    if (isPOD && !arId) {
      throw new Error('Accounts Receivable account (1050) not found in the Chart of Accounts. A Pay on Delivery sale posts the full amount to 1050. Add it, then post again.')
    }
    // If we collected delivery money but have nowhere to credit it, the
    // journal will silently go out of balance. Fail loudly instead.
    if (deliveryTotal > 0 && !delivFloatId) {
      throw new Error('Delivery & Shipping Float account (2085) not found and no fallback configured. Add it to the Chart of Accounts before posting sales with delivery.')
    }

    // Build payment label (helper — mirrored on edit path). Primary amount
    // is total minus what secondary split lines collected; when 0 the
    // primary method is omitted from the label so we don't show methods
    // that received nothing.
    const primaryAmount = isSplit ? total - totalSplitPaid : total
    const paymentLabel = buildPaymentLabel(isSplit, splitLines, currentMethod, primaryAmount, params.accountNames, methodList)

    // Create journal (with retry to handle ref collisions)
    const { data: journal, error: jErr } = await insertJournalWithRetry({
      ref: 'JV-' + ref, posting_date: postingDate,
      description: `Cash Sale — ${newCustName} — ${ref}`,
      journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref,
      posted_by: userName, status: 'posted',
      branch: params.branchName || null,
    })
    if (jErr) throw new Error('Journal: ' + jErr.message)
    if (!journal) throw new Error('Journal: insert returned no data')

    const cogsTotal = lines.reduce((s, l) => {
      if (l.productId && isService(l.productId)) return s   // no COGS on services
      const p = dbProducts.find(p => p.id === l.productId)
      return s + (p ? p.cost_price * l.qty : 0)
    }, 0)

    // ─── Referral benefit (applied at till) ────────────────────────────────
    // Two flavours:
    //   (a) percent / flat discount → reduces cash collected; Dr 4040 balances
    //       the gross-revenue credit against the reduced cash debit.
    //   (b) free item → cash unchanged; freebie leaves inventory at cost,
    //       full retail cost recognized as marketing expense (Dr 5081 / Cr 1110).
    // Only one shape is active per sale.
    let referralDiscountAmount = 0
    let freebieCost = 0
    let freebieProductId: string | null = null
    let freebieProductName = ''

    if (referralBenefit && referralCode) {
      if (referralBenefit.benefit_shape === 'discount_pct') {
        // Compute discount LIVE from current subtotal. The benefit_amount on
        // the validation snapshot may be stale (e.g. validated before items
        // were added). benefit_percent is the source of truth.
        const pct = referralBenefit.benefit_percent || 0
        referralDiscountAmount = Math.min(
          Math.round((subtotal + deliveryTotal) * pct / 100),
          subtotal + deliveryTotal
        )
      } else if (referralBenefit.benefit_shape === 'discount_tzs') {
        // Flat TZS — benefit_amount is the configured value (not subtotal-dependent).
        referralDiscountAmount = Math.min(
          referralBenefit.benefit_amount || 0,
          subtotal + deliveryTotal
        )
      } else if (referralBenefit.benefit_shape === 'free_item' && referralBenefit.free_product_id) {
        freebieProductId = referralBenefit.free_product_id
        freebieProductName = referralBenefit.free_product_name || ''
        // Look up the freebie's cost. If it's not in dbProducts (because the
        // cashier didn't add it as a line), fetch it directly.
        const fromList = dbProducts.find(p => p.id === freebieProductId)
        if (fromList) {
          freebieCost = fromList.cost_price
        } else {
          const { data: prod } = await supabase
            .from('products')
            .select('cost')
            .eq('id', freebieProductId)
            .maybeSingle()
          freebieCost = Number((prod as any)?.cost ?? 0)
        }
      }
    }

    // Build journal lines using the shared helper
    const { lines: receiptLines, nextLineNumber } = buildReceiptJournalLines({
      journalId: journal.id, startLineNumber: 1,
      isPOD, autoReceipt, isSplit,
      total, totalSplitPaid, splitLines, currentMethod,
      accountMap, paymentRef,
      custName: newCustName, ref,
      deliveryTotal, delivFloatId, arId,
      methods: methodList,
    })

    const jLines: any[] = [...receiptLines]
    let ln = nextLineNumber
    // Mixed carts post two revenue lines: products to 4010, services to 4200.
    // The journal still balances — cash debit covers both credits. COGS and
    // the inventory credit only exist when product cost actually left stock.
    if (productSubtotal > 0 || serviceSubtotal === 0) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: productSubtotal })
    }
    if (serviceNetTotal > 0 && serviceRevenueId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: serviceRevenueId, description: `Service revenue — ${ref}`, debit: 0, credit: serviceNetTotal })
    }
    if (vatTotal > 0 && vatId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: vatId, description: `VAT — ${ref}`, debit: 0, credit: vatTotal })
    }
    if (cogsTotal > 0) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
    }
    if (deliveryTotal > 0 && delivFloatId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
    }

    // Referral discount line (Dr 4040 Sales Discounts).
    // The cash debit was already reduced by referralDiscountAmount (because
    // `total` came in reduced); this 4040 debit re-balances the journal
    // against the gross revenue credit. Net P&L effect: revenue stays at
    // gross, the discount shows as a contra-revenue line — Joe can report
    // "how much did the referral program cost us this month?" cleanly.
    if (referralDiscountAmount > 0) {
      if (!salesDiscountsId) {
        throw new Error('Sales Discounts account (4040) not found in Chart of Accounts')
      }
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: salesDiscountsId,
        description: `Referral discount — ${ref}`,
        debit: referralDiscountAmount, credit: 0,
      })
    }

    // Free-item giveaway: freebie left inventory; full cost expensed as
    // marketing. Does NOT touch revenue (nothing was sold).
    //   Dr 5081 Marketing Expense (cost)
    //   Cr 1110 Inventory          (cost)
    if (freebieCost > 0) {
      if (!marketingExpId) {
        throw new Error('Sample & Marketing Expense account (5081) not found')
      }
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: marketingExpId,
        description: `Referral giveaway: ${freebieProductName} — ${ref}`,
        debit: freebieCost, credit: 0,
      })
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: inventoryId,
        description: `Giveaway out: ${freebieProductName} — ${ref}`,
        debit: 0, credit: freebieCost,
      })
    }

    // Balance guard (076). Every VAT bug found in the audit shared one trait:
    // the journal still inserted. A silently unbalanced journal is far more
    // expensive to unpick later than a failed post is now.
    {
      const dr = jLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
      const cr = jLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
      if (Math.abs(dr - cr) > 0.5) {
        throw new Error(
          `Journal does not balance (Dr ${dr.toLocaleString()} vs Cr ${cr.toLocaleString()}). ` +
          'Nothing was posted. This usually means a required account is missing from the Chart of Accounts.'
        )
      }
    }
    const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
    if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

    await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

    // Build payment split (helper — mirrored on edit path)
    const paymentSplitData = buildPaymentSplit(isSplit, total, totalSplitPaid, splitLines, currentMethod, params.accountNames, methodList)

    // Create voucher
    const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
      ref, type: 'cash_sale', posting_date: postingDate,
      description: `Cash Sale — ${newCustName}`,
      subtotal: productSubtotal + serviceNetTotal, vat_amount: vatTotal, total_amount: total,
      // A POD sale is POSTED. The journal is posted, stock has gone and 2020
      // is credited, so calling the voucher a draft was a lie that VATReport,
      // useDashboard, useCashCenter, InvestorsHub and CashCustomerDetail all
      // believed, quietly dropping POD sales from every one of them (119).
      // Settlement now lives in its own column and is maintained by
      // trg_voucher_payment_status as receipts allocate against the ledger.
      status: 'posted', payment_status: isPOD ? 'unpaid' : 'paid',
      branch: params.branchName || null,
      customer_id: customerId, journal_id: journal.id,
      payment_method: paymentLabel,
      payment_split: paymentSplitData,
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : '',
        (params.stockOverride && allowNegative)
          ? `⚑ Negative stock override (${shortages.map(shortageLabel).join(' · ')}) — ${params.stockOverride.reason} — authorised by ${params.stockOverride.by}`
          : ''
      ].filter(Boolean).join(' · ') || null,
      posted_by: userName,
    }).select('id').single()
    if (vErr) throw new Error('Voucher: ' + vErr.message)

    // Voucher lines + stock (atomic deduction prevents overselling)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId); if (!prod) continue
      // subtotal = qty × unit_price (gross, before line discount)
      // total    = line.amount (net, after line discount)
      // The split between the two columns is what tells reports how much
      // discount was given — `subtotal - total`.
      const grossLineAmount = line.qty * line.price
      const lineIsService = !!prod.is_service
      // cart.lines is index-aligned with the productId-bearing lines, which is
      // the same filter used to build it.
      const lineVat = cart.lines[
        lines.filter(l => l.productId).findIndex(l => l === line)
      ]
      const { error: ck104 } = await supabase.from('voucher_lines').insert({
        voucher_id: voucher.id,
        line_number: i + 1,
        product_id: line.productId,
        description: line.name,
        qty: line.qty,
        // Services are pure margin in v1 — a zero unit_cost keeps Product
        // Profitability honest even if someone typed a cost on the service.
        unit_cost: lineIsService ? 0 : prod.cost_price,
        unit_price: line.price,
        subtotal: grossLineAmount,
        vat_amount: lineVat?.vat ?? 0,
        tax_code: lineVat?.taxCode ?? 'none',
        vat_rate: lineVat?.rate ?? 0,
        total: line.amount,
      })
      if (ck104) throw new Error('voucher_lines write failed: ' + ck104.message)

      // Phantom-stock guard (064): a service line ends here. No deduct_stock,
      // no item ledger row, no product_locations touch — there is no stock to
      // move and writing any of it would corrupt real inventory data.
      if (lineIsService) continue

      // Atomic stock deduction. When this specific post is NOT permitted to
      // go negative, use the guarded RPC so a concurrent sale grabbing the
      // last unit fails safely instead of slipping below zero.
      if (!allowNegative) {
        const { error: stockErr } = await supabase.rpc('deduct_stock', { p_product_id: line.productId, p_qty: line.qty })
        if (stockErr) throw new Error(`Insufficient stock for ${prod.name}. Another sale may have just taken the last unit(s).`)
      } else {
        // Negatives permitted (policy 'allow', or a confirmed override)
        await supabase.rpc('deduct_stock_allow_negative', { p_product_id: line.productId, p_qty: line.qty })
      }

      const locObj = locations.find(l => l.code === locationCode)
      // These writes were previously fire-and-forget. A failure here (RLS
      // scope rejection, network drop) now aborts loudly instead of letting
      // the sale claim success with stock and ledger silently untouched.
      const ledgerRes = await postLedgerEntry({
        product_id: line.productId, entry_type: 'sale',
        document_type: 'cash_sale', document_ref: ref,
        posting_date: postingDate, qty: -line.qty,
        cost_amount: prod.cost_price * line.qty,
        location: locObj || null,
      })
      if (!ledgerRes.success) {
        throw new Error(`Stock ledger write failed for ${prod.name} at ${locationCode}: ${ledgerRes.error || 'rejected'}. The sale did NOT complete cleanly — tell your admin, quoting ${ref}.`)
      }
      if (locObj) {
        // Decrement THIS LOCATION's own qty — read it fresh, subtract this sale's qty.
        // Previously this code read the global products.qty_on_hand after the RPC ran
        // and wrote that as the location qty, which corrupted multi-location stock
        // (selling location's qty would inherit the global total). The product_locations
        // trigger will recompute products.qty_on_hand = SUM(locations) after this upsert,
        // so global stays in sync automatically.
        const { data: existingLoc } = await supabase.from('product_locations')
          .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', locObj.id).maybeSingle()
        // When negatives are permitted the location must carry the TRUE
        // (negative) figure — the trigger recomputes the global as
        // SUM(locations), so clamping here would snap it back to zero.
        const rawLocQty = (existingLoc?.qty_on_hand ?? 0) - line.qty
        const newLocQty = allowNegative ? rawLocQty : Math.max(0, rawLocQty)
        const { error: locUpsertErr } = await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: locObj.id, location_code: locationCode, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        if (locUpsertErr) {
          throw new Error(`Stock could not be deducted at ${locationCode} for ${prod.name}: ${locUpsertErr.message}. The sale did NOT complete cleanly — tell your admin, quoting ${ref}.`)
        }
      }
    }

    // ─── Freebie voucher line (Ambassador free-item benefit) ────────
    // The freebie isn't in `lines` (cashier didn't add it; the system did).
    // We insert it as a special voucher_line with is_referral_giveaway=true,
    // price=0 (so it doesn't inflate revenue), and deduct stock atomically.
    if (freebieProductId && freebieCost > 0) {
      const { error: ck103 } = await supabase.from('voucher_lines').insert({
        voucher_id: voucher.id,
        line_number: lines.length + 1,
        product_id: freebieProductId,
        description: `[FREE] ${freebieProductName}`,
        qty: 1,
        unit_cost: freebieCost,
        unit_price: 0,
        subtotal: 0,
        total: 0,
        is_referral_giveaway: true,
      })
      if (ck103) throw new Error('voucher_lines write failed: ' + ck103.message)

      // Atomic stock deduction for the freebie
      const { error: stockErr } = await supabase.rpc('deduct_stock_allow_negative', {
        p_product_id: freebieProductId, p_qty: 1
      })
      if (stockErr) {
        console.warn('Freebie stock deduction failed:', stockErr.message)
      }

      // Ledger entry so stock-movement reports see the giveaway
      const locObj = locations.find(l => l.code === locationCode)
      const lr1 = await postLedgerEntry({
        product_id: freebieProductId, entry_type: 'sale',
        document_type: 'cash_sale', document_ref: ref,
        posting_date: postingDate, qty: -1,
        cost_amount: freebieCost,
        location: locObj || null,
      })
      if (!lr1.success) throw new Error('Stock ledger write failed: ' + (lr1.error || 'unknown'))
      if (locObj) {
        const { data: existingLoc } = await supabase.from('product_locations')
          .select('qty_on_hand').eq('product_id', freebieProductId).eq('location_id', locObj.id).maybeSingle()
        const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - 1)
        const { error: ck102 } = await supabase.from('product_locations').upsert(
          { product_id: freebieProductId, location_id: locObj.id, location_code: locationCode, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        if (ck102) throw new Error('product_locations write failed: ' + ck102.message)
      }
    }

    if (isPOD && customerId && arId) {
      const { error: ck1 } = await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
      if (ck1) throw new Error('customer_ledger_entries write failed: ' + ck1.message)
    }

    // The Cash Sale journal above already posts the payment leg to the
    // correct Cash & Bank account (debit M-Pesa / NMB / etc. for the
    // received amount). An earlier version of this file created a SECOND
    // "Auto Bank Receipt" journal with a debit AND a credit on the same
    // Cash & Bank account, producing a net-zero pair that cluttered the
    // account statement with meaningless "From CS-XXX / Deposit received —
    // CS-XXX" entries. That block was removed. If a tenant later needs a
    // reconciliation-facing Receipt document tied to the sale, it should
    // be a settlement move to a DIFFERENT account (e.g. mobile-money float
    // to bank), not a self-pair on the same account.

    // Log bundle sale for analytics
    if (appliedBundle && voucher) {
      logBundleSale({
        bundleId: appliedBundle.id, voucherId: voucher.id, voucherRef: ref,
        customerId, customerName: newCustName,
        bundlePrice: appliedBundle.bundle_price, individualTotal: appliedBundle.individual_total,
        soldBy: userName, postingDate,
      }).catch(err => console.error('Bundle sale log failed:', err))
    }

    // Schedule feedback follow-ups. Fire-and-forget — a scheduling failure
    // must never break a posted sale. The RPC respects stage_paused and
    // is idempotent (won't double-schedule for the same lines).
    if (!isPOD && customerId) {
      supabase.rpc('schedule_feedback_followups', { p_voucher_id: voucher.id })
        .then(({ error }) => {
          if (error) console.warn('schedule_feedback_followups failed:', error.message)
        })
    }

    // ─── Record the referral use (atomic finalization) ─────────────────────
    // Calls record_referral_use which: locks the referrer row, increments
    // uses_count (with cap re-check), inserts the referrals row as 'credited',
    // stamps voucher.referral_id, and awards Crown points to the referrer.
    // We await because we want the result back for the receipt + because if
    // the cap was just hit by a concurrent cashier, we still want to log.
    if (!isPOD && customerId && referralCode && referralBenefit) {
      try {
        const { data: refId, error: refErr } = await supabase.rpc('record_referral_use', {
          p_code:           referralCode,
          p_referee_id:     customerId,
          p_voucher_id:     voucher.id,
          p_benefit_amount: referralDiscountAmount || freebieCost || 0,
          p_benefit_shape:  referralBenefit.benefit_shape,
        })
        if (refErr) console.warn('record_referral_use failed:', refErr.message)
        else if (!refId) console.warn('record_referral_use returned NULL (cap reached or code invalidated mid-sale)')
      } catch (err) {
        console.warn('record_referral_use threw:', err)
      }
    }

    // Build receipt data
    if (!isPOD) {
      const receiptData = {
        ref, posting_date: postingDate,
        description: `Cash Sale — ${newCustName}`,
        total_amount: total, subtotal,
        payment_method: paymentLabel,          // "SPLIT: M-Pesa + Cash" for splits, "M-Pesa" for singles
        payment_split: paymentSplitData,        // per-method amounts, drives receipt breakdown
        notes: '', posted_by: userName,
        customer_id: selectedCust ? selectedCust.id : null,
        customers: selectedCust ? { name: selectedCust.name, whatsapp: selectedCust.whatsapp, pregnancy_stage: selectedCust.pregnancy_stage, crown_points: (selectedCust.crown_points || 0) + crownPoints } : { name: newCustName, whatsapp: waInput, pregnancy_stage: '', crown_points: crownPoints },
        voucher_lines: lines.filter(l => l.productId).map(l => {
          const prod = dbProducts.find(p => p.id === l.productId)
          return {
            qty: l.qty,
            unit_price: l.price,
            // gross before line discount — used by the receipt to show
            // "less X% off" when subtotal > total.
            subtotal: l.qty * l.price,
            total: l.amount,
            products: prod ? { name: prod.name, sku: prod.sku, category: '' } : null,
          }
        }),
      }
      return { success: true, ref, receiptData, isPOD: false }
    }

    return { success: true, ref, isPOD: true }
  } catch (err: any) {
    // postingError classifies the failure honestly. It only reports a network
    // problem when we actually saw one (offline, aborted, or fetch TypeError).
    // Business errors ("Insufficient stock…") pass through their message.
    return { success: false, error: postingError(err) }
  }
}

// ─── UPDATE (reverse + repost) ─────────────────────────────────────────────

export interface UpdateParams {
  editVoucherData: any
  newCustName: string
  waInput: string
  lines: SaleLine[]
  dbProducts: DBProduct[]
  selectedCust: { id: string } | null
  isPOD: boolean
  autoReceipt: boolean
  selectedMethod: string
  isSplit: boolean
  splitLines: SplitLine[]
  paymentRef: string
  townDelivery: string
  upcountryShipping: string
  currentMethod: PaymentMethod
  /** Dynamic tile list from the page (see PostParams.methods). Optional. */
  methods?: PaymentMethod[]
  // ─ Required for the journal repost (NEW) ─
  accountMap: Record<string, string>
  accountNames?: Record<string, string>
  deliveryAccountId: string
  totalSplitPaid: number
  userName: string
  userId?: string
  /** Does this user hold customers.edit (or own the company)? Editing a SALE
   *  must not silently rewrite the CUSTOMER's name/whatsapp for someone who
   *  is not allowed to edit customers. Defaults to false (strictest). */
  canEditCustomers?: boolean
  // Optional customer context update (Edit view path)
  customerContext?: {
    stage_path?:    'ttc' | 'pregnant' | 'postpartum' | null
    ttc_duration?:  string | null
    edd?:           string | null
    delivery_date?: string | null
    notes?:         string | null
  }
}

export async function updateCashSale(params: UpdateParams): Promise<{ success: boolean; error?: string }> {
  const {
    editVoucherData, newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, autoReceipt, isSplit, splitLines, paymentRef,
    townDelivery, upcountryShipping, currentMethod,
    accountMap, deliveryAccountId, totalSplitPaid, userName, userId,
    customerContext, canEditCustomers,
  } = params

  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product or service' }

  // Phantom-stock guard (064), mirrored on the edit path: service lines
  // never touch stock — not when restoring the old lines, not when writing
  // the new ones — and their revenue re-posts to 4200.
  const isService = (productId: string) =>
    !!params.dbProducts.find(p => p.id === productId)?.is_service

  const voucherId = editVoucherData.id
  const ref = editVoucherData.ref
  const journalId = editVoucherData.journal_id
  // Same fallback contract as postCashSale: legacy callers without a
  // dynamic list get the presets and behave exactly as before.
  const methodList = params.methods && params.methods.length ? params.methods : PAYMENT_METHODS

  try {
    const lineItems = lines.filter(l => l.productId && l.amount > 0)
    const newSubtotal = lineItems.reduce((sum, l) => sum + l.amount, 0)
    const deliveryTotal = (parseInt(townDelivery) || 0) + (parseInt(upcountryShipping) || 0)
    const newTotal = newSubtotal + deliveryTotal

    // VAT (076). Computed once, before voucher_lines are rewritten, so the
    // stored line breakdown and the re-posted journal come from the same
    // numbers. An edited sale must re-split exactly as the original post did,
    // otherwise changing a quantity silently drops VAT already declared.
    const taxCfgEdit = await loadTaxSettings()
    const cartEdit = computeCartVat(
      lineItems.filter(l => l.productId).map(l => ({
        amount: l.amount,
        product: dbProducts.find(p => p.id === l.productId),
        isService: isService(l.productId),
      })),
      taxCfgEdit
    )

    // ── 1. Customer info
    // Same null-safety as postCashSale; a picked customer with a null
    // whatsapp on file would otherwise throw here.
    const cleaned = (waInput || '').replace(/[\s+\-()]/g, '')
    if (selectedCust) {
      // Build context fields if cashier captured/updated anything
      const ctxPayload: Record<string, any> = {}
      if (customerContext?.stage_path) {
        ctxPayload.context_status      = 'captured'
        ctxPayload.context_captured_at = new Date().toISOString()
        if (userId) ctxPayload.context_captured_by = userId
        if (customerContext.stage_path === 'ttc' && customerContext.ttc_duration) {
          ctxPayload.ttc_duration  = customerContext.ttc_duration
          ctxPayload.edd           = null
          ctxPayload.delivery_date = null
        } else if (customerContext.stage_path === 'pregnant' && customerContext.edd) {
          ctxPayload.edd               = customerContext.edd
          ctxPayload.edd_source        = 'manual_edit'
          ctxPayload.edd_captured_at   = new Date().toISOString()
          ctxPayload.ttc_duration      = null
          ctxPayload.delivery_date     = null
        } else if (customerContext.stage_path === 'postpartum' && customerContext.delivery_date) {
          ctxPayload.delivery_date = customerContext.delivery_date
          ctxPayload.ttc_duration  = null
        }
        if (customerContext.notes !== undefined) {
          ctxPayload.internal_notes = customerContext.notes
        }
      }
      // Editing a SALE must not silently rewrite the CUSTOMER. name and
      // whatsapp are permission-guarded columns; the ctxPayload ones are not
      // and always go through. Skip the call entirely if nothing is left.
      const custPatch: Record<string, any> = { ...ctxPayload }
      if (canEditCustomers) {
        custPatch.name = newCustName.trim()
        custPatch.whatsapp = cleaned || null
      }
      if (Object.keys(custPatch).length > 0) {
        await supabase.from('customers').update(custPatch).eq('id', selectedCust.id)
      }
    }

    // ── 2. Compute label + split TOGETHER (no drift possible)
    const primaryAmount = isSplit ? newTotal - totalSplitPaid : newTotal
    const paymentLabel = buildPaymentLabel(isSplit, splitLines, currentMethod, primaryAmount, params.accountNames, methodList)
    const paymentSplitData = buildPaymentSplit(isSplit, newTotal, totalSplitPaid, splitLines, currentMethod, params.accountNames, methodList)

    // ── 3. REVERSE old journal lines: undo balance impact, then delete them
    if (journalId) {
      const { data: oldJLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')
        .eq('journal_id', journalId)

      if (oldJLines && oldJLines.length > 0) {
        await Promise.all(oldJLines.map(l =>
          supabase.rpc('update_account_balance', {
            p_account_id: l.account_id,
            p_debit: -(l.debit || 0),
            p_credit: -(l.credit || 0),
          })
        ))
        const { error: delErr } = await supabase.from('journal_lines').delete().eq('journal_id', journalId)
        // Never ignore this. If the delete silently fails, the re-post below
        // inserts a second copy of every line while the balances (already
        // reversed above) stay correct — duplicated ledger, clean-looking
        // balance sheet, invisible until something recomputes from lines.
        // Migration 066 also guards this at the schema level.
        if (delErr) throw new Error('Could not clear previous journal lines: ' + delErr.message)
      }
    }

    // ── 4. Update voucher header — payment_method AND payment_split together
    const { error: vErr } = await supabase.from('vouchers').update({
      subtotal: cartEdit.productNet + cartEdit.serviceNet,
      vat_amount: cartEdit.vat,
      total_amount: newTotal,
      payment_method: paymentLabel,
      payment_split: paymentSplitData,                    // ← previously missing (root cause)
      // status only. payment_status is deliberately NOT written here: this
      // path reverses and reposts a sale that may already be part paid, and
      // hardcoding 'unpaid' would wipe that. trg_voucher_payment_status owns
      // the column and derives it from the ledger.
      //
      // Pre-existing and NOT fixed here: this path never touches
      // customer_ledger_entries, so editing a POD sale changes the voucher
      // total while the AR entry keeps the original amount. Separate bug,
      // flagged rather than silently bundled into this change.
      status: 'posted',
      description: `Cash Sale — ${newCustName.trim()}`,
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : '',
        `Edited by ${userName} on ${new Date().toISOString()}`,
      ].filter(Boolean).join(' · ') || null,
    }).eq('id', voucherId)
    if (vErr) throw new Error('Voucher update: ' + vErr.message)

    // ── 5. Restore stock from old voucher lines, then delete & re-insert
    const oldLines = editVoucherData.voucher_lines || []
    for (const oldLine of oldLines) {
      if (!oldLine.product_id) continue
      if (isService(oldLine.product_id)) continue   // services never held stock
      const prod = dbProducts.find(p => p.id === oldLine.product_id)
      if (prod) {
        await supabase.from('products')
          .update({ qty_on_hand: prod.qty_on_hand + oldLine.qty })
          .eq('id', oldLine.product_id)
      }
    }
    await supabase.from('voucher_lines').delete().eq('voucher_id', voucherId)

    for (let i = 0; i < lineItems.length; i++) {
      const line = lineItems[i]
      const prod = dbProducts.find(p => p.id === line.productId)
      if (!prod) continue
      const lineIsService = !!prod.is_service
      const grossLineAmount = line.qty * line.price
      const editLineVat = cartEdit.lines[
        lineItems.filter(l => l.productId).findIndex(l => l === line)
      ]
      const { error: ck101 } = await supabase.from('voucher_lines').insert({
        voucher_id: voucherId, line_number: i + 1, product_id: line.productId,
        description: line.name, qty: line.qty,
        unit_cost: lineIsService ? 0 : prod.cost_price,
        unit_price: line.price, subtotal: grossLineAmount,
        vat_amount: editLineVat?.vat ?? 0,
        tax_code: editLineVat?.taxCode ?? 'none',
        vat_rate: editLineVat?.rate ?? 0,
        total: line.amount,
      })
      if (ck101) throw new Error('voucher_lines write failed: ' + ck101.message)
      if (lineIsService) continue   // no stock to deduct on a service line
      const currentQty = prod.qty_on_hand + (oldLines.find((ol: any) => ol.product_id === line.productId)?.qty || 0)
      await supabase.from('products').update({ qty_on_hand: currentQty - line.qty }).eq('id', line.productId)
    }

    // ── 6. RE-POST journal_lines with new amounts and (potentially new) accounts
    if (journalId) {
      const neededCodes = ['4010', '4200', '5010', '1110', '1050', '2085', '2020']
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010')
      const serviceRevenueId = acct('4200')
      const cogsId = acct('5010')
      const inventoryId = acct('1110')
      const arId = acct('1050')
      const delivFloatId = acct('2085') || deliveryAccountId
      const vatId = acct('2020')
      if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found for re-post')
      if (deliveryTotal > 0 && !delivFloatId) {
        throw new Error('Delivery & Shipping Float account (2085) not found and no fallback configured. Cannot re-post.')
      }

      // Same split as postCashSale: services to 4200, products to 4010,
      // COGS pair only for real cost that left stock.
      const serviceSubtotal = lineItems.reduce((s, l) =>
        (l.productId && isService(l.productId)) ? s + l.amount : s, 0)

      const vatTotalEdit = cartEdit.vat
      const productSubtotal = cartEdit.productNet
      const serviceNetTotal = cartEdit.serviceNet
      if (vatTotalEdit > 0 && !vatId) {
        throw new Error('VAT Payable account (2020) not found in the Chart of Accounts. Run migration 076 or add it, then save again.')
      }
      if (serviceSubtotal > 0 && !serviceRevenueId) {
        throw new Error('Service Revenue account (4200) not found in the Chart of Accounts. Run migration 064 or add it, then save again.')
      }

      const cogsTotal = lineItems.reduce((s, l) => {
        if (l.productId && isService(l.productId)) return s
        const p = dbProducts.find(p => p.id === l.productId)
        return s + (p ? p.cost_price * l.qty : 0)
      }, 0)

      const { lines: receiptLines, nextLineNumber } = buildReceiptJournalLines({
        journalId, startLineNumber: 1,
        isPOD, autoReceipt, isSplit,
        total: newTotal, totalSplitPaid, splitLines, currentMethod,
        accountMap, paymentRef,
        custName: newCustName.trim(), ref,
        deliveryTotal, delivFloatId, arId,
        methods: methodList,
      })

      const jLines: any[] = [...receiptLines]
      let ln = nextLineNumber
      if (productSubtotal > 0 || serviceSubtotal === 0) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: productSubtotal })
      }
      if (serviceNetTotal > 0 && serviceRevenueId) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: serviceRevenueId, description: `Service revenue — ${ref}`, debit: 0, credit: serviceNetTotal })
      }
      if (vatTotalEdit > 0 && vatId) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: vatId, description: `VAT — ${ref}`, debit: 0, credit: vatTotalEdit })
      }
      if (cogsTotal > 0) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
      }
      if (deliveryTotal > 0 && delivFloatId) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines re-post: ' + jlErr.message)

      await Promise.all(jLines.map(l =>
        supabase.rpc('update_account_balance', {
          p_account_id: l.account_id,
          p_debit: l.debit,
          p_credit: l.credit,
        })
      ))

      // Audit trail on the journal description
      await supabase.from('journals').update({
        description: `Cash Sale — ${newCustName.trim()} — ${ref} (edited by ${userName})`,
      }).eq('id', journalId)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: postingError(err) }
  }
}
