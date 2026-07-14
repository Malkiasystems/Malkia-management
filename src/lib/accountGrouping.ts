// ─── accountGrouping ───────────────────────────────────────────────────────
// Turns a flat account list into groups for a category picker: each MAIN
// (header, allow_direct_posting === false) becomes a group label, and its
// postable SUBS are the selectable options underneath. Postable accounts with
// no header parent (e.g. COGS 5010, liability accounts) fall back to grouping
// by their `category` text. Headers themselves are never selectable — that's
// how we stop money being posted to a group instead of a real account.
// ───────────────────────────────────────────────────────────────────────────

export interface GroupAccount {
  id: string
  code: string
  name: string
  category?: string | null
  parent_id?: string | null
  allow_direct_posting?: boolean | null
}

export interface AcctGroup {
  label: string
  sortKey: number
  options: { id: string; code: string; name: string }[]
}

export function groupAccountsForSelect(all: GroupAccount[]): AcctGroup[] {
  const headers = all.filter(a => a.allow_direct_posting === false)
  const headerById = new Map(headers.map(h => [h.id, h]))
  // Preserve the order headers arrived in (caller sorts by sort_order/code).
  const headerOrder = new Map(headers.map((h, i) => [h.id, i]))

  const groups = new Map<string, AcctGroup>()

  for (const a of all) {
    if (a.allow_direct_posting === false) continue // headers are labels, not options
    const underHeader = a.parent_id && headerById.has(a.parent_id)
    const key = underHeader ? `h:${a.parent_id}` : `c:${a.category || 'Other'}`
    if (!groups.has(key)) {
      groups.set(key, {
        label: underHeader ? headerById.get(a.parent_id as string)!.name : (a.category || 'Other'),
        sortKey: underHeader ? (headerOrder.get(a.parent_id as string) ?? 900) : 1000,
        options: [],
      })
    }
    groups.get(key)!.options.push({ id: a.id, code: a.code, name: a.name })
  }

  return [...groups.values()].sort((x, y) => x.sortKey - y.sortKey || x.label.localeCompare(y.label))
}
