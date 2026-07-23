import { useSettingsStore } from '@/store/settingsStore'

/** Lightweight canvas confetti burst — no dependency. Respects reduced-animations. */
export function confettiBurst(count = 120) {
  if (useSettingsStore.getState().reducedAnimations) return
  if (typeof document === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  const colors = ['#FFC24B', '#FF3D8B', '#A855F7', '#3BD07A', '#2E9DFF', '#FFDA85']

  const parts = Array.from({ length: count }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height / 2 + (Math.random() - 0.5) * 80,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -14 - 4,
    size: Math.random() * 7 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    life: 1,
  }))

  let raf = 0
  const start = performance.now()
  function frame(now: number) {
    const t = now - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of parts) {
      p.vy += 0.35 // gravity
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life = Math.max(0, 1 - t / 2200)
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (t < 2400) {
      raf = requestAnimationFrame(frame)
    } else {
      cancelAnimationFrame(raf)
      canvas.remove()
    }
  }
  raf = requestAnimationFrame(frame)
}

let audioCtx: AudioContext | null = null

/** Short synthesized win/lose cues via Web Audio — respects the sound setting. */
export function playSound(kind: 'win' | 'big' | 'lose' | 'click') {
  if (!useSettingsStore.getState().soundEnabled) return
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const ctx = audioCtx
    const notes =
      kind === 'big'
        ? [523, 659, 784, 1047]
        : kind === 'win'
          ? [523, 784]
          : kind === 'lose'
            ? [330, 247]
            : [660]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + i * 0.09
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.24)
    })
  } catch {
    /* audio not available */
  }
}
