import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

const SECTIONS = [
  {
    title: 'Money Vouchers', desc: 'Payments, receipts and transfers', items: [
      { icon: '💸', name: 'Cash Payment', desc: 'Pay expense or supplier in cash', color: 'rgba(255,71,87,.12)', page: 'cash-payment' as Page },
      { icon: '📥', name: 'Cash Receipt', desc: 'Record money received in cash', color: 'rgba(0,229,160,.12)', page: 'cash-receipt' as Page },
      { icon: '🏦', name: 'Bank Payment', desc: 'Pay via bank transfer or cheque', color: 'rgba(61,139,255,.12)', page: 'bank-payment' as Page },
      { icon: '📤', name: 'Bank Receipt', desc: 'Record money received in bank', color: 'rgba(0,229,160,.12)', page: 'bank-receipt' as Page },
      { icon: '🔁', name: 'Bank Transfer', desc: 'Between your own accounts', color: 'rgba(61,139,255,.12)', page: 'bank-transfer' as Page },
      { icon: '🪙', name: 'Petty Cash', desc: 'Small cash office expenses', color: 'rgba(255,211,42,.12)', page: 'petty-cash' as Page },
      { icon: '↔️', name: 'Contra Entry', desc: 'Cash deposit to bank or withdrawal', color: 'rgba(168,85,247,.12)', page: 'contra' as Page },
    ]
  },
  {
    title: 'Sales', desc: 'Sales invoices, cash sales and returns', items: [
      { icon: '💵', name: 'Cash Sale', desc: 'Counter POS — WhatsApp receipt', color: 'rgba(212,135,74,.12)', page: 'cash-sale' as Page },
      { icon: '📄', name: 'Sales Invoice', desc: 'Credit sale — creates AR entry', color: 'rgba(0,229,160,.12)', page: 'sales-invoice' as Page },
      { icon: '📋', name: 'Quotation', desc: 'Price quote / proforma invoice', color: 'rgba(61,139,255,.12)', page: 'coming-soon' as Page },
      { icon: '↩️', name: 'Sales Return', desc: 'Customer return / refund', color: 'rgba(255,71,87,.12)', page: 'sales-return' as Page },
      { icon: '📤', name: 'Debit Note', desc: 'Charge customer additional amount', color: 'rgba(255,71,87,.12)', page: 'debit-note' as Page },
      { icon: '📥', name: 'Credit Note', desc: 'Credit customer — reduce balance', color: 'rgba(0,229,160,.12)', page: 'credit-note' as Page },
    ]
  },
  {
    title: 'Procurement', desc: 'Purchasing stock and receiving goods', items: [
      { icon: '📋', name: 'Purchase Order', desc: 'Order to supplier — no journal', color: 'rgba(100,116,139,.12)', page: 'purchase-order' as Page },
      { icon: '🚛', name: 'GRN', desc: 'Receive goods — updates stock', color: 'rgba(251,146,60,.12)', page: 'grn' as Page },
      { icon: '🧾', name: 'Purchase Invoice', desc: 'Supplier bill — creates AP entry', color: 'rgba(168,85,247,.12)', page: 'purchase-invoice' as Page },
      { icon: '↩️', name: 'Purchase Return', desc: 'Return goods to supplier', color: 'rgba(255,71,87,.12)', page: 'purchase-return' as Page },
    ]
  },
  {
    title: 'Inventory Adjustments', desc: 'Stock corrections and transfers', items: [
      { icon: '📦', name: 'Opening Stock', desc: 'Enter initial stock quantities', color: 'rgba(212,135,74,.12)', page: 'opening-stock' as Page },
      { icon: '🔧', name: 'Stock Adjustment', desc: 'Physical count correction or write-off', color: 'rgba(255,71,87,.12)', page: 'stock-adjustment' as Page },
      { icon: '🔄', name: 'Stock Transfer', desc: 'Move stock between branches', color: 'rgba(61,139,255,.12)', page: 'stock-transfer' as Page },
    ]
  },
  {
    title: 'Journal & Corrections', desc: 'Manual double-entry postings', items: [
      { icon: '🔄', name: 'Journal Entry', desc: 'Manual debit/credit — must balance', color: 'rgba(212,135,74,.12)', page: 'journal-entry' as Page },
    ]
  },
]

export default function VouchersHub({ onNav }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📝 Vouchers</div>
          <div className="page-sub">Every voucher auto-creates a double-entry journal · Stock updates automatically</div>
        </div>
      </div>
      {SECTIONS.map((section, si) => (
        <div key={si} style={{ marginBottom: 32 }}>
          <div className="section-label">
            <div className="section-bar"></div>
            <div className="section-title-txt">{section.title}</div>
            <div className="section-desc-txt">— {section.desc}</div>
          </div>
          <div className="voucher-grid">
            {section.items.map((item, ii) => (
              <div key={ii} className="voucher-card" onClick={() => onNav(item.page)}>
                <div className="voucher-card-icon" style={{ background: item.color }}>{item.icon}</div>
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
