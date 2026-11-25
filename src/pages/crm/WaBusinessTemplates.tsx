// WaBusinessTemplates.tsx
// Templates for the business WhatsApp number, managed from the app.
//
// A "template" is a message Meta has approved in advance. It is the only kind
// of message that can be sent to a customer who has not written to us in the
// last 24 hours. Until now each one was written into a server function and
// submitted through a one-off link. This screen replaces that:
//   - every template with Meta's live decision (approved, waiting, rejected + reason)
//   - a form that checks a draft against Meta's rules before it is sent
//   - Submit, for administrators, which sends it to Meta for approval
//
// Meta's rule: wording cannot be edited once submitted. A change is a new
// template with a new name and a new wait.
//
// This is NOT the older "WhatsApp Templates" page (crm-whatsapp-templates),
// whose texts are for staff's personal WhatsApp and were never sent to Meta.
import { useEffect, useMemo, useState } from 'react'
import { waTemplates } from '../../lib/wa'

interface Tpl {
  id: string; slot: string | null; name: string; sid: string | null; category: string; meta_category: string | null
  body: string; samples: Record<string, string>; buttons: { title: string; id: string }[]; has_media: boolean; media_kind?: string | null
  status: string; rejection_reason: string | null; is_active: boolean; submitted_by_name: string | null
  created_at: string; checked_at: string | null
}
const SLOT_LABEL: Record<string, string> = {
  back_in_stock: 'Waiting list: back in stock with offer', receipt_pdf: 'Receipt (PDF)', receipt_text: 'Receipt (text)',
  invoice_pdf: 'Invoice: on credit, with a pay-by date (PDF)', payslip: 'Payslip',
  invoice_thanks_pdf: 'Invoice: pay on delivery or already paid (PDF)', invoice_part_pdf: 'Invoice: part paid (PDF)',
  login_code: 'Login code (Malkia Circle joining and password reset)',
}
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: 'Approved', bg: '#DCF5E6', fg: '#12683A' },
  pending:  { label: 'Waiting for Meta', bg: '#FFF1CC', fg: '#7A5200' },
  rejected: { label: 'Rejected', bg: '#FCE4E4', fg: '#8F1D1D' },
  paused:   { label: 'Paused by Meta', bg: '#FCE4E4', fg: '#8F1D1D' },
  disabled: { label: 'Disabled by Meta', bg: '#FCE4E4', fg: '#8F1D1D' },
  unknown:  { label: 'Not known', bg: 'var(--surface2)', fg: 'var(--text2)' },
}

