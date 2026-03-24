interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', bottom: 20, right: 20, background: 'var(--surface)',
      border: `1px solid ${type === 'success' ? 'var(--green)' : 'var(--red)'}`,
      borderRadius: 'var(--r)', padding: '14px 18px', display: 'flex',
      alignItems: 'center', gap: 12, fontSize: 13,
      boxShadow: '0 10px 40px rgba(0,0,0,.5)', zIndex: 1000, maxWidth: 460, cursor: 'pointer'
    }}>
      <span style={{ fontSize: 18 }}>{type === 'success' ? '✅' : '❌'}</span>
      <span>{message}</span>
    </div>
  )
}
