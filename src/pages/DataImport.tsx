import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

// ─── Types ─────────────────────────────────────────────────────────────────

type ImportSource = 'tally_xml' | 'excel_csv' | 'quickbooks' | 'manual_csv'
type ImportEntity = 'customers' | 'products' | 'accounts' | 'opening_balances'
type Step = 'source' | 'entity' | 'upload' | 'map' | 'preview' | 'done'
type Toast_ = { msg: string; type: 'success' | 'error' } | null

interface FieldDef {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'date'
  hint?: string
  example?: string
}

interface MappedRow { [malkiaKey: string]: string }
interface ParsedRow  { [col: string]: string }

// ─── Field Definitions per entity ──────────────────────────────────────────

const ENTITY_FIELDS: Record<ImportEntity, FieldDef[]> = {
  customers: [
    { key: 'name',           label: 'Full Name / Company',  required: true,  type: 'string', example: 'Amina Mohamed' },
    { key: 'customer_type',  label: 'Customer Type',        required: true,  type: 'string', hint: 'cash or debtor', example: 'cash' },
    { key: 'whatsapp',       label: 'WhatsApp Number',      required: false, type: 'string', example: '+255712345678' },
    { key: 'contact_person', label: 'Contact Person',       required: false, type: 'string', example: 'John Mwamba' },
    { key: 'email',          label: 'Email Address',        required: false, type: 'string', example: 'amina@example.com' },
    { key: 'credit_limit',   label: 'Credit Limit (TZS)',   required: false, type: 'number', example: '500000' },
    { key: 'credit_period',  label: 'Credit Period (days)', required: false, type: 'number', example: '30' },
    { key: 'balance',        label: 'Opening Balance (TZS)',required: false, type: 'number', hint: 'Positive = owes you', example: '150000' },
    { key: 'pregnancy_stage',label: 'Pregnancy Stage',      required: false, type: 'string', hint: 'pregnant / postpartum / ttc / newborn', example: 'pregnant' },
    { key: 'segment',        label: 'Segment',              required: false, type: 'string', hint: 'B2B or B2C', example: 'B2C' },
    { key: 'address',        label: 'Address',              required: false, type: 'string', example: 'Dar es Salaam' },
  ],
  products: [
    { key: 'sku',            label: 'SKU / Item Code',      required: false, type: 'string', example: 'BPM-001', hint: 'Auto-generated from name if blank' },
    { key: 'name',           label: 'Product Name',         required: true,  type: 'string', example: 'Spectra S1 Breast Pump' },    { key: 'category',       label: 'Category',             required: false, type: 'string', hint: 'Feeding / Maternity / Postpartum / Newborn', example: 'Feeding' },
    { key: 'unit',           label: 'Unit of Measure',      required: false, type: 'string', hint: 'Piece / Box / Set', example: 'Piece' },
    { key: 'cost_price',     label: 'Cost Price (TZS)',     required: false, type: 'number', example: '180000', hint: 'Defaults to 0 if blank' },
    { key: 'selling_price',  label: 'Selling Price (TZS)',  required: false, type: 'number', example: '250000', hint: 'Defaults to 0 if blank' },
    { key: 'qty_on_hand',    label: 'Qty in Stock',         required: false, type: 'number', example: '24' },
    { key: 'reorder_point',  label: 'Reorder Point',        required: false, type: 'number', example: '5' },
  ],
  accounts: [
    { key: 'code',           label: 'Account Code',         required: true,  type: 'string', example: '4001' },
    { key: 'name',           label: 'Account Name',         required: true,  type: 'string', example: 'Sales Revenue' },
    { key: 'type',           label: 'Account Type',         required: true,  type: 'string', hint: 'Asset / Liability / Equity / Revenue / Expense', example: 'Revenue' },
    { key: 'category',       label: 'Category / Group',     required: false, type: 'string', example: 'Current Assets' },
    { key: 'balance',        label: 'Opening Balance (TZS)',required: false, type: 'number', hint: 'Dr positive, Cr negative', example: '0' },
  ],
  opening_balances: [
    { key: 'account_code',   label: 'Account Code',         required: true,  type: 'string', example: '1001' },
    { key: 'account_name',   label: 'Account Name',         required: false, type: 'string', example: 'Cash in Hand' },
    { key: 'debit',          label: 'Debit Amount (TZS)',   required: false, type: 'number', example: '500000' },
    { key: 'credit',         label: 'Credit Amount (TZS)',  required: false, type: 'number', example: '0' },
    { key: 'date',           label: 'As-at Date',           required: false, type: 'date',   example: '2025-01-01' },
    { key: 'description',    label: 'Description / Narration', required: false, type: 'string', example: 'Opening balance from Tally' },
  ],
}