// The agreed waiting-list message. The four blanks must stay in this order,
// because the waiting list fills them: name, product, percent, price.
const WAITLIST_PRESET = {
  slot: 'back_in_stock', name: 'malkia_back_in_stock_offer_sw', category: 'MARKETING',
  body: 'Habari {{1}} \u{1F44B}\nHabari njema: {{2}} uliyotuulizia imefika Malkia.\n\nKwa kuwa ulisubiri, tumekuwekea punguzo la {{3}}%: utalipa TZS {{4}} tu ukilipia ndani ya saa 24.\n\nTukuwekee moja?',
  samples: { '1': 'Asha', '2': 'Push to Recover Kit', '3': '10', '4': '45,000' } as Record<string, string>,
  buttons: [{ title: 'Ndiyo, niwekee', id: 'hold' }, { title: 'Nipigie simu', id: 'call' }, { title: 'Sihitaji tena', id: 'no' }],
}
const BLANK_MEANING: Record<string, string[]> = {
  back_in_stock: ['customer first name', 'product', 'discount percent', 'price after discount'],
  invoice_thanks_pdf: ['invoice number', 'total'],
  invoice_part_pdf: ['invoice number', 'total', 'amount paid', 'balance', 'when the balance is due'],
}
// The agreed invoice messages. Each carries the invoice PDF, attached automatically.
const INVOICE_THANKS_PRESET = {
  slot: 'invoice_thanks_pdf', name: 'malkia_invoice_thanks_pdf_sw', category: 'UTILITY',
  body: 'Invoice yako {{1}} \u00b7 Jumla TZS {{2}}. Hifadhi invoice hii kwa kumbukumbu zako. Asante kwa kuwa mshirika wa Malkia.',
  samples: { '1': 'SI-10-0392', '2': '224,250' } as Record<string, string>, buttons: [] as { title: string; id: string }[],
}
const INVOICE_PART_PRESET = {
  slot: 'invoice_part_pdf', name: 'malkia_invoice_part_pdf_sw', category: 'UTILITY',
  body: 'Invoice yako {{1}} \u00b7 Jumla TZS {{2}} \u00b7 Umelipa TZS {{3}}. Salio TZS {{4}} lilipwe {{5}}. Hifadhi invoice hii kwa kumbukumbu zako. Asante kwa kuwa mshirika wa Malkia.',
  samples: { '1': 'SI-10-0392', '2': '224,250', '3': '100,000', '4': '124,250', '5': 'kabla ya 19/11/2026' } as Record<string, string>, buttons: [] as { title: string; id: string }[],
}
const PDF_SLOTS = ['invoice_thanks_pdf', 'invoice_part_pdf']
const PRESETS: Record<string, typeof WAITLIST_PRESET> = { back_in_stock: WAITLIST_PRESET, invoice_thanks_pdf: INVOICE_THANKS_PRESET, invoice_part_pdf: INVOICE_PART_PRESET }
const clonePreset = (slot: string) => { const pr = PRESETS[slot]; return { ...pr, attach: '', samples: { ...pr.samples }, buttons: pr.buttons.map(b => ({ ...b })) } }
const PRESET_NOTE: Record<string, string> = {
  back_in_stock: 'The waiting-list message has not been created yet. Until it is, staff cannot tell waiting customers that a product is back.',
  invoice_thanks_pdf: 'The invoice message for dealers who pay on delivery or have already paid has not been created yet. Until Meta approves it, they keep getting the "pay before" message.',
  invoice_part_pdf: 'The invoice message for dealers who paid part has not been created yet. Until Meta approves it, they keep getting the "pay before" message.',
}
const EMPTY = { slot: '', name: '', category: 'MARKETING', body: '', attach: '', samples: {} as Record<string, string>, buttons: [] as { title: string; id: string }[] }

const blanksIn = (body: string) => Array.from(new Set(Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => Number(m[1])))).sort((a, b) => a - b)
const fillPreview = (body: string, samples: Record<string, string>) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => samples[n] || `{{${n}}}`)

