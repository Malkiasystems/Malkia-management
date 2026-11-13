/* Shown above a screen that is a design preview only.

   Four CRM screens (Automations, Feedback, Crown and Upsells) were built as
   visual mock-ups: every name, number and message on them is typed into the
   page, not read from the business's records. Until each one is connected to
   real data, this notice says so, so nobody reads "801 messages sent" or a
   customer's "review" as fact.

   Remove the wrapper from a screen when that screen goes live. */
export default function DemoNotice({ what, real }: { what: string; real?: string }) {
  return (
    <div role="note" style={{ margin: '16px 20px 0', padding: '12px 16px', borderRadius: 10, border: '1px solid #E8B93E', background: '#FFF6DA', color: '#5F4500', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A6700" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
      </svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Not live yet: this screen shows sample data</div>
        <div style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          The {what} below are examples made for the design. None of the names, numbers or messages are real, and nothing here sends or saves anything.
          {real ? ` ${real}` : ''}
        </div>
      </div>
    </div>
  )
}
