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
