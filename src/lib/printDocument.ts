// src/lib/printDocument.ts
//
// Printing a document used to be, in 18 different places:
//
//     const win = window.open('', '_blank')
//     if (!win) return          // <-- silently does nothing
//
// window.open returns null whenever the browser blocks the popup, and every
// caller then returned without a word. The user clicks Print / PDF and nothing
// happens at all: no dialog, no error, no toast. That is what users hit on
// the proforma and the receipt.
//
// Popups get blocked more often than you would expect even from a real click:
// a click handler that awaits something before opening loses its "user
// gesture" status, and some corporate and mobile browsers block by default.
//
// This helper tries the popup first, because a real tab is nicer (the user can
// re-print, save, or keep it open), then falls back to a hidden iframe, which
// needs no popup permission at all and drives the same native print dialog.
// If both fail, it reports the reason so the caller can tell the user
// something instead of appearing broken.

export interface PrintResult { ok: boolean; method?: 'window' | 'iframe'; error?: string }

/**
 * Print a complete HTML document that the caller has already assembled.
 *
 * Most existing print handlers build the whole `<!DOCTYPE html>…</html>` string
 * in one template literal. Splitting those into head and body just to satisfy a
 * signature would mean touching every template and risking a broken layout, so
 * this takes the document as-is and applies the same popup-then-iframe
 * fallback.
 */
export function printHtmlDocument(fullDoc: string, waitMs = 1200): PrintResult {
  return runPrint(fullDoc, waitMs)
}

/**
 * Print an HTML fragment as a standalone document.
 *
 * @param bodyHtml  markup to place in <body> (usually element.outerHTML)
 * @param title     document title, shown as the default PDF filename
 * @param headHtml  extra <head> content: fonts, <style> blocks
 * @param waitMs    delay before printing, so webfonts settle and the document
 *                  does not print in Times New Roman fallback
 */
export function printDocument(
  bodyHtml: string,
  title: string,
  headHtml = '',
  waitMs = 1200,
): PrintResult {
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${headHtml}</head><body>${bodyHtml}</body></html>`
  return runPrint(doc, waitMs)
}

function runPrint(doc: string, waitMs: number): PrintResult {
  // ── 1. Popup ────────────────────────────────────────────────────────────
  let win: Window | null = null
  try { win = window.open('', '_blank') } catch { win = null }

  if (win && win.document) {
    try {
      win.document.write(doc)
      win.document.close()
      const run = () => {
        try { win!.focus(); win!.print() } catch { /* user closed it */ }
      }
      // Fonts may never resolve if the font CDN is unreachable, so race the
      // readiness promise against a timeout instead of waiting on both. The
      // old code used Promise.all, which could hang forever offline.
      const fontsReady: Promise<unknown> = win.document.fonts
        ? win.document.fonts.ready
        : Promise.resolve()
      Promise.race([fontsReady, new Promise(r => setTimeout(r, waitMs))])
        .then(() => setTimeout(run, 120))
      return { ok: true, method: 'window' }
    } catch {
      try { win.close() } catch { /* noop */ }
    }
  }

  // ── 2. Hidden iframe. Needs no popup permission. ────────────────────────
  try {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)

    const fdoc = frame.contentWindow?.document
    if (!fdoc) {
      frame.remove()
      return { ok: false, error: 'This browser blocked the print window. Allow pop-ups for this site and try again.' }
    }
    fdoc.open(); fdoc.write(doc); fdoc.close()

    const cleanup = () => { setTimeout(() => { try { frame.remove() } catch { /* noop */ } }, 1000) }
    const run = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch { /* noop */ }
      cleanup()
    }
    const fontsReady: Promise<unknown> = fdoc.fonts ? fdoc.fonts.ready : Promise.resolve()
    Promise.race([fontsReady, new Promise(r => setTimeout(r, waitMs))])
      .then(() => setTimeout(run, 120))
    return { ok: true, method: 'iframe' }
  } catch (e) {
    return {
      ok: false,
      error: 'Could not open the print view. Allow pop-ups for this site, or use the PNG button instead.',
    }
  }
}
