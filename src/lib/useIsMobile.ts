// ─── useIsMobile ───────────────────────────────────────────────────────────
// Single source of truth for "are we on a phone-sized screen". 768px matches
// the existing CSS media-query breakpoints in index.css, so JS and CSS agree.
//
// SSR-safe: guards `window` so it never throws if evaluated before mount.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    // addEventListener('change') is the modern API; older Safari needs addListener.
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [breakpoint])

  return isMobile
}
