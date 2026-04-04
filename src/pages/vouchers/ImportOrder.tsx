// ═══════════════════════════════════════════════════════════════
// IMPORT ORDER RECEIVE FIX — PATCH INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════
//
// Replace these sections in your existing ImportOrder.tsx:
//
// 1. Replace the receiveLines state declaration with:
//    (find: const [receiveLines, setReceiveLines])

const [receiveLines, setReceiveLines] = useState<{
  shipmentLineId: string;
  orderLineId: string;
  productId: string;
  qtyShipped: number;
  qtyAlreadyReceived: number;
  qtyReceive: number;
  desc: string;
  unitCostTzs: number;
}[]>([])
const [receiving, setReceiving] = useState(false)
const [receiveShipmentData, setReceiveShipmentData] = useState<Shipment | null>(null)

// 2. Replace the openReceiveModal / Receive button onClick with:

const openReceiveModal = async (sh: Shipment) => {
  setReceiveShipmentId(sh.id!)
  setReceiveShipmentData(sh)

  // Query shipment lines DIRECTLY from DB (not from nested select)
  const { data: freshShipLines } = await supabase
    .from('import_shipment_lines')
    .select('*')
    .eq('shipment_id', sh.id)

  const sLines = (freshShipLines || []) as ShipmentLine[]

  setReceiveLines(sLines.map(sl => {
    const ol = orderLines.find(l => l.id === sl.order_line_id)
    return {
      shipmentLineId: sl.id || '',
      orderLineId: sl.order_line_id,
      productId: ol?.product_id || '',
      qtyShipped: sl.qty_shipped,
      qtyAlreadyReceived: sl.qty_received || 0,
      qtyReceive: sl.qty_shipped - (sl.qty_received || 0),
      desc: ol?.description || '',
      unitCostTzs: ol?.unit_cost_tzs || 0,
    }
  }))
  setShowReceiveModal(true)
}

// 3. Replace the ENTIRE receiveShipment function with doReceiveShipment:

