import { useState } from 'react'

// ── TYPES ──────────────────────────────────────────
type Page = 'dashboard' | 'vouchers' | 'chart-of-accounts' | 'cash-sale' |
  'cash-payment' | 'cash-receipt' | 'bank-payment' | 'bank-receipt' |
  'bank-transfer' | 'petty-cash' | 'contra' |
  'sales-invoice' | 'quotation' | 'sales-return' | 'debit-note' | 'credit-note' |
  'purchase-order' | 'grn' | 'purchase-invoice' | 'purchase-return' |
  'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry' |
  'sales' | 'inventory' | 'reports' | 'pnl' | 'sales-register' |
  'purchase-register' | 'payment-register' | 'trial-balance' | 'settings' |
  'coming-soon' | 'stock-levels' | 'suppliers' | 'stock-movements'

// ── DEMO DATA ──────────────────────────────────────
const PRODUCTS = [
  { id:'1', sku:'MK-001', name:'Breast Pump — Elite', category:'Feeding', cost:95000, price:185000, qty:4, reorder:10 },
  { id:'2', sku:'MK-002', name:'Belly Binder — Large', category:'Postpartum', cost:35000, price:68000, qty:8, reorder:15 },
  { id:'3', sku:'MK-003', name:'U-Shape Pregnancy Pillow', category:'Comfort', cost:75000, price:145000, qty:24, reorder:10 },
  { id:'4', sku:'MK-004', name:'Nipple Cream — 60ml', category:'Feeding', cost:22000, price:42000, qty:11, reorder:20 },
  { id:'5', sku:'MK-005', name:'Scar Sheet za Malkia', category:'Postpartum', cost:45000, price:85000, qty:31, reorder:10 },
  { id:'6', sku:'MK-006', name:'PeaceTouch Belly Binder', category:'Postpartum', cost:55000, price:105000, qty:18, reorder:12 },
  { id:'7', sku:'MK-007', name:'Folic Acid Supplements', category:'Supplements', cost:8000, price:18000, qty:45, reorder:20 },
  { id:'8', sku:'MK-008', name:'DHA Omega-3 Capsules', category:'Supplements', cost:22000, price:45000, qty:28, reorder:15 },
]

const ACCOUNTS = [
  { id:'a1', code:'1010', name:'Cash — DSM HQ Till', type:'asset' },
  { id:'a2', code:'1020', name:'M-Pesa — Business Account', type:'asset' },
  { id:'a3', code:'1030', name:'CRDB Bank — TZS Operating', type:'asset' },
  { id:'a4', code:'1031', name:'CRDB Bank — USD Account', type:'asset' },
  { id:'a5', code:'1040', name:'Petty Cash — DSM HQ', type:'asset' },
  { id:'a6', code:'1050', name:'Accounts Receivable — B2B', type:'asset' },
  { id:'a7', code:'1110', name:'Inventory — Maternity Products', type:'asset' },
  { id:'a8', code:'2010', name:'Accounts Payable — Import Suppliers', type:'liability' },
  { id:'a9', code:'2011', name:'Accounts Payable — Local Suppliers', type:'liability' },
  { id:'a10', code:'2020', name:'VAT Payable — Output Tax', type:'liability' },
  { id:'a11', code:'2050', name:'Deferred Revenue — Konnect', type:'liability' },
  { id:'a12', code:'4010', name:'Sales — Maternity Products B2C', type:'revenue' },
  { id:'a13', code:'4110', name:'Konnect Subscription Revenue', type:'revenue' },
  { id:'a14', code:'5010', name:'COGS — Maternity Products', type:'cogs' },
  { id:'a15', code:'6010', name:'Salaries — Full-Time Staff', type:'expense' },
  { id:'a16', code:'6110', name:'Rent — DSM HQ Office', type:'expense' },
  { id:'a17', code:'6210', name:'Social Media Advertising', type:'expense' },
  { id:'a18', code:'6310', name:'Software Subscriptions', type:'expense' },
  { id:'a19', code:'6410', name:'Delivery — Last Mile DSM', type:'expense' },
  { id:'a20', code:'6512', name:'Bank Charges & Transfer Fees', type:'expense' },
]

const SUPPLIERS = [
  { id:'s1', name:'Meditech International', currency:'USD', balance: 2100000 },
  { id:'s2', name:'PharmaCare Global', currency:'USD', balance: 980000 },
  { id:'s3', name:'Meditech Tanzania (Local)', currency:'TZS', balance: 340000 },
  { id:'s4', name:'PharmaCare Ltd Tanzania', currency:'TZS', balance: 120000 },
]

const CUSTOMERS: Record<string,{name:string;stage:string;last:string;ai:string;points:number}> = {
  '255712345678':{ name:'Amina Hassan', stage:'28 wks pregnant', last:'Breast pump · TZS 185,000 · 2 days ago', ai:'💡 She may need a belly binder or hospital bag kit soon', points:1850 },
  '255758221043':{ name:'Grace Mwanza', stage:'6 wks postpartum', last:'Nipple cream · TZS 95,000 · 1 week ago', ai:'💡 Recommend Scar Sheet za Malkia at this stage', points:950 },
  '255743100212':{ name:'Fatuma Iddi', stage:'34 wks pregnant', last:'Pregnancy pillow · TZS 145,000 · 5 days ago', ai:'💡 Hospital bag kit or breast pump next', points:1450 },
]

const tzs = (n:number) => 'TZS ' + Math.round(n).toLocaleString()
const getStatus = (qty:number, reorder:number) => qty === 0 ? 'critical' : qty <= reorder ? (qty <= reorder*0.5 ? 'critical' : 'low') : 'ok'
const greeting = () => { const h = new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening' }
const today = () => new Date().toISOString().split('T')[0]
const genRef = (prefix:string, num:number) => `${prefix}-${String(num).padStart(4,'0')}`

// ── SHARED COMPONENTS ──────────────────────────────

function Topbar({ breadcrumb, onNav }: { breadcrumb:string; onNav:(p:Page)=>void }) {
  return (
    <div style={{ height:'var(--topbar)', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:14, flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:180 }}>
        <div style={{ width:30, height:30, background:'var(--accent)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }} onClick={()=>onNav('dashboard')}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="white"><circle cx="11" cy="7.5" r="4.5"/><path d="M2 20c0-5 4-9 9-9s9 4 9 9"/></svg>
        </div>
        <div style={{ fontFamily:'var(--display)', fontSize:16, fontWeight:800, color:'var(--text)', cursor:'pointer' }} onClick={()=>onNav('dashboard')}>
          Malkia<span style={{ color:'var(--accent)' }}>OS</span>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--text3)', fontFamily:'var(--mono)' }}>
        Wellness Group <span style={{ opacity:.4 }}>›</span> <span style={{ color:'var(--text2)' }}>{breadcrumb}</span>
      </div>
      <div style={{ flex:1, maxWidth:400, margin:'0 auto', position:'relative' }}>
        <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13 }}>🔍</span>
        <input placeholder="Search transactions, products, accounts…" style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'7px 36px 7px 32px', color:'var(--text)', fontSize:12, outline:'none' }} />
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:'auto' }}>
        <span style={{ background:'var(--yellow-dim)', border:'1px solid var(--yellow)', borderRadius:6, padding:'3px 9px', fontFamily:'var(--mono)', fontSize:10, color:'var(--yellow)' }}>FY 2025–26</span>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 10px', cursor:'pointer' }}>
          <div style={{ width:24, height:24, background:'linear-gradient(135deg,var(--accent),#e05c3a)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--display)', fontSize:10, fontWeight:700, color:'#fff' }}>JG</div>
          <div>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--text)' }}>Joe Gembe</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>Super Admin</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { icon:'📊', label:'Home', page:'dashboard' as Page },
  { sep:true },
  { icon:'📝', label:'Vouchers', page:'vouchers' as Page },
  { icon:'📒', label:'Accounts', page:'chart-of-accounts' as Page },
  { icon:'🛒', label:'Sales', page:'sales' as Page, badge:'7' },
  { icon:'📦', label:'Inventory', page:'inventory' as Page },
  { icon:'📈', label:'Reports', page:'reports' as Page },
  { sep:true },
  { icon:'⚕️', label:'Services', page:'coming-soon' as Page, coming:true },
  { icon:'💬', label:'Konnect', page:'coming-soon' as Page, coming:true },
  { icon:'🌐', label:'CRM', page:'coming-soon' as Page, coming:true },
  { icon:'👥', label:'HRM', page:'coming-soon' as Page, coming:true },
  { sep:true },
  { icon:'⚙️', label:'Settings', page:'settings' as Page },
]

