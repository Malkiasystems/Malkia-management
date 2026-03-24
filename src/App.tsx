import { useState } from 'react'



// ── TYPES ──────────────────────────────────────────
type Page = 'dashboard' | 'vouchers' | 'chart-of-accounts' | 'cash-sale' |
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
  { code:'1010', name:'Cash — DSM HQ Till', type:'asset', category:'Cash & Bank', balance:3450000 },
  { code:'1020', name:'M-Pesa — Business Account', type:'asset', category:'Cash & Bank', balance:780000 },
  { code:'1030', name:'CRDB Bank — TZS Operating', type:'asset', category:'Cash & Bank', balance:12200000 },
  { code:'1031', name:'CRDB Bank — USD Account', type:'asset', category:'Cash & Bank', balance:2100000 },
  { code:'1050', name:'Accounts Receivable — B2B', type:'asset', category:'Receivables', balance:320000 },
  { code:'1110', name:'Inventory — Maternity Products', type:'asset', category:'Inventory', balance:18400000 },
  { code:'1111', name:'Inventory — Supplements', type:'asset', category:'Inventory', balance:2100000 },
  { code:'2010', name:'Accounts Payable — Import Suppliers', type:'liability', category:'Payables', balance:-2100000 },
  { code:'2020', name:'VAT Payable — Output Tax', type:'liability', category:'Tax', balance:-340000 },
  { code:'2050', name:'Deferred Revenue — Konnect', type:'liability', category:'Deferred Revenue', balance:-180000 },
  { code:'3020', name:'Retained Earnings', type:'equity', category:'Equity', balance:-8200000 },
  { code:'4010', name:'Sales — Maternity Products B2C', type:'revenue', category:'Revenue', balance:-4250000 },
  { code:'4110', name:'Konnect Subscription Revenue', type:'revenue', category:'Revenue', balance:-180000 },
  { code:'5010', name:'COGS — Maternity Products', type:'cogs', category:'COGS', balance:1680000 },
  { code:'6010', name:'Salaries — Full-Time Staff', type:'expense', category:'People', balance:450000 },
  { code:'6110', name:'Rent — DSM HQ Office', type:'expense', category:'Premises', balance:180000 },
  { code:'6210', name:'Social Media Advertising', type:'expense', category:'Marketing', balance:55000 },
  { code:'6310', name:'Software Subscriptions (SaaS)', type:'expense', category:'Technology', balance:32000 },
  { code:'6512', name:'Bank Charges & Transfer Fees', type:'expense', category:'Admin', balance:18000 },
]

const CUSTOMERS: Record<string,{name:string;stage:string;last:string;ai:string}> = {
  '255712345678':{ name:'Amina Hassan', stage:'28 wks pregnant', last:'Breast pump · TZS 185,000 · 2 days ago', ai:'💡 She may need a belly binder or hospital bag kit soon' },
  '255758221043':{ name:'Grace Mwanza', stage:'6 wks postpartum', last:'Nipple cream · TZS 95,000 · 1 week ago', ai:'💡 Recommend Scar Sheet za Malkia at this stage' },
  '255743100212':{ name:'Fatuma Iddi', stage:'34 wks pregnant', last:'Pregnancy pillow · TZS 145,000 · 5 days ago', ai:'💡 Hospital bag kit or breast pump next' },
}

