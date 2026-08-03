// BankReconciliation.tsx
// Import a bank or mobile money statement, see exactly where it fails to add
// up, then approve the charges that genuinely left the account and post them.

import React, { useMemo, useState } from 'react';
import GuideToggle from '@/components/GuideToggle';
import GuideTip from '@/components/GuideTip';
import { useCashAccounts, useStatementImports, useStatementLines } from '@/hooks/useBankStatements';
import { parseStatement, hashText } from '@/lib/bankStatement/statementParse';
import { reconcile, summarise, isSafeToPost, describeBreak } from '@/lib/bankStatement/statementReconcile';
import { saveImport, postCharges, fetchCutoverDate, abandonImport } from '@/lib/bankStatement/statementPost';
import type { ReconciledRow, StatementSource, StatementSummary } from '@/lib/bankStatement/statementTypes';

const money = (n: number) => n.toLocaleString('en-TZ', { maximumFractionDigits: 2 });

const SOURCES: { value: StatementSource; label: string }[] = [
  { value: 'mixx_yas', label: 'Mixx by Yas (Tigo Pesa)' },
  { value: 'crdb', label: 'CRDB (CSV)' },
  { value: 'nmb', label: 'NMB (CSV)' },
  { value: 'equity', label: 'Equity (CSV)' },
  { value: 'mpesa', label: 'M-Pesa (CSV)' },
];

