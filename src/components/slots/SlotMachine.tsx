import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { SlotDefinition } from '@/types'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { ACCENT_TEXT } from '@/lib/slotTheme'

const BET_PRESETS = [10, 25, 50, 100, 250, 500]
const REEL_STOP_DELAYS = [550, 950, 1350]
const FLICKER_INTERVAL = 70
const REELS = 3
const ROWS = 3
const PAYLINE_COUNT = 5

type WinTier = 'none' | 'win' | 'big' | 'jackpot'

interface SpinResponse {
  result: {
    grid: string[][]
    winningLines: { line: number; glyph: string; payout: number }[]
    totalWin: number
    tier: WinTier
  }
  balance: number
  fair: FairInfo
}

interface RecentSpin {
  id: string
  amount: number
  tier: WinTier
}

function errorKey(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'loginToPlay'
    case 'bet_over_limit':
    case 'loss_limit_reached':
      return 'limitReached'
    case 'self_excluded':
      return 'selfExcluded'
    default:
      return 'insufficientFunds'
  }
}

export function SlotMachine({ slot }: { slot: SlotDefinition }) {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const glyphs = slot.symbols.map((s) => s.glyph)

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [grid, setGrid] = useState<string[][]>(() =>
    Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => glyphs[0])),
  )
  const [reelStopped, setReelStopped] = useState([true, true, true])
  const [spinning, setSpinning] = useState(false)
  const [winningLineIndexes, setWinningLineIndexes] = useState<number[]>([])
  const [message, setMessage] = useState<{ tier: WinTier; amount: number } | null>(null)
  const [sessionBet, setSessionBet] = useState(0)
  const [sessionWin, setSessionWin] = useState(0)
  const [recentSpins, setRecentSpins] = useState<RecentSpin[]>([])
  const [error, setError] = useState<string | null>(null)

  const timeouts = useRef<number[]>([])
  const intervals = useRef<number[]>([])

  useEffect(() => {
    return () => {
      timeouts.current.forEach(clearTimeout)
      intervals.current.forEach(clearInterval)
    }
  }, [])

  const maxBet = Math.max(BET_PRESETS[0], Math.min(1000, Math.floor(balance)))

  function clearTimers() {
    timeouts.current.forEach(clearTimeout)
    intervals.current.forEach(clearInterval)
    timeouts.current = []
    intervals.current = []
  }

  function randGlyph() {
    return glyphs[Math.floor(Math.random() * glyphs.length)]
  }

  function startFlicker() {
    setSpinning(true)
    setReelStopped([false, false, false])
    for (let reel = 0; reel < REELS; reel++) {
      const flicker = window.setInterval(() => {
        setGrid((prev) => {
          const next = prev.map((col) => [...col])
          next[reel] = Array.from({ length: ROWS }, randGlyph)
          return next
        })
      }, FLICKER_INTERVAL)
      intervals.current.push(flicker)
    }
  }

  /** Sequentially stop the reels onto the server's grid, then resolve. */
  function settleTo(res: SpinResponse) {
    for (let reel = 0; reel < REELS; reel++) {
      const stop = window.setTimeout(() => {
        setGrid((prev) => {
          const next = prev.map((col) => [...col])
          next[reel] = res.result.grid[reel]
          return next
        })
        setReelStopped((prev) => {
          const next = [...prev]
          next[reel] = true
          return next
        })
      }, REEL_STOP_DELAYS[reel])
      timeouts.current.push(stop)
    }

    const finish = window.setTimeout(() => {
      setSpinning(false)
      setBalance(res.balance)
      setWinningLineIndexes(res.result.winningLines.map((w) => w.line))
      const { totalWin, tier } = res.result
      if (totalWin > 0) {
        setSessionWin((v) => v + totalWin)
        setMessage({ tier, amount: totalWin })
      } else {
        setMessage({ tier: 'none', amount: 0 })
      }
      setRecentSpins((prev) =>
        [{ id: crypto.randomUUID(), amount: totalWin, tier }, ...prev].slice(0, 6),
      )
    }, REEL_STOP_DELAYS[REELS - 1] + 150)
    timeouts.current.push(finish)
  }

  async function handleSpin() {
    if (spinning) return
    setError(null)
    setMessage(null)
    setWinningLineIndexes([])

    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet <= 0 || bet > balance) {
      setError('insufficientFunds')
      return
    }

    clearTimers()
    startFlicker()
    setSessionBet((v) => v + bet)

    try {
      const res = await api.post<SpinResponse>('/games/slots/spin', { gameId: slot.id, bet })
      settleTo(res)
    } catch (err) {
      clearTimers()
      setSpinning(false)
      setReelStopped([true, true, true])
      setSessionBet((v) => Math.max(0, v - bet))
      setError(errorKey(err instanceof ApiError ? err.code : undefined))
    }
  }

  const canSpin = !spinning && bet > 0 && (!isAuthenticated || bet <= balance)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8"
        style={{ background: `linear-gradient(160deg, ${slot.themeFrom}, ${slot.themeTo})` }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{slot.icon}</span>
            <div>
              <h2 className="font-display text-lg font-bold text-white sm:text-xl">{slot.name}</h2>
              <p className="text-xs text-white/50">
                {t('slots.rtp')} {slot.rtp}% · {t('slots.paylines')}: {PAYLINE_COUNT}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm ${ACCENT_TEXT[slot.accent]}`}
          >
            {t(`slots.volatility${slot.volatility.charAt(0).toUpperCase()}${slot.volatility.slice(1)}`)}
          </span>
        </div>

        <div className="relative rounded-2xl border-4 border-gold/40 bg-black/40 p-3 shadow-glow-gold sm:p-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: REELS }).map((_, reel) => (
              <div
                key={reel}
                className={`flex flex-col gap-2 overflow-hidden rounded-xl bg-black/30 p-1.5 sm:gap-3 sm:p-2 ${
                  !reelStopped[reel] ? 'animate-spin-reel' : ''
                }`}
              >
                {Array.from({ length: ROWS }).map((_, row) => {
                  const glyph = grid[reel][row]
                  const isNumeric = /^[0-9]+$/.test(glyph)
                  return (
                    <div
                      key={row}
                      className={`flex aspect-square items-center justify-center rounded-lg bg-surface-2/80 text-3xl sm:text-4xl ${
                        isNumeric ? 'font-display font-black text-gold-soft' : ''
                      }`}
                    >
                      {glyph}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex min-h-[2.5rem] items-center justify-center">
          {error && (
            <div className="rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('slots.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : error === 'limitReached' ? (
                t('slots.limitReached')
              ) : error === 'selfExcluded' ? (
                t('slots.selfExcluded')
              ) : (
                <>
                  {t('slots.insufficientFunds')}{' '}
                  <Link to="/wallet" className="font-semibold underline">
                    {t('slots.goToWallet')}
                  </Link>
                </>
              )}
            </div>
          )}
          {!error && message && !spinning && (
            <div
              className={`animate-coin rounded-xl px-5 py-2 text-center font-display font-bold ${
                message.tier === 'jackpot'
                  ? 'bg-gold/20 text-gold-soft text-xl shadow-glow-gold'
                  : message.tier === 'big'
                    ? 'bg-magenta/20 text-magenta text-lg'
                    : message.tier === 'win'
                      ? 'bg-emerald/15 text-emerald'
                      : 'text-white/35 text-sm font-normal'
              }`}
            >
              {message.tier === 'jackpot' && `${t('slots.jackpot')} `}
              {message.tier === 'big' && `${t('slots.bigWin')} `}
              {message.tier !== 'none'
                ? `+${message.amount.toLocaleString('en-US')} ${t('common.currencyShort')}`
                : t('slots.noWin')}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/50">{t('slots.bet')}</span>
            <div className="flex items-center rounded-xl border border-white/12 bg-black/30">
              <button
                onClick={() => setBet((v) => Math.max(BET_PRESETS[0], v - 10))}
                disabled={spinning}
                className="px-3 py-2 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                −
              </button>
              <span className="min-w-[4.5rem] px-2 text-center font-mono font-bold text-gold-soft">
                {bet}
              </span>
              <button
                onClick={() => setBet((v) => Math.min(maxBet, v + 10))}
                disabled={spinning}
                className="px-3 py-2 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                +
              </button>
            </div>
            <button
              onClick={() => setBet(maxBet)}
              disabled={spinning}
              className="rounded-lg border border-white/12 px-2.5 py-1.5 text-xs font-semibold text-white/60 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              {t('slots.maxBet')}
            </button>
          </div>

          <Button size="lg" onClick={handleSpin} disabled={!canSpin} className="min-w-[10rem]">
            {spinning ? t('slots.spinning') : `🎰 ${t('slots.spin')}`}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {BET_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setBet(preset)}
              disabled={spinning || (isAuthenticated && preset > balance)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-30 cursor-pointer ${
                bet === preset
                  ? 'border-gold bg-gold/15 text-gold-soft'
                  : 'border-white/12 text-white/50 hover:text-white'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Side panel */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <div className="mb-4 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-white/40">
                {t('slots.totalBet')}
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-white/80">{sessionBet}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-white/40">
                {t('slots.totalWin')}
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald">{sessionWin}</div>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-white/40">
              {t('slots.balance')}
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-gold-soft">
              {balance.toLocaleString('en-US')}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <h3 className="mb-3 text-sm font-bold text-white/80">{t('slots.lastWins')}</h3>
          {recentSpins.length === 0 ? (
            <p className="text-sm text-white/35">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentSpins.map((spin) => (
                <li
                  key={spin.id}
                  className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="text-white/50">
                    {spin.tier === 'jackpot'
                      ? '💰 ' + t('slots.jackpot')
                      : spin.tier === 'big'
                        ? '🔥 ' + t('slots.bigWin')
                        : spin.tier === 'win'
                          ? t('slots.win')
                          : t('slots.noWin')}
                  </span>
                  <span
                    className={`font-mono font-bold ${spin.amount > 0 ? 'text-emerald' : 'text-white/30'}`}
                  >
                    {spin.amount > 0 ? `+${spin.amount}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {winningLineIndexes.length > 0 && !spinning && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4 text-xs text-gold-soft">
            {t('slots.paylines')}: {winningLineIndexes.map((i) => i + 1).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}
