import { useRef, useLayoutEffect, useState } from 'react'

/* ═══════════════════════════════════════════════════
   MoneyInput
   Text input that displays thousands separators while typing.

   Why not <input type="number">: the HTML spec requires its value to be a
   valid floating-point number, so a browser will silently reject "1,234".
   Commas are impossible on type="number". This uses type="text" with
   inputMode="decimal" so mobile still gets the numeric keypad.

   Use for money amounts only. Do not use for quantities, percentages,
   day counts, or ratings, where separators add noise.
   ═══════════════════════════════════════════════════ */

export function formatMoneyInput(raw: string): string {
  if (raw === '' || raw === '-') return raw
  const neg = raw.startsWith('-')
  const body = neg ? raw.slice(1) : raw
  const firstDot = body.indexOf('.')
  const intPart = firstDot === -1 ? body : body.slice(0, firstDot)
  const decPart = firstDot === -1 ? '' : body.slice(firstDot + 1).replace(/\./g, '')
  const intFmt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US')
  const out = firstDot === -1 ? intFmt : `${intFmt}.${decPart}`
  return neg ? `-${out}` : out
}

/** Strip separators back to a plain numeric string. */
export function cleanMoneyInput(display: string, allowDecimal = true): string {
  let s = display.replace(/[^0-9.-]/g, '')
  s = (s.startsWith('-') ? '-' : '') + s.replace(/-/g, '')
  if (!allowDecimal) return s.replace(/\./g, '')
  const i = s.indexOf('.')
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '')
  return s
}

const digitsBefore = (s: string, pos: number) =>
  s.slice(0, pos).replace(/[^0-9]/g, '').length

const posAfterDigits = (s: string, n: number) => {
  if (n === 0) return 0
  let c = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] >= '0' && s[i] <= '9') c++
    if (c === n) return i + 1
  }
  return s.length
}

type Props = {
  value: number | string | null | undefined
  onChange: (n: number) => void
  /** Raw string on every keystroke, if the parent needs the untruncated text. */
  onRawChange?: (raw: string) => void
  allowDecimal?: boolean
  allowNegative?: boolean
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  id?: string
  name?: string
  autoFocus?: boolean
  className?: string
  style?: React.CSSProperties
  onBlur?: () => void
  onFocus?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export default function MoneyInput({
  value,
  onChange,
  onRawChange,
  allowDecimal = true,
  allowNegative = false,
  placeholder = '0',
  disabled,
  readOnly,
  id,
  name,
  autoFocus,
  className,
  style,
  onBlur,
  onFocus,
  onKeyDown,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const external =
    value === null || value === undefined || value === ''
      ? ''
      : String(value)

  const raw = focused && draft !== null ? draft : external
  const display = formatMoneyInput(raw)

  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      const p = posAfterDigits(display, caret.current)
      ref.current.setSelectionRange(p, p)
      caret.current = null
    }
  }, [display])

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    caret.current = digitsBefore(el.value, el.selectionStart ?? el.value.length)
    let next = cleanMoneyInput(el.value, allowDecimal)
    if (!allowNegative) next = next.replace(/-/g, '')
    setDraft(next)
    onRawChange?.(next)
    const n = parseFloat(next)
    onChange(Number.isFinite(n) ? n : 0)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={display}
      onChange={handle}
      onFocus={() => { setFocused(true); setDraft(external); onFocus?.() }}
      onBlur={() => { setFocused(false); setDraft(null); onBlur?.() }}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      id={id}
      name={name}
      autoFocus={autoFocus}
      className={className}
      style={style}
      onKeyDown={onKeyDown}
    />
  )
}
