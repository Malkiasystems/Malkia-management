export default function SalesRegister() {
  const DATA = [
    { date: '23/03/2026', ref: 'CS-0042', customer: 'Amina Hassan', wa: '+255 712 345 678', products: 'Breast Pump × 1', payment: 'Cash', subtotal: 156779, vat: 28221, total: 185000 },
    { date: '23/03/2026', ref: 'CS-0041', customer: 'Grace Mwanza', wa: '+255 758 221 043', products: 'Nipple Cream × 2', payment: 'M-Pesa', subtotal: 80508, vat: 14492, total: 95000 },
    { date: '22/03/2026', ref: 'CS-0040', customer: 'Fatuma Iddi', wa: '+255 743 100 212', products: 'Belly Binder, Pillow', payment: 'Cash', subtotal: 288136, vat: 51864, total: 340000 },
    { date: '22/03/2026', ref: 'CS-0039', customer: 'Zainab Ally', wa: '+255 769 887 654', products: 'PeaceTouch Binder × 1', payment: 'Bank', subtotal: 89000, vat: 16000, total: 105000 },
  ]
  const totals = DATA.reduce((acc, r) => ({ sub: acc.sub + r.subtotal, vat: acc.vat + r.vat, total: acc.total + r.total }), { sub: 0, vat: 0, total: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">🛒 Sales Register</div><div className="page-sub">All sales in chronological order</div></div>
        <div className="page-actions">
          <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} defaultValue="2026-03-01" />
          <span style={{ color: 'var(--text3)' }}>to</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} defaultValue="2026-03-23" />
          <button className="btn btn-primary btn-sm">🔄 Load</button>
          <button className="btn btn-ghost btn-sm">📥 Export</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Products</th><th>Payment</th><th className="td-right">Subtotal</th><th className="td-right">VAT</th><th className="td-right">Total (TZS)</th></tr>
          </thead>
          <tbody>
            {DATA.map((r, i) => (
              <tr key={i}>
                <td className="td-mono" style={{ color: 'var(--text3)' }}>{r.date}</td>
                <td className="td-mono td-amber">{r.ref}</td>
                <td className="td-bold">{r.customer}</td>
                <td className="td-mono" style={{ color: 'var(--wa)' }}>{r.wa}</td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{r.products}</td>
                <td><span className={`pill ${r.payment === 'Cash' ? 'pill-green' : r.payment === 'M-Pesa' ? 'pill-blue' : 'pill-amber'}`}>{r.payment}</span></td>
                <td className="td-right td-mono">{r.subtotal.toLocaleString()}</td>
                <td className="td-right td-mono td-amber">{r.vat.toLocaleString()}</td>
                <td className="td-right td-mono td-green">{r.total.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
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
