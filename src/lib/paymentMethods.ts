// ════════════════════════════════════════════════════════════════════════════
// paymentMethods.ts
//
// One place to answer: "given a Cash & Bank account, how was this paid, and
// does it need a reference?"
//
// WHY THIS EXISTS
// This logic was copy-pasted into five files, each drifting slightly:
//
//   CashReceipt.tsx                 deriveMethod + isRefRequired + refLabel
//   CustomerReceiptBatchInner.tsx   its own deriveMethod, returns {value,label}
//   SalesInvoice.tsx                its own deriveMethod
//   Purchase.tsx                    methodFromAccount, code-prefix only
//   CashPayment.tsx                 none — it just hardcoded 'cash'
//
// The last one is the point. CashPayment writes payment_method: 'cash' on every
// voucher, so a supplier paid from CRDB is recorded as a cash payment. Adding a
// sixth copy to fix it would have been the wrong move.
//
// MIGRATION STATUS: CashPayment.tsx uses this module. The other four still have
// their own copies and should be moved across, but they work today and changing
// four live voucher pages at once is a separate, riskier change. Until then,
// treat THIS file as the definition and those as legacy. If you touch one of
// them, migrate it.
// ════════════════════════════════════════════════════════════════════════════

export interface PaymentMethodOption { value: string; label: string }

export const PAYMENT_METHODS_CASH: PaymentMethodOption[] = [
  { value: 'cash',    label: 'Cash' },
  { value: 'mpesa',   label: 'M-Pesa' },
  { value: 'mixx',    label: 'Mixx by Yas' },
  { value: 'airtel',  label: 'Airtel Money' },
  { value: 'pos',     label: 'POS Card (small)' },
]

export const PAYMENT_METHODS_BANK: PaymentMethodOption[] = [
  { value: 'rtgs',    label: 'RTGS / Bank Transfer' },
  { value: 'cheque',  label: 'Cheque' },
  { value: 'deposit', label: 'Cash Deposit at Bank' },
  { value: 'pos',     label: 'POS Settlement' },
  { value: 'swift',   label: 'SWIFT (International)' },
]

/**
 * Work out the payment method from a Cash & Bank account.
 *
 * Name first, code second. A Tanzanian chart of accounts has no reliable rule
 * for which prefix a bank sits under — ours has banks in both 102x (NMB) and
 * 103x (CRDB) — so the account NAME is the better signal and the code is only
 * a fallback. Purchase.tsx guessed purely on code prefixes and that is how its
 * Pay From dropdown ended up offering Inventory accounts.
 */
export function deriveMethod(code: string, name: string): string {
  const n = (name || '').toLowerCase()
  const c = (code || '').trim()

  if (n.includes('mpesa') || n.includes('m-pesa')) return 'mpesa'
  if (n.includes('mixx') || n.includes('tigo'))    return 'mixx'
  if (n.includes('airtel'))                        return 'airtel'
  if (n.includes('halopesa') || n.includes('halo pesa')) return 'mpesa'

  const banks = ['nmb', 'crdb', 'nbc', 'stanbic', 'absa', 'dtb', 'exim', 'access',
                 'i&m', 'kcb', 'azania', 'amana', 'equity', 'tcb', 'mkombozi',
                 'tib', 'twiga', 'ecobank', 'bank']
  if (banks.some(b => n.includes(b))) return 'rtgs'
  if (n.includes('cash') || n.includes('till') || n.includes('petty')) return 'cash'

  if (c.startsWith('101') || c === '1040') return 'cash'
  if (c.startsWith('103')) return 'rtgs'
  return 'cash'
}

export function methodLabel(method: string): string {
  return [...PAYMENT_METHODS_CASH, ...PAYMENT_METHODS_BANK]
    .find(m => m.value === method)?.label || method
}

/**
 * Cash in hand is the one method with no external reference to quote: nobody
 * hands you a code with an envelope. Every other method produces one on the
 * counterparty's side, and that code is the only thing that ties the voucher to
 * a line on the bank or mobile money statement.
 *
 * Applies in both directions. An unreconciled receipt is an annoyance; an
 * unreconciled payment is money leaving with no trace.
 */
export function isRefRequired(method: string): boolean {
  return method !== 'cash'
}

export function refLabel(method: string): string {
  switch (method) {
    case 'cheque':  return 'Cheque Number'
    case 'rtgs':
    case 'swift':   return 'Reference / TT Number'
    case 'deposit': return 'Bank Deposit Slip Number'
    case 'mpesa':   return 'M-Pesa Transaction ID'
    case 'mixx':    return 'Mixx Transaction ID'
    case 'airtel':  return 'Airtel Money Transaction ID'
    case 'pos':     return 'POS Approval Code'
    case 'cash':    return 'Reference'
    default:        return 'Transaction ID'
  }
}

export function refPlaceholder(method: string): string {
  switch (method) {
    case 'cheque':  return 'e.g. 000123'
    case 'rtgs':
    case 'swift':   return 'e.g. TT-REF-2026-01-01'
    case 'deposit': return 'e.g. slip 4471'
    case 'mpesa':   return 'e.g. QTA1BCD2EFG'
    case 'mixx':    return 'e.g. CI260715.1423.A12345'
    case 'airtel':  return 'e.g. PP260715.1423.123456'
    case 'pos':     return 'e.g. 004471'
    case 'cash':    return 'Optional: slip or envelope number'
    default:        return 'Reference number'
  }
}