export default function BankReconciliation() {
  const [guide, setGuide] = useState(false);
  const { accounts, expenseAccounts } = useCashAccounts();

  const [accountId, setAccountId] = useState('');
  const [source, setSource] = useState<StatementSource>('mixx_yas');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [cutover, setCutover] = useState<string | null>(null);

  const [rows, setRows] = useState<ReconciledRow[] | null>(null);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [expenseId, setExpenseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const { imports, refresh: refreshImports } = useStatementImports(accountId || null);

  React.useEffect(() => {
    fetchCutoverDate().then(setCutover).catch(() => setCutover(null));
  }, []);

  React.useEffect(() => {
    if (!expenseId && expenseAccounts.length) {
      const charges = expenseAccounts.find((a) => a.code === '6512');
      if (charges) setExpenseId(charges.id);
    }
  }, [expenseAccounts, expenseId]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setRaw(await f.text());
  };

  const runReconcile = () => {
    setError(''); setResult('');
    const parsed = parseStatement(raw, source);
    if (!parsed.length) {
      setError('No transactions could be read from this text. Check the statement format, or paste the transaction rows only.');
      setRows(null); setSummary(null);
      return;
    }
    const open = Number(opening.replace(/,/g, '')) || 0;
    const close = Number(closing.replace(/,/g, '')) || 0;
    const rec = reconcile(parsed, open, cutover);
    const sum = summarise(rec, open, close);
    setRows(rec);
    setSummary(sum);
    setSelected(
      Object.fromEntries(rec.filter((r) => r.chargeBorne && !r.beforeCutover).map((r) => [r.lineNo, true])),
    );
  };

  const selectedRows = useMemo(
    () => (rows ?? []).filter((r) => selected[r.lineNo] && r.chargeBorne && !r.beforeCutover),
    [rows, selected],
  );
  const selectedTotal = selectedRows.reduce((s, r) => s + r.printedCharge, 0);

  const approveAndPost = async () => {
    if (!rows || !summary || !accountId || !expenseId) return;
    setBusy(true); setError(''); setResult('');
    try {
      const hash = await hashText(raw);
      const imp = await saveImport({
        accountId, source, fileName, fileHash: hash,
        periodStart: rows[0].entryDate,
        periodEnd: rows[rows.length - 1].entryDate,
        statedOpening: summary.statedOpening,
        statedClosing: summary.statedClosing,
        rows, summary, createdBy: null,
      });

      const { data } = await import('@/lib/supabase').then((m) =>
        m.supabase.from('bank_statement_lines').select('id, line_no').eq('import_id', imp.id),
      );
      const idByLine = new Map<number, string>((data ?? []).map((d: any) => [d.line_no, d.id]));
      const ids = selectedRows.map((r) => idByLine.get(r.lineNo)).filter(Boolean) as string[];

      const posted = await postCharges({
        importId: imp.id, lineIds: ids, expenseAccountId: expenseId, postedBy: null,
      });

      const total = posted.reduce((s, p) => s + Number(p.amount), 0);
      setResult(`Posted ${money(total)} across ${posted.length} journal(s). Statement saved for the audit trail.`);
      setRows(null); setSummary(null); setRaw(''); setFileName(null);
      void refreshImports();
    } catch (e: any) {
      setError(e.message ?? 'Posting failed.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = (rows ?? []).filter((r) => r.chargeBorne && r.beforeCutover);
  const notOurs = (rows ?? []).filter((r) => !r.chargeBorne && r.printedCharge > 0);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bank reconciliation</h1>
          <p className="text-sm text-gray-500">
            Check a statement against itself, then post the charges it proves you paid.
          </p>
        </div>
        <GuideToggle enabled={guide} onChange={setGuide} />
      </header>

      {/* ---------------------------------------------------------- import --- */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">1. Load the statement</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Account</span>
            <select className="mt-1 w-full rounded border p-2"
              value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose an account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <GuideTip show={guide}>
              The ledger account this statement belongs to. Charges are credited here unless you post a reclass.
            </GuideTip>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Statement format</span>
            <select className="mt-1 w-full rounded border p-2"
              value={source} onChange={(e) => setSource(e.target.value as StatementSource)}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <GuideTip show={guide}>
              Ask the bank for CSV where you can. Text pulled out of a PDF is the most fragile input and is checked hardest.
            </GuideTip>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Opening balance</span>
            <input className="mt-1 w-full rounded border p-2" inputMode="decimal"
              value={opening} onChange={(e) => setOpening(e.target.value)} />
            <GuideTip show={guide}>
              Copy this from the statement header exactly. The whole check is built on it.
            </GuideTip>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Closing balance</span>
            <input className="mt-1 w-full rounded border p-2" inputMode="decimal"
              value={closing} onChange={(e) => setClosing(e.target.value)} />
            <GuideTip show={guide}>
              If the rows do not walk from opening to closing, the statement is missing an entry and nothing will be posted.
            </GuideTip>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Statement text or CSV</span>
          <input type="file" accept=".csv,.txt,.tsv" className="mt-1 block text-sm"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          <textarea className="mt-2 h-40 w-full rounded border p-2 font-mono text-xs"
            placeholder="Paste the transaction rows here, or choose a file above."
            value={raw} onChange={(e) => setRaw(e.target.value)} />
          <GuideTip show={guide}>
            For a PDF, open it, select the transaction table, and paste. Headers and footers are ignored.
          </GuideTip>
        </label>

        <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={!raw.trim() || !accountId} onClick={runReconcile}>
          Check the statement
        </button>
      </section>

      {/* ------------------------------------------------------ the verdict --- */}
      {summary && rows && (
        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">2. What the statement says</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Money in" value={money(summary.parsedMoneyIn)} />
            <Stat label="Money out" value={money(summary.parsedMoneyOut)} />
            <Stat label="Should close at" value={money(summary.computedClosing)} />
            <Stat label="Actually closes at" value={money(summary.statedClosing)} />
            <Stat label="Unexplained gap" value={money(summary.balanceGap)}
              tone={Math.abs(summary.balanceGap) > 0.01 ? 'bad' : 'good'} />
            <Stat label="Charges you paid" value={money(summary.borneCharges)} />
          </div>

          {!isSafeToPost(summary) && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
              <p className="font-medium text-red-800">This statement does not add up.</p>
              <p className="mt-1 text-red-700">
                {money(Math.abs(summary.balanceGap))} of movement has no entry to explain it,
                across {summary.rowsWithBreaks} row(s). Charges can still be posted, but call the
                bank about the gap first. Quote the transaction references either side of the flagged row.
              </p>
            </div>
          )}

          {notOurs.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {money(notOurs.reduce((s, r) => s + r.printedCharge, 0))} of service charges are
              printed on this statement but never left the account. They belong to the other side and
              will not be posted.
            </div>
          )}

          {blocked.length > 0 && (
            <div className="rounded border border-gray-300 bg-gray-50 p-3 text-sm">
              {money(blocked.reduce((s, r) => s + r.printedCharge, 0))} of real charges fall before
              the ledger cutover ({cutover}) and cannot be journalled. Take them through an opening
              balance adjustment instead.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-2">Post</th><th className="p-2">Date</th>
                  <th className="p-2">Counterparty</th>
                  <th className="p-2 text-right">Out</th><th className="p-2 text-right">In</th>
                  <th className="p-2 text-right">Balance</th>
                  <th className="p-2 text-right">Charge</th><th className="p-2">Finding</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const postable = r.chargeBorne && !r.beforeCutover;
                  return (
                    <tr key={r.lineNo}
                      className={r.flags.includes('balance_break') ? 'bg-red-50' : undefined}>
                      <td className="p-2">
                        <input type="checkbox" disabled={!postable}
                          checked={!!selected[r.lineNo] && postable}
                          onChange={(e) => setSelected((s) => ({ ...s, [r.lineNo]: e.target.checked }))} />
                      </td>
                      <td className="p-2 whitespace-nowrap">{r.entryDate}</td>
                      <td className="p-2">{r.counterparty ?? '-'}</td>
                      <td className="p-2 text-right">{r.moneyOut ? money(r.moneyOut) : ''}</td>
                      <td className="p-2 text-right">{r.moneyIn ? money(r.moneyIn) : ''}</td>
                      <td className="p-2 text-right">{r.statedBalance != null ? money(r.statedBalance) : ''}</td>
                      <td className="p-2 text-right">{r.printedCharge ? money(r.printedCharge) : ''}</td>
                      <td className="p-2 text-xs text-gray-600">
                        {describeBreak(r)}
                        {r.flags.includes('charge_not_borne') && 'Charge printed but not deducted, so it is not yours. '}
                        {r.flags.includes('before_cutover') && 'Before cutover, cannot be journalled. '}
                        {r.flags.includes('malformed_msisdn') && 'Counterparty number has the wrong digit count. '}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- approve --- */}
      {summary && rows && (
        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">3. Approve and post</h2>

          <label className="block max-w-md">
            <span className="text-sm font-medium">Post charges to</span>
            <select className="mt-1 w-full rounded border p-2"
              value={expenseId} onChange={(e) => setExpenseId(e.target.value)}>
              <option value="">Choose an expense account</option>
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <GuideTip show={guide}>
              Bank charges normally go to 6512. Use a different account only if you split charges by type.
            </GuideTip>
          </label>

          <p className="text-sm">
            {selectedRows.length} charge(s) selected, totalling{' '}
            <span className="font-medium">{money(selectedTotal)}</span>. One journal is created per
            date, debiting the expense account and crediting the bank account.
          </p>

          {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {result && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{result}</p>}

          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={busy || !selectedRows.length || !expenseId}
            onClick={() => void approveAndPost()}>
            {busy ? 'Posting...' : `Post ${money(selectedTotal)} in charges`}
          </button>
        </section>
      )}

      {/* ----------------------------------------------------------- history --- */}
      {accountId && imports.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">Statements already imported</h2>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-2">Period</th><th className="p-2">File</th>
                <th className="p-2 text-right">Gap</th><th className="p-2 text-right">Charges</th>
                <th className="p-2">Status</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="p-2">{i.period_start} to {i.period_end}</td>
                  <td className="p-2">{i.file_name ?? 'Pasted'}</td>
                  <td className={`p-2 text-right ${Math.abs(Number(i.balance_gap)) > 0.01 ? 'text-red-700' : ''}`}>
                    {money(Number(i.balance_gap))}
                  </td>
                  <td className="p-2 text-right">{money(Number(i.borne_charges))}</td>
                  <td className="p-2">{i.status}</td>
                  <td className="p-2 text-right">
                    <button className="text-xs text-gray-500 underline"
                      onClick={() => void abandonImport(i.id).then(refreshImports)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const colour = tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-green-700' : '';
  return (
    <div className="rounded border p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className={`text-lg font-medium ${colour}`}>{value}</div>
    </div>
  );
}
