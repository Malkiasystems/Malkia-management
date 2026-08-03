// ════════════════════════════════════════════════════════════════════════════
// statementParse.ts
//
// Raw statement text → ParsedRow[]. Pure functions, no I/O, no Supabase.
//
// Adapters:
//   parseMixxYas          Tigo Pesa / Mixx by Yas PDF text (paste from the PDF)
//   parseDelimited        generic CSV/TSV for CRDB, NMB, Equity exports
//   extractHeaderBalances pulls OPENING/CLOSING BALANCE out of a pasted header
//
// Ask the bank for CSV wherever possible. Text copied out of a PDF is the most
// fragile input in this pipeline, which is why every import is balance-checked
// in statementReconcile.ts before anything is allowed near the ledger.
// ════════════════════════════════════════════════════════════════════════════

import type { ParsedRow, StatementSource } from './statementTypes'

const DATE_DMY = /\b(\d{2})\/(\d{2})\/(\d{4})\b/
const NUM = /-?[\d,]+(?:\.\d+)?/g

export function toNumber(raw: string | null | undefined): number {
  if (!raw) return 0
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function isoFromDmy(d: string, m: string, y: string): string {
  return `${y}-${m}-${d}`
}

/**
 * If the paste includes the statement header, read the opening and closing
 * balances out of it so the user does not retype them. Returns nulls when the
 * header is not present; the fields stay editable either way.
 */
export function extractHeaderBalances(text: string): { opening: number | null; closing: number | null } {
  const open = text.match(/OPENING\s*BALANCE\s*:?\s*([\d,]+(?:\.\d+)?)/i)
  const close = text.match(/CLOSING\s*BALANCE\s*:?\s*([\d,]+(?:\.\d+)?)/i)
  return {
    opening: open ? toNumber(open[1]) : null,
    closing: close ? toNumber(close[1]) : null,
  }
}

/**
 * Mixx by Yas / Tigo Pesa.
 *
 * A record starts at a dd/mm/yyyy token and runs to the next one. Within it we
 * read the labelled fields (TxnID, Amount, ServiceCharge, counterparty), strip
 * them, then take the LAST three bare numbers as (money out, money in,
 * balance) — that is the column order the PDF renders. Header and footer noise
 * never carries a TxnID, so requiring one skips it automatically.
 */
export function parseMixxYas(text: string): ParsedRow[] {
  const cleaned = text.replace(/\r/g, '')
  const chunks = cleaned.split(/(?=\b\d{2}\/\d{2}\/\d{4}\b)/g)
  const rows: ParsedRow[] = []

  for (const chunk of chunks) {
    const dm = chunk.match(DATE_DMY)
    const txn = chunk.match(/TxnID\s*:\s*(\d+)/i)
    if (!dm || !txn) continue

    const amount = chunk.match(/Amount\s*:\s*([\d,]+(?:\.\d+)?)/i)
    const charge = chunk.match(/ServiceCharge\s*:\s*([\d,]+(?:\.\d+)?)/i)
    const party =
      chunk.match(/(?:Send\s*To|Received\s*[Ff]rom)\s*:\s*([0-9]+)/i) ||
      chunk.match(/(?:Send\s*To|Received\s*[Ff]rom)\s*:\s*([^\n,]+)/i)
    const incoming = /Received\s*[Ff]rom/i.test(chunk)

    // remove every labelled number so it cannot be mistaken for a column value
    const bare = chunk
      .replace(/TxnID\s*:\s*\d+/gi, ' ')
      .replace(/Amount\s*:\s*[\d,]+(?:\.\d+)?/gi, ' ')
      .replace(/ServiceCharge\s*:\s*[\d,]+(?:\.\d+)?/gi, ' ')
      .replace(DATE_DMY, ' ')
      .replace(/(?:Send\s*To|Received\s*[Ff]rom)\s*:\s*[0-9]+/gi, ' ')

    const nums = (bare.match(NUM) || []).map(toNumber)
    if (nums.length < 3) continue

    const [out, inn, bal] = nums.slice(-3)

    rows.push({
      lineNo: rows.length + 1,
      entryDate: isoFromDmy(dm[1], dm[2], dm[3]),
      description: chunk.replace(/\s+/g, ' ').trim().slice(0, 400),
      counterparty: party ? party[1].trim() : null,
      txnRef: txn[1],
      direction: incoming ? 'in' : 'out',
      grossAmount: amount ? toNumber(amount[1]) : (incoming ? inn : out),
      moneyIn: inn,
      moneyOut: out,
      statedBalance: bal,
      printedCharge: charge ? toNumber(charge[1]) : 0,
    })
  }

  return rows
}

export interface DelimitedMap {
  date: string
  description: string
  debit: string        // money out of the account
  credit: string       // money into the account
  balance?: string
  reference?: string
  charge?: string
}

/** Generic CSV/TSV adapter. Header names are matched case-insensitively. */
export function parseDelimited(text: string, map: DelimitedMap, delimiter = ','): ParsedRow[] {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const split = (l: string) => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))
  const header = split(lines[0]).map(h => h.toLowerCase())
  const idx = (name?: string) => (name ? header.indexOf(name.toLowerCase()) : -1)

  const iDate = idx(map.date)
  const iDesc = idx(map.description)
  const iDr = idx(map.debit)
  const iCr = idx(map.credit)
  const iBal = idx(map.balance)
  const iRef = idx(map.reference)
  const iChg = idx(map.charge)

  if (iDate < 0 || iDr < 0 || iCr < 0) return []

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i])
    const rawDate = c[iDate] || ''
    const dm = rawDate.match(DATE_DMY)
    const iso = dm
      ? isoFromDmy(dm[1], dm[2], dm[3])
      : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '')
    if (!iso) continue

    const out = toNumber(c[iDr])
    const inn = toNumber(c[iCr])
    const charge = iChg >= 0 ? toNumber(c[iChg]) : 0

    rows.push({
      lineNo: rows.length + 1,
      entryDate: iso,
      description: iDesc >= 0 ? c[iDesc] || '' : '',
      counterparty: null,
      txnRef: iRef >= 0 ? c[iRef] || null : null,
      direction: inn > 0 ? 'in' : 'out',
      grossAmount: inn > 0 ? inn : Math.max(out - charge, 0),
      moneyIn: inn,
      moneyOut: out,
      statedBalance: iBal >= 0 ? toNumber(c[iBal]) : null,
      printedCharge: charge,
    })
  }
  return rows
}

export function parseStatement(text: string, source: StatementSource): ParsedRow[] {
  if (source === 'mixx_yas') return parseMixxYas(text)
  return parseDelimited(text, {
    date: 'date',
    description: 'description',
    debit: 'debit',
    credit: 'credit',
    balance: 'balance',
    reference: 'reference',
  })
}

/** Stable fingerprint of the paste, so the same statement cannot import twice. */
export async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/\s+/g, ' ').trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
