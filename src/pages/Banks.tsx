import EmptyState from '../components/EmptyState'
import { GuideTip, GuideToggle } from '../components/GuideMode'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTableSort } from '../lib/useTableSort'
import { exportStatementCSV, exportStatementExcel, exportStatementPDF, type StatementExportRow, type StatementExportMeta } from '../lib/bankStatementExport'
import { supabase } from '../lib/supabase'
import { accountBrand, defaultColorForNature, iconForNature, hexToTint } from '../components/accountBrand'
import { tzs, localIso, today } from '../lib/utils'
import { clampFrom } from '../lib/ledgerCutover'
import { usePermission } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props {
  onNav?: (page: Page) => void
}

interface BankAccount {
  id: string
  code: string
  name: string
  balance: number
  nature?: 'cash' | 'mobile_money' | 'traditional_bank' | 'general' | null
  display_color?: string | null
  account_number?: string | null
  show_in_cash_sale?: boolean | null
  branch?: string | null
  description?: string | null
}

// Preset banks the till knows how to accept payment from. Each preset lists a
// preferred GL code (base for auto-assignment; a taken code bumps to the next
// available), a friendly default name, a nature (drives icon), and a default
// colour. Tenants can activate any preset from the Banks page and customise
// all four fields plus the account number afterward. Cash Sale offers the
// same list on the payment tiles; a preset whose account row does not exist
// yet is shown as "Not set up" on the till.
//
// Cash itself is NOT in this list: every tenant is seeded with a live Cash on
// Hand account at code 1000 by the RPC, so it never needs activating. POS
// Card is NOT in this list either: card payments settle into the merchant's
// underlying bank account, so a separate GL tile would double-count.
type BankNature = 'cash' | 'mobile_money' | 'traditional_bank'
interface BankPreset {
  code: string
  defaultName: string
  nature: BankNature
  defaultColor: string
}
const BANK_PRESETS: BankPreset[] = [
  { code: '1020', defaultName: 'M-Pesa',       nature: 'mobile_money',    defaultColor: '#f87171' },
  { code: '1021', defaultName: 'Mixx by YAS',  nature: 'mobile_money',    defaultColor: '#facc15' },
  { code: '1022', defaultName: 'NMB Bank',     nature: 'traditional_bank',defaultColor: '#60a5fa' },
  { code: '1030', defaultName: 'CRDB Bank',    nature: 'traditional_bank',defaultColor: '#34d399' },
]

// Colour helpers so nature drives icon+background even when the tenant has
// not yet chosen a custom display_color. hexToTint softens a hex color for
// the tile background; iconForNature picks the right SVG glyph.
// iconForNature / defaultColorForNature / hexToTint now live in
// components/accountBrand, so the Sales Invoice deposit tiles and this page
// resolve an account's look through exactly one function.

interface LedgerEntry {
  id: string
  posting_date: string
  created_at: string
  description: string
  debit: number
  credit: number
  voucher_ref: string
  voucher_type: string
  running_balance?: number
}

// ── SVG ICONS ────────────────────────────────────
const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'bank') return <svg {...s} viewBox="0 0 24 24"><path d="M3 10L12 3l9 7"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/><path d="M2 18h20"/></svg>
  if (name === 'cash') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>
  if (name === 'mobile') return <svg {...s} viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/></svg>
  if (name === 'card') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>
  if (name === 'arrow-in') return <svg {...s} viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M5 12l7 7 7-7"/></svg>
  if (name === 'arrow-out') return <svg {...s} viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12l7-7 7 7"/></svg>
  if (name === 'refresh') return <svg {...s} viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (name === 'export') return <svg {...s} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  if (name === 'filter') return <svg {...s} viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  if (name === 'chevron-right') return <svg {...s} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
  if (name === 'chevron-left') return <svg {...s} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
  if (name === 'trend-up') return <svg {...s} viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
  if (name === 'trend-down') return <svg {...s} viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
  if (name === 'reconcile') return <svg {...s} viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  if (name === 'calendar') return <svg {...s} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  if (name === 'maximize') return <svg {...s} viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
  if (name === 'minimize') return <svg {...s} viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
  return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
}

// Bank account config — display decoration mapped to GL code. This is used
// ONLY for styling (icon/color); the account list itself is fetched by
// category, so any Cash & Bank account will render even if its code is not
// in this map (it falls back to a neutral tile via cfg()).

function SortableTh({
  label, sortKey, align, width, onHeaderClick, getSortIndex, getSortDir,
}: {
  label: string
  sortKey: string
  align?: 'right'
  width?: number
  onHeaderClick: (key: string, e?: { shiftKey?: boolean }) => void
  getSortIndex: (key: string) => number | null
  getSortDir: (key: string) => 'asc' | 'desc' | null
}) {
  const idx = getSortIndex(sortKey)
  const dir = getSortDir(sortKey)
  const active = idx !== null
  const arrow = dir === 'asc' ? '\u2191' : dir === 'desc' ? '\u2193' : ''
  return (
    <th
      className={align === 'right' ? 'td-right' : undefined}
      style={{ cursor: 'pointer', userSelect: 'none', width }}
      onClick={e => onHeaderClick(sortKey, { shiftKey: e.shiftKey })}
      title="Click to sort. Shift+click for multi-column sort."
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--accent)' }}>
            <span style={{ fontSize: 10 }}>{arrow}</span>
            <span style={{ fontSize: 8, fontFamily: 'var(--mono)', background: 'var(--accent-dim)', padding: '0 4px', borderRadius: 3 }}>{idx}</span>
          </span>
        )}
      </span>
    </th>
  )
}

