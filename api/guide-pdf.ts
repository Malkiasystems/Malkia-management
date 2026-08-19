// Vercel serverless function: renders /vitabu/:slug/print with headless Chromium and returns a PDF.
// Uses no secrets. Reads the public print page of this same deployment.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = String(req.query.slug || '').replace(/[^a-z0-9-]/g, '')
  if (!slug) return res.status(400).send('slug required')
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers.host
  const url = `${proto}://${host}/vitabu/${slug}/print`
  let browser: any = null
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1000, height: 1400 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForSelector('[data-ready="1"]', { timeout: 20000 })
    await page.evaluate(() => (document as any).fonts?.ready)
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="Malkia_${slug}.pdf"`)
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).send(Buffer.from(pdf))
  } catch (e: any) {
    return res.status(500).send('PDF render failed: ' + (e?.message || e))
  } finally {
    if (browser) await browser.close()
  }
}
