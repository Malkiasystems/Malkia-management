// ============================================================================
// cashSalePost.test.ts — money-path unit tests
//
// These tests guard the invariants that have actually bitten this codebase:
//   1. The receipt-side debits must equal the voucher total — the historical
//      double-debit bug (fully-allocated split re-debited the total) and the
//      delivery-fee imbalance bug both lived here.
//   2. payment_split amounts must sum to the voucher total, always.
//   3. The tenant's account name must beat the hardcoded preset label
//      (today's bank-rename bug class).
//
// Run: npx vitest run
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  labelOf,
  buildPaymentLabel,
  buildPaymentSplit,
  buildReceiptJournalLines,
} from './cashSalePost'
import { PAYMENT_METHODS } from './cashSaleTypes'
import type { SplitLine } from './cashSaleTypes'

const CASH = PAYMENT_METHODS.find(m => m.id === 'cash')!
const MPESA = PAYMENT_METHODS.find(m => m.id === 'mpesa')!
const CRDB = PAYMENT_METHODS.find(m => m.id === 'crdb')!

const ACCOUNT_MAP: Record<string, string> = {
  [CASH.accountCode]: 'acct-cash',
  [MPESA.accountCode]: 'acct-mpesa',
  [CRDB.accountCode]: 'acct-crdb',
}

const baseArgs = {
  journalId: 'j-1',
  startLineNumber: 1,
  isPOD: false,
  autoReceipt: true,
  isSplit: false,
  total: 46000,
  totalSplitPaid: 0,
  splitLines: [] as SplitLine[],
  currentMethod: CASH,
  accountMap: ACCOUNT_MAP,
  paymentRef: '',
  custName: 'Test Customer',
  ref: 'CS-10-0001',
  deliveryTotal: 0,
  delivFloatId: null,
  arId: undefined as string | undefined,
}

const debitSum = (lines: { debit: number }[]) => lines.reduce((a, l) => a + l.debit, 0)

// ── 1. Receipt journal: debit side must equal the voucher total ─────────────
describe('buildReceiptJournalLines — balance invariants', () => {
  it('single-method sale debits exactly the total to the primary account', () => {
    const { lines } = buildReceiptJournalLines({ ...baseArgs })
    expect(lines).toHaveLength(1)
    expect(lines[0].account_id).toBe('acct-cash')
    expect(debitSum(lines)).toBe(46000)
    expect(lines.every(l => l.credit === 0)).toBe(true)
  })

  it('split sale: primary remainder + split lines sum to the total', () => {
    const { lines } = buildReceiptJournalLines({
      ...baseArgs,
      isSplit: true,
      totalSplitPaid: 30000,
      splitLines: [{ methodId: 'mpesa', accountId: 'acct-mpesa', amount: 30000, ref: 'TX1' }],
    })
    expect(lines).toHaveLength(2)
    expect(debitSum(lines)).toBe(46000)
  })

  it('REGRESSION: fully-allocated split must NOT re-debit the total (the double-debit bug)', () => {
    const { lines } = buildReceiptJournalLines({
      ...baseArgs,
      isSplit: true,
      totalSplitPaid: 46000,
      splitLines: [
        { methodId: 'mpesa', accountId: 'acct-mpesa', amount: 26000, ref: '' },
        { methodId: 'crdb', accountId: 'acct-crdb', amount: 20000, ref: '' },
      ],
    })
    // Primary received nothing → no primary line, only the two split lines.
    expect(lines).toHaveLength(2)
    expect(debitSum(lines)).toBe(46000) // NOT 92,000
  })

  it('REGRESSION: delivery fee inside total gets no extra debit line', () => {
    // total = subtotal 46,000 + delivery 5,000 computed upstream.
    const { lines } = buildReceiptJournalLines({
      ...baseArgs,
      total: 51000,
      deliveryTotal: 5000,
      delivFloatId: 'acct-deliv',
    })
    // One primary debit of the full 51,000. The 5,000 delivery credit is the
    // caller's job — a second delivery debit here is the historical imbalance.
    expect(lines).toHaveLength(1)
    expect(debitSum(lines)).toBe(51000)
  })

  it('POD sale debits accounts receivable, not cash', () => {
    const { lines } = buildReceiptJournalLines({
      ...baseArgs, isPOD: true, autoReceipt: false, arId: 'acct-ar',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].account_id).toBe('acct-ar')
    expect(debitSum(lines)).toBe(46000)
  })

  // Documents the hole the new guard in postCashSale covers. This function
  // cannot throw here without changing its contract for the non-POD callers,
  // so it returns nothing and the caller is responsible for refusing the sale.
  // If that guard is ever removed, the only thing standing between a tenant
  // without 1050 and a debt recorded nowhere is the 076 balance check.
  it('POD with no AR account emits no debit line at all', () => {
    const { lines } = buildReceiptJournalLines({
      ...baseArgs, isPOD: true, autoReceipt: false, arId: undefined,
    })
    expect(lines).toHaveLength(0)
    expect(debitSum(lines)).toBe(0)
  })

  it('throws a clear error when the primary method has no account', () => {
    expect(() => buildReceiptJournalLines({ ...baseArgs, accountMap: {} }))
      .toThrowError(/not set up/)
  })

  it('line numbers are sequential from the requested start', () => {
    const { lines, nextLineNumber } = buildReceiptJournalLines({
      ...baseArgs,
      startLineNumber: 5,
      isSplit: true,
      totalSplitPaid: 10000,
      splitLines: [{ methodId: 'mpesa', accountId: 'acct-mpesa', amount: 10000, ref: '' }],
    })
    expect(lines.map(l => l.line_number)).toEqual([5, 6])
    expect(nextLineNumber).toBe(7)
  })

  it('skips split lines with missing account or zero amount instead of posting garbage', () => {
    const { lines } = buildReceiptJournalLines({
      ...baseArgs,
      isSplit: true,
      totalSplitPaid: 6000,
      splitLines: [
        { methodId: 'mpesa', accountId: '', amount: 6000, ref: '' },
        { methodId: 'crdb', accountId: 'acct-crdb', amount: 0, ref: '' },
      ],
    })
    // Only the primary remainder (40,000) posts; the invalid lines are dropped.
    expect(lines).toHaveLength(1)
    expect(debitSum(lines)).toBe(40000)
  })
})

