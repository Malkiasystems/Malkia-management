export default function PnL() {
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">📊 Profit & Loss</div><div className="page-sub">March 2026 · DSM HQ</div></div>
        <div className="page-actions">
          <select className="form-input" style={{ width: 150, padding: '6px 10px', fontSize: 12 }}>
            <option>March 2026</option><option>February 2026</option><option>Q1 2026</option>
          </select>
          <button className="btn btn-ghost btn-sm">🖨️ Print</button>
          <button className="btn btn-primary btn-sm">📥 Export PDF</button>
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="report-section-title">Revenue</div>
          {[['Sales — Retail', '3,800,000', 'td-green'], ['Sales — Wholesale', '450,000', 'td-green']].map(([l, v, c], i) => (
            <div key={i} className="report-row"><span className="r-label r-indent">{l}</span><span className={`r-value ${c}`}>{v}</span></div>
          ))}
          <div className="report-row total"><span className="r-label">Total Revenue</span><span className="r-value">4,250,000</span></div>

          <div className="report-section-title" style={{ marginTop: 20 }}>Cost of Goods Sold</div>
          {[['Opening Stock', '(14,200,000)', 'td-red'], ['Purchases', '(5,880,000)', 'td-red'], ['Closing Stock', '18,400,000', 'td-green']].map(([l, v, c], i) => (
            <div key={i} className="report-row"><span className="r-label r-indent">{l}</span><span className={`r-value ${c}`}>{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total COGS</span><span className="r-value">(1,680,000)</span></div>

          <div style={{ height: 1, background: 'var(--border2)', margin: '12px 0' }}></div>
          <div className="report-row total" style={{ borderTop: 'none' }}>
            <span className="r-label" style={{ fontSize: 15 }}>Gross Profit</span>
            <span className="r-value" style={{ fontSize: 16, color: 'var(--green)' }}>2,570,000</span>
          </div>
        </div>

        <div className="card">
          <div className="report-section-title">Operating Expenses</div>
          {[['Salaries', '(450,000)'], ['Rent', '(180,000)'], ['Transport', '(65,000)'], ['Marketing', '(55,000)'], ['Bank Charges', '(18,000)']].map(([l, v], i) => (
            <div key={i} className="report-row negative"><span className="r-label r-indent">{l}</span><span className="r-value">{v}</span></div>
          ))}
          <div className="report-row total negative"><span className="r-label">Total Operating Exp</span><span className="r-value">(768,000)</span></div>

          <div style={{ height: 1, background: 'var(--border2)', margin: '20px 0' }}></div>
          <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 'var(--r)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Net Profit — March 2026</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: 'var(--green)' }}>TZS 1,802,000</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Margin: 42.4% · vs Feb: +18%</div>
          </div>
        </div>
      </div>
    </div>
  )
}
