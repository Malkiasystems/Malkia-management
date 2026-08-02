// ─── InvoicePreviewModal ───────────────────────────────────────────────────
// Full-screen invoice viewer. Wraps <MalkiaInvoice /> with Print/PDF and
// Save PNG, so any page can open an invoice without leaving its context.
//
// Pairs with useInvoicePreview(). The hook does the reading, this does the
// showing. Pass `voucher` = null to render nothing.
//
// Note the DOM id: it defaults to 'invoice-preview-modal', deliberately NOT
// the 'invoice-preview' that SalesInvoicesList already uses. Two elements
// with the same id would make getElementById() print the wrong invoice.
// ───────────────────────────────────────────────────────────────────────────

import { MalkiaInvoice } from '../pages/InvoiceTemplate'
import { printHtmlDocument } from '../lib/printDocument'

interface Props {
  voucher: any | null
  settings: any
  onClose: () => void
  /** Optional: DOM id used by print/PNG capture. Must be unique on the page. */
  domId?: string
}

const IconPrint = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
)

const IconImage = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)

export default function InvoicePreviewModal({ voucher, settings, onClose, domId = 'invoice-preview-modal' }: Props) {
  if (!voucher) return null

  const printPreview = () => {
    const el = document.getElementById(domId)
    if (!el) return
    const brandColor = settings?.primary_color || '#85c2be'
    const printRes = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${voucher.ref}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        @media print{
          body{background:#fff;padding:0;display:block}
          .no-print{display:none !important}
          .print-solid-bar{background:${brandColor} !important}
          @page{size:A4;margin:0}
        }
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    if (!printRes.ok && printRes.error) alert(printRes.error)
  }

  // html2canvas is loaded lazily from CDN on first use and cached on window.
  const downloadPNG = () => {
    const el = document.getElementById(domId)
    if (!el) return
    const generate = () => {
      const fullWidth = el.scrollWidth || (el as HTMLElement).offsetWidth
      const fullHeight = el.scrollHeight || (el as HTMLElement).offsetHeight
      ;(window as any).html2canvas(el, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
        width: fullWidth, height: fullHeight,
        windowWidth: fullWidth, windowHeight: fullHeight,
        scrollX: 0, scrollY: 0,
      }).then((canvas: HTMLCanvasElement) => {
        const link = document.createElement('a')
        link.download = `Invoice-${voucher.ref}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }).catch(() => {})
    }
    if ((window as any).html2canvas) { generate(); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = generate
    document.body.appendChild(script)
  }

  const remaining = Number(voucher._invoiceRemaining) || 0
  const paid = Number(voucher._invoicePaid) || 0
  const statusLabel = remaining <= 0 ? 'Paid in full' : paid > 0 ? 'Partially paid' : 'Unpaid'
  const statusColor = remaining <= 0 ? 'var(--green)' : paid > 0 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>
            Invoice — {voucher.ref}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: statusColor, fontWeight: 700 }}>
            {statusLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={printPreview} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconPrint /> Print / PDF
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadPNG} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconImage /> Save PNG
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 20px' }}
           onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div id={domId}>
          <MalkiaInvoice voucher={voucher} settings={settings} />
        </div>
      </div>
    </div>
  )
}
