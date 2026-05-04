// ════════════════════════════════════════════════════════════════════════════
// CashCustomerDetail.tsx
//
// CRM-focused detail view for B2C / cash customers (moms, end-consumers).
// Built for retention, loyalty, and marketing — not credit collection.
//
// Replaces the credit-focused detail panel for cash customers only.
// Wholesale customers (customer_type = 'debtor') keep the existing detail.
//
// Data source: customer_metrics, customer_auto_tags, customer_top_products views
// (created in migration 013). Plus direct queries to vouchers + voucher_lines
// for the purchase history tab.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tzs } from '../../lib/utils'
import Toast from '../../components/Toast'

interface Props {
  customerId: string
  onBack: () => void
  onViewStatement?: (id: string) => void
}

interface Metrics {
  customer_id: string
  customer_number: string
  name: string
  whatsapp: string | null
  segment: string
  crown_points: number
  edd: string | null
  edd_source: string | null
  birthday: string | null
  first_purchase_at: string | null
  visit_count: number
  lifetime_value: number
  avg_basket: number
  biggest_basket: number
  first_visit: string | null
  last_visit: string | null
  days_since_last: number | null
  visits_per_30d: number
  lifecycle_stage: string
  days_to_edd: number | null
  baby_age_months: number | null
}

interface Purchase {
  // One row per (cash sale × product line). Multiple lines from the same
  // sale share the same voucher_id, posting_date, and ref — the renderer
  // groups them visually so the date/ref shows once per voucher.
  voucher_id: string
  ref: string
  posting_date: string
  voucher_total: number     // total for the whole cash sale
  line_number: number       // for stable ordering within a voucher
  product_name: string
  qty: number
  line_total: number        // post-discount line total
}

interface TopProduct {
  product_id: string
  product_name: string
  product_sku: string
  times_purchased: number
  total_qty: number
  total_spent: number
  last_purchased: string
  avg_gap_days: number | null
  predicted_next: string | null
}

interface CustomerRow {
  id: string
  manual_tags: string[] | null
  internal_notes: string | null
}

const STAGE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  unknown:           { label: 'Stage unknown',          emoji: '❓', color: '#6b7280' },
  pre_pregnancy:     { label: 'Pre-pregnancy',          emoji: '🌸', color: '#a78bfa' },
  first_trimester:   { label: 'First trimester',        emoji: '🌱', color: '#10b981' },
  second_trimester:  { label: 'Second trimester',       emoji: '🌿', color: '#10b981' },
  third_trimester:   { label: 'Third trimester',        emoji: '🤰', color: '#f59e0b' },
  newborn_0_4w:      { label: 'Newborn (0–4 weeks)',    emoji: '👶', color: '#ec4899' },
  baby_1_3m:         { label: 'Baby (1–3 months)',      emoji: '🍼', color: '#ec4899' },
  baby_3_6m:         { label: 'Baby (3–6 months)',      emoji: '🍼', color: '#ec4899' },
  baby_6_12m:        { label: 'Baby (6–12 months)',     emoji: '🥄', color: '#06b6d4' },
  toddler_1_2y:      { label: 'Toddler (1–2 years)',    emoji: '🚶', color: '#06b6d4' },
  toddler_2_3y:      { label: 'Toddler (2–3 years)',    emoji: '🧸', color: '#3b82f6' },
  past_3y:           { label: 'Past 3 years',           emoji: '📚', color: '#6b7280' },
}

