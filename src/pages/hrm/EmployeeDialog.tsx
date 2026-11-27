import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  onDismiss: () => void
  inline?: boolean
  compact?: boolean
}

export default function EmployeeDialog({ title, children, onDismiss, inline, compact }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [inline])

  if (inline) return <div style={{ maxWidth: 700, margin: '0 auto' }}>{children}</div>
  return (
    <dialog className={compact ? 'employee-dialog compact' : 'employee-dialog'} ref={ref}
      aria-label={title} onCancel={event => { event.preventDefault(); onDismiss() }}>
      {children}
    </dialog>
  )
}