// ─── Auto-mapping heuristics ───────────────────────────────────────────────
// Maps common Tally / QuickBooks / Excel column names to MalkiaOS field keys

const AUTO_MAP_HINTS: Record<string, string> = {
  // Customers
  'party name': 'name', 'ledger name': 'name', 'customer name': 'name', 'name': 'name',
  'company': 'name', 'organisation': 'name', 'organization': 'name',
  'mobile': 'whatsapp', 'phone': 'whatsapp', 'whatsapp': 'whatsapp', 'contact': 'whatsapp',
  'email': 'email', 'e-mail': 'email', 'email address': 'email',
  'contact person': 'contact_person', 'attention': 'contact_person',
  'credit limit': 'credit_limit', 'credit days': 'credit_period',
  'opening balance': 'balance', 'balance': 'balance',
  'address': 'address', 'city': 'address',
  // Products
  'item name': 'name', 'stock item': 'name', 'product name': 'name', 'description': 'name',
  'name of item': 'name', 'particulars': 'name',
  'item code': 'sku', 'sku': 'sku', 'code': 'sku', 'part no': 'sku', 'part number': 'sku',
  'alias': 'sku', 'short name': 'sku',
  'unit': 'unit', 'uom': 'unit', 'unit of measure': 'unit', 'base unit': 'unit', 'baseunits': 'unit',
  'purchase rate': 'cost_price', 'cost': 'cost_price', 'cost price': 'cost_price', 'buying price': 'cost_price',
  'purchase price': 'cost_price', 'standard cost': 'cost_price', 'last purchase cost': 'cost_price',
  'sales rate': 'selling_price', 'selling price': 'selling_price', 'price': 'selling_price', 'rate': 'selling_price',
  'mrp': 'selling_price', 'list price': 'selling_price', 'standard selling price': 'selling_price',
  'quantity': 'qty_on_hand', 'qty': 'qty_on_hand', 'stock': 'qty_on_hand', 'closing stock': 'qty_on_hand',
  'opening qty': 'qty_on_hand', 'opening quantity': 'qty_on_hand', 'opening balance': 'qty_on_hand',
  'stock in hand': 'qty_on_hand', 'current stock': 'qty_on_hand', 'balance qty': 'qty_on_hand',
  'group': 'category', 'category': 'category', 'item group': 'category', 'parent': 'category',
  'stock group': 'category', 'product group': 'category', 'classification': 'category',
  // Accounts
  'account code': 'code', 'ledger code': 'code', 'gl code': 'code', 'account no': 'code',
  'account name': 'name', 'ledger': 'name',
  'account type': 'type', 'type': 'type', 'nature': 'type',
  'account group': 'category',
  'closing balance': 'balance',
  // Opening balances
  'debit': 'debit', 'dr': 'debit', 'debit amount': 'debit',
  'credit': 'credit', 'cr': 'credit', 'credit amount': 'credit',
  'narration': 'description', 'particulars': 'description', 'remarks': 'description',
  'date': 'date', 'as at': 'date',
}

function autoMap(columns: string[], entity: ImportEntity): Record<string, string> {
  const fields = ENTITY_FIELDS[entity].map(f => f.key)
  const result: Record<string, string> = {}
  columns.forEach(col => {
    const norm = col.toLowerCase().trim()
    const mapped = AUTO_MAP_HINTS[norm]
    if (mapped && fields.includes(mapped) && !Object.values(result).includes(mapped)) {
      result[col] = mapped
    }
  })
  return result
}