const RECENCY_COLORS: Record<string, string> = {
  recent:        '#10b981',
  engaged:       '#10b981',
  first_time:    '#a78bfa',
  lapsing:       '#f59e0b',
  lapsed:        '#ef4444',
  churned:       '#dc2626',
  inactive:      '#6b7280',
  never_purchased: '#6b7280',
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const buildWhatsAppLink = (whatsapp: string | null, message: string) => {
  if (!whatsapp) return null
  // Normalize: drop leading 0, add 255 country code
  let n = whatsapp.replace(/\D/g, '')
  if (n.startsWith('0')) n = n.substring(1)
  if (n.length === 9) n = '255' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`
}

export default function CashCustomerDetail({ customerId, onBack, onViewStatement }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [autoTags, setAutoTags] = useState<string[]>([])
  const [customerRow, setCustomerRow] = useState<CustomerRow | null>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [waTemplate, setWaTemplate] = useState(
    'Habari {name} 🌸, salama? Ni muda wa kuongeza {product} tena. Naomba ujibu hapa.'
  )

  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'top_products' | 'discounts' | 'notes'>('overview')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // EDD modal state
  const [showEddModal, setShowEddModal] = useState(false)
  const [eddInput, setEddInput] = useState('')
  const [savingEdd, setSavingEdd] = useState(false)

  // Notes editing
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Tag editor
  const [newTagInput, setNewTagInput] = useState('')

  useEffect(() => { loadAll() }, [customerId])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([
      loadMetrics(),
      loadAutoTags(),
      loadCustomerRow(),
      loadPurchases(),
      loadTopProducts(),
      loadWaTemplate(),
    ])
    setLoading(false)
  }

  const loadMetrics = async () => {
    const { data } = await supabase
      .from('customer_metrics')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (data) setMetrics(data as Metrics)
  }

  const loadAutoTags = async () => {
    const { data } = await supabase
      .from('customer_auto_tags')
      .select('tag')
      .eq('customer_id', customerId)
    if (data) setAutoTags(data.map(r => r.tag))
  }

  const loadCustomerRow = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, manual_tags, internal_notes')
      .eq('id', customerId)
      .maybeSingle()
    if (data) {
      setCustomerRow(data as CustomerRow)
      setNotesDraft(data.internal_notes || '')
    }
  }

  const loadPurchases = async () => {
    // Pull this customer's cash sales (most recent first).
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select('id, ref, posting_date, total_amount')
      .eq('customer_id', customerId)
      .eq('type', 'cash_sale')
      .eq('status', 'posted')
      .order('posting_date', { ascending: false })
      .limit(50)

    if (!vouchers || vouchers.length === 0) { setPurchases([]); return }

    // Pull all line items for those sales in one go, then expand into
    // one row per (voucher × line). The renderer groups them visually.
    const ids = vouchers.map(v => v.id)
    const { data: lines } = await supabase
      .from('voucher_lines')
      .select('voucher_id, line_number, description, qty, total')
      .in('voucher_id', ids)
      .order('voucher_id', { ascending: false })
      .order('line_number', { ascending: true })

    if (!lines) { setPurchases([]); return }

    // Index voucher metadata for quick lookup
    const voucherById: Record<string, typeof vouchers[number]> = {}
    for (const v of vouchers) voucherById[v.id] = v

    const expanded: Purchase[] = lines
      .map(l => {
        const v = voucherById[l.voucher_id]
        if (!v) return null
        return {
          voucher_id:    v.id,
          ref:           v.ref,
          posting_date:  v.posting_date,
          voucher_total: v.total_amount,
          line_number:   l.line_number,
          product_name:  l.description || '—',
          qty:           l.qty,
          line_total:    l.total ?? 0,
        } as Purchase
      })
      .filter((p): p is Purchase => p !== null)
      // Sort: most recent voucher first (vouchers already came back desc, but
      // the join may have shuffled). Within voucher, by line_number ascending.
      .sort((a, b) => {
        const dateCmp = b.posting_date.localeCompare(a.posting_date)
        if (dateCmp !== 0) return dateCmp
        const refCmp = b.ref.localeCompare(a.ref)
        if (refCmp !== 0) return refCmp
        return a.line_number - b.line_number
      })

    setPurchases(expanded)
  }

  const loadTopProducts = async () => {
    const { data } = await supabase
      .from('customer_top_products')
      .select('*')
      .eq('customer_id', customerId)
      .order('total_spent', { ascending: false })
      .limit(20)
    if (data) setTopProducts(data as TopProduct[])
  }

  const loadWaTemplate = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'crm_reorder_whatsapp_template')
      .maybeSingle()
    if (data?.value) {
      try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
        if (parsed?.template) setWaTemplate(parsed.template)
      } catch { /* keep default */ }
    }
  }

  // Auto-pop EDD modal once per session if customer is engaged but EDD not set
  useEffect(() => {
    if (!metrics || loading) return
    if (metrics.edd) return
    if ((metrics.visit_count ?? 0) < 2) return
    const sessionKey = `edd_prompt_shown_${customerId}`
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')
    setShowEddModal(true)
  }, [metrics, loading, customerId])

  const saveEdd = async () => {
    if (!eddInput) {
      setToast('Pick a date'); setToastType('error'); return
    }
    setSavingEdd(true)
    const { error } = await supabase
      .from('customers')
      .update({
        edd: eddInput,
        edd_source: metrics?.edd ? 'manual_edit' : 'manual_edit',
        edd_captured_at: new Date().toISOString(),
      })
      .eq('id', customerId)
    setSavingEdd(false)

    if (error) {
      setToast('Save failed: ' + error.message); setToastType('error'); return
    }
    setToast('EDD saved'); setToastType('success')
    setShowEddModal(false)
    setEddInput('')
    loadMetrics()
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    const { error } = await supabase
      .from('customers')
      .update({ internal_notes: notesDraft })
      .eq('id', customerId)
    setSavingNotes(false)
    if (error) {
      setToast('Save failed: ' + error.message); setToastType('error'); return
    }
    setToast('Notes saved'); setToastType('success')
    loadCustomerRow()
  }

  const addManualTag = async () => {
    const tag = newTagInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (!tag) return
    const current = customerRow?.manual_tags || []
    if (current.includes(tag)) {
      setNewTagInput(''); return
    }
    const next = [...current, tag]
    const { error } = await supabase
      .from('customers')
      .update({ manual_tags: next })
      .eq('id', customerId)
    if (error) {
      setToast('Failed to add tag: ' + error.message); setToastType('error'); return
    }
    setNewTagInput('')
    loadCustomerRow()
  }

  const removeManualTag = async (tag: string) => {
    const next = (customerRow?.manual_tags || []).filter(t => t !== tag)
    const { error } = await supabase
      .from('customers')
      .update({ manual_tags: next })
      .eq('id', customerId)
    if (error) {
      setToast('Failed to remove: ' + error.message); setToastType('error'); return
    }
    loadCustomerRow()
  }

  // ─── Computed ───────────────────────────────────────────────────────────

  const recencyTag = useMemo(() => {
    return autoTags.find(t => RECENCY_COLORS[t]) || 'inactive'
  }, [autoTags])

  const spendTier = useMemo(() => {
    if (autoTags.includes('top_10pct')) return { label: 'Top 10%', color: '#facc15' }
    if (autoTags.includes('top_25pct')) return { label: 'Top 25%', color: '#a78bfa' }
    return null
  }, [autoTags])

  const stageInfo = metrics ? STAGE_LABELS[metrics.lifecycle_stage] || STAGE_LABELS.unknown : STAGE_LABELS.unknown
  const recencyColor = RECENCY_COLORS[recencyTag] || '#6b7280'

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading || !metrics) {
    return (
      <div style={{ padding: 40, color: 'var(--text3)' }}>Loading customer…</div>
    )
  }

  const sendWhatsAppFor = (productName: string) => {
    const msg = waTemplate
      .replace(/\{name\}/g, metrics.name)
      .replace(/\{product\}/g, productName)
      .replace(/\{stage\}/g, stageInfo.label)
    const url = buildWhatsAppLink(metrics.whatsapp, msg)
    if (!url) {
      setToast('Customer has no WhatsApp number'); setToastType('error'); return
    }
    window.open(url, '_blank')
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1200 }}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
          }}
        >← Back</button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28 }}>{metrics.name}</h1>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              {metrics.customer_number || '—'}
            </span>
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 4, background: 'var(--surface2)',
              color: 'var(--text3)', letterSpacing: 0.6,
            }}>{metrics.segment}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Tag color={recencyColor} icon="🔵">{recencyTag.replace(/_/g, ' ')}</Tag>
            {spendTier && <Tag color={spendTier.color} icon="💰">{spendTier.label}</Tag>}
            <Tag color={stageInfo.color} icon={stageInfo.emoji}>{stageInfo.label}</Tag>
            {autoTags.includes('frequent_buyer') && <Tag color="#10b981" icon="⚡">Frequent buyer</Tag>}
            {autoTags.includes('crown_gold')   && <Tag color="#facc15" icon="👑">Crown Gold</Tag>}
            {autoTags.includes('crown_silver') && <Tag color="#94a3b8" icon="👑">Crown Silver</Tag>}
            {autoTags.includes('crown_bronze') && <Tag color="#a16207" icon="👑">Crown Bronze</Tag>}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            📱 {metrics.whatsapp || '—'} · Customer since {formatDate(metrics.first_purchase_at || metrics.first_visit)}
          </div>
        </div>
      </div>

      {/* ─── KPI Strip ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14, marginBottom: 18,
      }}>
        <Kpi label="Lifetime Value"   value={tzs(metrics.lifetime_value)} accent="var(--accent)" />
        <Kpi label="Visits"           value={String(metrics.visit_count)} />
        <Kpi label="Avg Basket"       value={tzs(metrics.avg_basket)} />
        <Kpi label="Days Since Last"  value={metrics.days_since_last !== null ? `${metrics.days_since_last}` : '—'}
             accent={metrics.days_since_last !== null && metrics.days_since_last > 60 ? 'var(--red)' : undefined} />
        <Kpi label="Crown Points"     value={String(metrics.crown_points || 0)} accent="#facc15" />
        <Kpi
          label={metrics.days_to_edd && metrics.days_to_edd > 0 ? 'Days to EDD' : 'Baby Age'}
          value={
            metrics.edd
              ? (metrics.days_to_edd && metrics.days_to_edd > 0
                  ? `${metrics.days_to_edd} d`
                  : metrics.baby_age_months !== null ? `${metrics.baby_age_months} mo` : '—')
              : 'Not set'
          }
          accent={metrics.edd ? '#ec4899' : 'var(--text3)'}
          onClick={() => { setEddInput(metrics.edd || ''); setShowEddModal(true) }}
        />
      </div>

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { k: 'overview',     label: 'Overview' },
          { k: 'purchases',    label: `Purchases (${metrics.visit_count})` },
          { k: 'top_products', label: 'Top Products & Reorder' },
          { k: 'discounts',    label: 'Discounts' },
          { k: 'notes',        label: 'Notes & Tags' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k as any)}
            style={{
              background: 'transparent', border: 'none',
              padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: activeTab === t.k ? 'var(--accent)' : 'var(--text3)',
              borderBottom: activeTab === t.k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ─── Tab Content ────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          metrics={metrics}
          purchases={purchases}
          topProducts={topProducts}
          autoTags={autoTags}
          onViewStatement={onViewStatement ? () => onViewStatement(customerId) : undefined}
        />
      )}

      {activeTab === 'purchases' && (
        <PurchasesTab purchases={purchases} />
      )}

      {activeTab === 'top_products' && (
        <TopProductsTab
          products={topProducts}
          onWhatsApp={sendWhatsAppFor}
          hasWhatsApp={!!metrics.whatsapp}
        />
      )}

      {activeTab === 'discounts' && (
        <DiscountsTab customerId={customerId} />
      )}

      {activeTab === 'notes' && (
        <NotesTab
          notes={notesDraft}
          onChangeNotes={setNotesDraft}
          onSaveNotes={saveNotes}
          savingNotes={savingNotes}
          manualTags={customerRow?.manual_tags || []}
          autoTags={autoTags}
          newTagInput={newTagInput}
          onChangeNewTag={setNewTagInput}
          onAddTag={addManualTag}
          onRemoveTag={removeManualTag}
        />
      )}

      {/* ─── EDD Modal ──────────────────────────────────────────── */}
      {showEddModal && (
        <div
          onClick={() => setShowEddModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 440, padding: 24,
            }}
          >
            <h3 style={{ margin: '0 0 6px 0', fontFamily: 'var(--display)', fontSize: 20 }}>
              Expected Delivery Date
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: 'var(--text3)' }}>
              When is {metrics.name} due? Setting this unlocks pregnancy + baby-age based recommendations.
              You can change it anytime.
            </p>

            <input
              type="date"
              value={eddInput}
              onChange={e => setEddInput(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', marginBottom: 16,
                fontFamily: 'var(--mono)',
              }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEddModal(false)}
                disabled={savingEdd}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 14px', fontSize: 12,
                  color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
                }}
              >Skip</button>
              <button
                onClick={saveEdd}
                disabled={savingEdd || !eddInput}
                style={{
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700,
                  color: '#000', cursor: savingEdd ? 'wait' : 'pointer',
                  opacity: !eddInput ? 0.5 : 1,
                }}
              >{savingEdd ? 'Saving…' : 'Save EDD'}</button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} type={toastType} onClose={() => setToast('')} />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Tag({ children, color, icon }: { children: React.ReactNode; color: string; icon?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
      background: color + '20', color, textTransform: 'uppercase', letterSpacing: 0.5,
      fontFamily: 'var(--mono)',
    }}>
      {icon && <span>{icon}</span>}
      {children}
    </span>
  )
}

function Kpi({ label, value, accent, onClick }: { label: string; value: string; accent?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 700, color: accent || 'var(--text)',
        fontFamily: 'var(--display)',
      }}>{value}</div>
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ metrics, purchases, topProducts, autoTags, onViewStatement }: {
  metrics: Metrics
  purchases: Purchase[]
  topProducts: TopProduct[]
  autoTags: string[]
  onViewStatement?: () => void
}) {
  const overdueCount = topProducts.filter(p =>
    p.predicted_next && new Date(p.predicted_next) < new Date()
  ).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Recommended Actions</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {overdueCount > 0 && (
            <ActionRow
              icon="📦"
              text={`${overdueCount} product${overdueCount > 1 ? 's' : ''} overdue for reorder — see Top Products tab`}
              tone="warning"
            />
          )}
          {!metrics.edd && (metrics.visit_count >= 2) && (
            <ActionRow
              icon="🤰"
              text="No EDD set — ask her if she's expecting and capture due date"
              tone="info"
            />
          )}
          {(metrics.days_since_last ?? 0) > 60 && metrics.visit_count > 1 && (
            <ActionRow
              icon="⏰"
              text={`Hasn't bought in ${metrics.days_since_last} days — re-engagement message overdue`}
              tone="warning"
            />
          )}
          {autoTags.includes('top_10pct') && (
            <ActionRow icon="⭐" text="Top 10% spender — consider Crown loyalty upgrade" tone="success" />
          )}
          {metrics.lifecycle_stage === 'newborn_0_4w' && (
            <ActionRow icon="👶" text="Newborn stage — recommend nipple cream, breast pads, perineal care" tone="info" />
          )}
          {metrics.lifecycle_stage === 'baby_3_6m' && (
            <ActionRow icon="🍼" text="Baby 3–6m — weaning bowls, feeding spoons coming up" tone="info" />
          )}
          {metrics.visit_count === 0 && (
            <ActionRow icon="🆕" text="Hasn't purchased yet — onboarding outreach" tone="info" />
          )}
        </div>
      </div>

      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Snapshot</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <SnapshotRow label="First visit"  value={formatDate(metrics.first_visit)} />
          <SnapshotRow label="Last visit"   value={formatDate(metrics.last_visit)} />
          <SnapshotRow label="Biggest basket" value={tzs(metrics.biggest_basket)} />
          <SnapshotRow label="Frequency"   value={`${metrics.visits_per_30d.toFixed(1)} / 30d`} />
          <SnapshotRow label="EDD"         value={metrics.edd ? formatDate(metrics.edd) : 'Not set'} />
          <SnapshotRow label="Birthday"    value={formatDate(metrics.birthday)} />
        </div>
        {onViewStatement && (
          <button
            onClick={onViewStatement}
            style={{
              marginTop: 14, width: '100%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 600,
              color: 'var(--text)', cursor: 'pointer',
            }}
          >View full statement →</button>
        )}
      </div>

      <div style={{ ...panelStyle, gridColumn: '1 / -1' }}>
        <h4 style={panelTitleStyle}>Recent Activity</h4>
        {purchases.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            No purchases yet
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {/* purchases is now line-level — aggregate back to voucher level
                for the activity feed (one entry per visit). */}
            {aggregateByVoucher(purchases).slice(0, 5).map(v => (
              <div key={v.voucher_id} style={timelineRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{v.ref}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {formatDate(v.posting_date)} · {v.line_count} item{v.line_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                  {tzs(v.voucher_total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Aggregate line-level purchases back to one row per voucher for activity feed
function aggregateByVoucher(lines: Purchase[]): {
  voucher_id: string
  ref: string
  posting_date: string
  voucher_total: number
  line_count: number
}[] {
  const byVoucher: Record<string, {
    voucher_id: string
    ref: string
    posting_date: string
    voucher_total: number
    line_count: number
  }> = {}
  for (const line of lines) {
    if (!byVoucher[line.voucher_id]) {
      byVoucher[line.voucher_id] = {
        voucher_id:    line.voucher_id,
        ref:           line.ref,
        posting_date:  line.posting_date,
        voucher_total: line.voucher_total,
        line_count:    0,
      }
    }
    byVoucher[line.voucher_id].line_count += 1
  }
  // Already sorted by date desc in loadPurchases, so iteration order preserves that
  const seen = new Set<string>()
  const out: typeof byVoucher[string][] = []
  for (const line of lines) {
    if (seen.has(line.voucher_id)) continue
    seen.add(line.voucher_id)
    out.push(byVoucher[line.voucher_id])
  }
  return out
}

// ─── Purchases Tab ───────────────────────────────────────────────────────
// Line-level view: one row per (cash sale × product line). Date and ref
// merge visually across rows from the same sale via rowSpan.

function PurchasesTab({ purchases }: { purchases: Purchase[] }) {
  if (purchases.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No purchases yet</div>
  }

  // Pre-compute how many lines belong to each voucher so the first row of
  // each group spans rowSpan=N for the date/ref cells.
  const linesByVoucher: Record<string, number> = {}
  for (const p of purchases) {
    linesByVoucher[p.voucher_id] = (linesByVoucher[p.voucher_id] || 0) + 1
  }

  // Track which voucher we're rendering — only render date/ref on first line
  const renderedVouchers = new Set<string>()

  return (
    <div style={panelStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Ref</th>
            <th style={thStyle}>Product</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p, i) => {
            const isFirstLineOfVoucher = !renderedVouchers.has(p.voucher_id)
            if (isFirstLineOfVoucher) renderedVouchers.add(p.voucher_id)
            const rowSpan = linesByVoucher[p.voucher_id]

            // Visual: top border on first line of each new voucher group;
            // light border between lines within the same voucher.
            const isLastLineOfVoucher =
              i === purchases.length - 1 || purchases[i + 1].voucher_id !== p.voucher_id

            const rowStyle: React.CSSProperties = {
              borderBottom: isLastLineOfVoucher
                ? '1px solid var(--border)'
                : '1px dashed rgba(255,255,255,.06)',
            }

            return (
              <tr key={`${p.voucher_id}-${p.line_number}`} style={rowStyle}>
                {isFirstLineOfVoucher && (
                  <>
                    <td
                      rowSpan={rowSpan}
                      style={{
                        ...tdStyle,
                        verticalAlign: 'top',
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface2)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(p.posting_date)}
                    </td>
                    <td
                      rowSpan={rowSpan}
                      style={{
                        ...tdStyle,
                        verticalAlign: 'top',
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface2)',
                        fontFamily: 'var(--mono)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div>{p.ref}</div>
                      {rowSpan > 1 && (
                        <div style={{
                          fontSize: 10, fontWeight: 400, color: 'var(--text3)',
                          marginTop: 4,
                        }}>
                          {tzs(p.voucher_total)} · {rowSpan} items
                        </div>
                      )}
                    </td>
                  </>
                )}
                <td style={tdStyle}>{p.product_name}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.qty}</td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                }}>
                  {tzs(p.line_total)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Top Products Tab ────────────────────────────────────────────────────

function TopProductsTab({ products, onWhatsApp, hasWhatsApp }: {
  products: TopProduct[]
  onWhatsApp: (productName: string) => void
  hasWhatsApp: boolean
}) {
  if (products.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No purchase history yet</div>
  }
  return (
    <div style={panelStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Product</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Times</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Spent</th>
            <th style={thStyle}>Last</th>
            <th style={thStyle}>Avg Gap</th>
            <th style={thStyle}>Predicted Next</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const isOverdue = p.predicted_next && new Date(p.predicted_next) < new Date()
            const isDueSoon = p.predicted_next && !isOverdue &&
              (new Date(p.predicted_next).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000
            return (
              <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{p.product_sku}</div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.times_purchased}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  {tzs(p.total_spent)}
                </td>
                <td style={tdStyle}>{formatDate(p.last_purchased)}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>
                  {p.avg_gap_days ? `${p.avg_gap_days} d` : '—'}
                </td>
                <td style={{
                  ...tdStyle,
                  color: isOverdue ? 'var(--red)' : isDueSoon ? '#f59e0b' : 'var(--text)',
                  fontWeight: (isOverdue || isDueSoon) ? 700 : 400,
                }}>
                  {p.predicted_next ? formatDate(p.predicted_next) : '—'}
                  {isOverdue && <span style={{ marginLeft: 6, fontSize: 9 }}>⚠ OVERDUE</span>}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => onWhatsApp(p.product_name)}
                    disabled={!hasWhatsApp}
                    title={hasWhatsApp ? 'Send WhatsApp' : 'No WhatsApp number'}
                    style={{
                      background: '#25d36620', border: '1px solid #25d366',
                      borderRadius: 6, padding: '4px 10px', cursor: hasWhatsApp ? 'pointer' : 'not-allowed',
                      fontSize: 11, color: '#25d366', fontWeight: 600,
                      opacity: hasWhatsApp ? 1 : 0.4,
                    }}
                  >📱 Send</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Discounts Tab ───────────────────────────────────────────────────────

function DiscountsTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({ saved: 0, count: 0 })

  useEffect(() => {
    (async () => {
      setLoading(true)
      // Pull voucher_lines with discount > 0 joined to vouchers (this customer's cash sales)
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, ref, posting_date')
        .eq('customer_id', customerId)
        .eq('type', 'cash_sale')
        .eq('status', 'posted')
        .order('posting_date', { ascending: false })

      if (!vouchers || vouchers.length === 0) {
        setRows([]); setLoading(false); return
      }

      const ids = vouchers.map(v => v.id)
      const { data: lines } = await supabase
        .from('voucher_lines')
        .select('voucher_id, description, qty, unit_price, discount_pct, subtotal, total')
        .in('voucher_id', ids)

      const discounted = (lines || []).filter(l => (l.discount_pct || 0) > 0)
      const byVoucher: Record<string, any> = {}
      for (const v of vouchers) byVoucher[v.id] = v

      let totalSaved = 0
      const built = discounted.map(l => {
        const v = byVoucher[l.voucher_id]
        const saved = (l.subtotal || 0) - (l.total || 0)
        totalSaved += saved
        return {
          ref: v?.ref,
          posting_date: v?.posting_date,
          description: l.description,
          qty: l.qty,
          discount_pct: l.discount_pct,
          subtotal: l.subtotal,
          total: l.total,
          saved,
        }
      })

      setRows(built)
      setTotals({ saved: totalSaved, count: discounted.length })
      setLoading(false)
    })()
  }, [customerId])

  if (loading) return <div style={{ padding: 40, color: 'var(--text3)' }}>Loading…</div>
  if (rows.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No discounts given to this customer yet</div>
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14,
      }}>
        <Kpi label="Total saved by customer" value={tzs(totals.saved)} accent="#10b981" />
        <Kpi label="Discounted purchases"    value={String(totals.count)} />
      </div>

      <div style={panelStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>Ref</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Item</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Discount %</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Saved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.ref}</td>
                <td style={tdStyle}>{formatDate(r.posting_date)}</td>
                <td style={tdStyle}>{r.description}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  {r.discount_pct}%
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: '#10b981', fontWeight: 700 }}>
                  {tzs(r.saved)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Notes Tab ───────────────────────────────────────────────────────────

function NotesTab({
  notes, onChangeNotes, onSaveNotes, savingNotes,
  manualTags, autoTags,
  newTagInput, onChangeNewTag, onAddTag, onRemoveTag,
}: {
  notes: string
  onChangeNotes: (v: string) => void
  onSaveNotes: () => void
  savingNotes: boolean
  manualTags: string[]
  autoTags: string[]
  newTagInput: string
  onChangeNewTag: (v: string) => void
  onAddTag: () => void
  onRemoveTag: (t: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Internal Notes</h4>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 10px' }}>
          Visible to staff only. Use for personal context, preferences, allergies, family notes, etc.
        </p>
        <textarea
          value={notes}
          onChange={e => onChangeNotes(e.target.value)}
          placeholder="e.g. Prefers pickup in Sinza · Loves Folic Acid · Follow up after delivery"
          rows={6}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 12,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={onSaveNotes}
          disabled={savingNotes}
          style={{
            marginTop: 10,
            background: 'var(--accent)', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontWeight: 700,
            color: '#000', cursor: savingNotes ? 'wait' : 'pointer',
          }}
        >{savingNotes ? 'Saving…' : 'Save Notes'}</button>
      </div>

      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Tags</h4>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 10px' }}>
          Auto tags (computed from data) on top, your manual tags below.
        </p>

        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>Auto tags ({autoTags.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {autoTags.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>None</span>}
            {autoTags.map(t => (
              <span key={t} style={{
                fontSize: 10, fontFamily: 'var(--mono)', padding: '3px 8px',
                background: 'var(--surface2)', borderRadius: 4, color: 'var(--text3)',
              }}>{t}</span>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>Manual tags ({manualTags.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {manualTags.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontFamily: 'var(--mono)', padding: '3px 4px 3px 8px',
                background: 'var(--accent)', borderRadius: 4, color: '#000', fontWeight: 700,
              }}>
                {t}
                <button
                  onClick={() => onRemoveTag(t)}
                  style={{
                    background: 'rgba(0,0,0,.2)', border: 'none', borderRadius: 3,
                    width: 14, height: 14, cursor: 'pointer', padding: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#000', fontSize: 11,
                  }}
                >×</button>
              </span>
            ))}
            {manualTags.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>None yet</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newTagInput}
              onChange={e => onChangeNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onAddTag() }}
              placeholder="e.g. vip, flagged, callback"
              style={{
                flex: 1, padding: '6px 10px', fontSize: 11,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)',
              }}
            />
            <button
              onClick={onAddTag}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600,
                color: 'var(--text)', cursor: 'pointer',
              }}
            >Add</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function ActionRow({ icon, text, tone }: { icon: string; text: string; tone: 'success' | 'warning' | 'info' }) {
  const colors = {
    success: { bg: '#10b98120', fg: '#10b981' },
    warning: { bg: '#f59e0b20', fg: '#f59e0b' },
    info:    { bg: '#3b82f620', fg: '#3b82f6' },
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: 10, borderRadius: 8,
      background: colors[tone].bg,
      borderLeft: `2px solid ${colors[tone].fg}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{text}</div>
    </div>
  )
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display)',
  fontSize: 14,
  fontWeight: 700,
}

const thStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'var(--mono)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text3)',
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--text)',
}

const timelineRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
}