const doReceiveShipment = async () => {
  if (!activeOrder || !receiveShipmentId) return
  const totalReceiving = receiveLines.reduce((s, rl) => s + rl.qtyReceive, 0)
  if (totalReceiving <= 0) { showToast('Enter quantities to receive', 'error'); return }

  setReceiving(true)
  try {
    const shipment = receiveShipmentData
    const freightForShipment = shipment?.freight_cost_tzs || 0

    for (const rl of receiveLines) {
      if (rl.qtyReceive <= 0) continue

      const ol = orderLines.find(l => l.id === rl.orderLineId)
      if (!ol) continue

      // Per-unit product cost from order line
      const productCostPerUnit = ol.unit_cost_tzs || 0

      // Freight allocation proportional to qty in THIS receive batch
      const freightPerUnit = totalReceiving > 0 ? freightForShipment / totalReceiving : 0
      const landedCostPerUnit = productCostPerUnit + freightPerUnit
      const totalLandedCost = landedCostPerUnit * rl.qtyReceive

      // 1. Update shipment line qty_received
      const { error: slErr } = await supabase
        .from('import_shipment_lines')
        .update({ qty_received: (rl.qtyAlreadyReceived || 0) + rl.qtyReceive })
        .eq('id', rl.shipmentLineId)
      if (slErr) console.error('Shipment line update failed:', slErr.message)

      // 2. Update order line qty_received
      const newTotalReceived = (ol.qty_received || 0) + rl.qtyReceive
      await supabase
        .from('import_order_lines')
        .update({ qty_received: newTotalReceived, landed_unit_cost_tzs: landedCostPerUnit })
        .eq('id', rl.orderLineId)

      // 3. UPDATE PRODUCT STOCK — query fresh from DB
      if (rl.productId) {
        const { data: freshProduct, error: pErr } = await supabase
          .from('products')
          .select('qty, cost_price')
          .eq('id', rl.productId)
          .single()

        if (pErr) {
          console.error('Product fetch failed:', rl.productId, pErr.message)
          continue
        }

        const currentQty = freshProduct?.qty || 0
        const newQty = currentQty + rl.qtyReceive

        // Weighted average cost
        const existingValue = currentQty * (freshProduct?.cost_price || 0)
        const newAvgCost = newQty > 0
          ? (existingValue + totalLandedCost) / newQty
          : landedCostPerUnit

        const { error: updateErr } = await supabase
          .from('products')
          .update({ qty: newQty, cost_price: Math.round(newAvgCost) })
          .eq('id', rl.productId)

        if (updateErr) {
          console.error('Product update failed:', rl.productId, updateErr.message)
        }
      }
    }

    // 4. Create inventory journal: Dr Inventory (1110) / Cr GRN Interim (1121)
    const inventoryAcct = accounts.find(a => a.code === '1110')
    const grnInterimAcct = accounts.find(a => a.code === '1121')

    if (inventoryAcct && grnInterimAcct) {
      const totalValue = receiveLines.reduce((s, rl) => {
        if (rl.qtyReceive <= 0) return s
        const unitCost = rl.unitCostTzs || 0
        const freightPerUnit = totalReceiving > 0 ? freightForShipment / totalReceiving : 0
        return s + (unitCost + freightPerUnit) * rl.qtyReceive
      }, 0)

      if (totalValue > 0) {
        const desc = `Import received — ${activeOrder.ref} — Shipment #${shipment?.shipment_number || ''}`
        const { data: journal } = await supabase.from('journals').insert({
          ref: `JV-${activeOrder.ref}-RCV${shipment?.shipment_number || ''}`,
          posting_date: today(), description: desc,
          journal_type: 'import_receive', source_type: 'import_order',
          source_ref: activeOrder.ref, posted_by: 'Joe Gembe', status: 'posted',
        }).select('id').single()

        if (journal) {
          await supabase.from('journal_lines').insert([
            { journal_id: journal.id, line_number: 1, account_id: inventoryAcct.id, description: desc, debit: Math.round(totalValue), credit: 0 },
            { journal_id: journal.id, line_number: 2, account_id: grnInterimAcct.id, description: desc, debit: 0, credit: Math.round(totalValue) },
          ])
          await Promise.all([
            supabase.rpc('update_account_balance', { p_account_id: inventoryAcct.id, p_debit: Math.round(totalValue), p_credit: 0 }),
            supabase.rpc('update_account_balance', { p_account_id: grnInterimAcct.id, p_debit: 0, p_credit: Math.round(totalValue) }),
          ])
        }
      }
    }

    // 5. Mark shipment received
    await supabase.from('import_shipments')
      .update({ status: 'received', actual_arrival: today() })
      .eq('id', receiveShipmentId)

    // 6. Check if entire order is done
    const { data: freshOrderLines } = await supabase
      .from('import_order_lines')
      .select('qty, qty_received')
      .eq('order_id', activeOrder.id)
    const allDone = freshOrderLines?.every(l => l.qty_received >= l.qty) || false

    await supabase.from('import_orders').update({
      status: allDone ? 'received' : 'partially_received'
    }).eq('id', activeOrder.id)

    const summary = receiveLines
      .filter(rl => rl.qtyReceive > 0)
      .map(rl => `${rl.desc}: ${rl.qtyReceive} pcs`)
      .join(', ')
    showToast(`Received: ${summary}. Stock updated!`)
    setShowReceiveModal(false)

    await loadAll()
    const refreshed = (await supabase.from('import_orders')
      .select('*, suppliers(name, code)')
      .eq('id', activeOrder.id).single()).data
    if (refreshed) await loadOrderDetail(refreshed as ImportOrder)
  } catch (err: unknown) {
    showToast(err instanceof Error ? err.message : 'Receive failed', 'error')
  } finally { setReceiving(false) }
}

// 4. In the Receive button onClick (inside shipments rendering), replace with:
//    onClick={() => openReceiveModal(sh)}

// 5. In the receive modal's Confirm button, replace onClick={receiveShipment} with:
//    onClick={doReceiveShipment}

// 6. In the receive modal, update the disabled prop:
//    disabled={receiving}
//    And the button text: {receiving ? 'Updating stock...' : 'Confirm Received'}
