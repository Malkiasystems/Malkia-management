// src/pages/Loans.tsx
//
// Loan portfolio plus a calculator that mirrors how Tanzanian lenders actually
// quote. The calculator is the part most owners will use first: it lets them
// price an offer BEFORE signing, and crucially converts every quote to an
// effective reducing-balance rate so a "10% flat" microfinance offer and an
// "18% reducing" bank offer can be compared honestly. They cost about the same,
// and nothing on a lender's term sheet says so.
//
// Maths lives in lib/loanMath.ts and is unit tested. Nothing is computed here.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useAuth } from '../lib/useAuth'
import { computeLoan, type InterestMethod } from '../lib/loanMath'
import { GuideTip, GuideToggle } from '../components/GuideMode'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

interface LoanRow {
  id: string; ref: string; lender: string; lender_type: string
  principal: number; interest_method: InterestMethod
  annual_rate_pct: number | null; total_repayable: number | null
  periods: number; periods_per_year: number
  start_date: string; status: string; is_opening: boolean
}

const METHOD_LABEL: Record<InterestMethod, string> = {
  reducing_balance: 'Reducing balance',
  flat: 'Flat rate',
  fixed_total: 'Fixed total repayable',
}

export default function Loans({ onNav }: Props) {
  const { can, isSuperAdmin } = useAuth()
  const canCreate = isSuperAdmin() || can('loans.create')

  const [loans, setLoans] = useState<LoanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'portfolio' | 'calculator'>('portfolio')

  // ── Calculator state ────────────────────────────────────────────────────
  const [cPrincipal, setCPrincipal] = useState('5000000')
  const [cMethod, setCMethod] = useState<InterestMethod>('reducing_balance')
  const [cRate, setCRate] = useState('18')
  const [cTotal, setCTotal] = useState('6000000')
  const [cPeriods, setCPeriods] = useState('12')
  const [cPpy, setCPpy] = useState('12')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('loans')
      .select('id, ref, lender, lender_type, principal, interest_method, annual_rate_pct, total_repayable, periods, periods_per_year, start_date, status, is_opening')
      .order('start_date', { ascending: false })
    setLoans((data as LoanRow[]) || [])
    setLoading(false)
  }

  const calc = computeLoan({
    principal: parseFloat(cPrincipal) || 0,
    annualRatePct: parseFloat(cRate) || 0,
    totalRepayable: parseFloat(cTotal) || 0,
    periods: parseInt(cPeriods) || 0,
    periodsPerYear: parseInt(cPpy) || 12,
    method: cMethod,
  })

  // Portfolio totals. Outstanding is the sum of what is still owed on active
  // facilities, using each loan's own terms.
  const active = loans.filter(l => l.status === 'active')
  const totals = active.reduce((acc, l) => {
    const r = computeLoan({
      principal: l.principal,
      annualRatePct: l.annual_rate_pct ?? 0,
      totalRepayable: l.total_repayable ?? 0,
      periods: l.periods,
      periodsPerYear: l.periods_per_year,
      method: l.interest_method,
    })
    acc.principal += l.principal
    acc.repayable += r.totalRepayableAmount
    acc.interest += r.totalInterest
    acc.perPeriod += r.instalment
    return acc
  }, { principal: 0, repayable: 0, interest: 0, perPeriod: 0 })

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 16,
  }
  const label: React.CSSProperties = {
    fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Loans</h1>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
            Every facility the business is carrying, and what each one really costs
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <GuideToggle />
          {canCreate && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('opening-loans')}>
              Record existing loans
            </button>
          )}
          {canCreate && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('new-loan')}>
              New loan
            </button>
          )}
          {canCreate && loans.some(l => l.status === 'active') && (
            <button className="btn btn-primary btn-sm" onClick={() => onNav('loan-repayment')}>
              Make a repayment
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '18px 0' }}>
        {(['portfolio', 'calculator'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'portfolio' && (
        <>
          <GuideTip>Total repayable includes interest, so it is always higher than what you borrowed. The gap is the cost of the money.</GuideTip>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { l: 'Borrowed (principal)', v: tzs(totals.principal) },
              { l: 'Total repayable', v: tzs(totals.repayable) },
              { l: 'Interest cost', v: tzs(totals.interest), red: true },
              { l: 'Per instalment', v: tzs(totals.perPeriod) },
            ].map(s => (
              <div key={s.l} style={card}>
                <div style={label}>{s.l}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: s.red ? 'var(--red)' : 'var(--text)' }}>{s.v}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : loans.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 40 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No loans recorded</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>
                If the business already owes money, record it once so it shows on the balance sheet
                as a liability. Until then your books will overstate what the business is worth.
              </div>
              {canCreate && (
                <button className="btn btn-primary btn-sm" onClick={() => onNav('opening-loans')}>
                  Record existing loans
                </button>
              )}
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontSize: 10 }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>LENDER</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>METHOD</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>PRINCIPAL</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>REPAYABLE</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>EFFECTIVE RATE</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>INSTALMENT</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map(l => {
                    const r = computeLoan({
                      principal: l.principal,
                      annualRatePct: l.annual_rate_pct ?? 0,
                      totalRepayable: l.total_repayable ?? 0,
                      periods: l.periods,
                      periodsPerYear: l.periods_per_year,
                      method: l.interest_method,
                    })
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', opacity: l.status === 'active' ? 1 : 0.55 }}>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 600 }}>{l.lender}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {l.ref}{l.is_opening ? ' · opening' : ''}{l.status !== 'active' ? ` · ${l.status}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: 12 }}>{METHOD_LABEL[l.interest_method]}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(l.principal)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(r.totalRepayableAmount)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                          {r.effectiveAnnualRatePct.toFixed(1)}%
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(r.instalment)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'calculator' && (
        <>
          <GuideTip>Use this before you sign. Enter the lender's numbers exactly as quoted, then read the effective rate: that is the only figure that lets you compare two offers fairly.</GuideTip>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
            <div style={card}>
              <div style={label}>How is interest charged?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {([
                  ['reducing_balance', 'Reducing balance', 'What CRDB, NMB and other banks quote. Interest is charged on what is still outstanding.'],
                  ['flat', 'Flat rate', 'Common with microfinance and SACCOS. Interest is charged on the full original amount for the whole term.'],
                  ['fixed_total', 'Fixed total repayable', 'No rate quoted. You borrow one amount and agree to pay back another, for example borrow 50m, repay 60m.'],
                ] as const).map(([val, title, desc]) => (
                  <label key={val} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 12.5 }}>
                    <input type="radio" name="method" checked={cMethod === val}
                      onChange={() => setCMethod(val)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                    <span>
                      {title}
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{desc}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div style={label}>Amount borrowed (TZS)</div>
              <input className="form-input" type="number" style={{ fontFamily: 'var(--mono)', marginBottom: 12 }}
                value={cPrincipal} onChange={e => setCPrincipal(e.target.value)} />

              {cMethod === 'fixed_total' ? (
                <>
                  <div style={label}>Total you agreed to repay (TZS)</div>
                  <input className="form-input" type="number" style={{ fontFamily: 'var(--mono)', marginBottom: 12 }}
                    value={cTotal} onChange={e => setCTotal(e.target.value)} />
                </>
              ) : (
                <>
                  <div style={label}>Annual interest rate (%)</div>
                  <input className="form-input" type="number" style={{ fontFamily: 'var(--mono)', marginBottom: 12 }}
                    value={cRate} onChange={e => setCRate(e.target.value)} />
                </>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={label}>Instalments</div>
                  <input className="form-input" type="number" style={{ fontFamily: 'var(--mono)' }}
                    value={cPeriods} onChange={e => setCPeriods(e.target.value)} />
                </div>
                <div>
                  <div style={label}>Frequency</div>
                  <select className="form-input" value={cPpy} onChange={e => setCPpy(e.target.value)}>
                    <option value="12">Monthly</option>
                    <option value="4">Quarterly</option>
                    <option value="52">Weekly</option>
                    <option value="1">Yearly</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {[
                  { l: 'Per instalment', v: tzs(calc.instalment) },
                  { l: 'Total repayable', v: tzs(calc.totalRepayableAmount) },
                  { l: 'Interest cost', v: tzs(calc.totalInterest), red: true },
                ].map(s => (
                  <div key={s.l} style={card}>
                    <div style={label}>{s.l}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: s.red ? 'var(--red)' : 'var(--text)' }}>{s.v}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...card, borderColor: 'var(--accent)' }}>
                <div style={label}>True cost of this money</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>
                  {calc.effectiveAnnualRatePct.toFixed(1)}% <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>per year, reducing balance</span>
                </div>
                {cMethod !== 'reducing_balance' && calc.effectiveAnnualRatePct > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
                    {cMethod === 'flat'
                      ? `A ${(parseFloat(cRate) || 0).toFixed(1)}% flat loan is not a ${(parseFloat(cRate) || 0).toFixed(1)}% loan. Because you keep paying interest on money you have already repaid, it costs about the same as a ${calc.effectiveAnnualRatePct.toFixed(1)}% bank loan. Compare offers on this number, not the quoted one.`
                      : `No rate was quoted, but this deal costs the same as a ${calc.effectiveAnnualRatePct.toFixed(1)}% bank loan. That works out to about ${calc.nominalRatePct.toFixed(1)}% flat.`}
                  </div>
                )}
              </div>

              {calc.schedule.length > 0 && (
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                    Repayment schedule
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: 'var(--text3)', fontSize: 10 }}>
                          <th style={{ textAlign: 'left', padding: '8px 12px' }}>#</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px' }}>PAYMENT</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px' }}>INTEREST</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px' }}>PRINCIPAL</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px' }}>BALANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.schedule.map(r => (
                          <tr key={r.period} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.period}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(r.payment)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{tzs(r.interest)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(r.principal)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{tzs(r.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
