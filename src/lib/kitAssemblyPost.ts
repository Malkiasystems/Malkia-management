// ─── Kit Assembly Posting ──────────────────────────────────────────────────
// Single source of truth for posting a Kit Assembly voucher. Called by:
//   * src/pages/vouchers/KitAssembly.tsx  (direct post)
//   * src/lib/approvalExecutor.tsx        (post after approval)
// Mirrors the cashSalePost.ts pattern: page-independent async function.
//
// What one posting does (assemble K kits of product KP at location L):
//   1. Re-read products for the kit and every component. Costs are taken at
//      POSTING time, not request time — stock moves now, so value moves at
//      today's average cost. The approval snapshot is indicative only.
//   2. Verify component stock AT THE SELECTED LOCATION's bin (per-bin check,
//      same reasoning as cashSalePost: picking from an empty bin corrupts
//      product_locations). Disassembly checks the kit's bin instead.
//   3. Voucher (insert, or flip an existing pending_approval voucher to
//      posted) + voucher_lines (kit line positive, component lines negative).
//   4. Item ledger entries in ONE atomic batch: kit assembly_in, components
//      assembly_out. Component line costs are rounded per line and the kit's
//      inflow cost is their exact sum, so ledger IN always equals ledger OUT
//      to the cent.
//   5. product_locations upserts for every touched product. The
//      product_locations_global_qty_sync trigger recomputes
//      products.qty_on_hand = SUM(locations) — global qty is never written
//      by hand here.
//   6. Kit cost_price update by weighted average (assembly only):
//      new = (beforeQty x oldCost + totalCost) / (beforeQty + K)
//   7. Journal via post_journal_transaction (atomic, rejects unbalanced):
//      assembly     Dr 1110 total / Cr 1110 total (net zero — total inventory
//                   value is unchanged; the entry exists for the audit trail)
//      disassembly  Dr 1110 components value / Cr 1110 kit value, with any
//                   difference posted to 6850 Stock Variance so inventory
//                   value can never move off-book when kit cost has drifted
//                   from the sum of component costs.
//
// Known non-atomicity (same as every voucher in this codebase): steps 3-7 are
// separate round trips. If a late step fails, earlier steps stay. Errors are
// surfaced loudly with exact step names so nothing fails silently.
// ───────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import { postLedgerEntries } from './itemLedger'
import type { LedgerEntryInput } from './itemLedger'

export type KitAssemblyMode = 'assemble' | 'disassemble'

export interface KitAssemblyComponentInput {
  productId: string
  qtyPer: number            // units consumed per ONE kit
}

export interface KitAssemblyPostArgs {
  mode: KitAssemblyMode
  kitProductId: string
  kits: number              // number of kits to assemble / break apart
  ref: string               // KIT-10-0001
  postingDate: string       // YYYY-MM-DD (caller validates via validatePostingDate)
  location: { id: string; code: string }
  notes: string
  postedBy: string
  components: KitAssemblyComponentInput[]
  /** Approval path: flip this pending voucher to posted instead of inserting. */
  existingVoucherId?: string
}