const VOUCHER_TYPE_LABEL: Record<string, string> = {
  cash_sale: 'Cash Sale', cash_payment: 'Payment', cash_receipt: 'Receipt',
  bank_transfer: 'Transfer', grn: 'GRN', purchase_invoice: 'Purchase Inv',
  journal: 'Journal', petty_cash: 'Petty Cash', contra: 'Contra',
}

export default function Banks({ onNav }: Props) {
  // Gate write operations (Edit an active account, Setup a preset) behind
  // accounting.edit. Read-only viewers still see every tile and statement
  // but the modal never opens for them.
  const canEdit = usePermission('accounting.edit')
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selected, setSelected] = useState<BankAccount | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [fromDate, setFromDate] = useState(clampFrom(localIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1))))
  const [toDate, setToDate] = useState(localIso(new Date()))
  const [monthStats, setMonthStats] = useState<Record<string, { in: number; out: number }>>({})
  const [statementBalance, setStatementBalance] = useState('')
  const [showReconcile, setShowReconcile] = useState(false)

  // Full-screen ledger. The detail panel normally shares a 300px/1fr grid with
  // the account list AND shares its own column with the header card and the
  // reconcile panel, which leaves the statement a few rows of visible height
  // on a laptop. Maximized re-renders the SAME panel inside a fixed overlay:
  // the account header collapses to one line, the table takes every remaining
  // pixel, and the sticky thead the global CSS already provides finally has a
  // scroll container to stick inside. Esc restores.
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  // Column sort for the statement table. Same hook and header affordance as
  // the Customers list: click to sort (asc → desc → clear), shift-click to
  // stack a secondary sort, persisted per user in localStorage.
  //
  // Sorting does NOT falsify the Balance column — each row's value is that
  // entry's balance AFTER it posted, which stays true in any display order.
  // It only stops "running" visually, so the card-sub says as much while a
  // sort is active.
  //
  // useCallback with no deps: useTableSort lists `accessor` in its memo deps,
  // so an unstable identity would re-sort on every render for nothing.
  const ledgerSortAccessor = useCallback((r: LedgerEntry, key: string): unknown => {
    switch (key) {
      case 'date': return `${r.posting_date}|${r.created_at}`
      case 'ref': return r.voucher_ref
      case 'type': return VOUCHER_TYPE_LABEL[r.voucher_type] || r.voucher_type
      case 'description': return r.description
      case 'in': return r.debit > 0 ? r.debit : null
      case 'out': return r.credit > 0 ? r.credit : null
      case 'balance': return r.running_balance ?? null
      default: return null
    }
  }, [])
  const {
    sorted: sortedLedger, sortSpecs: ledgerSortSpecs,
    onHeaderClick: onLedgerHeaderClick, getSortIndex: getLedgerSortIndex, getSortDir: getLedgerSortDir,
  } = useTableSort<LedgerEntry>(ledger, {
    storageKey: 'malkia.banks.ledger.sort',
    defaultSort: [],
    accessor: ledgerSortAccessor,
  })

  // Editor state. Set when the user clicks Edit on an existing account or
  // Setup on a preset placeholder. On Save, we UPDATE the existing row (by
  // id) or INSERT a fresh Cash & Bank account row (from preset). Nature
  // drives the icon; display_color drives the colour.
  type EditorMode =
    | { kind: 'edit'; acct: BankAccount }
    | { kind: 'setup'; preset: BankPreset }
    | null
  const [editor, setEditor] = useState<EditorMode>(null)
  const [editName, setEditName] = useState('')
  const [editShowInCS, setEditShowInCS] = useState(true)
  const [editBranch, setEditBranch] = useState('')
  const [editNature, setEditNature] = useState<BankNature>('cash')
  const [editColor, setEditColor] = useState('#4ade80')
  // Account number (e.g. 22510074972). Shown on Cash Sale so a tenant with
  // two NMB accounts can tell which one they're posting to. Optional.
  const [editAccountNumber, setEditAccountNumber] = useState('')
  // Opening balance capture at bank setup. Deliberately a FORCED CHOICE with
  // no default: '' means the user has not answered yet and cannot save. An
  // account opened later legitimately starts at zero, so 'always require an
  // amount' would be wrong accounting and would credit 3040 with money that
  // was never new capital.
  // Scroll affordance for the account list. listScrollable drives the "scroll
  // for more" hint and the fade at the bottom edge; atListEnd hides the fade
  // once the user has reached the last account so it does not imply more.
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listScrollable, setListScrollable] = useState(false)
  const [atListEnd, setAtListEnd] = useState(false)
  const updateListScroll = () => {
    const el = listRef.current
    if (!el) return
    const scrollable = el.scrollHeight > el.clientHeight + 4
    setListScrollable(scrollable)
    setAtListEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }

  const [editOpeningMode, setEditOpeningMode] = useState<'' | 'zero' | 'amount'>('')
  const [editOpeningAmount, setEditOpeningAmount] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // For preset activation: instead of forcing the exact preset code (which
  // fails if the tenant already has that code taken by an unrelated
  // account), scan the range [preset.code, preset.code + 20) for the first
  // free code. Auto-assignment removes a class of "code already taken"
  // errors users cannot reasonably resolve.
  const nextAvailableCode = async (baseCode: string): Promise<string> => {
    const base = parseInt(baseCode)
    if (!Number.isFinite(base)) throw new Error(`Invalid preset code: ${baseCode}`)
    const { data } = await supabase
      .from('accounts')
      .select('code')
      .gte('code', String(base))
      .lte('code', String(base + 20))
    const taken = new Set((data || []).map(r => r.code))
    for (let c = base; c <= base + 20; c++) {
      const candidate = String(c)
      if (!taken.has(candidate)) return candidate
    }
    throw new Error(`No available account code in range ${base}–${base + 20}. Reclassify an existing account first.`)
  }

  const openEdit = (acct: BankAccount) => {
    setEditor({ kind: 'edit', acct })
    setEditName(acct.name)
    setEditNature((acct.nature as BankNature) || 'cash')
    setEditColor(acct.display_color || defaultColorForNature(acct.nature) || '#4ade80')
    setEditAccountNumber(acct.account_number || '')
    setEditShowInCS(acct.show_in_cash_sale !== false)
    setEditBranch(acct.branch || '')
    setEditError(null)
  }
  const openSetup = (preset: BankPreset) => {
    setEditor({ kind: 'setup', preset })
    setEditName(preset.defaultName)
    setEditNature(preset.nature)
    setEditColor(preset.defaultColor)
    setEditAccountNumber('')
    setEditShowInCS(true)
    setEditBranch('')
    setEditOpeningMode('')
    setEditOpeningAmount('')
    setEditError(null)
  }
  const closeEditor = () => { setEditor(null); setEditError(null) }

  const saveEditor = async () => {
    if (!editor) return
    if (!editName.trim()) { setEditError('Name is required.'); return }
    if (editor.kind === 'setup') {
      if (!editOpeningMode) {
        setEditError('Choose whether this account already had money in it, or starts at zero.'); return
      }
      if (editOpeningMode === 'amount' && !(parseFloat(editOpeningAmount) > 0)) {
        setEditError('Enter the balance this account started with, or choose "starts at zero".'); return
      }
    }
    setEditSaving(true)
    setEditError(null)
    try {
      if (editor.kind === 'edit') {
        const { error } = await supabase
          .from('accounts')
          .update({
            name: editName.trim(),
            nature: editNature,
            display_color: editColor,
            account_number: editAccountNumber.trim() || null,
            show_in_cash_sale: editShowInCS,
            branch: editBranch.trim() || null,
          })
          .eq('id', editor.acct.id)
        if (error) throw new Error(error.message)
      } else {
        // Preset activation. Ask the DB for the next free code so a taken
        // preset.code doesn't turn into an unrecoverable error.
        const assignedCode = await nextAvailableCode(editor.preset.code)
        const { error } = await supabase.from('accounts').insert({
          code: assignedCode,
          name: editName.trim(),
          type: 'asset',
          category: 'Cash & Bank',
          account_type: 'posting',
          nature: editNature,
          display_color: editColor,
          account_number: editAccountNumber.trim() || null,
          show_in_cash_sale: editShowInCS,
          branch: editBranch.trim() || null,
          is_active: true,
          allow_direct_posting: true,
        })
        if (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new Error(`Code ${assignedCode} is already taken by another account on this tenant. Reclassify or rename that account first.`)
          }
          throw new Error(error.message)
        }

        // Opening balance for a bank that already held money at go-live.
        //   Dr <this account>  Cr 3040 Opening Balance Equity
        // The money arrived before the books existed, so equity is the correct
        // other side. Migration 115 guarantees an account can only receive one
        // opening balance, so this cannot double up with the Opening Balances
        // voucher or a repeated save.
        const openingAmt = parseFloat(editOpeningAmount) || 0
        if (editOpeningMode === 'amount' && openingAmt > 0) {
          const [{ data: newAcct }, { data: eqAcct }] = await Promise.all([
            supabase.from('accounts').select('id').eq('code', assignedCode).maybeSingle(),
            supabase.from('accounts').select('id').eq('code', '3040').maybeSingle(),
          ])
          if (!newAcct || !eqAcct) {
            throw new Error('The account was created, but 3040 Opening Balance Equity was not found, so its opening balance was not posted. Post it from the Opening Balances voucher.')
          }
          const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
          const obRef = `JV-OB-${assignedCode}-${stamp}`
          const { error: jErr } = await supabase.rpc('post_journal_transaction', {
            p_ref: obRef,
            p_posting_date: today(),
            p_description: `Opening balance: ${editName.trim()}`,
            p_journal_type: 'opening_balance',
            p_source_type: 'bank_setup',
            p_source_ref: obRef,
            p_posted_by: 'Bank Setup',
            p_branch: null,
            p_lines: [
              { account_id: newAcct.id, description: `Opening balance: ${editName.trim()}`, debit: openingAmt, credit: 0 },
              { account_id: eqAcct.id, description: 'Opening Balance Equity', debit: 0, credit: openingAmt },
            ],
          })
          if (jErr) {
            if (jErr.code === '23505' || /already has an opening balance/i.test(jErr.message)) {
              throw new Error('The account was created, but it already has an opening balance recorded, so none was posted again.')
            }
            throw new Error(`The account was created, but its opening balance failed to post: ${jErr.message}`)
          }
        }
      }
      closeEditor()
      await loadAccounts()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.'
      setEditError(msg)
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => { loadAccounts() }, [])

  // Measure after accounts render and on resize, so the hint and fade are
  // correct on first paint rather than only after the user scrolls.
  useEffect(() => {
    const id = setTimeout(updateListScroll, 0)
    window.addEventListener('resize', updateListScroll)
    return () => { clearTimeout(id); window.removeEventListener('resize', updateListScroll) }
  }, [accounts, loadingAccounts])

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    // Fetch by CATEGORY, not by a hardcoded list of codes. The old approach
    // baked Malkia's specific numbering (1010, 1020, 1021, 1022, 1030, 1031,
    // 1040) into the query, which meant any tenant using different codes
    // saw an empty page OR any tenant that happened to have 1050 land in
    // that code set saw Accounts Receivable as a bank account. Neither is
    // right. Cash & Bank is the accounting category we actually want.
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, balance, nature, display_color, account_number, description, show_in_cash_sale, branch')
      .eq('category', 'Cash & Bank')
      .eq('is_active', true)
      .order('code')
    if (data) {
      setAccounts(data)
      loadMonthStats(data)
      if (!selected && data.length > 0) {
        setSelected(data[0])
        loadLedger(data[0])
      }
    }
    setLoadingAccounts(false)
  }

  const loadMonthStats = async (accts: BankAccount[]) => {
    const stats: Record<string, { in: number; out: number }> = {}
    const monthStart = clampFrom(localIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
    const todayStr = localIso(new Date())

    // Bounded in the query. The unbounded version hit the same 1,000-row cap
    // as loadLedger and quietly reported MONTH IN/OUT as zero.
    const ids = accts.map(a => a.id)
    const { data } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journals!inner(posting_date, status)')
      .in('account_id', ids)
      .gte('journals.posting_date', monthStart)
      .lte('journals.posting_date', todayStr)
      .eq('journals.status', 'posted')

    if (data) {
      // Filter by month in JS
      data.forEach((l: any) => {
        const pd = l.journals?.posting_date || ''
        if (pd >= monthStart && pd <= todayStr) {
          if (!stats[l.account_id]) stats[l.account_id] = { in: 0, out: 0 }
          stats[l.account_id].in += (l.debit || 0)
          stats[l.account_id].out += (l.credit || 0)
        }
      })
    }
    setMonthStats(stats)
  }

  const loadLedger = async (acct: BankAccount, from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoadingLedger(true)
    // One query, filtered server-side through the embedded journals relation.
    //
    // The two-step version this replaces fetched EVERY line for the account
    // unbounded and oldest-first, and PostgREST caps a response at 1,000 rows.
    // M-Pesa 1020 carries 2,300+ lines, so the cap returned only the OLDEST
    // thousand, none from the requested range, and the statement rendered
    // empty under a correct balance. Fixed once on the pre-port page, lost in
    // the wholesale port, now fixed at the source.
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_id, journals!inner(ref, posting_date, journal_type, source_ref, status)')
      .eq('account_id', acct.id)
      .gte('journals.posting_date', f)
      .lte('journals.posting_date', t)
      .eq('journals.status', 'posted')
      .order('created_at', { ascending: true })

    if (!lines || lines.length === 0) { setLedger([]); setLoadingLedger(false); return }

    // Running balance must follow ACCOUNTING chronology: posting_date first,
    // creation time second. The old code accumulated in raw created_at order,
    // which walks a BACKDATED entry (posted today, dated last week) at the
    // END of the run instead of on its accounting date, skewing every
    // running figure between the two dates. Sort the composite key first,
    // then accumulate.
    const chrono = [...lines].sort((a: any, b: any) =>
      `${a.journals.posting_date}|${a.created_at || ''}`.localeCompare(`${b.journals.posting_date}|${b.created_at || ''}`))

    let running = 0
    const entries = chrono
      .map((l: any) => {
        const j = l.journals
        running += (l.debit || 0) - (l.credit || 0)
        return {
          id: l.id,
          posting_date: j.posting_date,
          created_at: l.created_at || '',
          description: l.description || '—',
          debit: l.debit || 0,
          credit: l.credit || 0,
          voucher_ref: j.source_ref || j.ref || '—',
          voucher_type: j.journal_type || '',
          running_balance: running,
        }
      })
      // Display newest-first down to the individual entry. posting_date has
      // no time component, so a date-only sort left same-day entries in
      // creation order (oldest at top of the day, NEWEST at the very bottom
      // of the day's block) — which is exactly how a 21:09 receipt "went
      // missing" below the scroll fold under 20 earlier entries.
      .sort((a: any, b: any) =>
        `${b.posting_date}|${b.created_at}`.localeCompare(`${a.posting_date}|${a.created_at}`))

    setLedger(entries)
    setLoadingLedger(false)
  }

  const selectAccount = (acct: BankAccount) => {
    setSelected(acct)
    setShowReconcile(false)
    loadLedger(acct)
  }

  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0)
  // Tile styling: prefer the tenant's saved display_color and nature. If the
  // tenant has not customised those yet, fall back to the legacy BANK_CONFIG
  // code map (which knows Malkia's canonical codes) and then to a
  // nature-based default. Result: every Cash & Bank account renders, whether
  // it's a hand-picked code or a fresh one.
  const cfgFor = (acct: BankAccount) => {
    return accountBrand(acct)
  }
  // Which BANK_PRESETS do not have a matching account row yet? These show up
  // in the left column as ghost tiles with a Setup button.
  const activeCodes = new Set(accounts.map(a => a.code))
  const missingPresets = BANK_PRESETS.filter(p => !activeCodes.has(p.code))
  const totalIn = ledger.reduce((s, l) => s + l.debit, 0)
  const totalOut = ledger.reduce((s, l) => s + l.credit, 0)
  const netFlow = totalIn - totalOut
  const diff = selected ? (parseFloat(statementBalance.replace(/,/g, '')) || 0) - selected.balance : 0

  // Export the currently-loaded statement. Three formats share one row
  // builder. Rows are re-sorted CHRONOLOGICALLY and carry the same per-row
  // running_balance the screen shows — the previous CSV recomputed the
  // running column over the newest-first display array starting from zero,
  // which made every exported balance cumulative-backwards. Column sorts on
  // screen never affect the export: a statement is an accounting document,
  // and date order is the only correct order for one.
  const [exportOpen, setExportOpen] = useState<null | 'header' | 'card'>(null)
  useEffect(() => {
    if (!exportOpen) return
    const close = () => setExportOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [exportOpen])

  const exportStatement = (kind: 'csv' | 'excel' | 'pdf') => {
    if (!selected || ledger.length === 0) return
    const chrono = [...ledger].sort((a, b) => `${a.posting_date}|${a.created_at}`.localeCompare(`${b.posting_date}|${b.created_at}`))
    const rows: StatementExportRow[] = chrono.map(l => ({
      date: l.posting_date,
      ref: l.voucher_ref,
      type: VOUCHER_TYPE_LABEL[l.voucher_type] || l.voucher_type || '—',
      description: l.description,
      moneyIn: l.debit || 0,
      moneyOut: l.credit || 0,
      balance: l.running_balance ?? 0,
    }))
    const meta: StatementExportMeta = {
      accountName: selected.name,
      accountCode: selected.code,
      accountNumber: selected.account_number,
      fromDate, toDate,
      totalIn, totalOut, netFlow,
      count: ledger.length,
    }
    if (kind === 'csv') exportStatementCSV(rows, meta)
    else if (kind === 'excel') exportStatementExcel(rows, meta)
    else {
      const res = exportStatementPDF(rows, meta)
      if (!res.ok && res.error) alert(res.error)
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-title">Bank & Cash Accounts</div>
          <div className="page-sub">Live balances · Full ledger per account · Reconciliation · <span className="sync-dot"></span> Supabase</div>
        </div>
        <div className="page-actions">
          <GuideToggle />
          {onNav && (
            <button
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => onNav('bank-transfer')}
              title="Move money between two Cash & Bank accounts"
            >
              Transfer Money
            </button>
          )}
          {canEdit && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Create a new bank, mobile money, or cash account — gets the next free code and posts like any other till"
              onClick={() => openSetup({
                code: '1023',
                defaultName: '',
                nature: 'traditional_bank',
                defaultColor: defaultColorForNature('traditional_bank'),
              })}
            >
              + Add Bank Account
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={loadAccounts}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: selected && ledger.length > 0 ? 1 : 0.5 }}
              onClick={e => { e.stopPropagation(); setExportOpen(o => o === 'header' ? null : 'header') }}
              disabled={!selected || ledger.length === 0}
              title={selected ? 'Download the current statement as PDF, Excel, or CSV' : 'Select an account first'}
            >
              <Icon name="export" size={14} /> Export ▾
            </button>
            {exportOpen === 'header' && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,.4)', zIndex: 950, minWidth: 160, overflow: 'hidden' }}>
                {(['pdf', 'excel', 'csv'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => { exportStatement(k); setExportOpen(null) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
                  >
                    {k === 'pdf' ? 'PDF (print / save)' : k === 'excel' ? 'Excel (.xlsx)' : 'CSV'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOTAL BALANCE BANNER */}
      <div style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),.15) 0%, rgba(0,229,160,.08) 100%)', border: '1px solid rgba(var(--accent-rgb),.2)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Cash & Bank Position</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: totalBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(totalBalance)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{accounts.length} active accounts · FY 2025-26</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Month In</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
              {tzs(Object.values(monthStats).reduce((s, v) => s + v.in, 0))}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }}></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Month Out</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
              {tzs(Object.values(monthStats).reduce((s, v) => s + v.out, 0))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, flex: 1, minHeight: 0 }}>

        {/* LEFT — ACCOUNT LIST
            Wrapped in a column so the count header stays put while the cards
            scroll under it. Before this, a tenant with 4 accounts saw two and
            a half and had no way to tell there were more: the total said "4
            active accounts" but that sits in a different card at the top of
            the page, far from the list it describes. */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {!loadingAccounts && accounts.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1,
              paddingBottom: 8, marginBottom: 2, borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
              {listScrollable && (
                <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
                  scroll for more
                </span>
              )}
            </div>
          )}
        <div
          ref={listRef}
          onScroll={updateListScroll}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 0, paddingTop: 8 }}
        >
          {loadingAccounts ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading accounts…</div>
          ) : accounts.length === 0 ? (
            <EmptyState
              compact
              icon={<svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
              title="Your cash and bank tills"
              body="Each till here is a real ledger account under Cash & Bank. Activate the ones you actually use so cash sale payment buttons, transfers, and the payment register post to the right place. Use the Setup buttons below to activate a preset, or add a custom account."
            />
          ) : accounts.map(acct => {
            const c = cfgFor(acct)
            const stats = monthStats[acct.id] || { in: 0, out: 0 }
            const isSelected = selected?.id === acct.id
            // COMPACT ROW. This card used to carry the account description, a
            // big balance block, an in/out row and a share-of-total bar, about
            // 180px each, so only two fit in the ~370px this column gets. Every
            // one of those is already shown for the selected account in the
            // detail pane on the right, so the list was repeating the pane and
            // hiding its own contents to do it. A row is now ~62px, so four or
            // five accounts are visible without scrolling at all.
            return (
              <div
                key={acct.id}
                onClick={() => selectAccount(acct)}
                style={{
                  background: isSelected ? `${c.color}12` : 'var(--surface)',
                  border: `2px solid ${isSelected ? c.color : 'var(--border)'}`,
                  borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: c.accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={c.iconName} size={16} color={c.color} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 700,
                    color: isSelected ? c.color : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{acct.name}</div>
                  <div style={{
                    fontSize: 9.5, color: 'var(--text3)', fontFamily: 'var(--mono)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {acct.code}{acct.account_number ? ` · ${acct.account_number}` : ''}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800,
                    color: acct.balance >= 0 ? (isSelected ? c.color : 'var(--text)') : 'var(--red)',
                    whiteSpace: 'nowrap',
                  }}>{tzs(acct.balance)}</div>
                  {(stats.in > 0 || stats.out > 0) && (
                    <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--green)' }}>+{tzs(stats.in)}</span>
                      {' '}
                      <span style={{ color: 'var(--red)' }}>-{tzs(stats.out)}</span>
                    </div>
                  )}
                </div>

                <Icon name="chevron-right" size={13} color={isSelected ? c.color : 'var(--text3)'} />
              </div>
            )
          })}

          {/* Preset tiles for known payment methods the tenant has NOT yet
              activated. Ghost styling makes it visually clear these are
              not real accounts, and the Setup button opens the editor to
              create the account row with the right code + nature. */}
          {!loadingAccounts && missingPresets.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>
                Available to activate
              </div>
              <GuideTip>These are common Tanzanian payment methods waiting to be switched on. Setting one up creates its account and unlocks its tile on Cash Sale — and any extra account you add gets a tile of its own too.</GuideTip>
              {missingPresets.map(p => (
                <div key={p.code} style={{
                  background: 'var(--surface)',
                  border: '2px dashed var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  opacity: 0.75,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: hexToTint(p.defaultColor, '18'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={iconForNature(p.nature)} size={20} color={p.defaultColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.defaultName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Code {p.code} · not set up</div>
                    </div>
                  </div>
                  {canEdit ? (
                    <button
                      onClick={() => openSetup(p)}
                      className="btn btn-sm"
                      style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Setup {p.defaultName}
                    </button>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: '8px 12px' }}>
                      Ask an admin to activate this account.
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

          {/* Fade at the bottom edge: a soft cue that content continues below.
              Hidden once the user reaches the end so it never implies more
              than there is. pointerEvents none so it cannot eat clicks on the
              card underneath it. */}
          {listScrollable && !atListEnd && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 48,
              background: 'linear-gradient(to bottom, transparent, var(--bg))',
              pointerEvents: 'none',
            }} />
          )}
        </div>

        {/* RIGHT — LEDGER */}
        {selected && (
          <div style={maximized
            ? { position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }
            : { display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {(() => {
              const c = cfgFor(selected)
              return (
                <>
                  {/* Account header (full card — hidden while maximized) */}
                  {!maximized && (
                  <div style={{ background: 'var(--surface)', border: `1px solid ${c.color}40`, borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={c.iconName} size={26} color={c.color} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{selected.name}</div>
                          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                            GL Account {selected.code} · Cash & Bank
                            {selected.account_number ? ` · A/C ${selected.account_number}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Current Balance</div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: selected.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(selected.balance)}</div>
                        {canEdit && (
                          <button
                            onClick={() => openEdit(selected)}
                            style={{ marginTop: 8, background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                          >
                            Edit name, colour, nature
                          </button>
                        )}
                        <button
                          onClick={() => setMaximized(true)}
                          title="Full-screen ledger"
                          style={{ marginTop: 8, marginLeft: canEdit ? 8 : 0, background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <Icon name="maximize" size={11} /> Maximize
                        </button>
                      </div>
                    </div>

                    {selected.description && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                        {selected.description}
                      </div>
                    )}

                    {/* Period stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      {[
                        { label: 'Money In', value: totalIn, color: 'var(--green)', icon: 'arrow-in' },
                        { label: 'Money Out', value: totalOut, color: 'var(--red)', icon: 'arrow-out' },
                        { label: 'Net Flow', value: netFlow, color: netFlow >= 0 ? 'var(--green)' : 'var(--red)', icon: netFlow >= 0 ? 'trend-up' : 'trend-down' },
                        { label: 'Transactions', value: ledger.length, color: 'var(--accent)', icon: 'filter', isCount: true },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Icon name={s.icon} size={12} color={s.color} />
                            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>{s.label}</span>
                          </div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: s.color }}>
                            {(s as any).isCount ? s.value : tzs(s.value as number)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* Compact account bar (maximized only) — one line, so the
                      table below gets every remaining pixel of the viewport */}
                  {maximized && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: `1px solid ${c.color}40`, borderRadius: 12, padding: '10px 16px', flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={c.iconName} size={18} color={c.color} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                          GL {selected.code}{selected.account_number ? ` · A/C ${selected.account_number}` : ''}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Current Balance</div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: selected.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(selected.balance)}</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={() => setMaximized(false)}>
                        <Icon name="minimize" size={14} /> Exit · Esc
                      </button>
                    </div>
                  )}

                  {/* Date filter + Reconcile */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
                      <Icon name="calendar" size={13} color="var(--text3)" />
                      <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
                      <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={toDate} onChange={e => setToDate(e.target.value)} />
                      <button className="btn btn-primary btn-sm" onClick={() => loadLedger(selected)}>Load</button>
                    </div>
                    {[
                        { label: 'Today', f: localIso(new Date()), t: localIso(new Date()) },
                        { label: 'This Week', f: localIso(new Date(Date.now()-6*86400000)), t: localIso(new Date()) },
                        { label: 'This Month', f: localIso(new Date(new Date().getFullYear(),new Date().getMonth(),1)), t: localIso(new Date()) },
                      ].map(p => (
                      <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => {
                        setFromDate(p.f); setToDate(p.t)
                        if (selected) loadLedger(selected, p.f, p.t)
                      }}>{p.label}</button>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: showReconcile ? 'var(--green)' : 'var(--text3)' }} onClick={() => setShowReconcile(!showReconcile)}>
                      <Icon name="reconcile" size={14} color={showReconcile ? 'var(--green)' : 'var(--text3)'} /> Reconcile
                    </button>
                  </div>

                  {/* RECONCILIATION PANEL */}
                  {showReconcile && (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="reconcile" size={16} color="var(--accent)" /> Bank Reconciliation
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>STATEMENT BALANCE (from bank)</div>
                          <input className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="Enter bank statement balance" value={statementBalance} onChange={e => setStatementBalance(e.target.value)} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>GL BALANCE (system)</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>{tzs(selected.balance)}</div>
                        </div>
                      </div>
                      {statementBalance && (
                        <div style={{ marginTop: 12, padding: '12px 16px', background: Math.abs(diff) < 1 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${Math.abs(diff) < 1 ? 'rgba(0,229,160,.3)' : 'rgba(255,71,87,.3)'}`, borderRadius: 'var(--r)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon name={Math.abs(diff) < 1 ? 'reconcile' : 'filter'} size={16} color={Math.abs(diff) < 1 ? 'var(--green)' : 'var(--red)'} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: Math.abs(diff) < 1 ? 'var(--green)' : 'var(--red)' }}>
                              {Math.abs(diff) < 1 ? 'RECONCILED — Balances match' : 'DIFFERENCE FOUND — Investigate unmatched entries'}
                            </span>
                          </div>
                          {Math.abs(diff) >= 1 && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>
                              {diff > 0 ? '+' : ''}{tzs(diff)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LEDGER TABLE */}
                  <div className="card" style={maximized ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : { flex: 1 }}>
                    <div className="card-header" style={{ marginBottom: 14, flexShrink: 0 }}>
                      <div>
                        <div className="card-title">{selected.name} — Statement</div>
                        <div className="card-sub">
                          {fromDate} to {toDate} · {ledger.length} entries
                          {ledgerSortSpecs.length > 0 && ' · sorted — Balance shows each entry\u2019s balance after posting'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => setMaximized(m => !m)}
                          title={maximized ? 'Exit full screen (Esc)' : 'Full-screen ledger'}
                        >
                          <Icon name={maximized ? 'minimize' : 'maximize'} size={13} /> {maximized ? 'Restore' : 'Maximize'}
                        </button>
                        <div style={{ position: 'relative' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: ledger.length > 0 ? 1 : 0.5 }}
                            onClick={e => { e.stopPropagation(); setExportOpen(o => o === 'card' ? null : 'card') }}
                            disabled={ledger.length === 0}
                            title="Download the current statement as PDF, Excel, or CSV"
                          >
                            <Icon name="export" size={13} /> Export ▾
                          </button>
                          {exportOpen === 'card' && (
                            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,.4)', zIndex: 950, minWidth: 160, overflow: 'hidden' }}>
                              {(['pdf', 'excel', 'csv'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => { exportStatement(k); setExportOpen(null) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
                  >
                    {k === 'pdf' ? 'PDF (print / save)' : k === 'excel' ? 'Excel (.xlsx)' : 'CSV'}
                  </button>
                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {loadingLedger ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading ledger…</div>
                    ) : ledger.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                        <div style={{ marginBottom: 8 }}><Icon name="bank" size={32} color="var(--surface3)" /></div>
                        No transactions found for this period.
                      </div>
                    ) : (
                      <div className="table-wrap" style={maximized ? { flex: 1, minHeight: 0, overflowY: 'auto' } : undefined}>
                        <table>
                          <thead>
                            <tr>
                              <SortableTh label="Date" sortKey="date" onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Ref" sortKey="ref" onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Type" sortKey="type" onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Description" sortKey="description" onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Money In" sortKey="in" align="right" width={140} onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Money Out" sortKey="out" align="right" width={140} onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                              <SortableTh label="Balance" sortKey="balance" align="right" width={150} onHeaderClick={onLedgerHeaderClick} getSortIndex={getLedgerSortIndex} getSortDir={getLedgerSortDir} />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLedger.map((entry, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                                <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{entry.posting_date}</td>
                                <td className="td-mono td-amber" style={{ fontSize: 11 }}>{entry.voucher_ref}</td>
                                <td>
                                  <span className="pill pill-gray" style={{ fontSize: 9 }}>
                                    {VOUCHER_TYPE_LABEL[entry.voucher_type] || entry.voucher_type || '—'}
                                  </span>
                                </td>
                                <td
                                  // Hovering a shortened description shows the whole text via the
                                  // native tooltip. In the maximized view there is real width, so
                                  // the cell wraps and shows everything without needing the hover.
                                  title={entry.description}
                                  style={maximized
                                    ? { fontSize: 12, color: 'var(--text2)', whiteSpace: 'normal', wordBreak: 'break-word' }
                                    : { fontSize: 12, color: 'var(--text2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >{entry.description}</td>
                                <td className="td-right td-mono" style={{ color: entry.debit > 0 ? 'var(--green)' : 'var(--text3)', fontWeight: entry.debit > 0 ? 600 : 400, fontSize: 12 }}>
                                  {entry.debit > 0 ? tzs(entry.debit) : '—'}
                                </td>
                                <td className="td-right td-mono" style={{ color: entry.credit > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: entry.credit > 0 ? 600 : 400, fontSize: 12 }}>
                                  {entry.credit > 0 ? `(${tzs(entry.credit)})` : '—'}
                                </td>
                                <td className="td-right td-mono" style={{ fontSize: 12, fontWeight: 600, color: (entry.running_balance || 0) >= 0 ? 'var(--text)' : 'var(--red)' }}>
                                  {tzs(entry.running_balance || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                              <td colSpan={4} style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Period Totals</td>
                              <td className="td-right td-mono" style={{ color: 'var(--green)', fontSize: 13, padding: '10px 14px' }}>{tzs(totalIn)}</td>
                              <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 13, padding: '10px 14px' }}>({tzs(totalOut)})</td>
                              <td className="td-right td-mono" style={{ color: netFlow >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 14, fontWeight: 800, padding: '10px 14px' }}>{tzs(selected.balance)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* EDIT / SETUP MODAL */}
      {editor && (
        <div
          onClick={closeEditor}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16, padding: 24,
              width: 420, maxWidth: '100%', border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
              // The opening balance block made this dialog taller than a laptop
              // viewport, and without a scroller the title and the Activate
              // button were both cut off with no way to reach them. 40px covers
              // the overlay's 20px padding top and bottom.
              // dvh not vh: on mobile, vh ignores the browser chrome, which is the
              // same class of bug the 100vh -> 100dvh sweep fixed elsewhere.
              maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto',
            }}
          >
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              {editor.kind === 'edit' ? `Edit ${editor.acct.name}` : `Set up ${editor.preset.defaultName}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 20 }}>
              {editor.kind === 'edit'
                ? `Code ${editor.acct.code} · Cash & Bank`
                : 'Cash & Bank · Code auto-assigned'}
            </div>

            {/* Name */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Display Name</div>
              <input
                className="form-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. NMB Business Account"
              />
            </label>

            {/* Account Number */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Account Number <span style={{ color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              <input
                className="form-input"
                value={editAccountNumber}
                onChange={e => setEditAccountNumber(e.target.value)}
                placeholder={editNature === 'mobile_money' ? 'e.g. 50582099' : editNature === 'traditional_bank' ? 'e.g. 22510074972' : 'Leave blank for cash'}
                style={{ fontFamily: 'var(--mono)' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                Shown on Cash Sale so cashiers can pick the right account when you have more than one at the same bank.
              </div>
            </label>

            {/* Branch — printed in the invoice's Payment Details section */}
            {editNature === 'traditional_bank' && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Branch <span style={{ color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
                <input
                  className="form-input"
                  value={editBranch}
                  onChange={e => setEditBranch(e.target.value)}
                  placeholder="e.g. Kariakoo Branch"
                />
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  Printed under Payment Details on sales invoices so customers pay into the right branch.
                </div>
              </label>
            )}

            {/* Opening balance. Setup only: an existing account's balance is
                already in the ledger and must not be restated here. */}
            {editor.kind === 'setup' && (
              <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Opening balance (required)
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12.5 }}>
                  <input type="radio" name="openingMode" checked={editOpeningMode === 'amount'}
                    onChange={() => setEditOpeningMode('amount')} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                  <span>
                    This account already had money in it when we started
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>
                      Posts the balance to assets and your balance sheet, against Opening Balance Equity.
                    </span>
                  </span>
                </label>
                {editOpeningMode === 'amount' && (
                  <input type="number" className="form-input" placeholder="0"
                    style={{ fontFamily: 'var(--mono)', marginBottom: 8 }}
                    value={editOpeningAmount} onChange={e => setEditOpeningAmount(e.target.value)} />
                )}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12.5 }}>
                  <input type="radio" name="openingMode" checked={editOpeningMode === 'zero'}
                    onChange={() => { setEditOpeningMode('zero'); setEditOpeningAmount('') }}
                    style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                  <span>
                    This account starts at zero
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>
                      Correct for a new account. Money arriving from another account is a transfer, not an opening balance.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {/* Cash Sale visibility */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, cursor: 'pointer', fontSize: 12.5, color: 'var(--text)' }}>
              <input type="checkbox" checked={editShowInCS} onChange={e => setEditShowInCS(e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--accent)' }} />
              <span>
                Show as a payment option in Cash Sale
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>Off keeps the account fully usable for transfers and reports — just hidden from the till.</span>
              </span>
            </label>
            <GuideTip>Nature decides how the Cash Sale tile behaves: cash needs no reference number, mobile money and bank tiles ask the cashier for the transaction ref.</GuideTip>

            {/* Nature */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Nature</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {(['cash', 'mobile_money', 'traditional_bank'] as BankNature[]).map(n => (
                  <button
                    key={n}
                    onClick={() => setEditNature(n)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 6px',
                      background: editNature === n ? hexToTint(editColor, '18') : 'var(--surface2)',
                      border: `2px solid ${editNature === n ? editColor : 'var(--border)'}`,
                      borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    <Icon name={iconForNature(n)} size={20} color={editNature === n ? editColor : 'var(--text3)'} />
                    <span style={{ fontSize: 10, color: editNature === n ? editColor : 'var(--text3)', fontWeight: 600 }}>
                      {n === 'cash' ? 'Cash' : n === 'mobile_money' ? 'Mobile Money' : 'Bank'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Colour */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Tile Colour</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  style={{ width: 44, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                />
                <input
                  className="form-input"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  placeholder="#4ade80"
                  style={{ flex: 1, fontFamily: 'var(--mono)' }}
                />
                {/* Preview chip so the tenant sees what the tile will look like */}
                <div style={{
                  width: 40, height: 36, borderRadius: 8,
                  background: hexToTint(editColor, '18'),
                  border: `2px solid ${editColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={iconForNature(editNature)} size={18} color={editColor} />
                </div>
              </div>
            </div>

            {editError && (
              <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', marginBottom: 12, padding: '8px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6 }}>
                {editError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={closeEditor}
                disabled={editSaving}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveEditor}
                disabled={editSaving || !editName.trim()}
                style={{ flex: 1 }}
              >
                {editSaving ? 'Saving…' : (editor.kind === 'edit' ? 'Save changes' : 'Activate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
