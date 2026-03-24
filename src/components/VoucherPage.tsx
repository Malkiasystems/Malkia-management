interface VoucherPageProps {
  title: string
  icon: string
  subtitle: string
  color: string
  children: React.ReactNode
  onPost: () => void
  onDraft?: () => void
  postLabel?: string
  journalNote?: string
}

export default function VoucherPage({
  title, icon, subtitle, color, children,
  onPost, onDraft, postLabel = '📤 Post Voucher', journalNote
}: VoucherPageProps) {
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, flexShrink: 0
          }}>{icon}</div>
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={onDraft}>📋 Save Draft</button>
          <button className="btn btn-primary" onClick={onPost}>{postLabel}</button>
        </div>
      </div>

      {journalNote && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 20,
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ color: 'var(--accent)' }}>⚡ Auto-journal:</span> {journalNote}
        </div>
      )}

      {children}
    </div>
  )
}
