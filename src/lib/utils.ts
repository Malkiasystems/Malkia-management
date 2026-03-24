export const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const genRef = (prefix: string, num: number) =>
  `${prefix}-${String(num).padStart(4, '0')}`

export const today = () => new Date().toISOString().split('T')[0]

export const getStatus = (qty: number, reorder: number): 'critical' | 'low' | 'ok' => {
  if (qty === 0) return 'critical'
  if (qty <= reorder) return qty <= reorder * 0.5 ? 'critical' : 'low'
  return 'ok'
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