function Sidebar({ current, onNav }: { current:Page; onNav:(p:Page)=>void }) {
  const voucherPages:Page[] = ['cash-sale','cash-payment','cash-receipt','bank-payment','bank-receipt','bank-transfer','petty-cash','contra','sales-invoice','quotation','sales-return','debit-note','credit-note','purchase-order','grn','purchase-invoice','purchase-return','opening-stock','stock-adjustment','stock-transfer','journal-entry']
  return (
    <div style={{ width:'var(--sidebar)', background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', flexShrink:0, overflowY:'auto', scrollbarWidth:'none' }}>
      {NAV_ITEMS.map((item, i) => {
        if ('sep' in item && item.sep) return <div key={i} style={{ width:36, height:1, background:'var(--border)', margin:'6px 0' }} />
        const isVoucherPage = voucherPages.includes(current)
        const active = current === item.page || (item.page === 'vouchers' && isVoucherPage) || (item.page === 'sales' && current === 'cash-sale')
        return (
          <div key={i} onClick={() => !item.coming && item.page && onNav(item.page)}
            style={{ width:52, height:52, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, borderRadius:10, borderLeft:`2px solid ${active?'var(--accent)':'transparent'}`, background:active?'var(--accent-dim)':'transparent', opacity:item.coming?0.4:1, transition:'all .15s', margin:'1px 0', position:'relative', cursor:item.coming?'default':'pointer' }}>
            <span style={{ fontSize:18 }}>{item.icon}</span>
            <span style={{ fontSize:8, fontWeight:600, color:active?'var(--accent)':'var(--text3)', textTransform:'uppercase', letterSpacing:'.4px' }}>{item.label}</span>
            {'badge' in item && item.badge && <span style={{ position:'absolute', top:5, right:6, minWidth:14, height:14, background:'var(--red)', borderRadius:7, fontSize:7, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{item.badge}</span>}
            {item.coming && <span style={{ position:'absolute', top:4, right:2, background:'var(--surface3)', border:'1px solid var(--border)', borderRadius:3, fontSize:6, fontFamily:'var(--mono)', color:'var(--text3)', padding:'1px 3px' }}>SOON</span>}
          </div>
        )
      })}
    </div>
  )
}

function Toast({ message, type='success', onClose }: { message:string; type?:'success'|'error'; onClose:()=>void }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', bottom:20, right:20, background:'var(--surface)', border:`1px solid ${type==='success'?'var(--green)':'var(--red)'}`, borderRadius:'var(--r)', padding:'14px 18px', display:'flex', alignItems:'center', gap:12, fontSize:13, boxShadow:'0 10px 40px rgba(0,0,0,.5)', zIndex:1000, maxWidth:460, cursor:'pointer' }}>
      <span style={{ fontSize:18 }}>{type==='success'?'✅':'❌'}</span>
      <span>{message}</span>
    </div>
  )
}

// ── VOUCHER PAGE WRAPPER ───────────────────────────
function VoucherPage({ title, icon, subtitle, color, children, onPost, onDraft, postLabel='📤 Post Voucher', journalNote }: {
  title:string; icon:string; subtitle:string; color:string;
  children:React.ReactNode; onPost:()=>void; onDraft?:()=>void;
  postLabel?:string; journalNote?:string;
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:14, background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{icon}</div>
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={onDraft}>📋 Save Draft</button>
          <button className="btn btn-primary" onClick={onPost}>{postLabel}</button>
        </div>
      </div>
      {journalNote && (
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:20, fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ color:'var(--accent)' }}>⚡ Auto-journal:</span> {journalNote}
        </div>
      )}
      {children}
    </div>
  )
}

// ── FORM HELPERS ──────────────────────────────────
function FG({ label, req, children }: { label:string; req?:boolean; children:React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{req && <span className="req"> *</span>}</label>
      {children}
    </div>
  )
}

function AccountSelect({ value, onChange, label, req }: { value:string; onChange:(v:string)=>void; label:string; req?:boolean }) {
  return (
    <FG label={label} req={req}>
      <select className="form-input" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">— Select account —</option>
        {ACCOUNTS.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
      </select>
    </FG>
  )
}

// ── LINE ITEMS TABLE ───────────────────────────────
interface LineItem { productId:string; desc:string; qty:number; price:number; amount:number }

function LineItemsTable({ lines, setLines, showProduct=true, showPrice=true, priceLabel='Price (TZS)' }: {
  lines:LineItem[]; setLines:(l:LineItem[])=>void;
  showProduct?:boolean; showPrice?:boolean; priceLabel?:string;
}) {
  const update = (i:number, field:keyof LineItem, val:string|number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if(field==='qty' || field==='price') nl[i].amount = nl[i].qty * nl[i].price
    if(field==='productId') {
      const p = PRODUCTS.find(p=>p.id===val)
      if(p) { nl[i].desc=p.name; nl[i].price=p.price; nl[i].amount=nl[i].qty*p.price }
    }
    setLines(nl)
  }
  const add = () => setLines([...lines, { productId:'', desc:'', qty:1, price:0, amount:0 }])
  const remove = (i:number) => setLines(lines.filter((_,idx)=>idx!==i))
  const subtotal = lines.reduce((s,l)=>s+l.amount, 0)
  const vat = Math.round(subtotal*0.18)
  const total = subtotal+vat

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom:8 }}>
        <table>
          <thead>
            <tr>
              {showProduct && <th>Product</th>}
              <th>Description</th>
              <th style={{ width:80, textAlign:'center' }}>Qty</th>
              {showPrice && <th style={{ textAlign:'right', width:150 }}>{priceLabel}</th>}
              <th style={{ textAlign:'right', width:150 }}>Amount (TZS)</th>
              <th style={{ width:40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line,i)=>(
              <tr key={i}>
                {showProduct && (
                  <td>
                    <select className="form-input" style={{ fontSize:12, padding:'6px 8px' }} value={line.productId} onChange={e=>update(i,'productId',e.target.value)}>
                      <option value="">— Select —</option>
                      {PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                )}
                <td><input className="form-input" style={{ fontSize:12, padding:'6px 8px' }} value={line.desc} onChange={e=>update(i,'desc',e.target.value)} placeholder="Description" /></td>
                <td><input className="form-input" type="number" style={{ fontSize:12, padding:'6px 8px', textAlign:'center' }} value={line.qty} min={1} onChange={e=>update(i,'qty',parseInt(e.target.value)||1)} /></td>
                {showPrice && <td><input className="form-input" type="number" style={{ fontSize:12, padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)' }} value={line.price} onChange={e=>update(i,'price',parseInt(e.target.value)||0)} /></td>}
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'var(--text)' }}>{line.amount.toLocaleString()}</td>
                <td><button onClick={()=>remove(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={add} style={{ marginBottom:16 }}>+ Add Line</button>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <div style={{ width:280, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0' }}><span style={{ color:'var(--text3)' }}>Subtotal</span><span style={{ fontFamily:'var(--mono)' }}>{subtotal.toLocaleString()}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0' }}><span style={{ color:'var(--text3)' }}>VAT (18%)</span><span style={{ fontFamily:'var(--mono)', color:'var(--accent)' }}>{vat.toLocaleString()}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, padding:'10px 0 0', borderTop:'1px solid var(--border2)', marginTop:6 }}><span>TOTAL</span><span style={{ fontFamily:'var(--mono)', color:'var(--green)' }}>{tzs(total)}</span></div>
        </div>
      </div>
    </div>
  )
}

// ── VOUCHER: CASH PAYMENT ─────────────────────────
function CashPayment({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('CPV',32), payTo:'', expAccount:'', cashAccount:'1010', amount:'', chequeNo:'', narration:'', branch:'DSM HQ' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr ${form.expAccount || 'Expense'} / Cr Cash — Journal created`); onNav('vouchers') }
  return (
    <VoucherPage title="Cash Payment" icon="💸" subtitle="Record a cash expense or supplier payment" color="rgba(255,71,87,.12)"
      onPost={post} journalNote="Dr Expense/Supplier Account · Cr Cash Account">
      <div className="grid g2" style={{ gap:20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Payment Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          </div>
          <FG label="Pay To (Payee)" req><input className="form-input" placeholder="e.g. Meditech Tanzania, John Msomi" value={form.payTo} onChange={e=>set('payTo',e.target.value)} /></FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} placeholder="0" value={form.amount} onChange={e=>set('amount',e.target.value)} /></FG>
            <FG label="Branch"><select className="form-input" value={form.branch} onChange={e=>set('branch',e.target.value)}><option>DSM HQ</option><option>Arusha Branch</option></select></FG>
          </div>
          <FG label="Narration / Description"><textarea className="form-input" rows={3} placeholder="What was this payment for?" value={form.narration} onChange={e=>set('narration',e.target.value)} style={{ resize:'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Accounting</div>
          <FG label="Cash / Bank Account (Credit)" req>
            <select className="form-input" value={form.cashAccount} onChange={e=>set('cashAccount',e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1040">1040 — Petty Cash — DSM HQ</option>
            </select>
          </FG>
          <FG label="Expense / Debit Account" req>
            <select className="form-input" value={form.expAccount} onChange={e=>set('expAccount',e.target.value)}>
              <option value="">— Select account —</option>
              <option value="2010">2010 — Accounts Payable — Import Suppliers</option>
              <option value="2011">2011 — Accounts Payable — Local Suppliers</option>
              <option value="6010">6010 — Salaries</option>
              <option value="6110">6110 — Rent</option>
              <option value="6210">6210 — Social Media Advertising</option>
              <option value="6310">6310 — Software Subscriptions</option>
              <option value="6410">6410 — Delivery — Last Mile</option>
              <option value="6512">6512 — Bank Charges</option>
            </select>
          </FG>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14, marginTop:8 }}>
            <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>Journal Preview</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ color:'var(--blue)' }}>Dr Expense Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0' }}>
              <span style={{ color:'var(--red)' }}>Cr Cash Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
          <div style={{ marginTop:14 }}>
            <FG label="Cheque / Reference No"><input className="form-input" placeholder="e.g. CHQ-001234 or M-Pesa ref" value={form.chequeNo} onChange={e=>set('chequeNo',e.target.value)} /></FG>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: CASH RECEIPT ─────────────────────────
function CashReceipt({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('CRV',28), receivedFrom:'', incomeAccount:'', cashAccount:'1010', amount:'', method:'cash', narration:'', branch:'DSM HQ' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Cash / Cr Income Account — Journal created`); onNav('vouchers') }
  return (
    <VoucherPage title="Cash Receipt" icon="📥" subtitle="Record money received in cash or M-Pesa" color="rgba(0,229,160,.12)"
      onPost={post} journalNote="Dr Cash/M-Pesa Account · Cr Revenue/Customer Account">
      <div className="grid g2" style={{ gap:20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Receipt Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          </div>
          <FG label="Received From" req><input className="form-input" placeholder="e.g. Amina Hassan, Aga Khan Hospital" value={form.receivedFrom} onChange={e=>set('receivedFrom',e.target.value)} /></FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} placeholder="0" value={form.amount} onChange={e=>set('amount',e.target.value)} /></FG>
            <FG label="Payment Method" req>
              <select className="form-input" value={form.method} onChange={e=>set('method',e.target.value)}>
                <option value="cash">💵 Cash</option>
                <option value="mpesa">📱 M-Pesa</option>
                <option value="bank">🏦 Bank Transfer</option>
                <option value="pos">💳 POS Card</option>
              </select>
            </FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={3} placeholder="What is this payment for?" value={form.narration} onChange={e=>set('narration',e.target.value)} style={{ resize:'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Accounting</div>
          <FG label="Deposit To (Debit Account)" req>
            <select className="form-input" value={form.cashAccount} onChange={e=>set('cashAccount',e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
            </select>
          </FG>
          <FG label="Income / Credit Account" req>
            <select className="form-input" value={form.incomeAccount} onChange={e=>set('incomeAccount',e.target.value)}>
              <option value="">— Select account —</option>
              <option value="4010">4010 — Sales B2C</option>
              <option value="4011">4011 — Sales B2B</option>
              <option value="4110">4110 — Konnect Subscription Revenue</option>
              <option value="1050">1050 — Accounts Receivable — B2B</option>
              <option value="2070">2070 — Customer Deposits</option>
            </select>
          </FG>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14, marginTop:8 }}>
            <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>Journal Preview</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ color:'var(--blue)' }}>Dr Cash Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0' }}>
              <span style={{ color:'var(--green)' }}>Cr Income Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--green)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: BANK TRANSFER ────────────────────────
function BankTransfer({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('BTV',14), fromAccount:'1030', toAccount:'1020', amount:'', fxRate:'', narration:'', branch:'DSM HQ' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Target Account / Cr Source Account`); onNav('vouchers') }
  return (
    <VoucherPage title="Bank Transfer" icon="🔁" subtitle="Move funds between your own bank accounts" color="rgba(61,139,255,.12)"
      onPost={post} journalNote="Dr Target Account · Cr Source Account · FX difference to 7010/7011 if cross-currency">
      <div className="grid g2" style={{ gap:20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Transfer Details</div>
          <div className="form-row">
            <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          </div>
          <FG label="From Account" req>
            <select className="form-input" value={form.fromAccount} onChange={e=>set('fromAccount',e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1031">1031 — CRDB Bank — USD Account</option>
              <option value="1040">1040 — Petty Cash — DSM HQ</option>
            </select>
          </FG>
          <FG label="To Account" req>
            <select className="form-input" value={form.toAccount} onChange={e=>set('toAccount',e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1031">1031 — CRDB Bank — USD Account</option>
              <option value="1040">1040 — Petty Cash — DSM HQ</option>
            </select>
          </FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:15, fontWeight:700 }} placeholder="0" value={form.amount} onChange={e=>set('amount',e.target.value)} /></FG>
            <FG label="FX Rate (if USD)"><input className="form-input" placeholder="e.g. 2540" value={form.fxRate} onChange={e=>set('fxRate',e.target.value)} /></FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={2} placeholder="Purpose of transfer" value={form.narration} onChange={e=>set('narration',e.target.value)} style={{ resize:'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Journal Preview</div>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ color:'var(--blue)' }}>Dr To Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0' }}>
              <span style={{ color:'var(--red)' }}>Cr From Account</span>
              <span style={{ fontFamily:'var(--mono)', color:'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
          <div style={{ background:'var(--yellow-dim)', border:'1px solid rgba(255,211,42,.2)', borderRadius:'var(--r)', padding:12, marginTop:14, fontSize:11, color:'var(--yellow)' }}>
            ⚠️ If transferring between TZS and USD accounts, the system will automatically calculate and post the FX difference to account 7010 or 7011.
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: PETTY CASH ───────────────────────────
function PettyCash({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('PCE',45), paidTo:'', approvedBy:'Joe Gembe', narration:'', branch:'DSM HQ' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const total = lines.reduce((s,l)=>s+l.amount,0)
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Expense / Cr Petty Cash · Balance updated`); onNav('vouchers') }
  return (
    <VoucherPage title="Petty Cash Expense" icon="🪙" subtitle="Record small office expenses from petty cash float" color="rgba(255,211,42,.12)"
      onPost={post} journalNote="Dr Expense Account · Cr Petty Cash (1040) · Updates petty cash balance">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title" style={{ marginBottom:16 }}>Expense Details</div>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Paid To" req><input className="form-input" placeholder="e.g. Office supplies shop, Delivery rider" value={form.paidTo} onChange={e=>set('paidTo',e.target.value)} /></FG>
          <FG label="Approved By"><select className="form-input" value={form.approvedBy} onChange={e=>set('approvedBy',e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
        </div>
        <FG label="Narration"><input className="form-input" placeholder="Brief description" value={form.narration} onChange={e=>set('narration',e.target.value)} /></FG>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div className="card-title">Expense Items</div>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'6px 14px', fontFamily:'var(--mono)', fontSize:12 }}>
            Petty Cash Balance: <span style={{ color:'var(--green)' }}>TZS 150,000</span>
          </div>
        </div>
        <LineItemsTable lines={lines} setLines={setLines} showProduct={false} priceLabel="Amount (TZS)" />
      </div>
      <div className="card">
        <div className="form-row">
          <FG label="Expense Account" req>
            <select className="form-input">
              <option>6510 — Office Supplies & Stationery</option>
              <option>6410 — Delivery — Last Mile DSM</option>
              <option>6515 — Miscellaneous Expenses</option>
              <option>6120 — Utilities</option>
            </select>
          </FG>
          <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:14 }}>
            <div style={{ background: total > 150000 ? 'var(--red-dim)' : 'var(--green-dim)', border:`1px solid ${total > 150000 ? 'var(--red)' : 'var(--green)'}`, borderRadius:'var(--r)', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:13 }}>Total</span>
              <span style={{ fontFamily:'var(--mono)', fontWeight:700, color: total > 150000 ? 'var(--red)' : 'var(--green)' }}>{tzs(total)}</span>
            </div>
            {total > 150000 && <div style={{ fontSize:11, color:'var(--red)', marginTop:6 }}>⚠️ Exceeds petty cash balance. Replenishment required.</div>}
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: CASH SALE ────────────────────────────
function CashSale({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [wa, setWa] = useState('')
  const [custName, setCustName] = useState('')
  const [foundCust, setFoundCust] = useState<typeof CUSTOMERS[string]|null>(null)
  const [payment, setPayment] = useState('cash')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [tendered, setTendered] = useState('')
  const [refNum, setRefNum] = useState(43)

  const lookupCust = (val:string) => {
    setWa(val)
    const c = CUSTOMERS[val.replace(/[\s+]/g,'')]
    if(c && val.replace(/[\s+]/g,'').length>=9){ setFoundCust(c); setCustName(c.name) }
    else setFoundCust(null)
  }
  const subtotal = lines.reduce((s,l)=>s+l.amount,0)
  const vat = Math.round(subtotal*0.18)
  const total = subtotal+vat
  const change = tendered ? parseInt(tendered)-total : 0
  const post = () => {
    if(!custName){ setToast('❌ Please enter customer name'); return }
    const ref = genRef('CS', refNum)
    setRefNum(n=>n+1)
    setToast(`✅ ${ref} posted · Dr Cash / Cr Revenue · Dr COGS / Cr Inventory · ${Math.round(total/1000)} Crown pts awarded · WA receipt sent`)
    setWa(''); setCustName(''); setFoundCust(null); setLines([{productId:'',desc:'',qty:1,price:0,amount:0}]); setTendered(''); setPayment('cash')
  }

  const RECENT = [
    {ref:'CS-0042',customer:'Amina Hassan',wa:'+255 712 345 678',products:'Breast pump × 1',amount:185000,payment:'Cash'},
    {ref:'CS-0041',customer:'Grace Mwanza',wa:'+255 758 221 043',products:'Nipple cream × 2',amount:95000,payment:'M-Pesa'},
    {ref:'CS-0040',customer:'Fatuma Iddi',wa:'+255 743 100 212',products:'Belly binder, Pillow',amount:340000,payment:'Cash'},
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(212,135,74,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>💵</div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter POS · WhatsApp receipt auto-sent · Crown points auto-awarded · Stock auto-deducted</div>
          </div>
        </div>
      </div>
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:20, fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)' }}>
        <span style={{ color:'var(--accent)' }}>⚡ Auto-journal:</span> Dr Cash/MPesa · Cr Revenue (4010) · Dr COGS (5010) · Cr Inventory (1110) · VAT to 2020
      </div>
      <div className="grid g2" style={{ gap:20, marginBottom:24 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div className="step-header"><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
            <div className="form-row">
              <FG label="WhatsApp Number" req>
                <input className="form-input" value={wa} onChange={e=>lookupCust(e.target.value)} placeholder="+255 7XX XXX XXX" style={{ borderColor:'var(--accent)' }} />
              </FG>
              <FG label="Customer Name" req>
                <input className="form-input" value={custName} onChange={e=>setCustName(e.target.value)} placeholder="e.g. Fatuma Said" />
              </FG>
            </div>
            {foundCust && (
              <div style={{ background:'var(--surface3)', border:'1px solid var(--green)', borderRadius:'var(--r)', padding:12, marginTop:8 }}>
                <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--green)', marginBottom:6 }}>✓ EXISTING CUSTOMER FOUND</div>
                <div style={{ fontSize:13, fontWeight:600 }}>{foundCust.name}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, fontFamily:'var(--mono)' }}>Stage: {foundCust.stage}</div>
                <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>Last: {foundCust.last}</div>
                <div style={{ fontSize:11, color:'var(--yellow)', marginTop:4, fontFamily:'var(--mono)' }}>👑 Crown Points: {foundCust.points.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'var(--green)', marginTop:6, fontStyle:'italic' }}>{foundCust.ai}</div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="step-header"><div className="step-num">2</div><div className="step-title">PAYMENT METHOD</div></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[{id:'cash',label:'💵 Cash'},{id:'mpesa',label:'📱 M-Pesa'},{id:'bank',label:'🏦 Bank Transfer'},{id:'pos',label:'💳 POS Card'}].map(pm=>(
                <button key={pm.id} onClick={()=>setPayment(pm.id)} className="btn" style={{ justifyContent:'center', background:payment===pm.id?'var(--accent-dim)':'transparent', border:`1px solid ${payment===pm.id?'var(--accent)':'var(--border)'}`, color:payment===pm.id?'var(--accent)':'var(--text2)' }}>{pm.label}</button>
              ))}
            </div>
            <div style={{ marginTop:12 }}>
              <FG label="Amount Tendered (TZS)">
                <input className="form-input" type="number" placeholder="0" value={tendered} onChange={e=>setTendered(e.target.value)} style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} />
              </FG>
              {tendered && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'8px 0' }}>
                  <span style={{ color:'var(--text3)' }}>Change</span>
                  <span style={{ fontFamily:'var(--mono)', fontWeight:700, color:change>=0?'var(--green)':'var(--red)' }}>{tzs(Math.max(0,change))}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="step-header"><div className="step-num">3</div><div className="step-title">PRODUCTS SOLD</div></div>
          <LineItemsTable lines={lines} setLines={setLines} />
          <div style={{ background:'var(--surface3)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:12, marginTop:14, fontSize:11, display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ color:'var(--wa)' }}>💬 WhatsApp receipt auto-sent after posting</div>
            <div style={{ color:'var(--text3)' }}>📦 Inventory deducted · Full journal auto-posted</div>
            <div style={{ color:'var(--yellow)' }}>👑 Crown points: {Math.round(total/1000)} pts will be awarded</div>
          </div>
          <button className="btn btn-primary" onClick={post} style={{ width:'100%', justifyContent:'center', marginTop:14, padding:'12px' }}>📤 Post Sale & Send Receipt</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Recent Cash Sales</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th className="td-right">Amount (TZS)</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>
              {RECENT.map((s,i)=>(
                <tr key={i}>
                  <td className="td-mono td-amber">{s.ref}</td>
                  <td className="td-bold">{s.customer}</td>
                  <td className="td-mono" style={{color:'var(--wa)'}}>{s.wa}</td>
                  <td style={{fontSize:12,color:'var(--text3)'}}>{s.products}</td>
                  <td className="td-right td-mono td-green">{s.amount.toLocaleString()}</td>
                  <td><span className={`pill ${s.payment==='Cash'?'pill-green':s.payment==='M-Pesa'?'pill-blue':'pill-amber'}`}>{s.payment}</span></td>
                  <td><span className="pill pill-green">Posted</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <Toast message={toast} type={toast.startsWith('❌')?'error':'success'} onClose={()=>setToast('')} />}
    </div>
  )
}

// ── VOUCHER: SALES INVOICE ────────────────────────
function SalesInvoice({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), dueDate:'', ref:genRef('INV',18), customer:'', wa:'', paymentTerms:'NET30', branch:'DSM HQ', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr AR / Cr Revenue · Dr COGS / Cr Inventory · Invoice sent via WhatsApp`); onNav('vouchers') }
  return (
    <VoucherPage title="Sales Invoice" icon="📄" subtitle="Credit sale — creates open AR entry, due in 30 days" color="rgba(0,229,160,.12)"
      onPost={post} postLabel="📤 Post Invoice & Send"
      journalNote="Dr Accounts Receivable (1050) · Cr Revenue (4011) · Dr COGS / Cr Inventory · VAT to 2020">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Invoice Header</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} /></FG>
              <FG label="Payment Terms">
                <select className="form-input" value={form.paymentTerms} onChange={e=>set('paymentTerms',e.target.value)}>
                  <option value="COD">COD — Cash on Delivery</option>
                  <option value="NET30">Net 30 Days</option>
                  <option value="NET15">Net 15 Days</option>
                  <option value="NET7">Net 7 Days</option>
                </select>
              </FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Bill To</div>
            <FG label="Customer / Company Name" req><input className="form-input" placeholder="e.g. Aga Khan Hospital" value={form.customer} onChange={e=>set('customer',e.target.value)} /></FG>
            <FG label="WhatsApp (for delivery)"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa} onChange={e=>set('wa',e.target.value)} /></FG>
            <FG label="Branch"><select className="form-input" value={form.branch} onChange={e=>set('branch',e.target.value)}><option>DSM HQ</option><option>Arusha Branch</option></select></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title" style={{ marginBottom:14 }}>Invoice Lines</div>
        <LineItemsTable lines={lines} setLines={setLines} />
      </div>
      <div className="card">
        <FG label="Notes / Terms"><textarea className="form-input" rows={2} placeholder="Payment instructions, bank details, terms…" value={form.notes} onChange={e=>set('notes',e.target.value)} style={{ resize:'none' }} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: PURCHASE ORDER ───────────────────────
function PurchaseOrder({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), deliveryDate:'', ref:genRef('PO',22), supplier:'', currency:'USD', fxRate:'2540', paymentTerms:'NET30', branch:'DSM HQ', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const subtotalUSD = lines.reduce((s,l)=>s+l.amount,0)
  const subtotalTZS = subtotalUSD * (parseInt(form.fxRate)||2540)
  const post = () => { setToast(`✅ ${form.ref} created · PO sent to supplier · No journal posted (PO has no accounting impact)`); onNav('vouchers') }
  return (
    <VoucherPage title="Purchase Order" icon="📋" subtitle="Order goods from supplier — no journal until GRN" color="rgba(100,116,139,.12)"
      onPost={post} postLabel="📤 Confirm & Send PO"
      journalNote="No journal posted — accounting happens on GRN receipt">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Order Details</div>
            <div className="form-row">
              <FG label="PO Number" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
              <FG label="Order Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
            </div>
            <FG label="Expected Delivery Date"><input type="date" className="form-input" value={form.deliveryDate} onChange={e=>set('deliveryDate',e.target.value)} /></FG>
            <div className="form-row">
              <FG label="Currency"><select className="form-input" value={form.currency} onChange={e=>set('currency',e.target.value)}><option>USD</option><option>TZS</option><option>INR</option><option>CNY</option></select></FG>
              <FG label="Exchange Rate (TZS/USD)"><input className="form-input" value={form.fxRate} onChange={e=>set('fxRate',e.target.value)} /></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e=>set('supplier',e.target.value)}>
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map(s=><option key={s.id} value={s.id}>{s.name} ({s.currency})</option>)}
              </select>
            </FG>
            <FG label="Payment Terms"><select className="form-input"><option>NET30</option><option>NET60</option><option>50% Advance</option><option>100% Advance</option></select></FG>
            <FG label="Delivery Branch"><select className="form-input"><option>DSM HQ</option><option>Arusha Branch</option></select></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title" style={{ marginBottom:14 }}>Order Lines (in {form.currency})</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel={`Unit Price (${form.currency})`} />
        {form.currency === 'USD' && subtotalUSD > 0 && (
          <div style={{ background:'var(--blue-dim)', border:'1px solid rgba(61,139,255,.2)', borderRadius:'var(--r)', padding:12, marginTop:12, fontSize:12, fontFamily:'var(--mono)' }}>
            USD Total: <span style={{ color:'var(--blue)', fontWeight:700 }}>${subtotalUSD.toLocaleString()}</span> · TZS Equivalent: <span style={{ color:'var(--accent)', fontWeight:700 }}>{tzs(subtotalTZS)}</span> @ rate {form.fxRate}
          </div>
        )}
      </div>
      <div className="card">
        <FG label="Notes / Special Instructions"><textarea className="form-input" rows={2} placeholder="Packaging requirements, shipping instructions…" value={form.notes} onChange={e=>set('notes',e.target.value)} style={{ resize:'none' }} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: GRN ──────────────────────────────────
function GRN({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('GRN',19), supplier:'', poRef:'', receivedBy:'Joe Gembe', fxRate:'2540', condition:'good', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Inventory (1110) / Cr GRN Interim (1121) · Stock quantities updated · Avg cost recalculated`); onNav('vouchers') }
  return (
    <VoucherPage title="Goods Received Note (GRN)" icon="🚛" subtitle="Record goods received from supplier — posts to inventory" color="rgba(251,146,60,.12)"
      onPost={post} postLabel="✅ Confirm GRN & Update Stock"
      journalNote="Dr Inventory (1110) · Cr GRN Interim (1121) · Qty added to stock · Weighted avg cost recalculated">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Receipt Details</div>
            <div className="form-row">
              <FG label="GRN Number" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
              <FG label="Received Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
            </div>
            <FG label="Related PO Reference"><input className="form-input" placeholder="e.g. PO-0022" value={form.poRef} onChange={e=>set('poRef',e.target.value)} /></FG>
            <div className="form-row">
              <FG label="FX Rate on Receipt Date" req><input className="form-input" placeholder="2540" value={form.fxRate} onChange={e=>set('fxRate',e.target.value)} /></FG>
              <FG label="Received By"><select className="form-input" value={form.receivedBy} onChange={e=>set('receivedBy',e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option><option>Lilian Mallya</option></select></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Supplier & Condition</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e=>set('supplier',e.target.value)}>
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FG>
            <FG label="Goods Condition">
              <select className="form-input" value={form.condition} onChange={e=>set('condition',e.target.value)}>
                <option value="good">✅ Good — All items accepted</option>
                <option value="partial">⚠️ Partial — Some items rejected</option>
                <option value="damaged">❌ Damaged — Return required</option>
              </select>
            </FG>
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize:'none' }} placeholder="Any notes on receipt…" value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title" style={{ marginBottom:14 }}>Items Received</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (USD)" />
      </div>
      <div style={{ background:'var(--accent-dim)', border:'1px solid rgba(212,135,74,.2)', borderRadius:'var(--r)', padding:14, fontSize:11, color:'var(--accent)', lineHeight:1.8 }}>
        ⚡ After posting GRN: Stock quantity increases immediately · Weighted average cost recalculates automatically · GRN Interim account (1121) clears when purchase invoice is matched
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: PURCHASE INVOICE ─────────────────────
function PurchaseInvoice({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), dueDate:'', ref:genRef('PINV',12), supplier:'', supplierRef:'', poRef:'', grnRef:'', fxRate:'2540', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr GRN Interim (1121) / Cr AP Suppliers (2010) · Supplier ledger updated · Cost variance to 5090`); onNav('vouchers') }
  return (
    <VoucherPage title="Purchase Invoice" icon="🧾" subtitle="Match supplier invoice to GRN — creates AP entry" color="rgba(168,85,247,.12)"
      onPost={post} postLabel="📤 Post Invoice"
      journalNote="Dr GRN Interim (1121) · Cr Accounts Payable (2010) · Cost variance to 5090 · Creates open AP entry">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Invoice Details</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} /></FG>
              <FG label="FX Rate (TZS/USD)" req><input className="form-input" value={form.fxRate} onChange={e=>set('fxRate',e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Related PO Ref"><input className="form-input" placeholder="PO-0022" value={form.poRef} onChange={e=>set('poRef',e.target.value)} /></FG>
              <FG label="Related GRN Ref"><input className="form-input" placeholder="GRN-0019" value={form.grnRef} onChange={e=>set('grnRef',e.target.value)} /></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom:14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e=>set('supplier',e.target.value)}>
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map(s=><option key={s.id} value={s.id}>{s.name} — Balance: TZS {s.balance.toLocaleString()}</option>)}
              </select>
            </FG>
            <FG label="Supplier Invoice Reference"><input className="form-input" placeholder="Supplier's own invoice number" value={form.supplierRef} onChange={e=>set('supplierRef',e.target.value)} /></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title" style={{ marginBottom:14 }}>Invoice Lines</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (USD)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: JOURNAL ENTRY ────────────────────────
function JournalEntry({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [jLines, setJLines] = useState([
    { account:'', dr:0, cr:0, desc:'' },
    { account:'', dr:0, cr:0, desc:'' },
  ])
  const [form, setForm] = useState({ date:today(), ref:genRef('JV',10), narration:'', branch:'DSM HQ', type:'manual' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const updateLine = (i:number, k:string, v:string|number) => { const nl=[...jLines]; (nl[i] as Record<string,string|number>)[k]=v; setJLines(nl) }
  const addLine = () => setJLines([...jLines, { account:'', dr:0, cr:0, desc:'' }])
  const removeLine = (i:number) => setJLines(jLines.filter((_,idx)=>idx!==i))
  const totalDr = jLines.reduce((s,l)=>s+l.dr,0)
  const totalCr = jLines.reduce((s,l)=>s+l.cr,0)
  const balanced = totalDr === totalCr && totalDr > 0
  const post = () => {
    if(!balanced){ setToast('❌ Journal not balanced — Debits must equal Credits'); return }
    setToast(`✅ ${form.ref} posted · ${jLines.length} lines · Balanced at TZS ${totalDr.toLocaleString()}`)
    onNav('vouchers')
  }
  return (
    <VoucherPage title="Journal Entry" icon="🔄" subtitle="Manual double-entry — use for corrections and adjustments" color="rgba(212,135,74,.12)"
      onPost={post} postLabel="📤 Post Journal"
      journalNote="Manual entry — debits must equal credits before posting is allowed">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Journal Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          <FG label="Type">
            <select className="form-input" value={form.type} onChange={e=>set('type',e.target.value)}>
              <option value="manual">Manual Adjustment</option>
              <option value="depreciation">Depreciation</option>
              <option value="accrual">Accrual</option>
              <option value="prepayment">Prepayment</option>
              <option value="fx_revaluation">FX Revaluation</option>
              <option value="correction">Error Correction</option>
            </select>
          </FG>
          <FG label="Branch"><select className="form-input"><option>DSM HQ</option><option>Arusha Branch</option></select></FG>
        </div>
        <FG label="Narration / Description" req><input className="form-input" placeholder="Explain why this journal entry is being posted" value={form.narration} onChange={e=>set('narration',e.target.value)} /></FG>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div className="card-title">Journal Lines</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color: balanced ? 'var(--green)' : 'var(--red)' }}>
              {balanced ? '✅ BALANCED' : `⚠️ Difference: ${Math.abs(totalDr-totalCr).toLocaleString()}`}
            </span>
          </div>
        </div>
        <div className="table-wrap" style={{ marginBottom:8 }}>
          <table>
            <thead><tr><th>Account</th><th>Description</th><th className="td-right" style={{ width:150 }}>Debit (TZS)</th><th className="td-right" style={{ width:150 }}>Credit (TZS)</th><th style={{ width:40 }}></th></tr></thead>
            <tbody>
              {jLines.map((line,i)=>(
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize:12, padding:'6px 8px' }} value={line.account} onChange={e=>updateLine(i,'account',e.target.value)}>
                      <option value="">— Select account —</option>
                      {ACCOUNTS.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </td>
                  <td><input className="form-input" style={{ fontSize:12, padding:'6px 8px' }} value={line.desc} onChange={e=>updateLine(i,'desc',e.target.value)} placeholder="Line description" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize:12, padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--blue)' }} value={line.dr||''} onChange={e=>updateLine(i,'dr',parseInt(e.target.value)||0)} placeholder="0" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize:12, padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--red)' }} value={line.cr||''} onChange={e=>updateLine(i,'cr',parseInt(e.target.value)||0)} placeholder="0" /></td>
                  <td><button onClick={()=>removeLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14 }}>✕</button></td>
                </tr>
              ))}
              <tr style={{ background:'var(--surface2)', fontWeight:700 }}>
                <td colSpan={2} style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)', textTransform:'uppercase' }}>TOTALS</td>
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', color:'var(--blue)', padding:'10px 14px' }}>{totalDr.toLocaleString()}</td>
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', color:'var(--red)', padding:'10px 14px' }}>{totalCr.toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={addLine}>+ Add Line</button>
      </div>
      {toast && <Toast message={toast} type={toast.startsWith('❌')?'error':'success'} onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: STOCK ADJUSTMENT ──────────────────────
function StockAdjustment({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('SA',8), type:'increase', reason:'count', approvedBy:'Joe Gembe', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Stock quantities updated · ${form.type==='increase'?'Dr Inventory / Cr Opening Stock Equity':'Dr Stock Write-off (5080) / Cr Inventory (1110)'}`); onNav('vouchers') }
  return (
    <VoucherPage title="Stock Adjustment" icon="🔧" subtitle="Correct stock quantities — physical count, damage, write-off" color="rgba(255,71,87,.12)"
      onPost={post} postLabel="✅ Post Adjustment"
      journalNote={form.type==='increase' ? 'Dr Inventory (1110) · Cr Opening Stock Equity (3040)' : 'Dr Inventory Write-off (5080) · Cr Inventory (1110)'}>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          <FG label="Adjustment Type" req>
            <select className="form-input" value={form.type} onChange={e=>set('type',e.target.value)}>
              <option value="increase">📈 Increase Stock</option>
              <option value="decrease">📉 Decrease Stock</option>
              <option value="writeoff">❌ Write-off (Damaged/Expired)</option>
            </select>
          </FG>
          <FG label="Reason">
            <select className="form-input" value={form.reason} onChange={e=>set('reason',e.target.value)}>
              <option value="count">Physical Count Correction</option>
              <option value="damaged">Damaged Goods</option>
              <option value="expired">Expired Products</option>
              <option value="theft">Theft / Shrinkage</option>
              <option value="opening">Opening Stock Entry</option>
              <option value="other">Other</option>
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Approved By" req><select className="form-input" value={form.approvedBy} onChange={e=>set('approvedBy',e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
          <FG label="Notes"><input className="form-input" placeholder="Reason for adjustment" value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Products to Adjust</div>
        <LineItemsTable lines={lines} setLines={setLines} showPrice={false} />
        <div style={{ background: form.type==='writeoff'?'var(--red-dim)':form.type==='increase'?'var(--green-dim)':'var(--yellow-dim)', border:`1px solid ${form.type==='writeoff'?'var(--red)':form.type==='increase'?'var(--green)':'var(--yellow)'}`, borderRadius:'var(--r)', padding:12, marginTop:12, fontSize:11 }}>
          {form.type==='increase' && <span style={{ color:'var(--green)' }}>📈 Stock will increase · Dr Inventory / Cr Opening Stock Equity</span>}
          {form.type==='decrease' && <span style={{ color:'var(--yellow)' }}>📉 Stock will decrease · Dr Opening Stock Equity / Cr Inventory</span>}
          {form.type==='writeoff' && <span style={{ color:'var(--red)' }}>❌ Stock written off · Dr Inventory Write-off (5080) / Cr Inventory · P&L impact</span>}
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: STOCK TRANSFER ────────────────────────
function StockTransfer({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('ST',5), fromBranch:'DSM HQ', toBranch:'Arusha Branch', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Stock moved from ${form.fromBranch} to ${form.toBranch} · No P&L impact`); onNav('vouchers') }
  return (
    <VoucherPage title="Stock Transfer" icon="🔄" subtitle="Move stock between branches — no P&L impact" color="rgba(61,139,255,.12)"
      onPost={post} postLabel="🔄 Confirm Transfer"
      journalNote="Dr Inventory at destination branch · Cr Inventory at source branch · No revenue or cost impact">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          <FG label="From Branch" req>
            <select className="form-input" value={form.fromBranch} onChange={e=>set('fromBranch',e.target.value)}>
              <option>DSM HQ</option><option>Arusha Branch</option><option>Online Warehouse</option>
            </select>
          </FG>
          <FG label="To Branch" req>
            <select className="form-input" value={form.toBranch} onChange={e=>set('toBranch',e.target.value)}>
              <option>Arusha Branch</option><option>DSM HQ</option><option>Online Warehouse</option>
            </select>
          </FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="Reason for transfer" value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Items to Transfer</div>
        <LineItemsTable lines={lines} setLines={setLines} showPrice={false} />
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: OPENING STOCK ────────────────────────
function OpeningStock({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState(PRODUCTS.slice(0,4).map(p=>({ productId:p.id, desc:p.name, qty:0, price:p.cost, amount:0 })))
  const [form, setForm] = useState({ date:today(), ref:genRef('OS',1), notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const total = lines.reduce((s,l)=>s+l.amount,0)
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Inventory / Cr Opening Stock Equity · Stock quantities set · Total value: ${tzs(total)}`); onNav('vouchers') }
  return (
    <VoucherPage title="Opening Stock" icon="📦" subtitle="Enter initial stock quantities at go-live — one time entry" color="rgba(212,135,74,.12)"
      onPost={post} postLabel="✅ Post Opening Stock"
      journalNote="Dr Inventory accounts (1110-1112) · Cr Opening Stock Equity (3040) · Run once at system go-live">
      <div style={{ background:'var(--yellow-dim)', border:'1px solid rgba(255,211,42,.3)', borderRadius:'var(--r)', padding:14, marginBottom:16, fontSize:12, color:'var(--yellow)' }}>
        ⚠️ This is a one-time entry. Opening stock should only be posted once when you go live. Posting this twice will double your inventory values.
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="e.g. Opening stock as at 1 July 2025" value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Products — Enter Quantities and Costs</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Cost Price (TZS)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: SALES RETURN ─────────────────────────
function SalesReturn({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('SRN',4), customer:'', wa:'', originalInv:'', reason:'defective', refundMethod:'cash', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Sales Returns / Cr Cash or AR · Dr Inventory / Cr COGS · Stock returned`); onNav('vouchers') }
  return (
    <VoucherPage title="Sales Return" icon="↩️" subtitle="Customer returns goods — reverses original sale" color="rgba(255,71,87,.12)"
      onPost={post} postLabel="↩️ Post Return"
      journalNote="Dr Sales Returns (4050) · Cr Cash/AR · Dr Inventory (1110) · Cr COGS (5010) · Stock qty restored">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
          <FG label="Original Invoice Ref"><input className="form-input" placeholder="e.g. CS-0042 or INV-0018" value={form.originalInv} onChange={e=>set('originalInv',e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer Name" req><input className="form-input" value={form.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer name" /></FG>
          <FG label="WhatsApp"><input className="form-input" value={form.wa} onChange={e=>set('wa',e.target.value)} placeholder="+255 7XX XXX XXX" /></FG>
        </div>
        <div className="form-row">
          <FG label="Return Reason">
            <select className="form-input" value={form.reason} onChange={e=>set('reason',e.target.value)}>
              <option value="defective">Defective / Not Working</option>
              <option value="wrong">Wrong Item Delivered</option>
              <option value="changed">Customer Changed Mind</option>
              <option value="damaged">Damaged in Transit</option>
              <option value="other">Other</option>
            </select>
          </FG>
          <FG label="Refund Method">
            <select className="form-input" value={form.refundMethod} onChange={e=>set('refundMethod',e.target.value)}>
              <option value="cash">💵 Cash Refund</option>
              <option value="mpesa">📱 M-Pesa Refund</option>
              <option value="credit">📋 Store Credit</option>
              <option value="exchange">🔄 Exchange</option>
            </select>
          </FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Items Returned</div>
        <LineItemsTable lines={lines} setLines={setLines} />
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: DEBIT NOTE ───────────────────────────
function DebitNote({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('DN',6), customer:'', originalInv:'', amount:'', reason:'', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Accounts Receivable / Cr Revenue · Customer balance increased`); onNav('vouchers') }
  return (
    <VoucherPage title="Debit Note" icon="📤" subtitle="Charge customer additional amount — increases their balance" color="rgba(255,71,87,.12)"
      onPost={post} journalNote="Dr Accounts Receivable (1050) · Cr Revenue · Customer owes more">
      <div className="card">
        <div className="form-row">
          <FG label="Debit Note Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer" req><input className="form-input" value={form.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer name" /></FG>
          <FG label="Original Invoice Ref"><input className="form-input" value={form.originalInv} onChange={e=>set('originalInv',e.target.value)} placeholder="INV-0018" /></FG>
        </div>
        <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" /></FG>
        <FG label="Reason for Debit Note" req>
          <select className="form-input" value={form.reason} onChange={e=>set('reason',e.target.value)}>
            <option value="">— Select reason —</option>
            <option>Underbilling correction</option>
            <option>Additional delivery charges</option>
            <option>Interest on overdue invoice</option>
            <option>Price adjustment</option>
            <option>Other charges</option>
          </select>
        </FG>
        <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize:'none' }} value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: CREDIT NOTE ──────────────────────────
function CreditNote({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('CN',5), customer:'', originalInv:'', amount:'', reason:'', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Revenue / Cr Accounts Receivable · Customer balance reduced`); onNav('vouchers') }
  return (
    <VoucherPage title="Credit Note" icon="📥" subtitle="Credit customer — reduces their outstanding balance" color="rgba(0,229,160,.12)"
      onPost={post} journalNote="Dr Revenue (4010) · Cr Accounts Receivable (1050) · Reduces what customer owes">
      <div className="card">
        <div className="form-row">
          <FG label="Credit Note Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer" req><input className="form-input" value={form.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer name" /></FG>
          <FG label="Original Invoice Ref"><input className="form-input" value={form.originalInv} onChange={e=>set('originalInv',e.target.value)} placeholder="INV-0018" /></FG>
        </div>
        <FG label="Credit Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" /></FG>
        <FG label="Reason">
          <select className="form-input" value={form.reason} onChange={e=>set('reason',e.target.value)}>
            <option value="">— Select reason —</option>
            <option>Overbilling correction</option>
            <option>Discount granted after invoice</option>
            <option>Goods returned</option>
            <option>Price reduction agreed</option>
            <option>Goodwill credit</option>
          </select>
        </FG>
        <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize:'none' }} value={form.notes} onChange={e=>set('notes',e.target.value)} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: PURCHASE RETURN ──────────────────────
function PurchaseReturn({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState([{ productId:'', desc:'', qty:1, price:0, amount:0 }])
  const [form, setForm] = useState({ date:today(), ref:genRef('PRN',3), supplier:'', originalGrn:'', reason:'defective', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr AP Suppliers / Cr Inventory · Stock returned to supplier`); onNav('vouchers') }
  return (
    <VoucherPage title="Purchase Return" icon="↩️" subtitle="Return goods to supplier — reduces AP and inventory" color="rgba(168,85,247,.12)"
      onPost={post} journalNote="Dr Accounts Payable (2010) · Cr Inventory (1110) · Reduces stock and supplier balance">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Supplier" req>
            <select className="form-input" value={form.supplier} onChange={e=>set('supplier',e.target.value)}>
              <option value="">— Select supplier —</option>
              {SUPPLIERS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FG>
          <FG label="Original GRN Ref"><input className="form-input" value={form.originalGrn} onChange={e=>set('originalGrn',e.target.value)} placeholder="GRN-0019" /></FG>
        </div>
        <FG label="Return Reason">
          <select className="form-input" value={form.reason} onChange={e=>set('reason',e.target.value)}>
            <option value="defective">Defective / Not as described</option>
            <option value="wrong">Wrong items sent</option>
            <option value="overdelivery">Over-delivery</option>
            <option value="damaged">Damaged in transit</option>
          </select>
        </FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom:14 }}>Items to Return</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (TZS)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHER: CONTRA ENTRY ─────────────────────────
function ContraEntry({ onNav }: { onNav:(p:Page)=>void }) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date:today(), ref:genRef('CON',7), fromAcc:'1010', toAcc:'1030', amount:'', notes:'' })
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))
  const post = () => { setToast(`✅ ${form.ref} posted · Contra entry between cash accounts`); onNav('vouchers') }
  return (
    <VoucherPage title="Contra Entry" icon="↔️" subtitle="Transfer between cash and bank — cash deposit or withdrawal" color="rgba(168,85,247,.12)"
      onPost={post} journalNote="Dr Bank/Cash (destination) · Cr Cash/Bank (source) · Both sides are balance sheet accounts">
      <div className="card">
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e=>set('ref',e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></FG>
        </div>
        <FG label="From (Source Account)" req>
          <select className="form-input" value={form.fromAcc} onChange={e=>set('fromAcc',e.target.value)}>
            <option value="1010">1010 — Cash — DSM HQ Till</option>
            <option value="1020">1020 — M-Pesa Business Account</option>
            <option value="1030">1030 — CRDB Bank TZS</option>
            <option value="1040">1040 — Petty Cash</option>
          </select>
        </FG>
        <FG label="To (Destination Account)" req>
          <select className="form-input" value={form.toAcc} onChange={e=>set('toAcc',e.target.value)}>
            <option value="1030">1030 — CRDB Bank TZS</option>
            <option value="1010">1010 — Cash — DSM HQ Till</option>
            <option value="1020">1020 — M-Pesa Business Account</option>
            <option value="1040">1040 — Petty Cash</option>
          </select>
        </FG>
        <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700 }} value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" /></FG>
        <FG label="Notes"><input className="form-input" value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="e.g. Cash deposited to bank from till" /></FG>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14, marginTop:8 }}>
          <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>Journal Preview</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ color:'var(--blue)' }}>Dr Destination Account</span>
            <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0' }}>
            <span style={{ color:'var(--red)' }}>Cr Source Account</span>
            <span style={{ fontFamily:'var(--mono)', color:'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </VoucherPage>
  )
}