// ─── Parsers ───────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || []
    const row: ParsedRow = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim().replace(/^"|"$/g, '') })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function parseTallyXML(xmlText: string): { entity: string; rows: ParsedRow[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  // Detect what kind of Tally export this is
  const ledgers = doc.querySelectorAll('LEDGER')
  const stockItems = doc.querySelectorAll('STOCKITEM')
  const vouchers = doc.querySelectorAll('VOUCHER')

  if (stockItems.length > 0) {
    const rows = Array.from(stockItems).map(item => ({
      'Item Name':   item.getAttribute('NAME') || item.querySelector('NAME')?.textContent || '',
      'Group':       item.querySelector('PARENT')?.textContent || '',
      'Unit':        item.querySelector('BASEUNITS')?.textContent || '',
      'Cost Price':  item.querySelector('COSTPRICE')?.textContent || item.querySelector('LASTPURCHASECOST')?.textContent || '',
      'Selling Price': item.querySelector('SELLINGPRICE')?.textContent || '',
      'Opening Qty': item.querySelector('OPENINGBALANCE')?.textContent?.replace(/[^\d.-]/g, '') || '0',
    }))
    return { entity: 'products', rows }
  }

  if (ledgers.length > 0) {
    const rows = Array.from(ledgers).map(l => ({
      'Ledger Name':    l.getAttribute('NAME') || l.querySelector('NAME')?.textContent || '',
      'Group':          l.querySelector('PARENT')?.textContent || '',
      'Opening Balance': l.querySelector('OPENINGBALANCE')?.textContent?.replace(/[^\d.-]/g, '') || '0',
      'Phone':          l.querySelector('MOBILE')?.textContent || l.querySelector('PHONE')?.textContent || '',
      'Email':          l.querySelector('EMAIL')?.textContent || '',
      'Address':        l.querySelector('ADDRESS')?.textContent || '',
      'Credit Limit':   l.querySelector('CREDITLIMIT')?.textContent?.replace(/[^\d.-]/g, '') || '',
      'Credit Days':    l.querySelector('CREDITPERIOD')?.textContent?.replace(/\D/g, '') || '',
    }))
    return { entity: 'customers', rows }
  }

  if (vouchers.length > 0) {
    const rows = Array.from(vouchers).map(v => ({
      'Date':        v.querySelector('DATE')?.textContent || '',
      'Account Code': '',
      'Account Name': v.querySelector('PARTYLEDGERNAME')?.textContent || '',
      'Narration':   v.querySelector('NARRATION')?.textContent || '',
      'Debit':       v.querySelector('ALLLEDGERENTRIES\\.LIST > AMOUNT')?.textContent?.startsWith('-') ? '' :
                     v.querySelector('ALLLEDGERENTRIES\\.LIST > AMOUNT')?.textContent || '',
      'Credit':      v.querySelector('ALLLEDGERENTRIES\\.LIST > AMOUNT')?.textContent?.startsWith('-') ?
                     (v.querySelector('ALLLEDGERENTRIES\\.LIST > AMOUNT')?.textContent?.replace('-','') || '') : '',
    }))
    return { entity: 'opening_balances', rows }
  }

  return { entity: 'customers', rows: [] }
}

// ─── Validators ────────────────────────────────────────────────────────────

interface ValidationResult { valid: boolean; errors: string[] }

function validateRow(row: MappedRow, fields: FieldDef[], idx: number): ValidationResult {
  const errors: string[] = []
  fields.filter(f => f.required).forEach(f => {
    if (!row[f.key] || row[f.key].trim() === '') {
      errors.push(`Row ${idx + 1}: "${f.label}" is required`)
    }
  })
  fields.filter(f => f.type === 'number').forEach(f => {
    if (row[f.key] && row[f.key] !== '' && isNaN(parseFloat(row[f.key].replace(/,/g, '')))) {
      errors.push(`Row ${idx + 1}: "${f.label}" must be a number (got "${row[f.key]}")`)
    }
  })
  // Customer type coercion check
  if (row['customer_type']) {
    const ct = row['customer_type'].toLowerCase()
    if (!['cash', 'debtor', 'b2c', 'b2b'].includes(ct)) {
      errors.push(`Row ${idx + 1}: Customer Type "${row['customer_type']}" — expected cash, debtor, B2B or B2C`)
    }
  }
  return { valid: errors.length === 0, errors }
}

function coerceRow(row: MappedRow, entity: ImportEntity): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  const fields = ENTITY_FIELDS[entity]
  fields.forEach(f => {
    const val = (row[f.key] || '').trim().replace(/,/g, '')
    if (!val) return
    if (f.type === 'number') {
      out[f.key] = parseFloat(val) || 0
    } else if (f.key === 'customer_type') {
      const m: Record<string,string> = { b2c:'cash', b2b:'debtor', customer:'cash', party:'debtor' }
      out[f.key] = m[val.toLowerCase()] || val.toLowerCase()
    } else if (f.key === 'sku') {
      out[f.key] = val.toUpperCase()
    } else {
      out[f.key] = val
    }
  })
  return out
}

