import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── TYPES ─────────────────────────────────────
interface ReceiptSettings {
  logo_url: string
  company_name: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
  instagram: string
  tin: string
  vrn: string
  primary_color: string
  accent_color: string
  konnect_url: string
  konnect_enabled: boolean
  community_url: string
  community_enabled: boolean
  community_name: string
  community_qr_enabled: boolean
  show_crown_points: boolean
  show_vat_breakdown: boolean
  show_cashier: boolean
  show_care_tip: boolean
  show_stage_message: boolean
  konnect_utm_tracking: boolean
  footer_message: string
  msg_pregnant: string
  msg_postpartum: string
  msg_general: string
}

interface VoucherData {
  ref: string
  posting_date: string
  description: string
  total_amount: number
  vat_amount: number
  subtotal: number
  payment_method: string
  notes: string
  posted_by: string
  customers: { name: string; whatsapp: string; pregnancy_stage: string; crown_points: number } | null
  voucher_lines: { qty: number; unit_price: number; total: number; products: { name: string; sku: string; category: string } | null }[]
}

const DEFAULT_SETTINGS: ReceiptSettings = {
  logo_url: '',
  company_name: 'Malkia Wellness Group Ltd',
  tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania',
  phone: '+255 700 000 000',
  email: 'hello@malkia.co.tz',
  website: 'www.malkia.co.tz',
  instagram: '@malkia_tz',
  tin: '—',
  vrn: '—',
  primary_color: '#85c2be',
  accent_color: '#f7a6ad',
  konnect_url: 'https://www.malkia.co.tz/join',
  konnect_enabled: true,
  community_url: '',
  community_enabled: false,
  community_name: 'Mama Community',
  community_qr_enabled: false,
  show_crown_points: true,
  show_vat_breakdown: true,
  show_cashier: true,
  show_care_tip: true,
  show_stage_message: true,
  konnect_utm_tracking: true,
  footer_message: 'Share your Malkia moment — tag us on Instagram',
  msg_pregnant: 'You are doing something extraordinary. Every choice you make matters, Mama.',
  msg_postpartum: 'The hardest work is invisible. We see you, and we are with you.',
  msg_general: 'Motherhood deserves better. That is why we exist.',
}

const CARE_TIPS: Record<string, string> = {
  'Feeding': 'Tip: Hold your baby skin-to-skin for at least the first hour after birth to support natural breastfeeding.',
  'Postpartum': 'Tip: Wear your belly binder consistently for 8–12 hours daily for best results. Start from day 3 postpartum.',
  'Comfort': 'Tip: Use your pregnancy pillow in a C-shape — one end between your knees, the other supporting your belly.',
  'Supplements': 'Tip: Take your prenatal supplement with food to reduce nausea. Consistency matters more than timing.',
  'Skincare': 'Tip: Apply your product twice daily — morning after shower and evening before bed — for best results.',
  'default': 'Tip: Questions about your purchase? WhatsApp our midwife team anytime. We are here for you.',
}

