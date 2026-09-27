// ============================================================================
// reminderTemplates.ts — the ONE place payment-reminder wording and phone
// normalisation live. Used by the ArReminders workqueue page AND the
// Remind shortcut on the customer profile, so both send the identical
// message and neither drifts when the wording changes. (Two copies of the
// same logic is how the invoice salesperson bug happened; not again.)
// ============================================================================

export const fmtTzsReminder = (n: number) => 'TZS ' + Math.round(n).toLocaleString()

export const fmtDateReminder = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 0715... -> 255715..., keeps 255..., strips separators. */
export function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('255')) return d
  if (d.startsWith('0')) return '255' + d.slice(1)
  return d
}

export function buildReminderMessage(args: {
  customerName: string
  contactPerson?: string | null
  invoiceRef: string
  amount: number
  dueDateIso: string
  balance: number
  overdue: boolean
}): string {
  const who = args.contactPerson || args.customerName
  if (args.overdue) {
    return (
      `Hello ${who},\n\n` +
      `This is a payment follow-up from Malkia Wellness Group Ltd.\n\n` +
      `Invoice ${args.invoiceRef} of ${fmtTzsReminder(args.amount)} was due on ${fmtDateReminder(args.dueDateIso)} and remains unsettled. ` +
      `Your account balance stands at ${fmtTzsReminder(args.balance)}.\n\n` +
      `Kindly arrange payment today, or reply with your payment plan so we keep your account in good standing.\n\n` +
      `Payment: M-Pesa / bank as per your invoice. Please use the invoice number as reference.\n\n` +
      `Asante,\nAccounts — Malkia Wellness Group Ltd`
    )
  }
  return (
    `Hello ${who},\n\n` +
    `A friendly reminder from Malkia Wellness Group Ltd.\n\n` +
    `Invoice ${args.invoiceRef} of ${fmtTzsReminder(args.amount)} falls due on ${fmtDateReminder(args.dueDateIso)}. ` +
    `Kindly plan the payment so your account stays in good standing.\n\n` +
    `Payment: M-Pesa / bank as per your invoice. Please use the invoice number as reference.\n\n` +
    `Asante kwa ushirikiano,\nAccounts — Malkia Wellness Group Ltd`
  )
}
