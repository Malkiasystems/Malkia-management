// One filename builder for every invoice print path. The browser's save-as-
// PDF dialog takes its default filename from the document <title>, and three
// separate print sites each built their own title — one rich
// (Customer_Name-SI-10-0197), two plain (Invoice SI-10-0197). Same invoice,
// different filename depending on WHICH button printed it. All three now
// call this.
export function invoiceFileName(customer: string | null | undefined, ref: string | null | undefined): string {
  const safe = String(customer || 'Customer').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'Customer'
  return `${safe}-${ref || ''}`
}