// ─── Supabase writers ──────────────────────────────────────────────────────

async function writeCustomers(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  for (const row of rows) {
    const payload: Record<string, unknown> = {
      ...coerceRow(row, 'customers'),
      is_active: true,
      segment: row['segment'] || (row['customer_type'] === 'debtor' ? 'B2B' : 'B2C'),
    }
    // Auto-generate customer_number
    const prefix = payload['customer_type'] === 'debtor' ? 'DEB' : 'CSH'
    const { data: last } = await supabase.from('customers').select('customer_number').ilike('customer_number', `${prefix}%`).order('customer_number', { ascending: false }).limit(1)
    const lastNum = parseInt(last?.[0]?.customer_number?.replace(prefix, '') || '0')
    payload['customer_number'] = `${prefix}${String(lastNum + 1).padStart(4, '0')}`
    const { error } = await supabase.from('customers').insert(payload)
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

async function writeProducts(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  for (const row of rows) {
    const payload: Record<string, unknown> = { ...coerceRow(row, 'products'), is_active: true }
    // Auto-generate SKU from name if not provided (common with Tally exports)
    if (!payload['sku'] && payload['name']) {
      const base = (payload['name'] as string)
        .toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().split(/\s+/)
        .map((w: string) => w.slice(0, 3)).join('-').slice(0, 15)
      const rand = Math.floor(Math.random() * 900 + 100)
      payload['sku'] = `${base}-${rand}`
    }
    if (!payload['sku']) { failed++; errors.push(`Skipped: no name or SKU for row`); continue }
    if (!payload['category']) payload['category'] = 'General'
    if (!payload['unit']) payload['unit'] = 'Piece'
    if (!payload['cost_price']) payload['cost_price'] = 0
    if (!payload['selling_price']) payload['selling_price'] = 0
    if (!payload['qty_on_hand']) payload['qty_on_hand'] = 0
    const { error } = await supabase.from('products').upsert(payload, { onConflict: 'sku' })
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

async function writeAccounts(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  // Normalize Tally account types to MalkiaOS types
  const typeMap: Record<string, string> = {
    'sundry debtors': 'Asset', 'sundry creditors': 'Liability',
    'bank accounts': 'Asset', 'cash-in-hand': 'Asset', 'cash in hand': 'Asset',
    'capital account': 'Equity', 'reserves & surplus': 'Equity',
    'sales accounts': 'Revenue', 'purchase accounts': 'Expense',
    'direct expenses': 'Expense', 'indirect expenses': 'Expense',
    'direct income': 'Revenue', 'indirect income': 'Revenue',
    'current assets': 'Asset', 'current liabilities': 'Liability',
    'fixed assets': 'Asset', 'loans (liability)': 'Liability',
  }
  for (const row of rows) {
    const payload = coerceRow(row, 'accounts')
    if (payload['type']) {
      payload['type'] = typeMap[(payload['type'] as string).toLowerCase()] || payload['type']
    }
    const { error } = await supabase.from('accounts').upsert(payload, { onConflict: 'code' })
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

async function writeOpeningBalances(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  for (const row of rows) {
    const debit = parseFloat((row['debit'] || '0').replace(/,/g, '')) || 0
    const credit = parseFloat((row['credit'] || '0').replace(/,/g, '')) || 0
    const amount = debit - credit
    // Find or match account
    let acctId: string | null = null
    if (row['account_code']) {
      const { data } = await supabase.from('accounts').select('id').eq('code', row['account_code'].trim()).maybeSingle()
      acctId = data?.id || null
    }
    if (!acctId && row['account_name']) {
      const { data } = await supabase.from('accounts').select('id').ilike('name', row['account_name'].trim()).maybeSingle()
      acctId = data?.id || null
    }
    if (!acctId) { failed++; errors.push(`Could not find account: ${row['account_code'] || row['account_name']}`); continue }
    const { error } = await supabase.from('ledger_entries').insert({
      account_id: acctId, amount, description: row['description'] || 'Opening balance import',
      entry_date: row['date'] || new Date().toISOString().slice(0, 10),
      entry_type: 'opening_balance', source: 'import',
    })
    if (error) { failed++; errors.push(error.message) } else {
      // Update account balance
      await supabase.rpc('increment_account_balance', { p_account_id: acctId, p_amount: amount })
      ok++
    }
  }
  return { ok, failed, errors }
}

// ─── Component ─────────────────────────────────────────────────────────────

const SOURCES: { id: ImportSource; label: string; ext: string; desc: string; badge?: string }[] = [
  { id: 'tally_xml',   label: 'Tally XML',     ext: '.xml',      desc: 'Export from Tally ERP 9 or TallyPrime via Data > Export > XML', badge: 'Most Common' },
  { id: 'excel_csv',   label: 'Excel / CSV',   ext: '.csv,.xlsx', desc: 'Any spreadsheet: Excel, Google Sheets, LibreOffice. Save as CSV first.' },
  { id: 'quickbooks',  label: 'QuickBooks',    ext: '.csv',       desc: 'Export via Reports > Export to Excel/CSV in QuickBooks Desktop or Online.' },
  { id: 'manual_csv',  label: 'Paste Data',    ext: '',           desc: 'Paste tab-separated or comma-separated data directly from clipboard.' },
]

const ENTITIES: { id: ImportEntity; label: string; icon: string; desc: string }[] = [
  { id: 'customers',        label: 'Customers',         icon: 'C', desc: 'Cash customers and debtors with contact details and opening balances' },
  { id: 'products',         label: 'Products / Stock',  icon: 'P', desc: 'Inventory items with SKU, pricing, and opening stock quantities' },
  { id: 'accounts',         label: 'Chart of Accounts', icon: 'A', desc: 'GL accounts with codes, types, and opening balances' },
  { id: 'opening_balances', label: 'Opening Balances',  icon: 'O', desc: 'Journal entries to set account balances at migration date' },
]

const s = {
  page: { padding: '32px 28px', maxWidth: 1100, margin: '0 auto' } as React.CSSProperties,
  h1: { fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, margin: '0 0 4px', color: 'var(--fg)' } as React.CSSProperties,
  sub: { fontSize: 13, color: 'var(--muted)', margin: '0 0 32px' } as React.CSSProperties,
  stepper: { display: 'flex', gap: 0, marginBottom: 36, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
  stepItem: (active: boolean, done: boolean): React.CSSProperties => ({
    padding: '10px 18px', fontSize: 12, fontWeight: 600, cursor: 'default',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : done ? 'var(--muted)' : 'var(--muted-light,#bbb)',
    transition: 'color .2s',
  }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 14 } as React.CSSProperties,
  card: (selected: boolean): React.CSSProperties => ({
    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 10, padding: '16px 18px', cursor: 'pointer', background: selected ? 'var(--accent-dim)' : 'var(--card)',
    transition: 'border-color .15s, background .15s',
  }),
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--accent)', color: '#fff', marginLeft: 8, letterSpacing: .5 } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px', display: 'flex', alignItems: 'center' } as React.CSSProperties,
  desc: { fontSize: 12, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 } as React.CSSProperties,
  btn: { padding: '10px 22px', borderRadius: 8, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { padding: '10px 22px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  dropzone: (drag: boolean): React.CSSProperties => ({
    border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
    background: drag ? 'var(--accent-dim)' : 'var(--card)', transition: 'all .15s',
  }),
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th: { padding: '8px 10px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--card)' },
  td: { padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--fg)', verticalAlign: 'top' as const },
  select: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontSize: 12 } as React.CSSProperties,
  pill: (ok: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: ok ? '#d1fae5' : '#fee2e2', color: ok ? '#065f46' : '#991b1b',
  }),
  mapRow: { display: 'grid', gridTemplateColumns: '1fr 36px 1fr 80px', alignItems: 'center', gap: 8, marginBottom: 8 } as React.CSSProperties,
  textarea: { width: '100%', minHeight: 200, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical' as const, boxSizing: 'border-box' as const } as React.CSSProperties,
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'source',  label: '1. Source' },
  { id: 'entity',  label: '2. Data Type' },
  { id: 'upload',  label: '3. Upload' },
  { id: 'map',     label: '4. Map Fields' },
  { id: 'preview', label: '5. Preview' },
  { id: 'done',    label: '6. Done' },
]

export default function DataImport() {
  const [step, setStep]           = useState<Step>('source')
  const [source, setSource]       = useState<ImportSource | null>(null)
  const [entity, setEntity]       = useState<ImportEntity | null>(null)
  const [rawRows, setRawRows]     = useState<ParsedRow[]>([])
  const [columns, setColumns]     = useState<string[]>([])
  const [mapping, setMapping]     = useState<Record<string, string>>({})
  const [pasteText, setPasteText] = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [fileName, setFileName]   = useState('')
  const [validRows, setValidRows] = useState<MappedRow[]>([])
  const [validErrs, setValidErrs] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<{ ok: number; failed: number; errors: string[] } | null>(null)
  const [toast, setToast]         = useState<Toast_>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const stepIdx = (id: Step) => STEPS.findIndex(s => s.id === id)

  const ingestRows = useCallback((rows: ParsedRow[], ent: ImportEntity) => {
    if (!rows.length) { showToast('No data rows found', 'error'); return }
    const cols = Object.keys(rows[0])
    setRawRows(rows)
    setColumns(cols)
    setMapping(autoMap(cols, ent))
    setStep('map')
  }, [])

  const processFile = useCallback((file: File, ent: ImportEntity, src: ImportSource) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (src === 'tally_xml' || file.name.endsWith('.xml')) {
        const { rows } = parseTallyXML(text)
        ingestRows(rows, ent)
      } else {
        ingestRows(parseCSV(text), ent)
      }
    }
    reader.readAsText(file)
  }, [ingestRows])

  // Build mapped rows from raw rows + mapping
  const buildMappedRows = (): MappedRow[] => {
    return rawRows.map(raw => {
      const out: MappedRow = {}
      Object.entries(mapping).forEach(([col, mkey]) => {
        if (mkey && raw[col] !== undefined) out[mkey] = raw[col]
      })
      return out
    })
  }

  const goToPreview = () => {
    const mapped = buildMappedRows()
    const fields = ENTITY_FIELDS[entity!]
    const allErrors: string[] = []
    const valid: MappedRow[] = []
    mapped.forEach((row, i) => {
      const v = validateRow(row, fields, i)
      if (v.valid) { valid.push(row) } else { valid.push(row); allErrors.push(...v.errors) }
    })
    setValidRows(valid)
    setValidErrs(allErrors)
    setStep('preview')
  }

  const runImport = async () => {
    if (!entity) return
    setImporting(true)
    try {
      let res: { ok: number; failed: number; errors: string[] }
      if (entity === 'customers') res = await writeCustomers(validRows)
      else if (entity === 'products') res = await writeProducts(validRows)
      else if (entity === 'accounts') res = await writeAccounts(validRows)
      else res = await writeOpeningBalances(validRows)
      setResult(res)
      setStep('done')
      if (res.ok > 0) showToast(`${res.ok} records imported`, 'success')
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setStep('source'); setSource(null); setEntity(null); setRawRows([])
    setColumns([]); setMapping({}); setPasteText(''); setFileName('')
    setValidRows([]); setValidErrs([]); setResult(null)
  }

  // ── Step: source ──────────────────────────────────────────────────────────
  const StepSource = () => (
    <div>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
        Select where your data is coming from. MalkiaOS will interpret the file format automatically.
      </p>
      <div style={s.grid2}>
        {SOURCES.map(src => (
          <div key={src.id} style={s.card(source === src.id)} onClick={() => setSource(src.id)}>
            <div style={s.label}>
              {src.label}
              {src.badge && <span style={s.badge}>{src.badge}</span>}
            </div>
            {src.ext && <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 2 }}>{src.ext}</div>}
            <div style={s.desc}>{src.desc}</div>
          </div>
        ))}
      </div>
      {source === 'tally_xml' && (
        <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--accent-dim)', borderRadius: 8, fontSize: 12, color: 'var(--fg)', lineHeight: 1.7 }}>
          <strong>How to export from Tally:</strong><br />
          1. Open Tally ERP9 or TallyPrime<br />
          2. Go to <strong>Gateway of Tally &gt; Display &gt; List of Accounts</strong> (for ledgers) or <strong>Stock Summary</strong> (for items)<br />
          3. Press <strong>E</strong> for Export, select <strong>XML</strong> format<br />
          4. Save the file and upload it here
        </div>
      )}
      {source === 'quickbooks' && (
        <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--accent-dim)', borderRadius: 8, fontSize: 12, color: 'var(--fg)', lineHeight: 1.7 }}>
          <strong>QuickBooks export steps:</strong><br />
          1. Go to <strong>Reports</strong> in QuickBooks<br />
          2. Find the relevant report (Customer List, Item List, Chart of Accounts, Trial Balance)<br />
          3. Click <strong>Export</strong> &gt; <strong>Export to Excel</strong><br />
          4. Open in Excel, save as CSV, then upload here
        </div>
      )}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <button style={s.btn} disabled={!source} onClick={() => setStep('entity')}>
          Continue
        </button>
      </div>
    </div>
  )

  // ── Step: entity ──────────────────────────────────────────────────────────
  const StepEntity = () => (
    <div>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
        What kind of data are you importing? Each import session handles one type.
      </p>
      <div style={s.grid2}>
        {ENTITIES.map(ent => (
          <div key={ent.id} style={s.card(entity === ent.id)} onClick={() => setEntity(ent.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'Syne, sans-serif' }}>{ent.icon}</div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{ent.label}</span>
            </div>
            <div style={s.desc}>{ent.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button style={s.btnGhost} onClick={() => setStep('source')}>Back</button>
        <button style={s.btn} disabled={!entity} onClick={() => setStep('upload')}>Continue</button>
      </div>
    </div>
  )

  // ── Step: upload ──────────────────────────────────────────────────────────
  const StepUpload = () => {
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file, entity!, source!)
    }
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file, entity!, source!)
    }
    const handlePaste = () => {
      if (!pasteText.trim()) { showToast('Paste your data first', 'error'); return }
      const rows = parseCSV(pasteText)
      if (!rows.length) {
        // Try tab-separated
        const lines = pasteText.trim().split('\n')
        const headers = lines[0].split('\t').map(h => h.trim())
        const parsed = lines.slice(1).map(line => {
          const vals = line.split('\t')
          const row: ParsedRow = {}
          headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
          return row
        }).filter(r => Object.values(r).some(v => v))
        ingestRows(parsed, entity!)
      } else {
        ingestRows(rows, entity!)
      }
    }
    return (
      <div>
        {source === 'manual_csv' ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Paste your data below. First row must be column headers. Supports comma or tab separation.
            </p>
            <textarea style={s.textarea} placeholder="Name, Phone, Type, Balance&#10;Amina Mohamed, +255712345678, cash, 0&#10;Tanzania Medical Stores, +255222345678, debtor, 500000" value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={s.btnGhost} onClick={() => setStep('entity')}>Back</button>
              <button style={s.btn} onClick={handlePaste}>Parse Data</button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={s.dropzone(dragOver)}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>&#8593;</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                {fileName || 'Drop file here or click to browse'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {source === 'tally_xml' ? 'Accepts .xml files exported from Tally' : 'Accepts .csv files. Save your Excel sheet as CSV first.'}
              </div>
              <input ref={fileRef} type="file" accept={SOURCES.find(s => s.id === source)?.ext || '.csv'} style={{ display: 'none' }} onChange={handleFile} />
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button style={s.btnGhost} onClick={() => setStep('entity')}>Back</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Step: map ─────────────────────────────────────────────────────────────
  const StepMap = () => {
    const fields = ENTITY_FIELDS[entity!]
    const unmappedRequired = fields.filter(f => f.required && !Object.values(mapping).includes(f.key))
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 14, color: 'var(--fg)', margin: '0 0 4px' }}>
              <strong>{rawRows.length} rows</strong> detected from <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fileName || 'pasted data'}</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              MalkiaOS has auto-mapped common column names. Review and correct any mismatches below.
            </p>
          </div>
          {unmappedRequired.length > 0 && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fee2e2', padding: '6px 12px', borderRadius: 6 }}>
              {unmappedRequired.length} required field{unmappedRequired.length > 1 ? 's' : ''} not yet mapped
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Your Column (source)</th>
                <th style={s.th}></th>
                <th style={s.th}>MalkiaOS Field</th>
                <th style={s.th}>Sample Value</th>
              </tr>
            </thead>
            <tbody>
              {columns.map(col => (
                <tr key={col}>
                  <td style={s.td}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{col}</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', fontSize: 16 }}>&#8594;</td>
                  <td style={s.td}>
                    <select style={s.select} value={mapping[col] || ''} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}>
                      <option value="">-- skip --</option>
                      {fields.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...s.td, fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 11 }}>
                    {rawRows[0]?.[col] || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>MalkiaOS fields for {ENTITIES.find(e => e.id === entity)?.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {fields.map(f => {
              const mapped = Object.values(mapping).includes(f.key)
              return (
                <span key={f.key} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: mapped ? '#d1fae5' : f.required ? '#fee2e2' : 'var(--accent-dim)', color: mapped ? '#065f46' : f.required ? '#991b1b' : 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {f.key}{f.required ? ' *' : ''}
                </span>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>* Required fields must be mapped before importing</div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <button style={s.btnGhost} onClick={() => setStep('upload')}>Back</button>
          <button style={s.btn} disabled={unmappedRequired.length > 0} onClick={goToPreview}>Preview Import</button>
        </div>
      </div>
    )
  }

  // ── Step: preview ─────────────────────────────────────────────────────────
  const StepPreview = () => {
    const fields = ENTITY_FIELDS[entity!]
    const mappedFields = fields.filter(f => Object.values(mapping).includes(f.key))
    const errorCount = validErrs.length
    return (
      <div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{validRows.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>rows to import</div>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: mappedFields.length > 0 ? '#065f46' : 'var(--muted)' }}>{mappedFields.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>fields mapped</div>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: errorCount > 0 ? '#991b1b' : '#065f46' }}>{errorCount}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>warnings</div>
          </div>
        </div>

        {errorCount > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
              {errorCount} warning{errorCount !== 1 ? 's' : ''} found — rows will still be imported
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              {validErrs.slice(0, 10).map((e, i) => <div key={i} style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>{e}</div>)}
              {validErrs.length > 10 && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>...and {validErrs.length - 10} more</div>}
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                {mappedFields.map(f => <th key={f.key} style={s.th}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {validRows.slice(0, 50).map((row, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, color: 'var(--muted)', fontFamily: 'var(--mono)', width: 32 }}>{i + 1}</td>
                  {mappedFields.map(f => (
                    <td key={f.key} style={{ ...s.td, fontFamily: f.type === 'number' ? 'var(--mono)' : 'inherit' }}>
                      {row[f.key] || <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {validRows.length > 50 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
              Showing first 50 of {validRows.length} rows
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={s.btnGhost} onClick={() => setStep('map')}>Back to Mapping</button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              This will {entity === 'products' ? 'upsert (add or update)' : 'add'} {validRows.length} records to MalkiaOS
            </span>
            <button style={{ ...s.btn, background: importing ? 'var(--muted)' : 'var(--accent)', borderColor: importing ? 'var(--muted)' : 'var(--accent)' }} disabled={importing || validRows.length === 0} onClick={runImport}>
              {importing ? 'Importing...' : `Import ${validRows.length} Records`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: done ────────────────────────────────────────────────────────────
  const StepDone = () => (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{result && result.failed === 0 ? '✓' : '⚠'}</div>
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
        {result?.ok} records imported successfully
      </div>
      {result && result.failed > 0 && (
        <div style={{ fontSize: 14, color: '#991b1b', marginBottom: 16 }}>
          {result.failed} records failed. Check errors below.
        </div>
      )}
      {result?.errors.slice(0, 5).map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>{e}</div>
      ))}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
        <button style={s.btnGhost} onClick={reset}>Import More Data</button>
        <button style={s.btn} onClick={() => {
          const map: Record<ImportEntity, string> = {
            customers: 'customers', products: 'inventory',
            accounts: 'chart-of-accounts', opening_balances: 'chart-of-accounts'
          }
          window.location.hash = map[entity!] || ''
        }}>
          View Imported Records
        </button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <h1 style={s.h1}>Data Import Studio</h1>
      <p style={s.sub}>
        Migrate data from Tally, QuickBooks, Excel, or any CSV source into MalkiaOS with automatic field mapping.
      </p>

      {/* Stepper */}
      <div style={s.stepper}>
        {STEPS.map((st, i) => (
          <div key={st.id} style={s.stepItem(step === st.id, i < stepIdx(step))}>
            {st.label}
          </div>
        ))}
      </div>

      {/* Content */}
      {step === 'source'  && <StepSource />}
      {step === 'entity'  && <StepEntity />}
      {step === 'upload'  && <StepUpload />}
      {step === 'map'     && <StepMap />}
      {step === 'preview' && <StepPreview />}
      {step === 'done'    && <StepDone />}

      {/* Help footer */}
      {step !== 'done' && (
        <div style={{ marginTop: 40, padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--fg)' }}>Before you import</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            <div>Back up your current data first via Settings &gt; Backups</div>
            <div>Importing customers will not delete existing ones</div>
            <div>Products import uses SKU as unique key (upsert)</div>
            <div>Opening balances require accounts to exist first</div>
            <div>Amounts should be in TZS without currency symbols</div>
            <div>Dates should be in YYYY-MM-DD format</div>
          </div>
        </div>
      )}
    </div>
  )
}
