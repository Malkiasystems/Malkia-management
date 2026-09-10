// BrandRain.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The falling-digit field ported from the Tarakimu login, retinted to the
// Malkia teal so the texture belongs to this brand rather than that one.
//
// Depth is the whole idea. A glyph's z drives its size, weight, brightness and
// fall speed together, which gives real parallax rather than a flat sheet of
// identical characters.
//
// TUNING PASS (login redesign)
//   * SMALLER. Base size dropped from 17px to 11px and the depth multiplier
//     tightened, so the field reads as fine grain rather than as legible
//     characters. Digits you can read compete with the form; digits you can
//     only sense do not.
//   * LIGHTER. Far glyphs are set at weight 300 and roughly a third of the
//     old opacity. Thin and dim is what separates expensive texture from a
//     screensaver.
//   * DENSER. Because each glyph is smaller, particle count rises to keep the
//     field feeling continuous. Small and sparse just looks like dust.
//   * COOL AT THE FRONT. The nearest few per cent carry a whisper of the brand
//     accent instead of pure white. It ties the texture to the product without
//     tipping into a coloured-rain cliché, and it is subtle enough that most
//     people will only register it as depth.
//
// The `intensity` prop is LIVE. It is read through a ref and eased toward, so
// the caller can fade the field down when a form opens without the canvas
// re-initialising and visibly repopulating.
//
// Renders nothing at all under prefers-reduced-motion, and stops when the tab
// is hidden so it costs no battery in a background tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'

interface Props {
  /** 'dark' (default): white/blue glyphs for dark pages. 'light': slate and
   *  deep-brand glyphs so the same texture survives a light background. */
  mode?: 'dark' | 'light'
  /** 0–1, live. Raise for a darker page, lower while a form is open. */
  intensity?: number
}

interface Glyph {
  z: number
  x: number
  y: number
  v: number
  ch: string
  a: number
  mut: number
  warm: boolean
}

export default function BrandRain({ intensity = 1, mode = 'dark' }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  // Target intensity, updated without tearing down the animation.
  const target = useRef(intensity)
  useEffect(() => { target.current = intensity }, [intensity])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const GL = '0123456789'
    let ctx: CanvasRenderingContext2D | null = null
    let W = 0, H = 0, fs = 11
    let parts: Glyph[] = []
    let raf = 0, last = 0, running = false

    // Eased current value, so a change in the prop glides instead of stepping.
    let cur = target.current

    const spawn = (scatter: boolean): Glyph => {
      const z = Math.random()
      return {
        z,
        x: Math.random() * W,
        y: scatter ? Math.random() * H * 1.6 - H * 0.6 : -20 - Math.random() * 160,
        v: 8 + z * z * 46,                     // near glyphs fall much faster
        ch: GL[(Math.random() * 10) | 0],
        // Ceiling roughly a third of the previous pass. The field should be
        // felt at the edge of vision, not read.
        a: 0.03 + z * 0.17,
        mut: Math.random() * 0.6,
        // Only the closest few per cent are warm, and only some of those.
        warm: z > 0.88 && Math.random() < 0.55,
      }
    }

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      fs = W < 520 ? 9 : 11
      // Denser than the old pass: smaller glyphs need more of them before the
      // field reads as a texture rather than as scattered specks.
      const n = Math.min(320, Math.floor((W / (fs * 1.35)) * 9))
      parts = []
      for (let i = 0; i < n; i++) parts.push(spawn(true))
      parts.sort((p, q) => p.z - q.z)          // far first, near draws over
    }

    const frame = (ts: number) => {
      if (!running || !ctx) return
      const dt = Math.min((ts - last) / 1000, 0.05)
      last = ts

      // Ease toward the requested intensity. ~0.4s to settle.
      cur += (target.current - cur) * Math.min(1, dt * 6)

      ctx.clearRect(0, 0, W, H)

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        p.y += p.v * dt
        if (p.y > H + 24) { parts[i] = spawn(false); continue }

        p.mut += dt
        if (p.mut > 0.25 + (1 - p.z) * 0.9) {  // far glyphs change lazily
          p.mut = 0
          p.ch = GL[(Math.random() * 10) | 0]
        }

        // Thin at the back, only slightly heavier at the front. Staying under
        // 500 across the whole range is what keeps this refined rather than
        // chunky.
        const weight = p.z < 0.55 ? 300 : 400
        const size = fs * (0.55 + p.z * 0.75)
        ctx.font = `${weight} ${size.toFixed(1)}px "DM Mono", ui-monospace, monospace`

        const a = p.a * cur
        // Alphas were tuned for glow-on-black; on white the same values
        // read as nothing. Light ink runs darker AND ~2.4x stronger, capped
        // so the field stays a texture, not a foreground.
        const la = Math.min(0.5, a * 2.4)
        ctx.fillStyle = mode === 'light'
          ? (p.warm
              ? `rgba(47,111,106,${Math.min(0.55, a * 2.6).toFixed(3)})`  // deep Malkia teal
              : `rgba(18,33,31,${la.toFixed(3)})`)                       // near-black ink
          : (p.warm
              ? `rgba(150,214,208,${a.toFixed(3)})`   // Malkia teal, lightened
              : `rgba(255,255,255,${a.toFixed(3)})`)

        ctx.fillText(p.ch, p.x, p.y)
      }
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running) return
      running = true; last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0 }

    const boot = () => { layout(); start() }
    if (document.fonts?.ready) document.fonts.ready.then(boot).catch(boot)
    else boot()

    let rt: ReturnType<typeof setTimeout>
    const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 200) }
    const onVis = () => { document.hidden ? stop() : start() }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      stop()
      clearTimeout(rt)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
    // Intentionally empty: intensity arrives through the ref above, so the
    // field never tears down and repopulates mid-fade.
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
