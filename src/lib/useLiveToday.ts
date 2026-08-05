// ════════════════════════════════════════════════════════════════════════════
// useLiveToday.ts
//
// The system date, as a YYYY-MM-DD string, that stays correct while a page
// sits open.
//
// Every voucher page defaults its posting date with `date: today()` inside a
// useState initialiser. That runs ONCE, at mount. On a desktop where the user
// navigates in fresh each time, that is fine. On the shop phones it is not:
// the browser restores the tab from memory the next morning without
// remounting anything, the date field still shows yesterday, nobody reads a
// small date field, and the voucher posts backdated. The books then disagree
// with the physical day-close by exactly that voucher.
//
// This hook re-checks the date when it actually can have changed:
//   • the tab becomes visible again (phone unlocked, tab restored)
//   • the window regains focus
//   • once a minute, for a screen that stays on and focused across midnight
//
// The re-render only fires when the DATE STRING changes, i.e. at most once a
// day per trigger, so the interval costs nothing in practice.
//
// Usage — pair it with a "touched" flag so a deliberate manual date survives:
//
//   const liveToday = useLiveToday()
//   const dateTouched = useRef(false)
//   useEffect(() => {
//     if (!dateTouched.current) setForm(f => ({ ...f, date: liveToday }))
//   }, [liveToday])
//
// and set dateTouched.current = true inside the date field's onChange.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { today } from './utils'

export function useLiveToday(): string {
  const [date, setDate] = useState<string>(() => today())

  useEffect(() => {
    const check = () => {
      const now = today()
      // Functional update + equality guard: no re-render unless the calendar
      // actually rolled over.
      setDate(prev => (prev === now ? prev : now))
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') check() }

    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisibility)
    const tick = window.setInterval(check, 60_000)

    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(tick)
    }
  }, [])

  return date
}
