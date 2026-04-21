// Bank Receipt is structurally identical to Cash Receipt — the only differences
// are (a) the default deposit account is a bank account, not cash/M-Pesa, and
// (b) the payment methods shown default to RTGS, cheque, etc. All business
// logic (customer picker, invoice allocation, AR ledger posting) lives in the
// shared CashReceipt component and CustomerPaymentFlow helper.

import CashReceipt from './CashReceipt'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function BankReceipt({ onNav }: Props) {
  return <CashReceipt onNav={onNav} variant="bank" />
}