// ── QR CODE GENERATOR (simple SVG-based) ──────
const QRPlaceholder = ({ size = 80, color = '#1a1a1a' }: { url?: string; size?: number; color?: string }) => {
  // We generate a visual placeholder that communicates QR intent
  // Real QR generation would use a library like qrcode.react
  return (
    <div style={{ width: size, height: size, background: '#fff', padding: 4, borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}20` }}>
      <svg width={size - 8} height={size - 8} viewBox="0 0 100 100" style={{ opacity: 0.15 }}>
        <rect x="0" y="0" width="40" height="40" fill={color} rx="4"/>
        <rect x="10" y="10" width="20" height="20" fill="#fff" rx="2"/>
        <rect x="60" y="0" width="40" height="40" fill={color} rx="4"/>
        <rect x="70" y="10" width="20" height="20" fill="#fff" rx="2"/>
        <rect x="0" y="60" width="40" height="40" fill={color} rx="4"/>
        <rect x="10" y="70" width="20" height="20" fill="#fff" rx="2"/>
        <rect x="55" y="55" width="10" height="10" fill={color}/>
        <rect x="70" y="55" width="10" height="10" fill={color}/>
        <rect x="85" y="55" width="10" height="10" fill={color}/>
        <rect x="55" y="70" width="10" height="10" fill={color}/>
        <rect x="70" y="70" width="10" height="10" fill={color}/>
        <rect x="55" y="85" width="10" height="10" fill={color}/>
        <rect x="85" y="85" width="10" height="10" fill={color}/>
      </svg>
      <div style={{ fontSize: 7, color, fontFamily: 'monospace', marginTop: 2, textAlign: 'center', lineHeight: 1.2, opacity: 0.5 }}>Scan to join</div>
    </div>
  )
}

// ── RECEIPT COMPONENT ─────────────────────────
export const MalkiaReceipt = ({ voucher, settings }: { voucher: VoucherData; settings: ReceiptSettings }) => {
  const s = settings
  const p = s.primary_color
  const a = s.accent_color
  const cust = voucher.customers
  const stage = cust?.pregnancy_stage || 'general'
  const crownPts = Math.round((voucher.total_amount || 0) / 1000)

  const stageMsg = stage.toLowerCase().includes('pregnant') || stage.toLowerCase().includes('wks')
    ? s.msg_pregnant
    : stage.toLowerCase().includes('postpartum')
    ? s.msg_postpartum
    : s.msg_general

  const mainCategory = voucher.voucher_lines?.[0]?.products?.category || 'default'
  const careTip = CARE_TIPS[mainCategory] || CARE_TIPS['default']

  const konnectUrl = s.konnect_utm_tracking
    ? `${s.konnect_url}?ref=${voucher.ref}&utm_source=receipt&utm_medium=pdf&utm_campaign=cs`
    : s.konnect_url

  const vat = voucher.vat_amount || Math.round((voucher.total_amount || 0) * 18 / 118)
  const net = (voucher.total_amount || 0) - vat

  return (
    <div id="malkia-receipt" style={{
      width: 400,
      background: '#fdfcfb',
      fontFamily: "'Instrument Sans', 'Helvetica Neue', sans-serif",
      color: '#1a1a1a',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,.12)',
    }}>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${p} 0%, ${p}dd 100%)`, padding: '24px 24px 20px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `${a}30` }}></div>
        <div style={{ position: 'absolute', bottom: -30, left: 60, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {s.logo_url && <img src={s.logo_url} alt="Logo" style={{ height: 48, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />}
            <div>
              <div style={{ fontFamily: "'Syne', 'Georgia', serif", fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.company_name}</div>
              <div style={{ fontSize: 11, color: `${a}`, fontStyle: 'italic', marginTop: 4, fontWeight: 500 }}>{s.tagline}</div>
            </div>
          </div>
          {!s.logo_url && (
            <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 22, height: 22, background: a, borderRadius: 6 }}></div>
            </div>
          )}
        </div>

        {/* Receipt ref */}
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.7)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1 }}>Receipt</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: '#fff' }}>{voucher.ref}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.7)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1 }}>Date</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#fff' }}>{voucher.posting_date}</div>
          </div>
        </div>
      </div>

      {/* STAGE MESSAGE */}
      {s.show_stage_message && (
        <div style={{ background: `${a}15`, borderLeft: `3px solid ${a}`, padding: '12px 16px', margin: '0' }}>
          <div style={{ fontSize: 12, color: '#5a3a3a', fontStyle: 'italic', lineHeight: 1.5 }}>{stageMsg}</div>
        </div>
      )}

      {/* CUSTOMER */}
      {cust && (
        <div style={{ padding: '14px 20px', borderBottom: '1px dashed #e8e0e0' }}>
          <div style={{ fontSize: 9, color: '#999', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Billed to</div>
          <div style={{ fontFamily: "'Syne', serif", fontSize: 15, fontWeight: 700 }}>{cust.name}</div>
          <div style={{ fontSize: 11, color: '#888', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{cust.whatsapp} · {cust.pregnancy_stage || 'Mama'}</div>
        </div>
      )}

      {/* LINE ITEMS */}
      <div style={{ padding: '14px 20px' }}>
        <div style={{ fontSize: 9, color: '#999', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Items Purchased</div>
        {(voucher.voucher_lines || []).map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f5f0f0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{line.products?.name || '—'}</div>
              <div style={{ fontSize: 10, color: '#aaa', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{line.products?.sku} · Qty: {line.qty} × {(line.unit_price || 0).toLocaleString()}</div>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: '#1a1a1a', paddingLeft: 12 }}>{(line.total || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* TOTALS */}
      <div style={{ padding: '0 20px 14px' }}>
        {s.show_vat_breakdown && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#888' }}>
              <span>Net (excl. VAT)</span>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{net.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#888' }}>
              <span>VAT (18% inclusive)</span>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{vat.toLocaleString()}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0', borderTop: '2px solid #f0e8e8', marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Total Paid</div>
            <div style={{ fontSize: 10, color: '#aaa', fontFamily: "'DM Mono', monospace" }}>{voucher.payment_method}</div>
          </div>
          <div style={{ fontFamily: "'Syne', serif", fontSize: 22, fontWeight: 800, color: p }}>TZS {(voucher.total_amount || 0).toLocaleString()}</div>
        </div>
        {s.show_cashier && voucher.posted_by && (
          <div style={{ fontSize: 10, color: '#bbb', fontFamily: "'DM Mono', monospace", marginTop: 6, textAlign: 'right' }}>Served by: {voucher.posted_by}</div>
        )}
      </div>

      {/* CROWN POINTS */}
      {s.show_crown_points && (
        <div style={{ margin: '0 20px 14px', background: `linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, color: '#888', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Crown Points</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: "'Syne', serif", fontSize: 20, fontWeight: 800, color: a }}>+{crownPts}</span>
                <span style={{ fontSize: 10, color: '#888' }}>earned this purchase</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#888', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Total Balance</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 600, color: '#fff' }}>{((cust?.crown_points || 0) + crownPts).toLocaleString()} pts</div>
            </div>
          </div>
        </div>
      )}

      {/* CARE TIP */}
      {s.show_care_tip && (
        <div style={{ margin: '0 20px 14px', background: `${p}12`, border: `1px solid ${p}30`, borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: p, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>Midwife Tip</div>
          <div style={{ fontSize: 11, color: '#5a6a6a', lineHeight: 1.5 }}>{careTip}</div>
        </div>
      )}

      {/* DIVIDER */}
      <div style={{ margin: '0 20px', borderTop: '1px dashed #e0d8d8' }}></div>

      {/* KONNECT CTA */}
      {s.konnect_enabled && (
        <div style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#aaa', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Your Personal Midwife, On Demand</div>
          <div style={{ fontFamily: "'Syne', serif", fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>Join Malkia Konnect</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12, lineHeight: 1.5 }}>Weekly guidance · Expert Q&A · Birth prep classes · Postpartum support</div>
          <a href={konnectUrl} style={{ display: 'inline-block', background: a, color: '#fff', padding: '10px 24px', borderRadius: 50, fontSize: 12, fontWeight: 700, textDecoration: 'none', fontFamily: "'Instrument Sans', sans-serif", letterSpacing: 0.3 }}>
            Join Konnect →
          </a>
          <div style={{ fontSize: 9, color: '#ccc', fontFamily: "'DM Mono', monospace", marginTop: 8 }}>{s.konnect_url}</div>
        </div>
      )}

      {/* COMMUNITY — placeholder ready for future */}
      {s.community_enabled && s.community_url && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ background: `${p}10`, border: `1px solid ${p}25`, borderRadius: 10, padding: '14px', display: 'flex', gap: 14, alignItems: 'center' }}>
            {s.community_qr_enabled && <QRPlaceholder url={s.community_url} size={70} color={p} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: p, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>{s.community_name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Join the Community</div>
              <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>Connect with mothers at every stage of the journey</div>
              {!s.community_qr_enabled && s.community_url && (
                <a href={s.community_url} style={{ fontSize: 10, color: p, fontFamily: "'DM Mono', monospace", display: 'block', marginTop: 6 }}>{s.community_url}</a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ background: '#1a1a1a', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, color: '#666', fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>{s.instagram} · {s.website}</div>
          <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>{s.footer_message}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#555', fontFamily: "'DM Mono', monospace" }}>TIN: {s.tin}</div>
          <div style={{ fontSize: 9, color: '#555', fontFamily: "'DM Mono', monospace" }}>VRN: {s.vrn}</div>
        </div>
      </div>
    </div>
  )
}

// ── PREVIEW PAGE ──────────────────────────────

// ── STANDALONE FIELD + TOGGLE (outside component to prevent focus loss) ──
const ReceiptField = ({
  label, k, placeholder, multiline, settings, onChange
}: {
  label: string; k: string; placeholder?: string; multiline?: boolean
  settings: any; onChange: (k: any, v: any) => void
}) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
    {multiline
      ? <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={String(settings[k] ?? '')} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} />
      : <input className="form-input" style={{ fontSize: 12 }} value={String(settings[k] ?? '')} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} />
    }
  </div>
)

const ReceiptToggle = ({
  label, desc, k, settings, onToggle
}: {
  label: string; desc: string; k: string
  settings: any; onToggle: (k: any, v: any) => void
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>
    </div>
    <div onClick={() => onToggle(k, !settings[k])} style={{ width: 44, height: 24, background: settings[k] ? 'var(--green)' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 16 }}>
      <div style={{ position: 'absolute', top: 2, left: settings[k] ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
    </div>
  </div>
)

export default function ReceiptTemplatePage() {
  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview')

  // Sample voucher for preview
  const SAMPLE_VOUCHER: VoucherData = {
    ref: 'CS-0042', posting_date: new Date().toISOString().split('T')[0],
    description: 'Cash Sale — Fatuma Said',
    total_amount: 185000, vat_amount: 26695, subtotal: 158305,
    payment_method: 'M-Pesa', notes: '', posted_by: 'Barbra Kabendera',
    customers: { name: 'Fatuma Said', whatsapp: '+255 743 100 212', pregnancy_stage: '28 weeks Pregnant', crown_points: 1240 },
    voucher_lines: [
      { qty: 1, unit_price: 120000, total: 120000, products: { name: 'U-Shape Pregnancy Pillow', sku: 'MK-003', category: 'Comfort' } },
      { qty: 2, unit_price: 32500, total: 65000, products: { name: 'Nipple Cream', sku: 'MK-007', category: 'Feeding' } },
    ],
  }

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'receipt_template').single()
    if (data?.value) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(data.value) })
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('system_settings').upsert({ key: 'receipt_template', value: JSON.stringify(settings) }, { onConflict: 'key' })
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  const set = (k: keyof ReceiptSettings, v: string | boolean) => setSettings(s => ({ ...s, [k]: v }))

  const printPreview = () => {
    const el = document.getElementById('malkia-receipt')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Receipt ${SAMPLE_VOUCHER.ref}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { display: flex; justify-content: center; padding: 40px; background: #f0f0f0; }
        @media print { body { background: #fff; padding: 0; } }
      </style>
      </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const TabBtn = ({ id, label }: { id: typeof activeTab; label: string }) => (
    <button onClick={() => setActiveTab(id)} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: activeTab === id ? 'var(--accent)' : 'transparent', color: activeTab === id ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s' }}>{label}</button>
  )





  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Receipt Template</div>
          <div className="page-sub">Branded cash sale receipt · PDF & print-ready · Malkia identity</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4 }}>
            <TabBtn id="preview" label="Preview" />
            <TabBtn id="settings" label="Settings" />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={printPreview}>Print / PDF</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </div>

      {activeTab === 'preview' ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Receipt preview */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <MalkiaReceipt voucher={SAMPLE_VOUCHER} settings={settings} />
          </div>
          {/* Quick toggles */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Quick Toggles</div>
              <ReceiptToggle settings={settings} onToggle={set} label="Crown Points" desc="Show loyalty points section" k="show_crown_points" />
              <ReceiptToggle settings={settings} onToggle={set} label="Stage Message" desc="Personalized message by pregnancy stage" k="show_stage_message" />
              <ReceiptToggle settings={settings} onToggle={set} label="Midwife Tip" desc="Product care tip relevant to purchase" k="show_care_tip" />
              <ReceiptToggle settings={settings} onToggle={set} label="VAT Breakdown" desc="Show net + VAT separately" k="show_vat_breakdown" />
              <ReceiptToggle settings={settings} onToggle={set} label="Cashier Name" desc="Show who served the customer" k="show_cashier" />
              <ReceiptToggle settings={settings} onToggle={set} label="Konnect CTA" desc="Join Malkia Konnect button" k="konnect_enabled" />
              <ReceiptToggle settings={settings} onToggle={set} label="Community Section" desc="Mama community link/QR" k="community_enabled" />
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Brand Colors</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Primary (Teal)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                  <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Accent (Blush)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                  <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid g2" style={{ gap: 20 }}>
          {/* Brand */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Brand Identity</div>
            <ReceiptField settings={settings} onChange={set} label="Company Name" k="company_name" />
            <ReceiptField settings={settings} onChange={set} label="Tagline" k="tagline" placeholder="Reimagining Motherhood" />
            <ReceiptField settings={settings} onChange={set} label="Address" k="address" />
            <div className="form-row">
              <ReceiptField settings={settings} onChange={set} label="Phone" k="phone" />
              <ReceiptField settings={settings} onChange={set} label="Email" k="email" />
            </div>
            <div className="form-row">
              <ReceiptField settings={settings} onChange={set} label="Website" k="website" />
              <ReceiptField settings={settings} onChange={set} label="Instagram" k="instagram" />
            </div>
            <div className="form-row">
              <ReceiptField settings={settings} onChange={set} label="TIN Number" k="tin" />
              <ReceiptField settings={settings} onChange={set} label="VRN Number" k="vrn" />
            </div>
            <ReceiptField settings={settings} onChange={set} label="Footer Message" k="footer_message" multiline />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Konnect */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Malkia Konnect</div>
              <ReceiptToggle settings={settings} onToggle={set} label="Show Konnect CTA" desc="Include join button on receipt" k="konnect_enabled" />
              <ReceiptToggle settings={settings} onToggle={set} label="UTM Tracking" desc="Add tracking params to link" k="konnect_utm_tracking" />
              <div style={{ marginTop: 12 }}>
                <ReceiptField settings={settings} onChange={set} label="Konnect Join URL" k="konnect_url" placeholder="https://www.malkia.co.tz/join" />
              </div>
            </div>

            {/* Community — ready for future */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Mama Community</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, fontFamily: 'var(--mono)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 'var(--r)' }}>
                Community is being built — configure now, activate when ready
              </div>
              <ReceiptField settings={settings} onChange={set} label="Community Name" k="community_name" placeholder="e.g. Malkia Mama Circle" />
              <ReceiptField settings={settings} onChange={set} label="Community URL" k="community_url" placeholder="https://community.malkia.co.tz" />
              <ReceiptToggle settings={settings} onToggle={set} label="Enable Community Section" desc="Show on receipt when URL is ready" k="community_enabled" />
              <ReceiptToggle settings={settings} onToggle={set} label="Show QR Code" desc="Display scannable QR code" k="community_qr_enabled" />
            </div>

            {/* Stage messages */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Brand Messages by Stage</div>
              <ReceiptField settings={settings} onChange={set} label="Pregnant Customers" k="msg_pregnant" multiline />
              <ReceiptField settings={settings} onChange={set} label="Postpartum Customers" k="msg_postpartum" multiline />
              <ReceiptField settings={settings} onChange={set} label="General / Other" k="msg_general" multiline />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