export interface KitAssemblyPostResult {
  success: boolean
  voucherId?: string
  error?: string
  /** Set when stock moved but the journal failed — needs manual follow-up. */
  warning?: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function postKitAssembly(args: KitAssemblyPostArgs): Promise<KitAssemblyPostResult> {
  const { mode, kitProductId, kits, ref, postingDate, location, notes, postedBy } = args

  // ─── 0. Input sanity ─────────────────────────────────────────────────────
  if (!kitProductId) return { success: false, error: 'Select a kit product' }
  if (!Number.isFinite(kits) || kits <= 0) return { success: false, error: 'Kit quantity must be at least 1' }
  if (!location?.id || !location?.code) return { success: false, error: 'Location is required — stock must move in a real bin' }

  // Dedupe components defensively (DB unique already prevents this in recipes)
  const compMap = new Map<string, number>()
  for (const c of args.components) {
    if (!c.productId || c.productId === kitProductId) continue
    if (!Number.isFinite(c.qtyPer) || c.qtyPer <= 0) continue
    compMap.set(c.productId, (compMap.get(c.productId) || 0) + c.qtyPer)
  }
  const comps = Array.from(compMap.entries()).map(([productId, qtyPer]) => ({ productId, qtyPer }))
  if (comps.length === 0) return { success: false, error: 'The kit recipe has no valid components' }

  // ─── 1. Fresh product read (posting-time costs) ──────────────────────────
  const allIds = [kitProductId, ...comps.map(c => c.productId)]
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, sku, name, cost_price, qty_on_hand, is_active')
    .in('id', allIds)
  if (pErr) return { success: false, error: 'Products read: ' + pErr.message }

  const byId = new Map((prods || []).map(p => [p.id, p]))
  const kit = byId.get(kitProductId)
  if (!kit) return { success: false, error: 'Kit product not found' }
  for (const c of comps) {
    if (!byId.get(c.productId)) return { success: false, error: 'A component product no longer exists — refresh the recipe' }
  }

  // Per-line total consumption and cost. totalCost is the EXACT sum of the
  // rounded component lines so ledger in == ledger out to the cent.
  const lines = comps.map(c => {
    const p = byId.get(c.productId)!
    const qtyTotal = c.qtyPer * kits
    return {
      productId: c.productId,
      name: p.name as string,
      qtyPer: c.qtyPer,
      qtyTotal,
      unitCost: Number(p.cost_price) || 0,
      lineCost: round2((Number(p.cost_price) || 0) * qtyTotal),
    }
  })
  const totalCost = round2(lines.reduce((s, l) => s + l.lineCost, 0))
  const kitUnitCost = kits > 0 ? round2(totalCost / kits) : 0
  const kitCurrentCost = Number(kit.cost_price) || 0
  const kitValue = round2(kitCurrentCost * kits) // used by disassembly

  // ─── 2. Per-bin stock check at the selected location ─────────────────────
  const checkIds = mode === 'assemble' ? comps.map(c => c.productId) : [kitProductId]
  const { data: bins, error: bErr } = await supabase
    .from('product_locations')
    .select('product_id, qty_on_hand')
    .eq('location_id', location.id)
    .in('product_id', allIds) // read all — we also need current bin qtys for the upserts
  if (bErr) return { success: false, error: 'Bin read: ' + bErr.message }
  const binQty = new Map((bins || []).map(b => [b.product_id, Number(b.qty_on_hand) || 0]))

  if (mode === 'assemble') {
    const short = lines
      .filter(l => (binQty.get(l.productId) ?? 0) < l.qtyTotal)
      .map(l => `${l.name}: need ${l.qtyTotal}, have ${binQty.get(l.productId) ?? 0} at ${location.code}`)
    if (short.length > 0) {
      return { success: false, error: 'Insufficient component stock — ' + short.join(' · ') }
    }
  } else {
    const have = binQty.get(kitProductId) ?? 0
    if (have < kits) {
      return { success: false, error: `Insufficient kit stock — ${kit.name}: need ${kits}, have ${have} at ${location.code}` }
    }
  }
  void checkIds

  // ─── 3. Voucher header ───────────────────────────────────────────────────
  const verb = mode === 'assemble' ? 'Assembled' : 'Disassembled'
  const description = `Kit ${mode === 'assemble' ? 'Assembly' : 'Disassembly'} — ${verb} ${kits} x ${kit.name}`
  let voucherId = args.existingVoucherId

  if (voucherId) {
    const { error: vuErr } = await supabase.from('vouchers')
      .update({
        status: 'posted', posted_by: postedBy, posted_at: new Date().toISOString(),
        description, total_amount: totalCost, subtotal: totalCost,
      })
      .eq('id', voucherId)
    if (vuErr) return { success: false, error: 'Voucher update: ' + vuErr.message }
  } else {
    const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
      ref, type: 'kit_assembly', posting_date: postingDate,
      description, status: 'posted', posted_by: postedBy,
      notes: notes || null, total_amount: totalCost, subtotal: totalCost,
    }).select('id').single()
    if (vErr || !voucher) return { success: false, error: 'Voucher: ' + (vErr?.message || 'insert returned no data') }
    voucherId = voucher.id
  }

  // ─── 4. Voucher lines: kit first, then components. Signed qty tells the
  //        story: assembly = kit +, components −. Disassembly reversed. ─────
  const kitSign = mode === 'assemble' ? 1 : -1
  const vLines = [
    {
      voucher_id: voucherId, line_number: 1, product_id: kitProductId,
      description: `${kit.name} (kit)`, qty: kitSign * kits,
      unit_cost: mode === 'assemble' ? kitUnitCost : kitCurrentCost,
      unit_price: 0, subtotal: mode === 'assemble' ? totalCost : kitValue,
      total: mode === 'assemble' ? totalCost : kitValue,
    },
    ...lines.map((l, i) => ({
      voucher_id: voucherId, line_number: i + 2, product_id: l.productId,
      description: `${l.name} (${l.qtyPer} per kit)`, qty: -kitSign * l.qtyTotal,
      unit_cost: l.unitCost, unit_price: 0, subtotal: l.lineCost, total: l.lineCost,
    })),
  ]
  const { error: vlErr } = await supabase.from('voucher_lines').insert(vLines)
  if (vlErr) return { success: false, error: 'Voucher lines: ' + vlErr.message }

  // ─── 5. Item ledger — one atomic batch ───────────────────────────────────
  const ledgerRows: LedgerEntryInput[] = [
    {
      product_id: kitProductId,
      entry_type: mode === 'assemble' ? 'assembly_in' : 'assembly_out',
      document_type: 'kit_assembly', document_ref: ref, posting_date: postingDate,
      qty: kitSign * kits,
      cost_amount: mode === 'assemble' ? totalCost : kitValue,
      location,
    },
    ...lines.map((l): LedgerEntryInput => ({
      product_id: l.productId,
      entry_type: mode === 'assemble' ? 'assembly_out' : 'assembly_in',
      document_type: 'kit_assembly', document_ref: ref, posting_date: postingDate,
      qty: -kitSign * l.qtyTotal,
      cost_amount: l.lineCost,
      location,
    })),
  ]
  const ledger = await postLedgerEntries(ledgerRows)
  if (!ledger.success) return { success: false, error: 'Item ledger: ' + ledger.error }

  // ─── 6. Bin balances. The global-qty trigger recomputes products.qty_on_hand
  //        from SUM(locations), so products qty is never written directly. ──
  const now = new Date().toISOString()
  const upserts = [
    {
      product_id: kitProductId, location_id: location.id, location_code: location.code,
      qty_on_hand: Math.max(0, (binQty.get(kitProductId) ?? 0) + kitSign * kits),
      last_updated: now,
    },
    ...lines.map(l => ({
      product_id: l.productId, location_id: location.id, location_code: location.code,
      qty_on_hand: Math.max(0, (binQty.get(l.productId) ?? 0) - kitSign * l.qtyTotal),
      last_updated: now,
    })),
  ]
  const { error: plErr } = await supabase.from('product_locations')
    .upsert(upserts, { onConflict: 'product_id,location_id' })
  if (plErr) return { success: false, error: 'Bin update: ' + plErr.message }

  // ─── 7. Kit weighted-average cost (assembly only). Uses the kit's GLOBAL
  //        qty BEFORE this posting (read in step 1, before the trigger ran).
  //        Disassembly leaves both kit and component costs untouched. ───────
  if (mode === 'assemble' && totalCost > 0) {
    const beforeQty = Math.max(0, Number(kit.qty_on_hand) || 0)
    const newCost = beforeQty > 0
      ? round2((beforeQty * kitCurrentCost + totalCost) / (beforeQty + kits))
      : kitUnitCost
    const { error: cErr } = await supabase.from('products')
      .update({ cost_price: newCost }).eq('id', kitProductId)
    if (cErr) {
      return {
        success: true, voucherId,
        warning: `${ref} posted and stock moved, but the kit cost update failed (${cErr.message}). Set ${kit.name} cost to ~${newCost} manually in Inventory.`,
      }
    }
  }

  // ─── 8. Journal. Assembly is net zero inside 1110 (audit trail only).
  //        Disassembly posts any kit-vs-components value drift to 6850. ─────
  const compValue = totalCost
  const drift = mode === 'disassemble' ? round2(compValue - kitValue) : 0
  const journalNeeded = mode === 'assemble' ? totalCost > 0 : (compValue > 0 || kitValue > 0)

  if (journalNeeded) {
    const { data: acctData, error: aErr } = await supabase
      .from('accounts').select('id, code').in('code', ['1110', '6850'])
    if (aErr) return { success: true, voucherId, warning: `${ref} posted and stock moved, but account lookup failed (${aErr.message}) so no journal was written.` }
    const inventoryId = acctData?.find(a => a.code === '1110')?.id
    const varianceId = acctData?.find(a => a.code === '6850')?.id
    if (!inventoryId) return { success: true, voucherId, warning: `${ref} posted and stock moved, but account 1110 was not found so no journal was written.` }
    if (drift !== 0 && !varianceId) return { success: true, voucherId, warning: `${ref} posted and stock moved, but account 6850 was not found so the disassembly variance journal was not written.` }

    const jLines = mode === 'assemble'
      ? [
          { account_id: inventoryId, description: `Kits assembled — ${kits} x ${kit.name}`, debit: totalCost, credit: 0 },
          { account_id: inventoryId, description: `Components consumed — ${ref}`, debit: 0, credit: totalCost },
        ]
      : [
          { account_id: inventoryId, description: `Components recovered — ${ref}`, debit: compValue, credit: 0 },
          { account_id: inventoryId, description: `Kits disassembled — ${kits} x ${kit.name}`, debit: 0, credit: kitValue },
          ...(drift > 0
            ? [{ account_id: varianceId!, description: `Assembly variance — ${ref}`, debit: 0, credit: drift }]
            : drift < 0
              ? [{ account_id: varianceId!, description: `Assembly variance — ${ref}`, debit: -drift, credit: 0 }]
              : []),
        ]

    const { error: jErr } = await supabase.rpc('post_journal_transaction', {
      p_ref: 'JV-' + ref,
      p_posting_date: postingDate,
      p_description: description,
      p_journal_type: 'kit_assembly',
      p_source_type: 'kit_assembly',
      p_source_ref: ref,
      p_posted_by: postedBy,
      p_branch: null,
      p_lines: jLines,
    })
    if (jErr) {
      return {
        success: true, voucherId,
        warning: `${ref} posted and stock moved, but the journal failed (${jErr.message}). Post JV-${ref} manually via Journal Entry.`,
      }
    }
  }

  return { success: true, voucherId }
}
