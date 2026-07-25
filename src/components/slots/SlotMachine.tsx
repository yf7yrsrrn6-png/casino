import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { SlotDefinition } from '@/types'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { ACCENT_TEXT, ACCENT_HEX } from '@/lib/slotTheme'
import { SlotSymbol } from '@/components/slots/SlotSymbol'
import { confettiBurst, playSound } from '@/lib/effects'

const BET_PRESETS = [10, 25, 50, 100, 250, 500]
const REEL_STOP_DELAYS = [640, 1020, 1440]
const REELS = 3
const ROWS = 3
const PAYLINE_COUNT = 5

type WinTier = 'none' | 'win' | 'big' | 'jackpot'
type Phase = 'idle' | 'spinning' | 'stopped'

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

/** A single reel: rolls a blurred strip while spinning, then drops onto the
 *  server column with an overshoot bounce. Winning symbols keep a gold frame. */
function Reel({
  column,
  phase,
  glyphs,
  landKey,
  winRows,
  accentHex,
}: {
  column: string[]
  phase: Phase
  glyphs: string[]
  landKey: number
  winRows: boolean[]
  accentHex: string
}) {
  // A seamless 9-tile blur strip (three identical triples) for the spin loop.
  const rollStrip = useMemo(() => {
    const triple = Array.from({ length: 3 }, () => glyphs[Math.floor(Math.random() * glyphs.length)])
    return [...triple, ...triple, ...triple]
  }, [glyphs])

  return (
    <div className="reel-window relative h-[13.8rem] overflow-hidden rounded-xl bg-black/45 sm:h-[16.8rem]">
      {/* glass reflection */}
      <div className="reel-glass pointer-events-none absolute inset-0 z-10" />
      {phase === 'spinning' ? (
        <div className="reel-rolling reel-spinning flex flex-col">
          {rollStrip.map((glyph, i) => (
            <SlotTile key={i} glyph={glyph} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {column.map((glyph, row) => (
            <SlotTile
              key={`${landKey}-${row}`}
              glyph={glyph}
              landing={phase === 'stopped'}
              stagger={row * 0.06}
              win={winRows[row]}
              accentHex={accentHex}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SlotTile({
  glyph,
  landing = false,
  stagger = 0,
  win = false,
  accentHex,
}: {
  glyph: string
  landing?: boolean
  stagger?: number
  win?: boolean
  accentHex?: string
}) {
  return (
    <div
      className={`relative flex h-[4.6rem] items-center justify-center sm:h-[5.6rem] ${
        landing ? 'animate-slot-land' : ''
      }`}
      style={landing ? { animationDelay: `${stagger}s` } : undefined}
    >
      <div
        className={`flex h-[3.9rem] w-[3.9rem] items-center justify-center rounded-xl p-1.5 transition-all sm:h-[4.8rem] sm:w-[4.8rem] ${
          win ? 'win-cell' : ''
        }`}
        style={{
          background: win
            ? `radial-gradient(circle at 50% 30%, ${accentHex}55, rgba(0,0,0,0.35))`
            : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.32))',
          boxShadow: win ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -6px 14px rgba(0,0,0,0.45)',
        }}
      >
        <SlotSymbol name={glyph} className={win ? 'scale-110 transition-transform' : ''} />
      </div>
    </div>
  )
}

export function SlotMachine({ slot }: { slot: SlotDefinition }) {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const glyphs = useMemo(() => slot.symbols.map((s) => s.glyph), [slot])
  const accentHex = ACCENT_HEX[slot.accent] ?? '#ffc24b'

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [columns, setColumns] = useState<string[][]>(() =>
    Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => glyphs[0])),
  )
  const [phases, setPhases] = useState<Phase[]>(['idle', 'idle', 'idle'])
  const [landKey, setLandKey] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winGlyphs, setWinGlyphs] = useState<Set<string>>(new Set())
  const [winningLineIndexes, setWinningLineIndexes] = useState<number[]>([])
  const [message, setMessage] = useState<{ tier: WinTier; amount: number } | null>(null)
  const [bigWin, setBigWin] = useState<{ tier: WinTier; amount: number } | null>(null)
  const [sessionBet, setSessionBet] = useState(0)
  const [sessionWin, setSessionWin] = useState(0)
  const [recentSpins, setRecentSpins] = useState<RecentSpin[]>([])
  const [error, setError] = useState<string | null>(null)

  const timeouts = useRef<number[]>([])

  useEffect(() => {
    return () => {
      timeouts.current.forEach(clearTimeout)
    }
  }, [])

  const maxBet = Math.max(BET_PRESETS[0], Math.min(1000, Math.floor(balance)))

  function clearTimers() {
    timeouts.current.forEach(clearTimeout)
    timeouts.current = []
  }

  function settleTo(res: SpinResponse) {
    const winSet = new Set(res.result.winningLines.map((w) => w.glyph))

    for (let reel = 0; reel < REELS; reel++) {
      const stop = window.setTimeout(() => {
        setColumns((prev) => {
          const next = prev.map((col) => [...col])
          next[reel] = res.result.grid[reel]
          return next
        })
        setPhases((prev) => {
          const next = [...prev]
          next[reel] = 'stopped'
          return next
        })
        setLandKey((k) => k + 1)
        playSound('spin')
      }, REEL_STOP_DELAYS[reel])
      timeouts.current.push(stop)
    }

    const finish = window.setTimeout(() => {
      setSpinning(false)
      setBalance(res.balance)
      setWinningLineIndexes(res.result.winningLines.map((w) => w.line))
      const { totalWin, tier } = res.result
      if (totalWin > 0) {
        setWinGlyphs(winSet)
        setSessionWin((v) => v + totalWin)
        setMessage({ tier, amount: totalWin })
        if (tier === 'jackpot') {
          confettiBurst(220)
          playSound('big')
          setBigWin({ tier, amount: totalWin })
        } else if (tier === 'big') {
          confettiBurst(140)
          playSound('big')
          setBigWin({ tier, amount: totalWin })
        } else {
          playSound('win')
        }
      } else {
        setMessage({ tier: 'none', amount: 0 })
      }
      setRecentSpins((prev) =>
        [{ id: crypto.randomUUID(), amount: totalWin, tier }, ...prev].slice(0, 6),
      )
    }, REEL_STOP_DELAYS[REELS - 1] + 180)
    timeouts.current.push(finish)
  }

  async function handleSpin() {
    if (spinning) return
    setError(null)
    setMessage(null)
    setBigWin(null)
    setWinGlyphs(new Set())
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
    setSpinning(true)
    setPhases(['spinning', 'spinning', 'spinning'])
    setLandKey((k) => k + 1)
    playSound('spin')
    setSessionBet((v) => v + bet)

    try {
      const res = await api.post<SpinResponse>('/games/slots/spin', { gameId: slot.id, bet })
      settleTo(res)
    } catch (err) {
      clearTimers()
      setSpinning(false)
      setPhases(['idle', 'idle', 'idle'])
      setSessionBet((v) => Math.max(0, v - bet))
      setError(errorKey(err instanceof ApiError ? err.code : undefined))
    }
  }

  const canSpin = !spinning && bet > 0 && (!isAuthenticated || bet <= balance)
  const hasWin = winGlyphs.size > 0 && !spinning

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-8"
        style={{ background: `linear-gradient(160deg, ${slot.themeFrom}, ${slot.themeTo})` }}
      >
        {/* ambient aurora */}
        <div
          className="aurora-layer pointer-events-none absolute -left-1/4 -top-1/3 h-[140%] w-[80%] rounded-full opacity-40 blur-3xl"
          style={{ background: `radial-gradient(circle, ${accentHex}55, transparent 70%)` }}
        />

        <div className="relative mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 drop-shadow-lg">
              <SlotSymbol name={slot.symbols[slot.symbols.length - 1].glyph} />
            </span>
            <div>
              <h2
                className={`neon-text font-display text-lg font-black tracking-tight sm:text-2xl ${ACCENT_TEXT[slot.accent]}`}
              >
                {slot.name}
              </h2>
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

        {/* Cabinet */}
        <div className="machine-cabinet relative rounded-2xl border-2 border-gold/50 p-3 sm:p-4">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-[2px] -translate-y-1/2"
            style={{ background: `linear-gradient(90deg, transparent, ${accentHex}88, transparent)` }}
          />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: REELS }).map((_, reel) => (
              <Reel
                key={reel}
                column={columns[reel]}
                phase={phases[reel]}
                glyphs={glyphs}
                landKey={landKey * 10 + reel}
                winRows={
                  hasWin ? columns[reel].map((g) => winGlyphs.has(g)) : [false, false, false]
                }
                accentHex={accentHex}
              />
            ))}
          </div>

          {/* Big win overlay */}
          {bigWin && !spinning && (
            <div className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-black/55 backdrop-blur-sm">
              <div className="animate-bigwin text-center">
                <div
                  className={`font-display text-3xl font-black uppercase tracking-tight sm:text-5xl ${
                    bigWin.tier === 'jackpot' ? 'gold-foil' : 'text-magenta'
                  }`}
                >
                  {bigWin.tier === 'jackpot' ? t('slots.jackpot') : t('slots.bigWin')}
                </div>
                <div className="mt-2 font-mono text-2xl font-black text-gold-soft sm:text-4xl">
                  +{bigWin.amount.toLocaleString('en-US')}
                </div>
                <button
                  onClick={() => setBigWin(null)}
                  className="mt-4 rounded-full border border-white/20 bg-white/10 px-5 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20 cursor-pointer"
                >
                  {t('common.continue')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative mt-4 flex min-h-[2.5rem] items-center justify-center">
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
          {!error && message && !spinning && !bigWin && (
            <div
              className={`animate-coin rounded-xl px-5 py-2 text-center font-display font-bold ${
                message.tier === 'win'
                  ? 'bg-emerald/15 text-emerald'
                  : 'text-white/35 text-sm font-normal'
              }`}
            >
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

          <Button
            size="lg"
            onClick={handleSpin}
            disabled={!canSpin}
            className="sheen relative min-w-[10rem] overflow-hidden"
          >
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
        <div className="glass rounded-2xl p-5">
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
