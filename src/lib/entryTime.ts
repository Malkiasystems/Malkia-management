// ════════════════════════════════════════════════════════════════════════════
// entryTime.ts
//
// One place that turns a journal_lines.created_at timestamptz into the clock
// time a statement should show.
//
// Why this exists: posting_date is a DATE. It carries no time. Every account
// statement in the app sorted "newest first" on posting_date alone, which
// leaves every entry made on the same day tied — so the day's block rendered
// in whatever order the rows arrived (oldest first), and the entry a user had
// just posted sank to the BOTTOM of the day's block instead of appearing at
// the top where they went looking for it.
//
// created_at is the only column that separates two entries on the same day, so
// it has to be selected, sorted on, and shown. Times render in the browser's
// local zone (EAT for Dar es Salaam), matching every other timestamp the app
// prints.
// ════════════════════════════════════════════════════════════════════════════

/** 24-hour clock time, e.g. "13:52". Returns '—' when there is no timestamp. */
export function entryTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Clock time with seconds, e.g. "13:52:10". Used for hover detail. */
export function entryTimeSeconds(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/**
 * Sort key for accounting chronology: posting date first, entry time second.
 *
 * Both halves are fixed-width so lexical comparison is correct. created_at is
 * padded rather than left empty, otherwise every same-day row ties and the
 * sort silently degrades into "whatever order the rows arrived in" — which is
 * the exact bug this file was written for.
 */
export function chronoKey(postingDate: string, createdAt?: string | null): string {
  return `${postingDate}|${createdAt || '0000-00-00T00:00:00Z'}`
}