// ── VOUCHERS HUB ──────────────────────────────────
function VouchersHub({ onNav }: { onNav:(p:Page)=>void }) {
  const SECTIONS = [
    { title:'Money Vouchers', desc:'Payments, receipts and transfers', items:[
      {icon:'💸',name:'Cash Payment',desc:'Pay expense or supplier in cash',color:'rgba(255,71,87,.12)',page:'cash-payment' as Page},
      {icon:'📥',name:'Cash Receipt',desc:'Record money received in cash',color:'rgba(0,229,160,.12)',page:'cash-receipt' as Page},
      {icon:'🏦',name:'Bank Payment',desc:'Pay via bank transfer or cheque',color:'rgba(61,139,255,.12)',page:'cash-payment' as Page},
      {icon:'📤',name:'Bank Receipt',desc:'Record money received in bank',color:'rgba(0,229,160,.12)',page:'cash-receipt' as Page},
      {icon:'🔁',name:'Bank Transfer',desc:'Between your own accounts',color:'rgba(61,139,255,.12)',page:'bank-transfer' as Page},
      {icon:'🪙',name:'Petty Cash',desc:'Small cash office expenses',color:'rgba(255,211,42,.12)',page:'petty-cash' as Page},
      {icon:'↔️',name:'Contra Entry',desc:'Cash deposit to bank or withdrawal',color:'rgba(168,85,247,.12)',page:'contra' as Page},
    ]},
    { title:'Sales', desc:'Sales invoices, cash sales and returns', items:[
      {icon:'💵',name:'Cash Sale',desc:'Counter POS — WhatsApp receipt',color:'rgba(212,135,74,.12)',page:'cash-sale' as Page},
      {icon:'📄',name:'Sales Invoice',desc:'Credit sale — creates AR entry',color:'rgba(0,229,160,.12)',page:'sales-invoice' as Page},
      {icon:'📋',name:'Quotation',desc:'Price quote / proforma invoice',color:'rgba(61,139,255,.12)',page:'coming-soon' as Page},
      {icon:'↩️',name:'Sales Return',desc:'Customer return / refund',color:'rgba(255,71,87,.12)',page:'sales-return' as Page},
      {icon:'📤',name:'Debit Note',desc:'Charge customer additional amount',color:'rgba(255,71,87,.12)',page:'debit-note' as Page},
      {icon:'📥',name:'Credit Note',desc:'Credit customer — reduce balance',color:'rgba(0,229,160,.12)',page:'credit-note' as Page},
    ]},
    { title:'Procurement', desc:'Purchasing stock and receiving goods', items:[
      {icon:'📋',name:'Purchase Order',desc:'Order to supplier — no journal',color:'rgba(100,116,139,.12)',page:'purchase-order' as Page},
      {icon:'🚛',name:'GRN',desc:'Receive goods — updates stock',color:'rgba(251,146,60,.12)',page:'grn' as Page},
      {icon:'🧾',name:'Purchase Invoice',desc:'Supplier bill — creates AP entry',color:'rgba(168,85,247,.12)',page:'purchase-invoice' as Page},
      {icon:'↩️',name:'Purchase Return',desc:'Return goods to supplier',color:'rgba(255,71,87,.12)',page:'purchase-return' as Page},
    ]},
    { title:'Inventory Adjustments', desc:'Stock corrections and transfers', items:[
      {icon:'📦',name:'Opening Stock',desc:'Enter initial stock quantities',color:'rgba(212,135,74,.12)',page:'opening-stock' as Page},
      {icon:'🔧',name:'Stock Adjustment',desc:'Physical count correction or write-off',color:'rgba(255,71,87,.12)',page:'stock-adjustment' as Page},
      {icon:'🔄',name:'Stock Transfer',desc:'Move stock between branches',color:'rgba(61,139,255,.12)',page:'stock-transfer' as Page},
    ]},
    { title:'Journal & Corrections', desc:'Manual double-entry postings', items:[
      {icon:'🔄',name:'Journal Entry',desc:'Manual debit/credit — must balance',color:'rgba(212,135,74,.12)',page:'journal-entry' as Page},
    ]},
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📝 Vouchers</div><div className="page-sub">Post payments, receipts, procurement and inventory adjustments — every voucher auto-creates a journal</div></div>
      </div>
      {SECTIONS.map((section,si)=>(
        <div key={si} style={{ marginBottom:32 }}>
          <div className="section-label">
            <div className="section-bar"></div>
            <div className="section-title-txt">{section.title}</div>
            <div className="section-desc-txt">— {section.desc}</div>
          </div>
          <div className="voucher-grid">
            {section.items.map((item,ii)=>(
              <div key={ii} className="voucher-card" onClick={()=>onNav(item.page)}>
                <div className="voucher-card-icon" style={{ background:item.color }}>{item.icon}</div>
                <div className="voucher-card-name">{item.name}</div>
                <div className="voucher-card-desc">{item.desc}</div>
                <div className="voucher-card-action">Open {item.name} →</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── CHART OF ACCOUNTS ─────────────────────────────
function ChartOfAccounts() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const ALL_ACCTS = [
    { code:'1010', name:'Cash — DSM HQ Till', type:'asset', category:'Cash & Bank', balance:3450000 },
    { code:'1020', name:'M-Pesa — Business Account', type:'asset', category:'Cash & Bank', balance:780000 },
    { code:'1030', name:'CRDB Bank — TZS Operating', type:'asset', category:'Cash & Bank', balance:12200000 },
    { code:'1031', name:'CRDB Bank — USD Account', type:'asset', category:'Cash & Bank', balance:2100000 },
    { code:'1040', name:'Petty Cash — DSM HQ', type:'asset', category:'Cash & Bank', balance:150000 },
    { code:'1050', name:'Accounts Receivable — B2B', type:'asset', category:'Receivables', balance:320000 },
    { code:'1051', name:'Accounts Receivable — Crown', type:'asset', category:'Receivables', balance:85000 },
    { code:'1060', name:'VAT Receivable (Input Tax)', type:'asset', category:'Tax', balance:42000 },
    { code:'1110', name:'Inventory — Maternity Products', type:'asset', category:'Inventory', balance:18400000 },
    { code:'1111', name:'Inventory — Supplements', type:'asset', category:'Inventory', balance:2100000 },
    { code:'1112', name:'Inventory — Skincare', type:'asset', category:'Inventory', balance:980000 },
    { code:'1120', name:'Goods in Transit', type:'asset', category:'Inventory', balance:0 },
    { code:'1121', name:'GRN Interim / Expected Cost', type:'asset', category:'Inventory', balance:0 },
    { code:'2010', name:'Accounts Payable — Import Suppliers', type:'liability', category:'Payables', balance:-2100000 },
    { code:'2011', name:'Accounts Payable — Local Suppliers', type:'liability', category:'Payables', balance:-340000 },
    { code:'2020', name:'VAT Payable — Output Tax (18%)', type:'liability', category:'Tax', balance:-480000 },
    { code:'2030', name:'PAYE Payable', type:'liability', category:'Payroll Tax', balance:-120000 },
    { code:'2050', name:'Deferred Revenue — Konnect', type:'liability', category:'Deferred Revenue', balance:-180000 },
    { code:'2060', name:'Crown Points Liability', type:'liability', category:'Other Liabilities', balance:-45000 },
    { code:'3010', name:'Owner Capital — Joe Gembe', type:'equity', category:'Equity', balance:-5000000 },
    { code:'3011', name:'Owner Capital — Jane Mwatonoka', type:'equity', category:'Equity', balance:-5000000 },
    { code:'3020', name:'Retained Earnings', type:'equity', category:'Equity', balance:-8200000 },
    { code:'4010', name:'Sales — Maternity Products B2C', type:'revenue', category:'Revenue', balance:-4250000 },
    { code:'4011', name:'Sales — Maternity Products B2B', type:'revenue', category:'Revenue', balance:-980000 },
    { code:'4020', name:'Sales — Supplements', type:'revenue', category:'Revenue', balance:-340000 },
    { code:'4110', name:'Konnect Subscription Revenue', type:'revenue', category:'Revenue', balance:-180000 },
    { code:'5010', name:'COGS — Maternity Products', type:'cogs', category:'COGS', balance:1680000 },
    { code:'5020', name:'COGS — Supplements', type:'cogs', category:'COGS', balance:145000 },
    { code:'5050', name:'Import Duties & Customs', type:'cogs', category:'COGS', balance:320000 },
    { code:'5060', name:'Freight & Shipping Inward', type:'cogs', category:'COGS', balance:180000 },
    { code:'5080', name:'Inventory Write-off / Damage', type:'cogs', category:'COGS', balance:0 },
    { code:'6010', name:'Salaries — Full-Time Staff', type:'expense', category:'People', balance:450000 },
    { code:'6110', name:'Rent — DSM HQ Office', type:'expense', category:'Premises', balance:180000 },
    { code:'6210', name:'Social Media Advertising', type:'expense', category:'Marketing', balance:55000 },
    { code:'6310', name:'Software Subscriptions (SaaS)', type:'expense', category:'Technology', balance:32000 },
    { code:'6312', name:'WhatsApp / Twilio API Costs', type:'expense', category:'Technology', balance:18000 },
    { code:'6410', name:'Delivery — Last Mile DSM', type:'expense', category:'Logistics', balance:65000 },
    { code:'6512', name:'Bank Charges & Transfer Fees', type:'expense', category:'Admin', balance:18000 },
    { code:'7010', name:'FX Gain — Realised', type:'other', category:'FX', balance:0 },
    { code:'7011', name:'FX Loss — Realised', type:'other', category:'FX', balance:0 },
  ]
  const filtered = ALL_ACCTS.filter(a =>
    (filter==='all' || a.type===filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search))
  )
  const TYPE_COLOR: Record<string,string> = { asset:'pill-blue', liability:'pill-red', equity:'pill-gray', revenue:'pill-green', cogs:'pill-amber', expense:'pill-amber', other:'pill-gray' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📂 Chart of Accounts</div><div className="page-sub">Full double-entry COA · NAV/Business Central structure · {ALL_ACCTS.length} accounts</div></div>
        <div className="page-actions">
          <input className="form-input" style={{ width:200, padding:'6px 10px', fontSize:12 }} placeholder="🔍 Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn-primary btn-sm">+ New Account</button>
        </div>
      </div>
      <div className="tabs">
        {['all','asset','liability','equity','revenue','cogs','expense','other'].map(t=>(
          <button key={t} className={`tab ${filter===t?'active':''}`} onClick={()=>setFilter(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th>Category</th><th className="td-right">Balance (TZS)</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.map((a,i)=>(
              <tr key={i}>
                <td className="td-mono td-amber">{a.code}</td>
                <td className="td-bold">{a.name}</td>
                <td><span className={`pill ${TYPE_COLOR[a.type]}`}>{a.type.charAt(0).toUpperCase()+a.type.slice(1)}</span></td>
                <td style={{ fontSize:12, color:'var(--text3)' }}>{a.category}</td>
                <td className={`td-right td-mono ${a.balance>=0?'td-green':'td-red'}`}>{a.balance<0?`(${Math.abs(a.balance).toLocaleString()})`:a.balance.toLocaleString()}</td>
                <td><span className="pill pill-green">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── INVENTORY ─────────────────────────────────────
function Inventory() {
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const filtered = PRODUCTS.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.sku.toLowerCase().includes(search.toLowerCase()))
  const totalValue = PRODUCTS.reduce((s,p)=>s+p.cost*p.qty,0)
  const lowStock = PRODUCTS.filter(p=>getStatus(p.qty,p.reorder)!=='ok').length

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📦 Inventory</div><div className="page-sub">Stock management · {PRODUCTS.length} products · DSM HQ</div></div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={()=>setToast('Add Product form coming when wiring Supabase')}>+ Add Product</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{PRODUCTS.length}</div><div className="stat-change up">▲ Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value">TZS {(totalValue/1000000).toFixed(1)}M</div><div className="stat-change up">▲ At cost</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low Stock</div><div className="stat-value">{lowStock}</div><div className="stat-change down">▼ Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{PRODUCTS.filter(p=>p.qty===0).length}</div><div className="stat-change down">▼ Action needed</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Products — Stock Levels</div>
          <input className="form-input" style={{ width:200, padding:'6px 10px', fontSize:12 }} placeholder="🔍 Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Product Name</th><th>Category</th><th className="td-right">Qty</th><th className="td-right">Reorder</th><th className="td-right">Cost (TZS)</th><th className="td-right">Price (TZS)</th><th className="td-right">Value</th><th>Level</th></tr></thead>
            <tbody>
              {filtered.map((p,i)=>{
                const s = getStatus(p.qty,p.reorder)
                const pct = Math.min(100,Math.round((p.qty/(p.reorder*2))*100))
                const colors: Record<string,string> = {ok:'var(--green)',low:'var(--yellow)',critical:'var(--red)'}
                return (
                  <tr key={i}>
                    <td className="td-mono td-amber">{p.sku}</td>
                    <td className="td-bold">{p.name}</td>
                    <td style={{ fontSize:12, color:'var(--text3)' }}>{p.category}</td>
                    <td className="td-right td-mono" style={{ color:colors[s], fontWeight:600 }}>{p.qty}</td>
                    <td className="td-right td-mono" style={{ color:'var(--text3)' }}>{p.reorder}</td>
                    <td className="td-right td-mono">{p.cost.toLocaleString()}</td>
                    <td className="td-right td-mono">{p.price.toLocaleString()}</td>
                    <td className="td-right td-mono">{(p.cost*p.qty).toLocaleString()}</td>
                    <td>
                      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                        <div className="stock-bar"><div className={`stock-fill ${s}`} style={{ width:`${pct}%` }}></div></div>
                        <span style={{ fontSize:9, fontFamily:'var(--mono)', color:colors[s], textTransform:'uppercase' }}>{s}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────
function Dashboard({ onNav }: { onNav:(p:Page)=>void }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting()}, Joe 👋</div>
          <div className="page-sub">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · DSM HQ · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={()=>onNav('cash-sale')}>💵 Cash Sale</button>
          <button className="btn btn-primary btn-sm" onClick={()=>onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card amber"><span className="stat-icon">💰</span><div className="stat-label">Revenue — Mar 2026</div><div className="stat-value">4.25M</div><div className="stat-change up">▲ +18% vs Feb</div></div>
        <div className="stat-card green"><span className="stat-icon">📊</span><div className="stat-label">Net Profit — Mar</div><div className="stat-value">1.82M</div><div className="stat-change up">▲ Margin 43%</div></div>
        <div className="stat-card blue"><span className="stat-icon">📦</span><div className="stat-label">Products in Stock</div><div className="stat-value">{PRODUCTS.length}</div><div className="stat-change down">▼ 3 low stock</div></div>
        <div className="stat-card red"><span className="stat-icon">⚠️</span><div className="stat-label">Pending Vouchers</div><div className="stat-value">7</div><div className="stat-change down">▼ Needs attention</div></div>
      </div>
      <div className="grid g32" style={{ marginBottom:20 }}>
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Recent Transactions</div><div className="card-sub">Last posted vouchers</div></div>
            <button className="btn btn-ghost btn-sm" onClick={()=>onNav('reports')}>View all</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Description</th><th>Type</th><th className="td-right">Amount (TZS)</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td className="td-mono td-amber">CS-0042</td><td>Cash Sale — Amina Hassan</td><td><span className="pill pill-green">Receipt</span></td><td className="td-right td-mono td-green">185,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">PV-0031</td><td>Supplier payment — Meditech</td><td><span className="pill pill-red">Payment</span></td><td className="td-right td-mono td-red">420,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">GRN-0018</td><td>Breast pumps — 20 units received</td><td><span className="pill pill-blue">GRN</span></td><td className="td-right td-mono td-blue">1,200,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">CS-0041</td><td>Cash Sale — Grace Mwanza</td><td><span className="pill pill-green">Receipt</span></td><td className="td-right td-mono td-green">95,000</td><td><span className="pill pill-green">Posted</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom:10 }}>
              <div className="card-title">⚠️ Stock Alerts</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav('inventory')}>Manage</button>
            </div>
            {PRODUCTS.filter(p=>getStatus(p.qty,p.reorder)!=='ok').map((p,i)=>{
              const s = getStatus(p.qty,p.reorder)
              return <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:`var(--${s==='critical'?'red':'yellow'}-dim)`, border:`1px solid rgba(${s==='critical'?'255,71,87':'255,211,42'},.2)`, borderRadius:8, marginBottom:6 }}>
                <span style={{ flex:1, fontSize:12, color:'var(--text2)' }}>{p.name}</span>
                <span className={`pill pill-${s==='critical'?'red':'yellow'}`} style={{ fontSize:10 }}>{p.qty} left · {s.toUpperCase()}</span>
              </div>
            })}
          </div>
          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom:10 }}>
              <div className="card-title">P&L Snapshot</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav('pnl')}>Full report</button>
            </div>
            {[{l:'Revenue',v:'4,250,000',c:'td-green'},{l:'Cost of Goods',v:'(1,680,000)',c:'td-red'},{l:'Operating Exp',v:'(750,000)',c:'td-red'}].map((r,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text3)' }}>{r.l}</span>
                <span className={`td-mono ${r.c}`}>{r.v}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, padding:'10px 0 0' }}>
              <span>Net Profit</span>
              <span className="td-mono" style={{ color:'var(--green)' }}>1,820,000</span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid g4">
        {[
          {icon:'💵',label:'New Cash Sale',page:'cash-sale' as Page,color:'rgba(212,135,74,.12)'},
          {icon:'🚛',label:'New GRN',page:'grn' as Page,color:'rgba(251,146,60,.12)'},
          {icon:'📊',label:'P&L Report',page:'pnl' as Page,color:'rgba(0,229,160,.12)'},
          {icon:'📒',label:'Chart of Accounts',page:'chart-of-accounts' as Page,color:'rgba(168,85,247,.12)'},
        ].map((item,i)=>(
          <div key={i} className="card card-sm" style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:12 }} onClick={()=>onNav(item.page)}>
            <div style={{ width:40, height:40, background:item.color, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{item.icon}</div>
            <span style={{ fontFamily:'var(--display)', fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── REPORTS & SETTINGS ────────────────────────────
function ReportsHub({ onNav }: { onNav:(p:Page)=>void }) {
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📈 Reports</div><div className="page-sub">Financial statements and registers</div></div>
      </div>
      {[
        { title:'Financial Statements', reports:[
          {name:'Profit & Loss',icon:'📊',page:'pnl' as Page,desc:'Income vs expenses'},
          {name:'Trial Balance',icon:'📋',page:'trial-balance' as Page,desc:'All account balances'},
        ]},
        { title:'Registers', reports:[
          {name:'Sales Register',icon:'🛒',page:'sales-register' as Page,desc:'All sales in date order'},
          {name:'Purchase Register',icon:'🏭',page:'purchase-register' as Page,desc:'All purchase transactions'},
          {name:'Payment Register',icon:'💸',page:'payment-register' as Page,desc:'All payments made'},
        ]},
      ].map((section,si)=>(
        <div key={si} style={{ marginBottom:24 }}>
          <div className="section-label"><div className="section-bar"></div><div className="section-title-txt">{section.title}</div></div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}>
            {section.reports.map((r,ri)=>(
              <div key={ri} className="card card-sm" style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:12 }} onClick={()=>onNav(r.page)}>
                <div style={{ width:36, height:36, background:'var(--accent-dim)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{r.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--display)', fontSize:13, fontWeight:600, color:'var(--text)' }}>{r.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PnL() {
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📊 Profit & Loss</div><div className="page-sub">March 2026 · DSM HQ</div></div>
        <div className="page-actions">
          <select className="form-input" style={{ width:150, padding:'6px 10px', fontSize:12 }}><option>March 2026</option><option>February 2026</option></select>
          <button className="btn btn-primary btn-sm">📥 Export PDF</button>
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="report-section-title">Revenue</div>
          {[['Sales — Retail','3,800,000','td-green'],['Sales — Wholesale','450,000','td-green']].map(([l,v,c],i)=>(
            <div key={i} className="report-row"><span className="r-label r-indent">{l}</span><span className={`r-value ${c}`}>{v}</span></div>
          ))}
          <div className="report-row total"><span className="r-label">Total Revenue</span><span className="r-value">4,250,000</span></div>
          <div className="report-section-title" style={{ marginTop:20 }}>Cost of Goods Sold</div>
          {[['Opening Stock','(14,200,000)','td-red'],['Purchases','(5,880,000)','td-red'],['Closing Stock','18,400,000','td-green']].map(([l,v,c],i)=>(
            <div key={i} className="report-row"><span className="r-label r-indent">{l}</span><span className={`r-value ${c}`}>{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total COGS</span><span className="r-value">(1,680,000)</span></div>
          <div style={{ height:1, background:'var(--border2)', margin:'12px 0' }}></div>
          <div className="report-row total" style={{ borderTop:'none' }}>
            <span className="r-label" style={{ fontSize:15 }}>Gross Profit</span>
            <span className="r-value" style={{ fontSize:16, color:'var(--green)' }}>2,570,000</span>
          </div>
        </div>
        <div className="card">
          <div className="report-section-title">Operating Expenses</div>
          {[['Salaries','(450,000)'],['Rent','(180,000)'],['Transport','(65,000)'],['Marketing','(55,000)'],['Bank Charges','(18,000)']].map(([l,v],i)=>(
            <div key={i} className="report-row negative"><span className="r-label r-indent">{l}</span><span className="r-value">{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total Operating Exp</span><span className="r-value">(768,000)</span></div>
          <div style={{ height:1, background:'var(--border2)', margin:'20px 0' }}></div>
          <div style={{ background:'var(--green-dim)', border:'1px solid rgba(0,229,160,.2)', borderRadius:'var(--r)', padding:16 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)', textTransform:'uppercase', marginBottom:6 }}>Net Profit — March 2026</div>
            <div style={{ fontFamily:'var(--display)', fontSize:32, fontWeight:800, color:'var(--green)' }}>TZS 1,802,000</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:4, fontFamily:'var(--mono)' }}>Margin: 42.4% · vs Feb: +18%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SalesRegister() {
  const DATA = [
    {date:'23/03/2026',ref:'CS-0042',customer:'Amina Hassan',wa:'+255 712 345 678',products:'Breast Pump × 1',payment:'Cash',subtotal:156779,vat:28221,total:185000},
    {date:'23/03/2026',ref:'CS-0041',customer:'Grace Mwanza',wa:'+255 758 221 043',products:'Nipple Cream × 2',payment:'M-Pesa',subtotal:80508,vat:14492,total:95000},
    {date:'22/03/2026',ref:'CS-0040',customer:'Fatuma Iddi',wa:'+255 743 100 212',products:'Belly Binder, Pillow',payment:'Cash',subtotal:288136,vat:51864,total:340000},
  ]
  const totals = DATA.reduce((acc,r)=>({sub:acc.sub+r.subtotal,vat:acc.vat+r.vat,total:acc.total+r.total}),{sub:0,vat:0,total:0})
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">🛒 Sales Register</div></div>
        <div className="page-actions">
          <input type="date" className="form-input" style={{ width:140, padding:'6px 10px', fontSize:12 }} defaultValue="2026-03-01" />
          <span style={{ color:'var(--text3)' }}>to</span>
          <input type="date" className="form-input" style={{ width:140, padding:'6px 10px', fontSize:12 }} defaultValue="2026-03-23" />
          <button className="btn btn-ghost btn-sm">📥 Export</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th>Payment</th><th className="td-right">Subtotal</th><th className="td-right">VAT</th><th className="td-right">Total (TZS)</th></tr></thead>
          <tbody>
            {DATA.map((r,i)=>(
              <tr key={i}>
                <td className="td-mono" style={{ color:'var(--text3)' }}>{r.date}</td>
                <td className="td-mono td-amber">{r.ref}</td>
                <td className="td-bold">{r.customer}</td>
                <td className="td-mono" style={{ color:'var(--wa)' }}>{r.wa}</td>
                <td style={{ fontSize:12, color:'var(--text3)' }}>{r.products}</td>
                <td><span className={`pill ${r.payment==='Cash'?'pill-green':'pill-blue'}`}>{r.payment}</span></td>
                <td className="td-right td-mono">{r.subtotal.toLocaleString()}</td>
                <td className="td-right td-mono td-amber">{r.vat.toLocaleString()}</td>
                <td className="td-right td-mono td-green">{r.total.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background:'var(--surface2)', fontWeight:700 }}>
              <td colSpan={6} className="td-bold">TOTALS</td>
              <td className="td-right td-mono td-bold">{totals.sub.toLocaleString()}</td>
              <td className="td-right td-mono td-amber">{totals.vat.toLocaleString()}</td>
              <td className="td-right td-mono td-green">{totals.total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Settings() {
  const [toast, setToast] = useState('')
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">⚙️ Settings</div><div className="page-sub">System configuration · Malkia Wellness Group Ltd</div></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Company Information</div>
          <FG label="Company Name"><input className="form-input" defaultValue="Malkia Wellness Group Ltd" /></FG>
          <FG label="TIN Number"><input className="form-input" defaultValue="123-456-789" /></FG>
          <FG label="VRN (VAT Reg No)"><input className="form-input" defaultValue="40-123456-E" /></FG>
          <div className="form-row">
            <FG label="Currency"><select className="form-input"><option>TZS — Tanzanian Shilling</option><option>USD</option></select></FG>
            <FG label="Financial Year"><select className="form-input"><option>July — June</option><option>January — December</option></select></FG>
          </div>
          <FG label="Default VAT Rate (%)"><input className="form-input" type="number" defaultValue="18" /></FG>
          <button className="btn btn-primary" onClick={()=>setToast('Settings saved successfully')}>Save Changes</button>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>Users & Access</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {[{n:'Joe Gembe',r:'Super Admin',s:'Active'},{n:'Jane Mwatonoka',r:'Super Admin',s:'Active'},{n:'Barbra Kabendera',r:'CRM Manager',s:'Pending'},{n:'Lilian Mallya',r:'Sales Rep',s:'Pending'},{n:'Sophia Kipanta',r:'Midwife',s:'Pending'}].map((u,i)=>(
                  <tr key={i}>
                    <td className="td-bold">{u.n}</td>
                    <td><span className={`pill ${u.r==='Super Admin'?'pill-amber':'pill-blue'}`}>{u.r}</span></td>
                    <td><span className={`pill ${u.s==='Active'?'pill-green':'pill-gray'}`}>{u.s}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </div>
  )
}

function ComingSoon({ module='Module' }: { module?:string }) {
  return (
    <div className="page">
      <div className="coming-soon">
        <div className="cs-icon">🚧</div>
        <div className="cs-title">{module}</div>
        <div className="cs-sub">This module is planned for a future phase of the build.</div>
        <div className="cs-tag">Coming Soon</div>
      </div>
    </div>
  )
}

// ── BREADCRUMBS ───────────────────────────────────
const BREADCRUMBS: Record<Page,string> = {
  'dashboard':'Dashboard','vouchers':'Vouchers','chart-of-accounts':'Chart of Accounts',
  'cash-sale':'Cash Sale','cash-payment':'Cash Payment','cash-receipt':'Cash Receipt',
  'bank-payment':'Bank Payment','bank-receipt':'Bank Receipt','bank-transfer':'Bank Transfer',
  'petty-cash':'Petty Cash','contra':'Contra Entry','sales-invoice':'Sales Invoice',
  'quotation':'Quotation','sales-return':'Sales Return','debit-note':'Debit Note',
  'credit-note':'Credit Note','purchase-order':'Purchase Order','grn':'GRN',
  'purchase-invoice':'Purchase Invoice','purchase-return':'Purchase Return',
  'opening-stock':'Opening Stock','stock-adjustment':'Stock Adjustment',
  'stock-transfer':'Stock Transfer','journal-entry':'Journal Entry',
  'sales':'Sales','inventory':'Inventory','reports':'Reports','pnl':'Profit & Loss',
  'sales-register':'Sales Register','purchase-register':'Purchase Register',
  'payment-register':'Payment Register','trial-balance':'Trial Balance',
  'settings':'Settings','coming-soon':'Coming Soon','stock-levels':'Stock Levels',
  'suppliers':'Suppliers','stock-movements':'Stock Movements',
}

// ── MAIN APP ──────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch(page) {
      case 'dashboard': return <Dashboard onNav={setPage} />
      case 'vouchers': return <VouchersHub onNav={setPage} />
      case 'chart-of-accounts': return <ChartOfAccounts />
      case 'cash-sale': return <CashSale onNav={setPage} />
      case 'cash-payment': return <CashPayment onNav={setPage} />
      case 'cash-receipt': return <CashReceipt onNav={setPage} />
      case 'bank-payment': return <CashPayment onNav={setPage} />
      case 'bank-receipt': return <CashReceipt onNav={setPage} />
      case 'bank-transfer': return <BankTransfer onNav={setPage} />
      case 'petty-cash': return <PettyCash onNav={setPage} />
      case 'contra': return <ContraEntry onNav={setPage} />
      case 'sales-invoice': return <SalesInvoice onNav={setPage} />
      case 'sales-return': return <SalesReturn onNav={setPage} />
      case 'debit-note': return <DebitNote onNav={setPage} />
      case 'credit-note': return <CreditNote onNav={setPage} />
      case 'purchase-order': return <PurchaseOrder onNav={setPage} />
      case 'grn': return <GRN onNav={setPage} />
      case 'purchase-invoice': return <PurchaseInvoice onNav={setPage} />
      case 'purchase-return': return <PurchaseReturn onNav={setPage} />
      case 'opening-stock': return <OpeningStock onNav={setPage} />
      case 'stock-adjustment': return <StockAdjustment onNav={setPage} />
      case 'stock-transfer': return <StockTransfer onNav={setPage} />
      case 'journal-entry': return <JournalEntry onNav={setPage} />
      case 'sales': return <CashSale onNav={setPage} />
      case 'inventory': return <Inventory />
      case 'reports': return <ReportsHub onNav={setPage} />
      case 'pnl': return <PnL />
      case 'sales-register': return <SalesRegister />
      case 'settings': return <Settings />
      default: return <ComingSoon module={BREADCRUMBS[page] || page} />
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
      <Topbar breadcrumb={BREADCRUMBS[page] || 'Dashboard'} onNav={setPage} />
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar current={page} onNav={setPage} />
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
