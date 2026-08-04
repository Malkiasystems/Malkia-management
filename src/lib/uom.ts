// ─── Dual unit of measure (pieces ⇄ cartons) ────────────────────────────────
// Pieces are the single source of truth everywhere: voucher_lines.qty, the
// item ledger, products.qty_on_hand are ALL pieces, always. A product with
// products.units_per_carton set (e.g. Maternity Pants = 24) additionally
// displays as cartons, and sales entry may be typed in cartons, converted to
// pieces at the input boundary. Nothing downstream ever stores cartons.

/** "10 ctn (240 pcs)" when whole cartons, else "252 pcs (10.5 ctn)". */
export function fmtDualQty(qtyPieces: number, unitsPerCarton?: number | null): string {
  const q = qtyPieces || 0
  const upc = unitsPerCarton || 0
  if (upc < 2) return q.toLocaleString()
  const cartons = q / upc
  if (Number.isInteger(cartons)) return `${cartons.toLocaleString()} ctn (${q.toLocaleString()} pcs)`
  // one decimal, trimmed: 10.5 not 10.50, 10.4166 -> 10.4
  const c = (Math.round(cartons * 10) / 10).toLocaleString()
  return `${q.toLocaleString()} pcs (${c} ctn)`
}

/** Short secondary form for tight cells: "= 10 ctn" / "= 10.4 ctn"; '' when N/A. */
export function fmtCartonHint(qtyPieces: number, unitsPerCarton?: number | null): string {
  const upc = unitsPerCarton || 0
  if (upc < 2 || !qtyPieces) return ''
  const c = Math.round((qtyPieces / upc) * 10) / 10
  return `= ${c.toLocaleString()} ctn`
}

/** Cartons typed by a user → pieces. Rounds to whole pieces. */
export function cartonsToPieces(cartons: number, unitsPerCarton: number): number {
  return Math.round((cartons || 0) * unitsPerCarton)
}

/** Exact physical breakdown for a headline total: "118 ctn + 23 pcs", or
 *  "119 ctn" when it divides evenly. '' when the product is not carton-packed.
 *
 *  Deliberately different from fmtDualQty, which rounds the carton count to
 *  one decimal and then drops it: 2,855 pcs of a 24-pack renders there as
 *  "119 ctn" when what is actually on the floor is 118 full cartons and 23
 *  loose pieces. That parenthetical is fine as a rough sense-check next to the
 *  piece count, but a headline total nobody can reconcile against a physical
 *  count is worse than no carton figure at all. Use this one for quantities
 *  actually sold or held; use fmtDualQty for progress and projections, where
 *  a fractional carton is meaningful. */
export function fmtCartonBreakdown(qtyPieces: number, unitsPerCarton?: number | null): string {
  const q = Math.max(0, Math.round(qtyPieces || 0))
  const upc = unitsPerCarton || 0
  if (upc < 2 || !q) return ''
  const full = Math.floor(q / upc)
  const rem = q - full * upc
  if (!full) return `${rem.toLocaleString()} pcs`
  return rem === 0
    ? `${full.toLocaleString()} ctn`
    : `${full.toLocaleString()} ctn + ${rem.toLocaleString()} pcs`
}
