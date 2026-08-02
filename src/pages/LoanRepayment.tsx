// src/pages/LoanRepayment.tsx
// Loan Repayment voucher.
//
// Posts Dr <loan> / Cr <cash-bank> through post_journal_transaction and records a
// loan_payment voucher. Shows the two-sided entry live before posting, guards
// against overdrawing the paying account on the chosen date, and warns on overpay.
//
// ── WIRING (three things only you can connect, they live in files not in this drop) ──
//  1. ROUTE: register this page in your router, e.g.
//       <Route path="/loan-repayment" element={<LoanRepayment canPost={can('finance.loan_payment')} postedBy={user.username} />} />
//     Purchase.tsx sat fully built but UNLINKED for four months. Do not repeat that:
//     add the route AND a sidebar link, then actually open it once.
//  2. PERMISSION: pass canPost from your real permission hook. Defaults to true here
//     so the page is not dead on arrival, but an internal money-moving screen should
//     be gated. Wire it.
//  3. POSTED_BY: pass the signed-in user. Falls back to a placeholder below.
//
// The supabase import path in loanRepaymentPost.ts and useLoans.ts assumes
import { localIso } from '../lib/utils'
// '../lib/supabase'. Fix those two lines if your client lives elsewhere.

import { useMemo, useState } from 'react';
import { useLoans } from '../hooks/useLoans';
import { postLoanRepayment } from '../lib/loanRepaymentPost';
import type { LoanRepaymentResult } from '../lib/loanTypes';