export default function WaBusinessTemplates() {
  const [rows, setRows] = useState<Tpl[]>([])
  const [canCreate, setCanCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<typeof EMPTY | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try { const r = await waTemplates({ action: 'list' }); setRows(r.templates || []); setCanCreate(!!r.can_create) }
    catch (e: any) { setError(e?.message || 'Could not load templates') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const blanks = useMemo(() => (draft ? blanksIn(draft.body) : []), [draft])
  const missingPresets = Object.keys(PRESETS).filter(slot => !rows.some(r => r.slot === slot))
  const isPdfSlot = !!draft && PDF_SLOTS.includes(draft.slot)
  // A template with no fixed use can also carry a PDF (a guide, a weekly lesson). The file is chosen when it is sent.
  const ownPdf = !!draft && !draft.slot && draft.attach === 'pdf'
  const ownImage = !!draft && !draft.slot && draft.attach === 'image'
  const noButtons = isPdfSlot || ownPdf || ownImage

  const submit = async () => {
    if (!draft) return
    setBusy(true); setProblems([])
    try {
      const chk = await waTemplates({ action: 'check', ...draft, slot: draft.slot || null })
      if (chk.problems?.length) { setProblems(chk.problems); setBusy(false); return }
      if (!window.confirm(`Send "${draft.name}" to Meta for approval?\n\nThe wording cannot be changed after this. A change later means a new template and a new wait.`)) { setBusy(false); return }
      const r = await waTemplates({ action: 'create', ...draft, slot: draft.slot || null })
      setNotice(r.submitted ? `${draft.name} was sent to Meta. Approval usually takes from a few hours to a few days.` : `${draft.name} was created but Meta did not accept the submission. See the reason on its card.`)
      setDraft(null); await load()
    } catch (e: any) {
      if (e?.problems?.length) setProblems(e.problems)
      else setProblems([e?.message || 'Could not submit'])
    }
    setBusy(false)
  }

  // The login-code message. Meta writes its wording itself (the code, a line
  // not to share it, when it expires), so there is no form: one button.
  const needsLoginCode = !rows.some(r => r.slot === 'login_code' && r.is_active && r.status !== 'rejected')
  const submitLoginCode = async () => {
    if (!window.confirm('Send the login-code message to Meta for approval?\n\nMeta writes the wording itself, in Swahili: the code, a line telling the person not to share it, and that it expires in 10 minutes. It has a "copy code" button.')) return
    setCodeBusy(true); setError(''); setNotice('')
    try {
      const r = await waTemplates({ action: 'create_code' })
      setNotice(r.submitted ? 'The login-code message was sent to Meta. Approval usually takes from a few minutes to a few hours.' : 'The login-code message was created but Meta did not accept the submission. See the reason on its card.')
      await load()
    } catch (e: any) { setError(e?.message || 'Could not submit the login-code message') }
    setCodeBusy(false)
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, marginBottom: 12 }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4, margin: '12px 0 5px' }
  const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }

  return (
    <div style={{ padding: 20, maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>WhatsApp Templates</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            Messages Meta has approved in advance for the business number. They are the only way to message a customer who has not written to you in the last 24 hours.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={btn}>{loading ? 'Checking...' : 'Check with Meta'}</button>
          {canCreate && !draft && <button onClick={() => { setDraft({ ...EMPTY }); setProblems([]); setNotice('') }} style={primary}>New template</button>}
        </div>
      </div>

      {notice && <div style={{ ...card, borderColor: '#9BD3B0', background: '#EAF8F0', color: '#12683A', fontSize: 13, fontWeight: 600 }}>{notice}</div>}
      {error && <div style={{ ...card, borderColor: '#E8A0A0', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

      {canCreate && !draft && !loading && needsLoginCode && (
        <div style={{ ...card, borderColor: '#E8B93E', background: '#FFF6DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#5F4500', flex: 1, minWidth: 260 }}>
            <b>{SLOT_LABEL.login_code}.</b> A one-time code sent to a mother's WhatsApp to prove the number is hers. It has not been created yet. Until Meta approves it, Malkia Circle cannot ask for a code.
          </div>
          <button onClick={submitLoginCode} disabled={codeBusy} style={primary}>{codeBusy ? 'Sending...' : 'Send to Meta'}</button>
        </div>
      )}

      {canCreate && !draft && !loading && missingPresets.map(slot => (
        <div key={slot} style={{ ...card, borderColor: '#E8B93E', background: '#FFF6DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#5F4500', flex: 1, minWidth: 260 }}>
            <b>{SLOT_LABEL[slot]}.</b> {PRESET_NOTE[slot]}
          </div>
          <button onClick={() => { setDraft(clonePreset(slot)); setProblems([]); setNotice('') }} style={primary}>Start from the agreed wording</button>
        </div>
      ))}

      {draft && (
        <div style={{ ...card, borderColor: 'var(--accent)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New template</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 20 }}>
            <div>
              <label style={lbl}>Used for</label>
              <select value={draft.slot} style={inp} onChange={e => {
                const slot = e.target.value
                // Choosing a kind on an untouched form loads its agreed message, so nothing has to be retyped.
                const untouched = !draft.name.trim() && !draft.body.trim()
                setDraft(PRESETS[slot] && untouched ? clonePreset(slot)
                  : { ...draft, slot, attach: slot ? '' : draft.attach, name: draft.name.trim() || (PRESETS[slot]?.name ?? draft.name), buttons: PDF_SLOTS.includes(slot) ? [] : draft.buttons })
              }}>
                <option value="">Not assigned yet (for a future feature)</option>
                <option value="back_in_stock">{SLOT_LABEL.back_in_stock}</option>
                <option value="invoice_thanks_pdf">{SLOT_LABEL.invoice_thanks_pdf}</option>
                <option value="invoice_part_pdf">{SLOT_LABEL.invoice_part_pdf}</option>
              </select>
              {draft.slot && BLANK_MEANING[draft.slot] && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5, lineHeight: 1.5 }}>
                  Keep exactly {BLANK_MEANING[draft.slot].length} blanks in this order: {BLANK_MEANING[draft.slot].map((m, i) => `{{${i + 1}}} ${m}`).join(', ')}. The system fills them in for each customer.{isPdfSlot ? ' The invoice PDF is attached automatically.' : ''}
                </div>
              )}
              <label style={lbl}>Name (lowercase, no spaces)</label>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="type a name here" style={{ ...inp, fontFamily: 'var(--mono)', borderColor: draft.name.trim() ? 'var(--border)' : '#E8B93E' }} />
              {!draft.name.trim() && <div style={{ fontSize: 11.5, color: '#9A6700', marginTop: 4 }}>Empty. Type a name, for example malkia_offer_sw.</div>}
              <label style={lbl}>Type</label>
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} style={inp}>
                <option value="MARKETING">Marketing: offers, discounts, anything that sells (higher charge)</option>
                <option value="UTILITY">Service: a factual notice about something the customer did or asked for</option>
              </select>
              <label style={lbl}>Message</label>
              <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={8} placeholder="Write the message. Mark each blank as {{1}}, {{2}} and so on." style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
              <div style={{ fontSize: 11, color: draft.body.length > 1024 ? '#B42318' : 'var(--text3)', marginTop: 3 }}>{draft.body.length} of 1,024 characters</div>
              {blanks.length > 0 && <label style={lbl}>An example for each blank (Meta requires these)</label>}
              {blanks.map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', width: 44 }}>{`{{${n}}}`}</span>
                  <input value={draft.samples[String(n)] || ''} onChange={e => setDraft({ ...draft, samples: { ...draft.samples, [String(n)]: e.target.value } })}
                    placeholder={`type an example${draft.slot && BLANK_MEANING[draft.slot]?.[n - 1] ? ' ' + BLANK_MEANING[draft.slot][n - 1] : ''}`}
                    style={{ ...inp, borderColor: (draft.samples[String(n)] || '').trim() ? 'var(--border)' : '#E8B93E' }} />
                </div>
              ))}
              {!draft.slot && (<>
                <label style={lbl}>Attachment</label>
                <select value={draft.attach} style={inp} onChange={e => setDraft({ ...draft, attach: e.target.value, buttons: e.target.value ? [] : draft.buttons })}>
                  <option value="">No attachment (words only)</option>
                  <option value="pdf">A PDF document (the customer taps to open it)</option>
                  <option value="image">An image (shows in the chat, one picture per message)</option>
                </select>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5, lineHeight: 1.5 }}>
                  The actual file is chosen each time the message is sent. The kind of attachment cannot be changed after Meta approves the template.
                </div>
              </>)}
              {!noButtons && (<>
              <label style={lbl}>Buttons the customer can tap (up to 3, 20 characters each)</label>
              {draft.buttons.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={b.title} maxLength={20} onChange={e => setDraft({ ...draft, buttons: draft.buttons.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} style={inp} />
                  <button onClick={() => setDraft({ ...draft, buttons: draft.buttons.filter((_, j) => j !== i) })} style={btn} title="Remove this button">Remove</button>
                </div>
              ))}
              {draft.buttons.length < 3 && <button onClick={() => setDraft({ ...draft, buttons: [...draft.buttons, { title: '', id: `b${draft.buttons.length + 1}` }] })} style={btn}>Add a button</button>}
              </>)}
            </div>
            <div>
              <label style={lbl}>How the customer will see it</label>
              <div style={{ background: '#E5DDD5', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: '#fff', color: '#111B21', borderRadius: 10, padding: '9px 11px', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 1px 1px rgba(0,0,0,.12)' }}>
                  {draft.body ? fillPreview(draft.body, draft.samples) : <span style={{ color: '#8696A0' }}>Your message appears here.</span>}
                </div>
                {ownImage && (
                  <div style={{ background: '#D9E7E5', color: '#3B5754', borderRadius: 10, marginBottom: 5, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, order: -1 }}>The image</div>
                )}
                {(isPdfSlot || ownPdf) && (
                  <div style={{ background: '#fff', color: '#111B21', borderRadius: 10, padding: '8px 11px', marginTop: 5, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 1px rgba(0,0,0,.12)' }}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B42318" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                    {isPdfSlot ? 'The invoice PDF' : 'A PDF document'}
                  </div>
                )}
                {draft.buttons.filter(b => b.title.trim()).map((b, i) => (
                  <div key={i} style={{ background: '#fff', color: '#027EB5', borderRadius: 10, padding: '9px 11px', marginTop: 5, fontSize: 14, fontWeight: 600, textAlign: 'center', boxShadow: '0 1px 1px rgba(0,0,0,.12)' }}>{b.title}</div>
                ))}
              </div>
              {problems.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid #E8A0A0', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Fix before sending to Meta</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => { setDraft(null); setProblems([]) }} disabled={busy} style={btn}>Cancel</button>
            <button onClick={submit} disabled={busy} style={primary}>{busy ? 'Working...' : 'Check and send to Meta'}</button>
          </div>
        </div>
      )}

      {loading && rows.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading templates and checking with Meta...</div>}
      {!loading && rows.length === 0 && !error && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No templates yet.</div>}

      {rows.map(t => {
        const st = STATUS[t.status] || STATUS.unknown
        const reclass = t.meta_category && t.category && t.meta_category.toUpperCase() !== t.category.toUpperCase()
        return (
          <div key={t.id} style={{ ...card, opacity: t.is_active ? 1 : .6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{t.slot ? (SLOT_LABEL[t.slot] || t.slot) : 'Not assigned'}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{t.name}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {!t.is_active && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text3)' }}>Replaced</span>}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)' }}>{(t.meta_category || t.category || '').toUpperCase() === 'MARKETING' ? 'Marketing' : (t.meta_category || t.category || '').toUpperCase() === 'AUTHENTICATION' ? 'Login code' : 'Service'}{t.has_media ? (t.media_kind === 'image' ? ' + Image' : ' + PDF') : ''}</span>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.fg }}>{st.label}</span>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9, background: 'var(--surface2)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.body || '(wording not available)'}</div>
            {t.buttons?.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{t.buttons.map((b, i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text2)' }}>{b.title}</span>)}</div>}
            {t.status === 'rejected' && <div style={{ marginTop: 10, fontSize: 13, color: '#8F1D1D' }}><b>Meta's reason:</b> {t.rejection_reason || 'none given'}. Wording cannot be edited; create a corrected template with a new name.</div>}
            {t.status !== 'rejected' && t.rejection_reason && <div style={{ marginTop: 10, fontSize: 13, color: '#8F1D1D' }}>{t.rejection_reason}</div>}
            {reclass && <div style={{ marginTop: 10, fontSize: 13, color: '#7A5200' }}>Meta classed this as <b>{t.meta_category?.toLowerCase()}</b>, not {t.category.toLowerCase()} as submitted. It is charged at Meta's rate for that type.</div>}
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text3)' }}>
              {t.submitted_by_name ? `Submitted by ${t.submitted_by_name}` : 'Submitted'} on {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {t.checked_at ? ` \u00b7 checked with Meta ${new Date(t.checked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          </div>
        )
      })}

      {!canCreate && !loading && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Only an administrator can create a template or send one to Meta.</div>}
    </div>
  )
}
