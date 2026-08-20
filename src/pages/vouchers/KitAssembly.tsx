import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import { checkApprovalRequired, submitForApproval } from '../../lib/useApproval'
import { useUserLocation } from '../../lib/useUserLocation'
import { validatePostingDate } from '../../lib/dateValidation'
import { postKitAssembly } from '../../lib/kitAssemblyPost'
import type { KitAssemblyMode } from '../../lib/kitAssemblyPost'
import { createProduct } from '../../lib/productPost'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; category: string; unit: string; cost_price: number; selling_price: number; qty_on_hand: number }
interface StockLocation { id: string; code: string; name: string; branch_code: string }
interface RecipeRow { id: string; kit_product_id: string; component_product_id: string; qty: number }

const round2 = (n: number) => Math.round(n * 100) / 100

export default function KitAssembly({ onNav }: Props) {
  const userLoc = useUserLocation()
  const { user, isSuperAdmin } = useAuth()
  const [tab, setTab] = useState<'assemble' | 'recipes'>('assemble')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)

  const [products, setProducts] = useState<DBProduct[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [binMap, setBinMap] = useState<Map<string, number>>(new Map())

  const [form, setForm] = useState({ date: today(), ref: '', mode: 'assemble' as KitAssemblyMode, kitProductId: '', kits: 1, notes: '', locationCode: '' })
  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  // Recipe editor modal
  const [showRecipe, setShowRecipe] = useState(false)
  const [recipeKitId, setRecipeKitId] = useState('')          // '' = new recipe
  const [recipeItems, setRecipeItems] = useState<{ componentId: string; qtyPer: number }[]>([{ componentId: '', qtyPer: 1 }])
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Kit product quick-create modal
  const [showQC, setShowQC] = useState(false)
  const [qc, setQc] = useState({ sku: '', name: '', category: 'Kits', unit: 'pcs', selling_price: 0, locationCode: '' })
  const [savingQC, setSavingQC] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('products')
      .select('id, sku, name, category, unit, cost_price, selling_price, qty_on_hand')
      .eq('is_active', true).order('name')
    if (data) setProducts(data)
  }, [])

  const loadRecipes = useCallback(async () => {
    const { data } = await supabase.from('kit_components')
      .select('id, kit_product_id, component_product_id, qty')
      .order('created_at')
    if (data) setRecipes(data)
  }, [])

  const loadNextRef = useCallback(async () => {
    const ref = await nextRef('kit_assembly')
    setForm(f => ({ ...f, ref }))
  }, [])

  useEffect(() => {
    loadProducts(); loadRecipes(); loadNextRef()
    supabase.from('stock_locations').select('id, code, name, branch_code').order('code').then(({ data }) => {
      if (data && data.length > 0) {
        setLocations(data)
        const defaultLoc =
          (userLoc.defaultLocationCode && data.find(l => l.code === userLoc.defaultLocationCode)) ||
          data.find(l => l.code === '1002' || /warehouse|godown/i.test(l.name)) ||
          data[0]
        setForm(f => ({ ...f, locationCode: defaultLoc.code }))
        setQc(q => ({ ...q, locationCode: defaultLoc.code }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bin balances at the selected location — drives the availability preview.
  const selectedLoc = locations.find(l => l.code === form.locationCode)
  useEffect(() => {
    if (!selectedLoc) return
    supabase.from('product_locations').select('product_id, qty_on_hand')
      .eq('location_id', selectedLoc.id)
      .then(({ data }) => setBinMap(new Map((data || []).map(r => [r.product_id, Number(r.qty_on_hand) || 0]))))
  }, [selectedLoc?.id, posting]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived: recipes grouped, current kit preview ───────────────────────
  const prodById = new Map(products.map(p => [p.id, p]))
  const recipesByKit = new Map<string, RecipeRow[]>()
  for (const r of recipes) {
    const arr = recipesByKit.get(r.kit_product_id) || []
    arr.push(r); recipesByKit.set(r.kit_product_id, arr)
  }
  const kitIds = Array.from(recipesByKit.keys()).filter(id => prodById.has(id))

  const kitProduct = prodById.get(form.kitProductId)
  const kitRecipe = recipesByKit.get(form.kitProductId) || []
  const preview = kitRecipe.map(r => {
    const p = prodById.get(r.component_product_id)
    const need = round2(r.qty * (form.kits || 0))
    const have = binMap.get(r.component_product_id) ?? 0
    return {
      productId: r.component_product_id,
      name: p?.name || 'Unknown product',
      qtyPer: r.qty, need, have,
      unitCost: p?.cost_price || 0,
      lineCost: round2((p?.cost_price || 0) * need),
      short: form.mode === 'assemble' && have < need,
      zeroCost: (p?.cost_price || 0) === 0,
    }
  })
  const totalCost = round2(preview.reduce((s, l) => s + l.lineCost, 0))
  const unitCost = form.kits > 0 ? round2(totalCost / form.kits) : 0
  const kitBinHave = binMap.get(form.kitProductId) ?? 0
  const anyShort = form.mode === 'assemble' ? preview.some(l => l.short) : kitBinHave < form.kits
  const kitBefore = Math.max(0, kitProduct?.qty_on_hand || 0)
  const newAvgCost = kitProduct && form.mode === 'assemble'
    ? (kitBefore > 0 ? round2((kitBefore * kitProduct.cost_price + totalCost) / (kitBefore + form.kits)) : unitCost)
    : null

  // ─── Post ────────────────────────────────────────────────────────────────
  const post = async () => {
    if (!user) { showToast('You must be signed in', 'error'); return }
    if (!form.kitProductId || !kitProduct) { showToast('Select a kit product', 'error'); return }
    if (kitRecipe.length === 0) { showToast('This product has no recipe yet — define it in the Recipes tab first', 'error'); return }
    if (!form.kits || form.kits < 1) { showToast('Kit quantity must be at least 1', 'error'); return }
    if (!selectedLoc) { showToast('Select a location', 'error'); return }
    if (!userLoc.canPostFrom(form.locationCode)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot post at ${form.locationCode}.`, 'error')
      return
    }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Posting date not allowed', 'error'); return }

    // Approval gate — value is the component cost being converted
    const check = await checkApprovalRequired('kit_assembly', {
      value: totalCost,
      quantity: form.kits,
      meta: { mode: form.mode, kit: kitProduct.name },
    })
    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitAssemblyForApproval(check.reason || 'Approval required')
      return
    }

    setPosting(true)
    try {
      const result = await postKitAssembly({
        mode: form.mode,
        kitProductId: form.kitProductId,
        kits: form.kits,
        ref: form.ref,
        postingDate: form.date,
        location: { id: selectedLoc.id, code: selectedLoc.code },
        notes: form.notes,
        postedBy: user.full_name,
        components: kitRecipe.map(r => ({ productId: r.component_product_id, qtyPer: r.qty })),
      })
      if (!result.success) { showToast(result.error || 'Posting failed', 'error'); return }
      if (result.warning) { showToast(result.warning, 'error') }
      else {
        const verb = form.mode === 'assemble' ? 'assembled' : 'disassembled'
        showToast(`${form.ref} posted · ${form.kits} x ${kitProduct.name} ${verb} · Stock, cost and books updated`)
      }
      await Promise.all([loadProducts(), loadNextRef()])
      setForm(f => ({ ...f, kits: 1, notes: '' }))
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const submitAssemblyForApproval = async (reason: string) => {
    if (!user || !kitProduct || !selectedLoc) return
    setPosting(true)
    try {
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'kit_assembly', posting_date: form.date,
        description: `Kit ${form.mode === 'assemble' ? 'Assembly' : 'Disassembly'} — ${form.kits} x ${kitProduct.name}`,
        status: 'pending_approval', posted_by: user.full_name, notes: form.notes || null,
        total_amount: totalCost, subtotal: totalCost,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher: ' + vErr.message)

      const res = await submitForApproval({
        typeCode: 'kit_assembly',
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `${form.mode === 'assemble' ? 'Assemble' : 'Disassemble'} ${form.kits} x ${kitProduct.name} · ~${tzs(totalCost)}`,
        requestedValue: totalCost,
        payload: {
          form: {
            date: form.date, ref: form.ref, mode: form.mode,
            kitProductId: form.kitProductId, kits: form.kits,
            notes: form.notes, locationCode: form.locationCode,
          },
          // Components snapshot: quantities are binding, costs are re-read at
          // execution time (stock moves at approval, so value moves at the
          // average cost of that moment).
          components: kitRecipe.map(r => ({ productId: r.component_product_id, qtyPer: r.qty })),
          total: totalCost,
        },
        requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Submission failed')
      }
      const approverPhrase = res.assignedToName ? ` · Sent to ${res.assignedToName}` : ''
      showToast(`Submitted for approval · ${reason}${approverPhrase}`, 'success')
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  // ─── Recipe editor ───────────────────────────────────────────────────────
  const openNewRecipe = () => { setRecipeKitId(''); setRecipeItems([{ componentId: '', qtyPer: 1 }]); setShowRecipe(true) }
  const openEditRecipe = (kitId: string) => {
    setRecipeKitId(kitId)
    const rows = recipesByKit.get(kitId) || []
    setRecipeItems(rows.length > 0 ? rows.map(r => ({ componentId: r.component_product_id, qtyPer: r.qty })) : [{ componentId: '', qtyPer: 1 }])
    setShowRecipe(true)
  }

  const saveRecipe = async (kitId: string) => {
    if (!kitId) { showToast('Select which product is the kit', 'error'); return }
    const items = recipeItems.filter(i => i.componentId && i.qtyPer > 0)
    if (items.length === 0) { showToast('Add at least one component', 'error'); return }
    if (items.some(i => i.componentId === kitId)) { showToast('A kit cannot contain itself', 'error'); return }
    const seen = new Set<string>()
    for (const i of items) {
      if (seen.has(i.componentId)) { showToast('The same component appears twice — merge the lines', 'error'); return }
      seen.add(i.componentId)
    }
    setSavingRecipe(true)
    try {
      const { error: delErr } = await supabase.from('kit_components').delete().eq('kit_product_id', kitId)
      if (delErr) throw new Error(delErr.message)
      const { error: insErr } = await supabase.from('kit_components')
        .insert(items.map(i => ({ kit_product_id: kitId, component_product_id: i.componentId, qty: i.qtyPer })))
      if (insErr) throw new Error(insErr.message)
      await loadRecipes()
      setShowRecipe(false)
      showToast('Recipe saved')
    } catch (e: any) {
      showToast('Recipe: ' + (e.message || 'save failed'), 'error')
    } finally {
      setSavingRecipe(false)
    }
  }

  const deleteRecipe = async (kitId: string) => {
    const name = prodById.get(kitId)?.name || 'this kit'
    if (!confirm(`Remove the recipe for ${name}? The product itself stays — only the recipe is deleted.`)) return
    await supabase.from('kit_components').delete().eq('kit_product_id', kitId)
    await loadRecipes()
    showToast('Recipe removed')
  }

  // ─── Kit product quick-create ────────────────────────────────────────────
  const saveQC = async () => {
    if (!qc.sku.trim() || !qc.name.trim()) { showToast('SKU and name are required', 'error'); return }
    const loc = locations.find(l => l.code === qc.locationCode)
    if (!loc) { showToast('Choose a location for the new product', 'error'); return }
    setSavingQC(true)
    try {
      const res = await createProduct(
        { sku: qc.sku.trim(), name: qc.name.trim(), category: qc.category.trim() || 'Kits', unit: qc.unit.trim() || 'pcs', cost_price: 0, selling_price: qc.selling_price || 0, reorder_point: 0 },
        { qty: 0, location: { id: loc.id, code: loc.code } }
      )
      if (!res.success) { showToast(res.error || 'Product create failed', 'error'); return }
      if (res.warning) showToast(res.warning, 'error')
      else showToast(`${qc.name} created · Now define its recipe`)
      await loadProducts()
      setShowQC(false)
      if (res.productId) { setRecipeKitId(res.productId); setRecipeItems([{ componentId: '', qtyPer: 1 }]); setShowRecipe(true) }
      setQc(q => ({ ...q, sku: '', name: '', selling_price: 0 }))
    } finally {
      setSavingQC(false)
    }
  }

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort()

  return (
    <VoucherPage title="Kit Assembly" icon="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" subtitle="Build sellable kits from component stock — components out, kit in, cost rolled up" color="rgba(139,92,246,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : form.mode === 'assemble' ? 'Post Assembly' : 'Post Disassembly'}
      postDisabled={tab !== 'assemble' || posting || anyShort}
      postDisabledReason={tab !== 'assemble' ? 'Switch to the Assemble tab to post' : anyShort ? 'Not enough stock at the selected location' : undefined}
      journalNote={form.mode === 'assemble'
        ? 'Dr Inventory (1110) · Cr Inventory (1110) · Net zero — value moves from components to kit'
        : 'Dr Inventory (1110) · Cr Inventory (1110) · Any cost drift posts to Stock Variance (6850)'}>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['assemble', 'recipes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t ? 'var(--accent)' : 'var(--text3)', fontWeight: tab === t ? 600 : 400, fontSize: 13 }}>
            {t === 'assemble' ? 'Assemble' : `Kit Recipes (${kitIds.length})`}
          </button>
        ))}
      </div>

      {tab === 'assemble' && (<>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            <FG label="Action" req>
              <select className="form-input" value={form.mode} onChange={e => set('mode', e.target.value)}>
                <option value="assemble">Assemble — components → kit</option>
                <option value="disassemble">Disassemble — kit → components</option>
              </select>
            </FG>
            <FG label="Location" req>
              <select className="form-input" value={form.locationCode} onChange={e => set('locationCode', e.target.value)}
                disabled={userLoc.isLocked} title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}>
                {locations.length === 0 && <option value="">— Loading —</option>}
                {locations.map(l => {
                  const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
                  return <option key={l.id} value={l.code} disabled={!isMine}>{l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}</option>
                })}
              </select>
            </FG>
          </div>
          <div className="form-row">
            <FG label="Kit Product" req>
              <select className="form-input" value={form.kitProductId} onChange={e => set('kitProductId', e.target.value)}>
                <option value="">— Select kit —</option>
                {kitIds.map(id => { const p = prodById.get(id)!; return <option key={id} value={id}>{p.name} (On hand: {p.qty_on_hand})</option> })}
              </select>
            </FG>
            <FG label={form.mode === 'assemble' ? 'Kits to Assemble' : 'Kits to Break Apart'} req>
              <input type="number" className="form-input" min={1} style={{ textAlign: 'center', fontWeight: 700 }} value={form.kits} onChange={e => set('kits', parseInt(e.target.value) || 1)} />
            </FG>
            <FG label="Posted By"><input className="form-input" readOnly value={user?.full_name || ''} style={{ background: 'var(--surface2)', cursor: 'default' }} /></FG>
            <FG label="Notes"><input className="form-input" placeholder="Optional" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
          </div>
          {kitIds.length === 0 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, fontSize: 12, color: 'var(--text3)' }}>
              No kit recipes yet. Open the <b>Kit Recipes</b> tab to define your first kit (e.g. CS Heaven Kit) and what goes inside it.
            </div>
          )}
        </div>

        {kitProduct && kitRecipe.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>
              {form.mode === 'assemble' ? 'Components to Consume' : 'Components Recovered'} · at {form.locationCode}
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Component</th><th className="td-right">Per Kit</th><th className="td-right">{form.mode === 'assemble' ? 'Needed' : 'Returned'}</th><th className="td-right">At {form.locationCode}</th><th className="td-right">Unit Cost</th><th className="td-right">Line Cost</th></tr></thead>
              <tbody>
                {preview.map(l => (
                  <tr key={l.productId}>
                    <td className="td-bold">{l.name}{l.zeroCost && <span style={{ fontSize: 9, color: 'var(--yellow)', marginLeft: 6 }}>NO COST PRICE</span>}</td>
                    <td className="td-right td-mono">{l.qtyPer}</td>
                    <td className="td-right td-mono td-bold">{l.need}</td>
                    <td className="td-right td-mono" style={{ color: l.short ? 'var(--red)' : 'var(--text3)' }}>{l.have}{l.short ? ' — short' : ''}</td>
                    <td className="td-right td-mono">{tzs(l.unitCost)}</td>
                    <td className="td-right td-mono">{tzs(l.lineCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>ASSEMBLY COST / KIT</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800 }}>{tzs(unitCost)}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>TOTAL ({form.kits} KIT{form.kits > 1 ? 'S' : ''})</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800 }}>{tzs(totalCost)}</div>
              </div>
              {form.mode === 'assemble' && newAvgCost !== null && (
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>KIT AVG COST AFTER</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800 }}>{tzs(newAvgCost)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>was {tzs(kitProduct.cost_price)} · {kitBefore} on hand</div>
                </div>
              )}
              {form.mode === 'assemble' && kitProduct.selling_price > 0 && unitCost > 0 && (
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>MARGIN AT {tzs(kitProduct.selling_price)}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: kitProduct.selling_price > unitCost ? 'var(--green)' : 'var(--red)' }}>
                    {Math.round(((kitProduct.selling_price - unitCost) / kitProduct.selling_price) * 100)}%
                  </div>
                </div>
              )}
              {form.mode === 'disassemble' && (
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>KITS AT {form.locationCode}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: kitBinHave < form.kits ? 'var(--red)' : 'var(--green)' }}>{kitBinHave}</div>
                </div>
              )}
            </div>

            {anyShort && (
              <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 12, marginTop: 12, fontSize: 11, color: 'var(--red)' }}>
                {form.mode === 'assemble'
                  ? `Not enough component stock at ${form.locationCode}. Transfer stock in, reduce the kit quantity, or pick another location.`
                  : `Not enough kits at ${form.locationCode} to disassemble.`}
              </div>
            )}
          </div>
        )}
      </>)}

      {tab === 'recipes' && (<>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowQC(true)}>+ New Kit Product</button>
          <button className="btn btn-primary btn-sm" onClick={openNewRecipe}>+ New Recipe</button>
        </div>
        {kitIds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No kit recipes yet</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>A recipe defines what goes into one kit. The kit itself is a normal product — create it first if it does not exist, then define its recipe.</div>
            <button className="btn btn-primary" onClick={openNewRecipe}>+ Create First Recipe</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {kitIds.map(kitId => {
              const kit = prodById.get(kitId)!
              const rows = recipesByKit.get(kitId) || []
              const uCost = round2(rows.reduce((s, r) => s + (prodById.get(r.component_product_id)?.cost_price || 0) * r.qty, 0))
              const margin = kit.selling_price > 0 && uCost > 0 ? Math.round(((kit.selling_price - uCost) / kit.selling_price) * 100) : null
              return (
                <div key={kitId} className="card" style={{ borderLeft: '3px solid #8b5cf6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{kit.sku}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{kit.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>On hand: {kit.qty_on_hand} · Sells at {tzs(kit.selling_price)}</div>
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                    {rows.map(r => {
                      const p = prodById.get(r.component_product_id)
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                          <span>{p?.name || 'Unknown'} x{r.qty}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{tzs((p?.cost_price || 0) * r.qty)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div><span style={{ fontSize: 10, color: 'var(--text3)' }}>ASSEMBLY COST </span><span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 800 }}>{tzs(uCost)}</span></div>
                    {margin !== null && <span style={{ fontSize: 11, fontWeight: 700, color: margin > 0 ? 'var(--green)' : 'var(--red)' }}>{margin}% margin</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEditRecipe(kitId)}>Edit Recipe</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setForm(f => ({ ...f, kitProductId: kitId, mode: 'assemble' })); setTab('assemble') }}>Assemble</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteRecipe(kitId)}>Del</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>)}

      {/* ─── Recipe editor modal ─── */}
      {showRecipe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '94%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{recipeKitId && recipesByKit.has(recipeKitId) ? 'Edit Recipe' : 'New Recipe'}</div>
              <button onClick={() => setShowRecipe(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FG label="Kit Product (what gets built)" req>
                <select className="form-input" value={recipeKitId} onChange={e => setRecipeKitId(e.target.value)} disabled={!!recipeKitId && recipesByKit.has(recipeKitId)}>
                  <option value="">— Select the kit product —</option>
                  {products.map(p => <option key={p.id} value={p.id} disabled={recipesByKit.has(p.id) && p.id !== recipeKitId}>{p.name}{recipesByKit.has(p.id) && p.id !== recipeKitId ? ' (has recipe)' : ''}</option>)}
                </select>
              </FG>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Components per ONE kit</label>
                {recipeItems.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <select className="form-input" style={{ fontSize: 12 }} value={item.componentId} onChange={e => { const it = [...recipeItems]; it[i] = { ...it[i], componentId: e.target.value }; setRecipeItems(it) }}>
                      <option value="">— Select component —</option>
                      {products.filter(p => p.id !== recipeKitId).map(p => <option key={p.id} value={p.id}>{p.name} (cost {tzs(p.cost_price)})</option>)}
                    </select>
                    <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }} min={0.01} step="any" value={item.qtyPer} onChange={e => { const it = [...recipeItems]; it[i] = { ...it[i], qtyPer: parseFloat(e.target.value) || 0 }; setRecipeItems(it) }} />
                    {recipeItems.length > 1 ? <button onClick={() => setRecipeItems(recipeItems.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>x</button> : <div />}
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => setRecipeItems([...recipeItems, { componentId: '', qtyPer: 1 }])}>+ Add component</button>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3)' }}>Assembly cost per kit (at current costs)</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>
                    {tzs(round2(recipeItems.reduce((s, i) => s + (prodById.get(i.componentId)?.cost_price || 0) * (i.qtyPer || 0), 0)))}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowRecipe(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: savingRecipe ? 0.6 : 1 }} disabled={savingRecipe} onClick={() => saveRecipe(recipeKitId)}>{savingRecipe ? 'Saving…' : 'Save Recipe'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Kit product quick-create modal ─── */}
      {showQC && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '94%', maxWidth: 520 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>New Kit Product</div>
              <button onClick={() => setShowQC(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Creates a normal product at qty 0 with cost 0. The first assembly sets its cost automatically from the components.</div>
              <div className="form-row">
                <FG label="SKU" req><input className="form-input" placeholder="e.g. KIT-CSHEAVEN" value={qc.sku} onChange={e => setQc({ ...qc, sku: e.target.value })} /></FG>
                <FG label="Name" req><input className="form-input" placeholder="e.g. CS Heaven Kit" value={qc.name} onChange={e => setQc({ ...qc, name: e.target.value })} /></FG>
              </div>
              <div className="form-row">
                <FG label="Category"><input className="form-input" list="kit-cat-list" value={qc.category} onChange={e => setQc({ ...qc, category: e.target.value })} /><datalist id="kit-cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist></FG>
                <FG label="Unit"><input className="form-input" value={qc.unit} onChange={e => setQc({ ...qc, unit: e.target.value })} /></FG>
              </div>
              <div className="form-row">
                <FG label="Selling Price (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }} value={qc.selling_price} onChange={e => setQc({ ...qc, selling_price: parseFloat(e.target.value) || 0 })} /></FG>
                <FG label="Stocked At" req>
                  <select className="form-input" value={qc.locationCode} onChange={e => setQc({ ...qc, locationCode: e.target.value })}>
                    {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
                  </select>
                </FG>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowQC(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: savingQC ? 0.6 : 1 }} disabled={savingQC} onClick={saveQC}>{savingQC ? 'Creating…' : 'Create Product'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