// ── 2. payment_split: amounts must always sum to the total ──────────────────
describe('buildPaymentSplit — sum invariant', () => {
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

  it('non-split puts the whole total under one label', () => {
    const r = buildPaymentSplit(false, 46000, 0, [], CASH)
    expect(sum(r)).toBe(46000)
    expect(Object.keys(r)).toEqual(['Cash'])
  })

  it('split with primary remainder sums to total', () => {
    const r = buildPaymentSplit(true, 46000, 30000,
      [{ methodId: 'mpesa', accountId: 'a', amount: 30000, ref: '' }], CASH)
    expect(sum(r)).toBe(46000)
    expect(r['Cash']).toBe(16000)
    expect(r['M-Pesa']).toBe(30000)
  })

  it('two split lines on the SAME method aggregate instead of overwriting', () => {
    const r = buildPaymentSplit(true, 46000, 46000, [
      { methodId: 'mpesa', accountId: 'a', amount: 26000, ref: '' },
      { methodId: 'mpesa', accountId: 'a', amount: 20000, ref: '' },
    ], CASH)
    expect(sum(r)).toBe(46000)
    expect(r['M-Pesa']).toBe(46000)
  })

  it('uses the tenant account name as the split key when provided', () => {
    const r = buildPaymentSplit(true, 46000, 20000,
      [{ methodId: 'crdb', accountId: 'a', amount: 20000, ref: '' }], CASH,
      { [CRDB.accountCode]: 'Benki Yangu', [CASH.accountCode]: 'Till Kuu' })
    expect(r['Benki Yangu']).toBe(20000)
    expect(r['Till Kuu']).toBe(26000)
    expect(sum(r)).toBe(46000)
  })
})

// ── 3. Labels: tenant name beats hardcoded preset ───────────────────────────
describe('labelOf & buildPaymentLabel — name precedence', () => {
  it('falls back to the preset label with no account names', () => {
    expect(labelOf(CRDB)).toBe('CRDB Bank')
  })

  it("REGRESSION: tenant's renamed account wins over the preset label", () => {
    expect(labelOf(CRDB, { [CRDB.accountCode]: 'EXIM Bank' })).toBe('EXIM Bank')
  })

  it('single-method label is the resolved name', () => {
    expect(buildPaymentLabel(false, [], CRDB, 46000, { [CRDB.accountCode]: 'EXIM Bank' }))
      .toBe('EXIM Bank')
  })

  it('split label joins resolved names', () => {
    const label = buildPaymentLabel(true,
      [{ methodId: 'mpesa', accountId: 'a', amount: 30000, ref: '' }],
      CRDB, 16000, { [CRDB.accountCode]: 'EXIM Bank' })
    expect(label).toBe('SPLIT: M-Pesa + EXIM Bank')
  })

  it('split collapsing to one method drops the SPLIT prefix', () => {
    const label = buildPaymentLabel(true,
      [{ methodId: 'cash', accountId: 'a', amount: 46000, ref: '' }],
      CASH, 0)
    expect(label).toBe('Cash')
  })
})
