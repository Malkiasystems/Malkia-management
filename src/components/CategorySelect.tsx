// ─── CategorySelect ────────────────────────────────────────────────────────
// A <select> that shows expense categories grouped by their MAIN account.
// Mains render as non-selectable <optgroup> labels; only real sub accounts can
// be chosen, so a user picks "Utilities → Electricity" and can never post to
// the "Utilities" header itself.
// ───────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { groupAccountsForSelect, type GroupAccount } from '../lib/accountGrouping'

interface Props {
  accounts: GroupAccount[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export default function CategorySelect({ accounts, value, onChange, placeholder = '— Select category —', className = 'form-input', style }: Props) {
  const groups = useMemo(() => groupAccountsForSelect(accounts), [accounts])
  return (
    <select className={className} style={style} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map(g => (
        <optgroup key={g.label} label={g.label.toUpperCase()}>
          {g.options.map(o => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