const C = {
  bg: '#0b0d0e',
  panel: '#14181a',
  panel2: '#1b2023',
  border: '#252b2f',
  text: '#e8ecef',
  dim: '#8b979d',
  teal: '#5EA8A2',
  maroon: '#5E2230',
  gold: '#C8A96E',
  red: '#e5645d',
  green: '#3fb98f',
  blue: '#5b8def',
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const today = () => localIso(new Date());

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile', label: 'Mobile money' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

interface Props {
  canPost?: boolean;
  postedBy?: string;
  branch?: string | null;
}

export default function LoanRepayment({
  canPost = true,
  postedBy = 'joe.gembe', // <-- wire to your auth/user context
  branch = null,
}: Props) {
  const { loans, cashBank, history, loading, error, reload, payFromBalanceAsOf } =
    useLoans();

  const [loanId, setLoanId] = useState('');
  const [payFromId, setPayFromId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('bank_transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [note, setNote] = useState('');

  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [coverageWarning, setCoverageWarning] = useState<string | null>(null);
  const [overrideCoverage, setOverrideCoverage] = useState(false);
  const [done, setDone] = useState<LoanRepaymentResult | null>(null);

  const amount = Number(amountStr.replace(/,/g, ''));
  const loan = useMemo(() => loans.find((l) => l.id === loanId), [loans, loanId]);
  const payFrom = useMemo(
    () => cashBank.find((a) => a.id === payFromId),
    [cashBank, payFromId]
  );

  const validAmount = Number.isFinite(amount) && amount > 0;
  const overpay = !!loan && validAmount && amount > loan.outstanding;
  const canSubmit =
    canPost && !!loanId && !!payFromId && loanId !== payFromId && validAmount && !!date;

  const resetAfterPost = () => {
    setLoanId('');
    setPayFromId('');
    setAmountStr('');
    setDate(today());
    setMethod('bank_transfer');
    setPaymentRef('');
    setNote('');
    setCoverageWarning(null);
    setOverrideCoverage(false);
  };

  const handlePost = async () => {
    setFormError(null);
    setDone(null);
    if (!canSubmit) return;

    // Coverage guard: would the paying account go negative on this date?
    if (!overrideCoverage) {
      try {
        const asOf = await payFromBalanceAsOf(payFromId, date);
        const projected = asOf - amount;
        if (projected < 0) {
          setCoverageWarning(
            `${payFrom?.code} ${payFrom?.name} held ${fmt(asOf)} on ${date}. ` +
              `Paying ${fmt(amount)} takes it to ${fmt(projected)}. ` +
              `That account could not cover this on that date. ` +
              `Check the date and the paying account, or tick the box to record it anyway.`
          );
          return;
        }
      } catch (e: any) {
        setFormError(`Could not check the paying account balance: ${e.message}`);
        return;
      }
    }

    setPosting(true);
    try {
      const result = await postLoanRepayment({
        loanAccountId: loanId,
        payFromAccountId: payFromId,
        amount,
        postingDate: date,
        paymentMethod: method,
        paymentRef,
        description: note,
        postedBy,
        branch,
      });
      setDone(result);
      resetAfterPost();
      await reload();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to post the repayment.');
    } finally {
      setPosting(false);
    }
  };

  // ---------- styles ----------
  const wrap: React.CSSProperties = {
    background: C.bg,
    color: C.text,
    minHeight: '100%',
    padding: '28px 32px',
    fontFamily: 'Instrument Sans, Arial, sans-serif',
  };
  const panel: React.CSSProperties = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: 22,
  };
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: C.dim,
    marginBottom: 6,
  };
  const field: React.CSSProperties = {
    width: '100%',
    background: C.panel2,
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    color: C.text,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const row: React.CSSProperties = { marginBottom: 16 };

  if (!canPost) {
    return (
      <div style={wrap}>
        <div style={{ ...panel, maxWidth: 520 }}>
          <h2 style={{ margin: 0, color: C.teal }}>Loan Repayment</h2>
          <p style={{ color: C.dim, marginTop: 10 }}>
            You do not have permission to record loan repayments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
          Loan Repayment
        </h1>
        <span style={{ color: C.dim, fontSize: 13 }}>
          Records Dr loan / Cr cash-bank as one balanced voucher
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
          gap: 22,
          alignItems: 'start',
        }}
      >
        {/* ---------------- form ---------------- */}
        <div style={panel}>
          <div style={row}>
            <label style={label}>Loan to repay</label>
            <select
              style={field}
              value={loanId}
              onChange={(e) => {
                setLoanId(e.target.value);
                setCoverageWarning(null);
                setOverrideCoverage(false);
              }}
            >
              <option value="">Select a lender…</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.name} · owed {fmt(l.outstanding)}
                </option>
              ))}
            </select>
            {loan && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>
                Outstanding before this payment:{' '}
                <span style={{ color: C.text }}>{fmt(loan.outstanding)} TZS</span>
              </div>
            )}
          </div>

          <div style={row}>
            <label style={label}>Amount (TZS)</label>
            <input
              style={field}
              inputMode="decimal"
              placeholder="0"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setCoverageWarning(null);
                setOverrideCoverage(false);
              }}
            />
            {overpay && (
              <div style={{ fontSize: 12, color: C.gold, marginTop: 6 }}>
                This is more than the {fmt(loan!.outstanding)} outstanding. The loan
                account will go into a debit (overpaid) position. Check the amount.
              </div>
            )}
          </div>

          <div style={row}>
            <label style={label}>Pay from</label>
            <select
              style={field}
              value={payFromId}
              onChange={(e) => {
                setPayFromId(e.target.value);
                setCoverageWarning(null);
                setOverrideCoverage(false);
              }}
            >
              <option value="">Select cash / bank account…</option>
              {cashBank.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name} · bal {fmt(a.balance)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...row, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Date</label>
              <input
                type="date"
                style={field}
                value={date}
                max={today()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setCoverageWarning(null);
                  setOverrideCoverage(false);
                }}
              />
            </div>
            <div>
              <label style={label}>Method</label>
              <select style={field} value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={row}>
            <label style={label}>Reference (cheque / txn id / statement)</label>
            <input
              style={field}
              placeholder="e.g. NMB txn 88421 or cheque 000123"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
          </div>

          <div style={row}>
            <label style={label}>Note (optional)</label>
            <input
              style={field}
              placeholder="e.g. Part repayment to Herman Kamande"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {coverageWarning && (
            <div
              style={{
                background: 'rgba(229,100,93,0.10)',
                border: `1px solid ${C.red}`,
                borderRadius: 9,
                padding: 12,
                marginBottom: 14,
                fontSize: 13,
                color: C.text,
              }}
            >
              <div style={{ marginBottom: 8 }}>{coverageWarning}</div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.dim }}>
                <input
                  type="checkbox"
                  checked={overrideCoverage}
                  onChange={(e) => setOverrideCoverage(e.target.checked)}
                />
                I understand, record it anyway
              </label>
            </div>
          )}

          {formError && (
            <div
              style={{
                background: 'rgba(229,100,93,0.10)',
                border: `1px solid ${C.red}`,
                borderRadius: 9,
                padding: 12,
                marginBottom: 14,
                fontSize: 13,
                color: C.red,
              }}
            >
              {formError}
            </div>
          )}

          {done && (
            <div
              style={{
                background: 'rgba(63,185,143,0.10)',
                border: `1px solid ${C.green}`,
                borderRadius: 9,
                padding: 12,
                marginBottom: 14,
                fontSize: 13,
                color: C.text,
              }}
            >
              Posted <b>{done.voucherRef}</b> (journal {done.journalRef}). The loan and
              the paying account both moved. Refresh the Balance Sheet to see it.
            </div>
          )}

          <button
            onClick={handlePost}
            disabled={!canSubmit || posting || (!!coverageWarning && !overrideCoverage)}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 10,
              border: 'none',
              fontSize: 15,
              fontWeight: 700,
              cursor:
                !canSubmit || posting || (!!coverageWarning && !overrideCoverage)
                  ? 'not-allowed'
                  : 'pointer',
              background:
                !canSubmit || posting || (!!coverageWarning && !overrideCoverage)
                  ? C.panel2
                  : C.teal,
              color:
                !canSubmit || posting || (!!coverageWarning && !overrideCoverage)
                  ? C.dim
                  : '#04211f',
            }}
          >
            {posting ? 'Posting…' : 'Post repayment'}
          </button>
        </div>

        {/* ---------------- live journal preview ---------------- */}
        <div style={{ ...panel, background: C.panel2 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', color: C.dim, letterSpacing: 0.4 }}>
            Journal preview
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4, marginBottom: 16 }}>
            This is the exact entry that will post. Both sides, always equal.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', rowGap: 10, columnGap: 14, fontSize: 14 }}>
            <div style={{ color: C.dim, fontSize: 12 }}>Account</div>
            <div style={{ color: C.dim, fontSize: 12, textAlign: 'right' }}>Debit</div>
            <div style={{ color: C.dim, fontSize: 12, textAlign: 'right' }}>Credit</div>

            <div>{loan ? `${loan.code} ${loan.name}` : '—'}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {validAmount ? fmt(amount) : '—'}
            </div>
            <div style={{ textAlign: 'right', color: C.dim }}>—</div>

            <div>{payFrom ? `${payFrom.code} ${payFrom.name}` : '—'}</div>
            <div style={{ textAlign: 'right', color: C.dim }}>—</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {validAmount ? fmt(amount) : '—'}
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />

            <div style={{ color: C.dim }}>Totals</div>
            <div style={{ textAlign: 'right', color: C.teal, fontVariantNumeric: 'tabular-nums' }}>
              {validAmount ? fmt(amount) : '0'}
            </div>
            <div style={{ textAlign: 'right', color: C.teal, fontVariantNumeric: 'tabular-nums' }}>
              {validAmount ? fmt(amount) : '0'}
            </div>
          </div>

          {loan && validAmount && (
            <div style={{ marginTop: 18, fontSize: 13, color: C.dim }}>
              After posting, <b style={{ color: C.text }}>{loan.name}</b> outstanding:{' '}
              <b style={{ color: C.text }}>{fmt(loan.outstanding - amount)} TZS</b>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- history ---------------- */}
      <div style={{ ...panel, marginTop: 22 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', color: C.dim, letterSpacing: 0.4, marginBottom: 12 }}>
          Repayment history
        </div>
        {loading ? (
          <div style={{ color: C.dim }}>Loading…</div>
        ) : error ? (
          <div style={{ color: C.red }}>{error}</div>
        ) : history.length === 0 ? (
          <div style={{ color: C.dim }}>No loan repayments recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.dim, textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Voucher</th>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Lender</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px 10px' }}>Method</th>
                  <th style={{ padding: '8px 10px' }}>Reference</th>
                  <th style={{ padding: '8px 10px' }}>By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.voucherRef} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', color: C.teal }}>{h.voucherRef}</td>
                    <td style={{ padding: '8px 10px' }}>{h.postingDate}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {h.loanCode} {h.loanName}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(h.amount)}
                    </td>
                    <td style={{ padding: '8px 10px' }}>{h.paymentMethod ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{h.paymentRef ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: C.dim }}>{h.postedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
