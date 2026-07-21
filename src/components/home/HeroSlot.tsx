import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const SYMBOLS = ['🍭', '🍬', '🍇', '🍉', '🍎', '🍌', '🫐', '⭐']
const CELL_COUNT = 30
const BETS = [10, 25, 50, 100, 250, 500]

interface Cell {
  glyph: string
  bomb?: boolean
}

function randGrid(): Cell[] {
  return Array.from({ length: CELL_COUNT }, () => {
    if (Math.random() < 0.05) return { glyph: '💣', bomb: true }
    return { glyph: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] }
  })
}

type WinState = 'idle' | 'spinning' | 'win' | 'nowin'

/** Self-contained hero showcase slot — plays on its own demo balance (not the wallet). */
export function HeroSlot() {
  const { t } = useTranslation()
  const [cells, setCells] = useState<Cell[]>(randGrid)
  const [betIndex, setBetIndex] = useState(2)
  const [balance, setBalance] = useState(25000)
  const [winState, setWinState] = useState<WinState>('idle')
  const [winEmoji, setWinEmoji] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const shuffleRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setMessage(t('home.miniSlotHint'))
  }, [t])

  useEffect(() => {
    return () => {
      if (shuffleRef.current) clearInterval(shuffleRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const bet = BETS[betIndex]
  const spinning = winState === 'spinning'

  function spin() {
    if (spinning || balance < bet) return
    setBalance((b) => b - bet)
    setWinState('spinning')
    setWinEmoji(null)
    setMessage(t('home.miniSlotSpinning'))

    shuffleRef.current = window.setInterval(() => setCells(randGrid()), 75)
    timerRef.current = window.setTimeout(() => {
      if (shuffleRef.current) clearInterval(shuffleRef.current)
      const final = randGrid()
      const counts: Record<string, number> = {}
      final.forEach((c) => {
        if (!c.bomb) counts[c.glyph] = (counts[c.glyph] || 0) + 1
      })
      let best: string | null = null
      let bestN = 0
      for (const [glyph, n] of Object.entries(counts)) {
        if (n > bestN) {
          bestN = n
          best = glyph
        }
      }
      const bombMult = final.filter((c) => c.bomb).length
      setCells(final)

      if (bestN >= 8 && best) {
        const base = bet * (bestN >= 12 ? 15 : bestN >= 10 ? 8 : 4)
        const win = base * (bombMult > 0 ? bombMult + 1 : 1)
        setBalance((b) => b + win)
        setWinEmoji(best)
        setWinState('win')
        setMessage(
          (bombMult > 0 ? `💥 x${bombMult + 1} · ` : '') +
            `${t('home.miniSlotWin')} +${win.toLocaleString('en-US')}`,
        )
      } else {
        setWinState('nowin')
        setMessage(t('home.miniSlotNoWin'))
      }
    }, 850)
  }

  const winColor =
    winState === 'win' ? 'text-gold' : winState === 'spinning' ? 'text-gold-soft' : 'text-mist'

  return (
    <div className="relative">
      <div
        className="relative w-full max-w-[460px] rounded-[30px] border border-gold/30 p-5 sm:p-6 animate-glow-pulse"
        style={{ background: 'linear-gradient(160deg,#3a1a5e,#1c0d3a)' }}
      >
        <div className="text-center font-display text-lg font-black tracking-wider text-gradient-gold sm:text-xl">
          🍭 {t('home.miniSlotTitle')} 🍭
        </div>
        <div className="mt-1 mb-3.5 text-center text-[11px] font-bold tracking-wide text-lilac">
          {t('home.miniSlotSubtitle')}
        </div>

        <div className="relative rounded-2xl border border-white/10 bg-[#150a30] p-3 shadow-[inset_0_8px_30px_rgba(0,0,0,0.7)]">
          <div className="grid grid-cols-6 gap-1.5">
            {cells.map((c, i) => {
              const win = winEmoji && c.glyph === winEmoji
              return (
                <div
                  key={i}
                  className="grid aspect-square place-items-center rounded-xl text-2xl transition-all duration-200"
                  style={{
                    background: c.bomb
                      ? 'radial-gradient(circle at 50% 38%,#4a2a6c,#1c1030)'
                      : 'radial-gradient(circle at 50% 36%, rgba(255,255,255,.16), rgba(255,255,255,.03))',
                    boxShadow: win
                      ? '0 0 0 2px #FFC24B, 0 0 22px rgba(255,194,75,.85)'
                      : 'inset 0 0 0 1px rgba(255,255,255,.07)',
                    transform: win ? 'scale(1.07)' : 'scale(1)',
                  }}
                >
                  {c.glyph}
                </div>
              )
            })}
          </div>
          {winState === 'win' && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-gold" />
          )}
        </div>

        <div className={`mt-3 min-h-[1.75rem] text-center font-display text-sm font-extrabold ${winColor}`}>
          {message}
        </div>

        <div className="mt-1 flex items-center gap-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
            <button
              onClick={() => !spinning && setBetIndex((i) => Math.max(0, i - 1))}
              className="h-7 w-7 rounded-lg bg-white/10 text-lg font-black leading-none text-white cursor-pointer"
            >
              −
            </button>
            <div className="flex-1 text-center">
              <div className="text-[10px] font-bold text-mist">{t('home.miniSlotBet')}</div>
              <div className="font-display text-base font-extrabold text-white">
                {bet.toLocaleString('en-US')}
              </div>
            </div>
            <button
              onClick={() => !spinning && setBetIndex((i) => Math.min(BETS.length - 1, i + 1))}
              className="h-7 w-7 rounded-lg bg-white/10 text-lg font-black leading-none text-white cursor-pointer"
            >
              +
            </button>
          </div>
          <button
            onClick={spin}
            disabled={spinning}
            className="flex-[1.2] rounded-2xl bg-gradient-to-br from-magenta to-gold px-4 py-3.5 font-display text-base font-black tracking-wider text-ink shadow-glow-magenta animate-spin-pulse disabled:opacity-70 cursor-pointer"
          >
            {spinning ? '...' : 'SPIN'}
          </button>
        </div>
      </div>
    </div>
  )
}