const tzs = (n:number) => 'TZS ' + Math.round(n).toLocaleString()
const getStatus = (qty:number, reorder:number) => qty === 0 ? 'critical' : qty <= reorder ? (qty <= reorder*0.5 ? 'critical' : 'low') : 'ok'
const greeting = () => { const h = new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening' }

// ── SIDEBAR NAV ────────────────────────────────────
const NAV = [
  { icon:'📊', label:'Home', page:'dashboard' as Page },
  { sep: true },
  { icon:'📝', label:'Vouchers', page:'vouchers' as Page },
  { icon:'📒', label:'Accounts', page:'chart-of-accounts' as Page },
  { icon:'🛒', label:'Sales', page:'sales' as Page, badge:'7' },
  { icon:'📦', label:'Inventory', page:'inventory' as Page },
  { icon:'📈', label:'Reports', page:'reports' as Page },
  { sep: true },
  { icon:'⚕️', label:'Services', page:'coming-soon' as Page, coming:true },
  { icon:'💬', label:'Konnect', page:'coming-soon' as Page, coming:true },
  { icon:'🌐', label:'CRM', page:'coming-soon' as Page, coming:true },
  { icon:'👥', label:'HRM', page:'coming-soon' as Page, coming:true },
  { sep: true },
  { icon:'⚙️', label:'Settings', page:'settings' as Page },
]

// ── TOPBAR ────────────────────────────────────────
function Topbar({ breadcrumb, onNav }: { breadcrumb: string; onNav: (p:Page)=>void }) {
  return (
    <div style={{ height:'var(--topbar)', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:14, flexShrink:0, zIndex:200 }}>
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
        <span style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', background:'var(--surface3)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px', fontFamily:'var(--mono)', fontSize:9, color:'var(--text3)' }}>⌘K</span>
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

// ── SIDEBAR ───────────────────────────────────────
function Sidebar({ current, onNav }: { current:Page; onNav:(p:Page)=>void }) {
  return (
    <div style={{ width:'var(--sidebar)', background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', flexShrink:0, overflowY:'auto', scrollbarWidth:'none' }}>
      {NAV.map((item, i) => {
        if ('sep' in item && item.sep) return <div key={i} style={{ width:36, height:1, background:'var(--border)', margin:'6px 0' }} />
        const active = current === item.page && !item.coming
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

// ── MODAL ─────────────────────────────────────────
function Modal({ title, size='default', children, footer, onClose }: { title:string; size?:'default'|'lg'; children:React.ReactNode; footer?:React.ReactNode; onClose:()=>void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:'var(--rl)', width:size==='lg'?820:640, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 40px 100px rgba(0,0,0,.8)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:20, borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--display)', fontSize:16, fontWeight:700 }}>{title}</div>
          <button onClick={onClose} style={{ width:28, height:28, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', fontSize:16, color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:20 }}>{children}</div>
        {footer && <div style={{ padding:'16px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>{footer}</div>}
      </div>
    </div>
  )
}

// ── TOAST ─────────────────────────────────────────
function Toast({ message, type='success', onClose }: { message:string; type?:'success'|'error'; onClose:()=>void }) {
  return (
    <div style={{ position:'fixed', bottom:20, right:20, background:'var(--surface)', border:`1px solid ${type==='success'?'var(--green)':'var(--red)'}`, borderRadius:'var(--r)', padding:'14px 18px', display:'flex', alignItems:'center', gap:12, fontSize:13, boxShadow:'0 10px 40px rgba(0,0,0,.5)', zIndex:1000, maxWidth:420 }}
      onClick={onClose}>
      <span style={{ fontSize:18 }}>{type==='success'?'✅':'❌'}</span>
      <span>{message}</span>
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
                <tr><td className="td-mono td-amber">GRN-0018</td><td>Breast pumps — 20 units</td><td><span className="pill pill-blue">GRN</span></td><td className="td-right td-mono td-blue">1,200,000</td><td><span className="pill pill-green">Posted</span></td></tr>
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
          {icon:'📦',label:'Inventory',page:'inventory' as Page,color:'rgba(61,139,255,.12)'},
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

// ── VOUCHERS HUB ──────────────────────────────────
function VouchersHub({ onNav }: { onNav:(p:Page)=>void }) {
  const SECTIONS = [
    { title:'Money Vouchers', desc:'Payments, receipts and transfers', items:[
      {icon:'💸',name:'Cash Payment',desc:'Pay expense or supplier',color:'rgba(255,71,87,.12)'},
      {icon:'📥',name:'Cash Receipt',desc:'Money received in cash',color:'rgba(0,229,160,.12)'},
      {icon:'🏦',name:'Bank Payment',desc:'Pay via bank or cheque',color:'rgba(61,139,255,.12)'},
      {icon:'📤',name:'Bank Receipt',desc:'Money received in bank',color:'rgba(0,229,160,.12)'},
      {icon:'🔁',name:'Bank Transfer',desc:'Between your accounts',color:'rgba(61,139,255,.12)'},
      {icon:'🪙',name:'Petty Cash',desc:'Small cash expenses',color:'rgba(255,211,42,.12)'},
      {icon:'↔️',name:'Contra Entry',desc:'Cash to bank or vice versa',color:'rgba(168,85,247,.12)'},
    ]},
    { title:'Sales', desc:'Sales invoices, cash sales and returns', items:[
      {icon:'💵',name:'Cash Sale',desc:'Counter POS sale',color:'rgba(212,135,74,.12)',action:()=>onNav('cash-sale')},
      {icon:'📄',name:'Sales Invoice',desc:'Credit sale to customer',color:'rgba(0,229,160,.12)'},
      {icon:'📋',name:'Quotation',desc:'Price quote / proforma',color:'rgba(61,139,255,.12)'},
      {icon:'↩️',name:'Sales Return',desc:'Customer return / refund',color:'rgba(255,71,87,.12)'},
      {icon:'📤',name:'Debit Note',desc:'Charge customer extra',color:'rgba(255,71,87,.12)'},
      {icon:'📥',name:'Credit Note',desc:'Credit to customer',color:'rgba(0,229,160,.12)'},
    ]},
    { title:'Procurement', desc:'Purchasing stock and receiving goods', items:[
      {icon:'📋',name:'Purchase Order',desc:'Order to supplier (no journal)',color:'rgba(100,116,139,.12)'},
      {icon:'🚛',name:'GRN',desc:'Receive goods from supplier',color:'rgba(251,146,60,.12)'},
      {icon:'🧾',name:'Purchase Invoice',desc:'Record a supplier bill',color:'rgba(168,85,247,.12)'},
      {icon:'↩️',name:'Purchase Return',desc:'Return goods to supplier',color:'rgba(255,71,87,.12)'},
    ]},
    { title:'Inventory Adjustments', desc:'Stock corrections and transfers', items:[
      {icon:'📦',name:'Opening Stock',desc:'Enter initial stock quantities',color:'rgba(212,135,74,.12)'},
      {icon:'🔧',name:'Stock Adjustment',desc:'Correct stock qty or write-off',color:'rgba(255,71,87,.12)'},
      {icon:'🔄',name:'Stock Transfer',desc:'Move stock between branches',color:'rgba(61,139,255,.12)'},
    ]},
    { title:'Journal & Corrections', desc:'Manual entries and corrections', items:[
      {icon:'🔄',name:'Journal Entry',desc:'Manual double-entry posting',color:'rgba(212,135,74,.12)'},
    ]},
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📝 Vouchers</div><div className="page-sub">Post payments, receipts, procurement and inventory adjustments</div></div>
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
              <div key={ii} className="voucher-card" onClick={'action' in item && item.action ? item.action : undefined}>
                <div className="voucher-card-icon" style={{ background:item.color }}>{item.icon}</div>
                <div className="voucher-card-name">{item.name}</div>
                <div className="voucher-card-desc">{item.desc}</div>
                <div className="voucher-card-action">+ New {item.name} →</div>
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
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')

  const filtered = ACCOUNTS.filter(a =>
    (filter==='all' || a.type===filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search))
  )
  const TYPE_COLOR: Record<string,string> = { asset:'pill-blue', liability:'pill-red', equity:'pill-gray', revenue:'pill-green', cogs:'pill-amber', expense:'pill-amber' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📂 Chart of Accounts</div><div className="page-sub">Double-entry account structure · {ACCOUNTS.length} accounts</div></div>
        <div className="page-actions">
          <input className="form-input" style={{ width:200, padding:'6px 10px', fontSize:12 }} placeholder="🔍 Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={()=>setShowModal(true)}>+ New Account</button>
        </div>
      </div>
      <div className="tabs">
        {['all','asset','liability','equity','revenue','cogs','expense'].map(t=>(
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
      {showModal && (
        <Modal title="📂 New Account" onClose={()=>setShowModal(false)}
          footer={<><div /><div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{setShowModal(false);setToast('Account created successfully')}}>💾 Create Account</button>
          </div></>}>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Account Code <span className="req">*</span></label><input className="form-input" placeholder="e.g. 1040" /></div>
            <div className="form-group"><label className="form-label">Account Name <span className="req">*</span></label><input className="form-input" placeholder="e.g. Petty Cash — Arusha" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Account Type <span className="req">*</span></label>
              <select className="form-input"><option>Asset</option><option>Liability</option><option>Equity</option><option>Revenue</option><option>COGS</option><option>Expense</option></select>
            </div>
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-input"><option>Cash & Bank</option><option>Receivables</option><option>Inventory</option><option>Fixed Assets</option><option>Payables</option><option>Tax</option><option>Revenue</option><option>COGS</option><option>People</option><option>Premises</option><option>Marketing</option><option>Technology</option><option>Admin</option></select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Opening Balance (TZS)</label><input className="form-input" type="number" placeholder="0" /></div>
            <div className="form-group"><label className="form-label">Branch</label><select className="form-input"><option>DSM HQ</option><option>Arusha Branch</option><option>All Branches</option></select></div>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </div>
  )
}

// ── CASH SALE ─────────────────────────────────────
function CashSale() {
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [wa, setWa] = useState('')
  const [custName, setCustName] = useState('')
  const [foundCust, setFoundCust] = useState<typeof CUSTOMERS[string]|null>(null)
  const [payment, setPayment] = useState('cash')
  const [lines, setLines] = useState([{productId:'', qty:1}])
  const [tendered, setTendered] = useState('')
  const [refNum, setRefNum] = useState(43)

  const lookupCust = (val:string) => {
    setWa(val)
    const c = CUSTOMERS[val.replace(/[\s+]/g,'')]
    if(c && val.replace(/[\s+]/g,'').length>=9){ setFoundCust(c); setCustName(c.name) }
    else{ setFoundCust(null) }
  }

  const subtotal = lines.reduce((s,l)=>{ const p=PRODUCTS.find(p=>p.id===l.productId); return s+(p?p.price*l.qty:0) },0)
  const vat = Math.round(subtotal*0.18)
  const total = subtotal+vat
  const change = tendered ? parseInt(tendered)-total : 0

  const postSale = () => {
    if(!custName){ setToast('❌ Please enter customer name'); return }
    setShowModal(false)
    setRefNum(n=>n+1)
    setToast(`✅ CS-${String(refNum).padStart(4,'0')} posted · Journal created · Dr Cash / Cr Revenue · Stock updated · WA receipt sent · Crown points awarded`)
    setWa(''); setCustName(''); setFoundCust(null); setLines([{productId:'',qty:1}]); setTendered(''); setPayment('cash')
  }

  const SALES = [
    {ref:'CS-0042',customer:'Amina Hassan',wa:'+255 712 345 678',products:'Breast pump × 1',amount:185000,payment:'Cash'},
    {ref:'CS-0041',customer:'Grace Mwanza',wa:'+255 758 221 043',products:'Nipple cream × 2',amount:95000,payment:'M-Pesa'},
    {ref:'CS-0040',customer:'Fatuma Iddi',wa:'+255 743 100 212',products:'Belly binder, Pillow',amount:340000,payment:'Cash'},
    {ref:'CS-0039',customer:'Zainab Ally',wa:'+255 769 887 654',products:'PeaceTouch Binder × 1',amount:105000,payment:'Bank'},
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">💵 Cash Sale</div><div className="page-sub">Counter POS · WhatsApp receipt auto-sent · Crown points auto-awarded · Stock auto-deducted</div></div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={()=>setShowModal(true)}>+ New Cash Sale</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card amber"><div className="stat-label">Today's Sales</div><div className="stat-value">1.24M</div><div className="stat-change up">▲ 7 transactions</div></div>
        <div className="stat-card green"><div className="stat-label">Cash Received</div><div className="stat-value">980K</div><div className="stat-change up">▲ 5 cash sales</div></div>
        <div className="stat-card blue"><div className="stat-label">M-Pesa</div><div className="stat-value">260K</div><div className="stat-change up">▲ 2 payments</div></div>
        <div className="stat-card yellow"><div className="stat-label">Crown Pts Awarded</div><div className="stat-value">5,480</div><div className="stat-change up">▲ Today</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Today's Sales</div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowModal(true)}>+ New Cash Sale</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sale No.</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th className="td-right">Amount (TZS)</th><th>Payment</th><th>Journal</th><th>Status</th></tr></thead>
            <tbody>
              {SALES.map((s,i)=>(
                <tr key={i}>
                  <td className="td-mono td-amber">{s.ref}</td>
                  <td className="td-bold">{s.customer}</td>
                  <td className="td-mono" style={{color:'var(--wa)'}}>{s.wa}</td>
                  <td style={{fontSize:12,color:'var(--text3)'}}>{s.products}</td>
                  <td className="td-right td-mono td-green">{s.amount.toLocaleString()}</td>
                  <td><span className={`pill ${s.payment==='Cash'?'pill-green':s.payment==='M-Pesa'?'pill-blue':'pill-amber'}`}>{s.payment}</span></td>
                  <td><span className="pill pill-green">Auto-posted</span></td>
                  <td><span className="pill pill-green">Posted</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="💵 New Cash Sale" size="lg" onClose={()=>setShowModal(false)}
          footer={<>
            <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)'}}>Posts: Dr Cash/Cr Revenue · Dr COGS/Cr Inventory · Crown points · WA receipt</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="btn btn-ghost">📋 Draft</button>
              <button className="btn btn-primary" onClick={postSale}>📤 Post & Send Receipt</button>
            </div>
          </>}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div>
              <div className="step-header"><div className="step-num">1</div><div className="step-title">STEP 1 — Customer Identity</div></div>
              <div className="step-box">
                <div className="form-row">
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">WhatsApp Number <span className="req">*</span></label>
                    <input className="form-input" value={wa} onChange={e=>lookupCust(e.target.value)} placeholder="+255 7XX XXX XXX" style={{borderColor:'var(--accent)'}} />
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Customer Name <span className="req">*</span></label>
                    <input className="form-input" value={custName} onChange={e=>setCustName(e.target.value)} placeholder="e.g. Fatuma Said" />
                  </div>
                </div>
                {foundCust && (
                  <div style={{marginTop:12,background:'var(--surface3)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:12}}>
                    <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--accent)',marginBottom:6,textTransform:'uppercase'}}>Existing Customer Found</div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{foundCust.name}</div>
                    <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:2}}>Stage: {foundCust.stage}</div>
                    <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:1}}>Last: {foundCust.last}</div>
                    <div style={{fontSize:11,color:'var(--green)',marginTop:6,fontStyle:'italic'}}>{foundCust.ai}</div>
                  </div>
                )}
              </div>
              <div className="step-header"><div className="step-num">2</div><div className="step-title">STEP 2 — Payment Method</div></div>
              <div className="step-box">
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[{id:'cash',label:'💵 Cash'},{id:'mpesa',label:'📱 M-Pesa'},{id:'bank',label:'🏦 Bank Transfer'},{id:'pos',label:'💳 POS Card'}].map(pm=>(
                    <button key={pm.id} onClick={()=>setPayment(pm.id)} className="btn" style={{justifyContent:'center',background:payment===pm.id?'var(--accent-dim)':'transparent',border:`1px solid ${payment===pm.id?'var(--accent)':'var(--border)'}`,color:payment===pm.id?'var(--accent)':'var(--text2)'}}>{pm.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="step-header"><div className="step-num">3</div><div className="step-title">STEP 3 — Products</div></div>
              <div className="step-box">
                {lines.map((line,li)=>(
                  <div key={li} style={{display:'flex',gap:8,marginBottom:8}}>
                    <select className="form-input" style={{flex:1,fontSize:12}} value={line.productId}
                      onChange={e=>{const nl=[...lines];nl[li].productId=e.target.value;setLines(nl)}}>
                      <option value="">— Select product —</option>
                      {PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name} — {tzs(p.price)}</option>)}
                    </select>
                    <input type="number" className="form-input" style={{width:60,textAlign:'center',fontSize:12}} min={1} value={line.qty}
                      onChange={e=>{const nl=[...lines];nl[li].qty=parseInt(e.target.value)||1;setLines(nl)}} />
                    {lines.length>1 && <button className="btn btn-ghost btn-sm" onClick={()=>setLines(lines.filter((_,i)=>i!==li))}>✕</button>}
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center',marginBottom:10}} onClick={()=>setLines([...lines,{productId:'',qty:1}])}>+ Add item</button>
                <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}><span style={{color:'var(--text3)'}}>Subtotal</span><span className="td-mono">{tzs(subtotal)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}><span style={{color:'var(--text3)'}}>VAT (18%)</span><span className="td-mono td-amber">{tzs(vat)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:700,padding:'10px 0',borderTop:'1px solid var(--border2)'}}>
                    <span>TOTAL</span><span className="td-mono td-green">{tzs(total)}</span>
                  </div>
                </div>
              </div>
              <div className="step-header">
                <div className="step-num" style={{background:'var(--surface3)',color:'var(--text3)'}}>4</div>
                <div className="step-title" style={{color:'var(--text2)'}}>AMOUNT TENDERED</div>
              </div>
              <div className="step-box">
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--text3)'}}>TZS</span>
                  <input className="form-input" type="number" placeholder="0" value={tendered} onChange={e=>setTendered(e.target.value)} style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,flex:1}} />
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:12}}>
                  <span style={{color:'var(--text3)'}}>Change</span>
                  <span className="td-mono" style={{color:change>=0?'var(--green)':'var(--red)'}}>{tzs(Math.max(0,change))}</span>
                </div>
              </div>
              <div style={{background:'var(--surface3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:12,fontSize:11,display:'flex',flexDirection:'column',gap:5}}>
                <div style={{color:'var(--wa)'}}>💬 WhatsApp receipt auto-sent to customer</div>
                <div style={{color:'var(--text3)'}}>📦 Inventory deducted · Journal auto-posted</div>
                <div style={{color:'var(--yellow)'}}>👑 Crown points awarded automatically</div>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} type={toast.startsWith('❌')?'error':'success'} onClose={()=>setToast('')} />}
    </div>
  )
}

// ── INVENTORY ─────────────────────────────────────
function Inventory() {
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState('')

  const filtered = PRODUCTS.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.sku.toLowerCase().includes(search.toLowerCase()))
  const _totalValue = PRODUCTS.reduce((s,p)=>s+p.cost*p.qty,0)
  const lowStock = PRODUCTS.filter(p=>getStatus(p.qty,p.reorder)!=='ok').length

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📦 Inventory</div><div className="page-sub">Stock management · {PRODUCTS.length} products · DSM HQ</div></div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAddModal(true)}>+ Add Product</button>
        </div>
      </div>
      <div className="grid g4" style={{marginBottom:20}}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{PRODUCTS.length}</div><div className="stat-change up">▲ Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value">TZS {(_totalValue/1000000).toFixed(1)}M</div><div className="stat-change up">▲ At cost price</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low Stock Items</div><div className="stat-value">{lowStock}</div><div className="stat-change down">▼ Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{PRODUCTS.filter(p=>p.qty===0).length}</div><div className="stat-change down">▼ Action required</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Products — Stock Levels</div>
          <div style={{display:'flex',gap:8}}>
            <input className="form-input" style={{width:200,padding:'6px 10px',fontSize:12}} placeholder="🔍 Search products…" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={()=>setShowAddModal(true)}>+ Add</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Product Name</th><th>Category</th><th className="td-right">Qty</th><th className="td-right">Reorder</th><th className="td-right">Cost (TZS)</th><th className="td-right">Price (TZS)</th><th className="td-right">Value</th><th>Level</th></tr></thead>
            <tbody>
              {filtered.map((p,i)=>{
                const s = getStatus(p.qty,p.reorder)
                const pct = Math.min(100,Math.round((p.qty/(p.reorder*2))*100))
                const colors = {ok:'var(--green)',low:'var(--yellow)',critical:'var(--red)'}
                return (
                  <tr key={i}>
                    <td className="td-mono td-amber">{p.sku}</td>
                    <td className="td-bold">{p.name}</td>
                    <td style={{fontSize:12,color:'var(--text3)'}}>{p.category}</td>
                    <td className="td-right td-mono" style={{color:colors[s],fontWeight:600}}>{p.qty}</td>
                    <td className="td-right td-mono" style={{color:'var(--text3)'}}>{p.reorder}</td>
                    <td className="td-right td-mono">{p.cost.toLocaleString()}</td>
                    <td className="td-right td-mono">{p.price.toLocaleString()}</td>
                    <td className="td-right td-mono">{(p.cost*p.qty).toLocaleString()}</td>
                    <td>
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        <div className="stock-bar"><div className={`stock-fill ${s}`} style={{width:`${pct}%`}}></div></div>
                        <span style={{fontSize:9,fontFamily:'var(--mono)',color:colors[s],textTransform:'uppercase'}}>{s}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <Modal title="📦 Add New Product" onClose={()=>setShowAddModal(false)}
          footer={<><div /><div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={()=>setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{setShowAddModal(false);setToast('Product added · Opening stock posted to inventory account')}}>💾 Save Product</button>
          </div></>}>
          <div className="form-row">
            <div className="form-group"><label className="form-label">SKU <span className="req">*</span></label><input className="form-input" placeholder="MK-009" /></div>
            <div className="form-group"><label className="form-label">Product Name <span className="req">*</span></label><input className="form-input" placeholder="e.g. Nursing Pillow" /></div>
          </div>
          <div className="form-row-3">
            <div className="form-group"><label className="form-label">Category</label><select className="form-input"><option>Feeding</option><option>Postpartum</option><option>Comfort</option><option>Pregnancy</option><option>Newborn</option><option>Supplements</option></select></div>
            <div className="form-group"><label className="form-label">Cost Price (TZS) <span className="req">*</span></label><input className="form-input" type="number" placeholder="0" /></div>
            <div className="form-group"><label className="form-label">Selling Price (TZS) <span className="req">*</span></label><input className="form-input" type="number" placeholder="0" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Opening Stock Qty <span className="req">*</span></label><input className="form-input" type="number" placeholder="0" /></div>
            <div className="form-group"><label className="form-label">Reorder Point</label><input className="form-input" type="number" placeholder="10" /></div>
          </div>
          <div style={{background:'var(--accent-dim)',border:'1px solid rgba(212,135,74,.2)',borderRadius:'var(--r)',padding:10,fontSize:11,color:'var(--accent)'}}>
            ⚡ Opening stock will auto-post: Dr Inventory (1110) · Cr Opening Stock Equity
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </div>
  )
}

// ── REPORTS HUB ───────────────────────────────────
function ReportsHub({ onNav }: { onNav:(p:Page)=>void }) {
  const REPORT_SECTIONS = [
    { title:'Financial Statements', reports:[
      {name:'Profit & Loss',desc:'Income vs expenses',icon:'📊',page:'pnl' as Page},
      {name:'Trial Balance',desc:'All account balances',icon:'📋',page:'trial-balance' as Page},
    ]},
    { title:'Registers', reports:[
      {name:'Sales Register',desc:'All sales in date order',icon:'🛒',page:'sales-register' as Page},
      {name:'Purchase Register',desc:'All purchase transactions',icon:'🏭',page:'purchase-register' as Page},
      {name:'Payment Register',desc:'All payments made',icon:'💸',page:'payment-register' as Page},
    ]},
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📈 Reports</div><div className="page-sub">Financial statements and registers — all live from transactions</div></div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm">🖨️ Print</button>
          <button className="btn btn-primary btn-sm">📥 Export</button>
        </div>
      </div>
      {REPORT_SECTIONS.map((section,si)=>(
        <div key={si} style={{marginBottom:28}}>
          <div className="section-label"><div className="section-bar"></div><div className="section-title-txt">{section.title}</div></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
            {section.reports.map((r,ri)=>(
              <div key={ri} className="card card-sm" style={{cursor:'pointer',display:'flex',alignItems:'center',gap:12}} onClick={()=>onNav(r.page)}>
                <div style={{width:36,height:36,background:'var(--accent-dim)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{r.icon}</div>
                <div>
                  <div style={{fontFamily:'var(--display)',fontSize:13,fontWeight:600,color:'var(--text)'}}>{r.name}</div>
                  <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── P&L ───────────────────────────────────────────
function PnL() {
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📊 Profit & Loss</div><div className="page-sub">March 2026 · DSM HQ</div></div>
        <div className="page-actions">
          <select className="form-input" style={{width:150,padding:'6px 10px',fontSize:12}}><option>March 2026</option><option>February 2026</option><option>Q1 2026</option></select>
          <button className="btn btn-ghost btn-sm">🖨️ Print</button>
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
          <div className="report-section-title" style={{marginTop:24}}>Cost of Goods Sold</div>
          {[['Opening Stock','(14,200,000)','td-red'],['Add: Purchases','(5,880,000)','td-red'],['Less: Closing Stock','18,400,000','td-green']].map(([l,v,c],i)=>(
            <div key={i} className="report-row"><span className="r-label r-indent">{l}</span><span className={`r-value ${c}`}>{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total COGS</span><span className="r-value">(1,680,000)</span></div>
          <div style={{height:1,background:'var(--border2)',margin:'12px 0'}}></div>
          <div className="report-row total" style={{borderTop:'none'}}>
            <span className="r-label" style={{fontSize:15}}>Gross Profit</span>
            <span className="r-value" style={{fontSize:16,color:'var(--green)'}}>2,570,000</span>
          </div>
        </div>
        <div className="card">
          <div className="report-section-title">Operating Expenses</div>
          {[['Salaries','(450,000)'],['Rent — Office','(180,000)'],['Transport & Delivery','(65,000)'],['Marketing','(55,000)'],['Bank Charges','(18,000)']].map(([l,v],i)=>(
            <div key={i} className="report-row negative"><span className="r-label r-indent">{l}</span><span className="r-value">{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total Operating Exp</span><span className="r-value">(768,000)</span></div>
          <div style={{height:1,background:'var(--border2)',margin:'20px 0'}}></div>
          <div style={{background:'var(--green-dim)',border:'1px solid rgba(0,229,160,.2)',borderRadius:'var(--r)',padding:16}}>
            <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Net Profit — March 2026</div>
            <div style={{fontFamily:'var(--display)',fontSize:32,fontWeight:800,color:'var(--green)'}}>TZS 1,802,000</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>Margin: 42.4% · vs Feb: +18%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SALES REGISTER ────────────────────────────────
function SalesRegister() {
  const DATA = [
    {date:'23/03/2026',ref:'CS-0042',customer:'Amina Hassan',wa:'+255 712 345 678',products:'Breast Pump × 1',payment:'Cash',subtotal:156779,vat:28221,total:185000},
    {date:'23/03/2026',ref:'CS-0041',customer:'Grace Mwanza',wa:'+255 758 221 043',products:'Nipple Cream × 2',payment:'M-Pesa',subtotal:80508,vat:14492,total:95000},
    {date:'23/03/2026',ref:'CS-0040',customer:'Fatuma Iddi',wa:'+255 743 100 212',products:'Belly Binder, Pillow',payment:'Cash',subtotal:288136,vat:51864,total:340000},
    {date:'22/03/2026',ref:'CS-0039',customer:'Zainab Ally',wa:'+255 769 887 654',products:'PeaceTouch Binder × 1',payment:'Bank',subtotal:89000,vat:16000,total:105000},
  ]
  const totals = DATA.reduce((acc,r)=>({sub:acc.sub+r.subtotal,vat:acc.vat+r.vat,total:acc.total+r.total}),{sub:0,vat:0,total:0})
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">🛒 Sales Register</div><div className="page-sub">All sales transactions in chronological order</div></div>
        <div className="page-actions">
          <input type="date" className="form-input" style={{width:140,padding:'6px 10px',fontSize:12}} defaultValue="2026-03-01" />
          <span style={{color:'var(--text3)'}}>to</span>
          <input type="date" className="form-input" style={{width:140,padding:'6px 10px',fontSize:12}} defaultValue="2026-03-23" />
          <button className="btn btn-primary btn-sm">🔄 Load</button>
          <button className="btn btn-ghost btn-sm">📥 Export</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th>Payment</th><th className="td-right">Subtotal</th><th className="td-right">VAT</th><th className="td-right">Total (TZS)</th></tr></thead>
          <tbody>
            {DATA.map((r,i)=>(
              <tr key={i}>
                <td className="td-mono" style={{color:'var(--text3)'}}>{r.date}</td>
                <td className="td-mono td-amber">{r.ref}</td>
                <td className="td-bold">{r.customer}</td>
                <td className="td-mono" style={{color:'var(--wa)'}}>{r.wa}</td>
                <td style={{fontSize:12,color:'var(--text3)'}}>{r.products}</td>
                <td><span className={`pill ${r.payment==='Cash'?'pill-green':r.payment==='M-Pesa'?'pill-blue':'pill-amber'}`}>{r.payment}</span></td>
                <td className="td-right td-mono">{r.subtotal.toLocaleString()}</td>
                <td className="td-right td-mono td-amber">{r.vat.toLocaleString()}</td>
                <td className="td-right td-mono td-green">{r.total.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{background:'var(--surface2)',fontWeight:700}}>
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

// ── COMING SOON ───────────────────────────────────
function ComingSoon({ module='Module', phase='?' }: { module?:string; phase?:string }) {
  return (
    <div className="page">
      <div className="coming-soon">
        <div className="cs-icon">🚧</div>
        <div className="cs-title">{module}</div>
        <div className="cs-sub">This module is planned for a future phase of the build.</div>
        <div className="cs-tag">Coming in Phase {phase}</div>
      </div>
    </div>
  )
}

// ── SETTINGS ──────────────────────────────────────
function Settings() {
  const [toast, setToast] = useState('')
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">⚙️ Settings</div><div className="page-sub">System configuration · Malkia Wellness Group Ltd</div></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-title" style={{marginBottom:16}}>Company Information</div>
          <div className="form-group"><label className="form-label">Company Name</label><input className="form-input" defaultValue="Malkia Wellness Group Ltd" /></div>
          <div className="form-group"><label className="form-label">TIN Number</label><input className="form-input" defaultValue="123-456-789" /></div>
          <div className="form-group"><label className="form-label">VRN (VAT Reg No)</label><input className="form-input" defaultValue="40-123456-E" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Currency</label><select className="form-input"><option>TZS — Tanzanian Shilling</option><option>USD</option></select></div>
            <div className="form-group"><label className="form-label">Financial Year</label><select className="form-input"><option>July — June</option><option>January — December</option></select></div>
          </div>
          <div className="form-group"><label className="form-label">Default VAT Rate (%)</label><input className="form-input" type="number" defaultValue="18" /></div>
          <button className="btn btn-primary" onClick={()=>setToast('Settings saved successfully')}>Save Changes</button>
        </div>
        <div className="card">
          <div className="card-title" style={{marginBottom:16}}>Users & Access</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Status</th></tr></thead>
              <tbody>
                {[
                  {name:'Joe Gembe',role:'Super Admin',branch:'DSM HQ',status:'Active'},
                  {name:'Jane Mwatonoka',role:'Super Admin',branch:'DSM HQ',status:'Active'},
                  {name:'Barbra Kabendera',role:'CRM Manager',branch:'DSM HQ',status:'Pending'},
                  {name:'Lilian Mallya',role:'Sales Rep',branch:'DSM HQ',status:'Pending'},
                  {name:'Sophia Kipanta',role:'Midwife',branch:'DSM HQ',status:'Pending'},
                ].map((u,i)=>(
                  <tr key={i}>
                    <td className="td-bold">{u.name}</td>
                    <td><span className={`pill ${u.role==='Super Admin'?'pill-amber':'pill-blue'}`}>{u.role}</span></td>
                    <td style={{fontSize:11,color:'var(--text3)'}}>{u.branch}</td>
                    <td><span className={`pill ${u.status==='Active'?'pill-green':'pill-gray'}`}>{u.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" style={{marginTop:12}}>+ Invite User</button>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={()=>setToast('')} />}
    </div>
  )
}

// ── BREADCRUMB MAP ────────────────────────────────
const BREADCRUMBS: Record<Page,string> = {
  'dashboard':'Dashboard',
  'vouchers':'Vouchers',
  'chart-of-accounts':'Chart of Accounts',
  'cash-sale':'Cash Sale',
  'sales':'Sales',
  'inventory':'Inventory',
  'reports':'Reports',
  'pnl':'Profit & Loss',
  'sales-register':'Sales Register',
  'purchase-register':'Purchase Register',
  'payment-register':'Payment Register',
  'trial-balance':'Trial Balance',
  'settings':'Settings',
  'coming-soon':'Coming Soon',
  'stock-levels':'Stock Levels',
  'suppliers':'Suppliers',
  'stock-movements':'Stock Movements',
}

// ── MAIN APP ──────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch(page) {
      case 'dashboard': return <Dashboard onNav={setPage} />
      case 'vouchers': return <VouchersHub onNav={setPage} />
      case 'chart-of-accounts': return <ChartOfAccounts />
      case 'cash-sale': return <CashSale />
      case 'sales': return <CashSale />
      case 'inventory': return <Inventory />
      case 'reports': return <ReportsHub onNav={setPage} />
      case 'pnl': return <PnL />
      case 'sales-register': return <SalesRegister />
      case 'settings': return <Settings />
      case 'coming-soon': return <ComingSoon module="This Module" phase="4" />
      default: return <ComingSoon module={BREADCRUMBS[page] || page} phase="Next" />
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
