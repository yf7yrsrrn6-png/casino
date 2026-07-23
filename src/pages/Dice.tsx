import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

const BET_PRESETS = [10, 25, 50, 100, 250]

interface DiceResult {
  roll: number
  target: number
  direction: 'under' | 'over'
  won: boolean
  multiplier: number
  payout: number
}

export function Dice() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [target, setTarget] = useState(50)
  const [direction, setDirection] = useState<'under' | 'over'>('under')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DiceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ roll: number; won: boolean }[]>([])
  const [, setFair] = useState<FairInfo | null>(null)

  const chance = direction === 'under' ? target : 100 - target
  const multiplier = Math.max(1.01, Math.floor((0.99 / (chance / 100)) * 100) / 100)

  async function roll() {
    if (busy) return
    setError(null)
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet > balance) {
      setError('insufficientFunds')
      return
    }
    setBusy(true)
    try {
      const res = await api.post<{ result: DiceResult; balance: number; fair: FairInfo }>(
        '/games/dice/roll',
        { bet, target, direction },
      )
      setResult(res.result)
      setBalance(res.balance)
      setFair(res.fair)
      setHistory((h) => [{ roll: res.result.roll, won: res.result.won }, ...h].slice(0, 14))
      if (res.result.won) {
        confettiBurst(res.result.multiplier >= 5 ? 130 : 70)
        playSound(res.result.multiplier >= 5 ? 'big' : 'win')
      } else {
        playSound('lose')
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'unauthorized' ? 'loginToPlay' : 'insufficientFunds')
    } finally {
      setBusy(false)
    }
  }

  const markerPos = result ? result.roll : 50

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🎲 {t('dice.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('dice.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-white/10 bg-surface p-6 sm:p-8">
          {/* Result number */}
          <div className="mb-6 text-center">
            <div
              className={`font-display text-6xl font-black tabular-nums ${
                result ? (result.won ? 'text-emerald' : 'text-ruby') : 'text-white/40'
              }`}
            >
              {result ? result.roll.toFixed(2) : '—'}
            </div>
            {result && (
              <div className={`mt-1 text-sm font-bold ${result.won ? 'text-emerald' : 'text-ruby'}`}>
                {result.won
                  ? `${t('dice.youWon')} +${result.payout.toLocaleString('en-US')}`
                  : t('dice.youLost')}
              </div>
            )}
          </div>

          {/* Slider track */}
          <div className="relative mb-2 h-3 rounded-full bg-gradient-to-r from-ruby via-gold to-emerald">
            <div
              className="absolute -top-1.5 h-6 w-1 rounded bg-white shadow"
              style={{ left: `calc(${markerPos}% - 2px)` }}
            />
          </div>
          <input
            type="range"
            min={2}
            max={98}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full accent-gold cursor-pointer"
          />
          <div className="mt-1 flex justify-between text-xs text-white/40">
            <span>0</span>
            <span>{t('dice.target')}: <b className="text-gold-soft">{target}</b></span>
            <span>100</span>
          </div>

          {/* Direction */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => setDirection('under')}
              className={`rounded-xl border-2 py-3 text-sm font-bold cursor-pointer ${
                direction === 'under' ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/12 text-white/60'
              }`}
            >
              ▼ {t('dice.rollUnder')} {target}
            </button>
            <button
              onClick={() => setDirection('over')}
              className={`rounded-xl border-2 py-3 text-sm font-bold cursor-pointer ${
                direction === 'over' ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/12 text-white/60'
              }`}
            >
              ▲ {t('dice.rollOver')} {target}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-surface-2 py-3">
              <div className="text-[11px] uppercase tracking-wide text-white/40">{t('dice.chance')}</div>
              <div className="font-mono font-bold text-white/80">{chance}%</div>
            </div>
            <div className="rounded-xl bg-surface-2 py-3">
              <div className="text-[11px] uppercase tracking-wide text-white/40">{t('dice.multiplier')}</div>
              <div className="font-mono font-bold text-emerald">{multiplier.toFixed(2)}×</div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('dice.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : (
                t('dice.insufficientFunds')
              )}
            </div>
          )}
        </div>

        {/* Side */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="text-[11px] uppercase tracking-wide text-white/40">{t('dice.balance')}</div>
            <div className="font-mono text-xl font-bold text-gold-soft">{balance.toLocaleString('en-US')}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold text-white/60">{t('dice.bet')}</div>
            <div className="flex flex-wrap gap-1.5">
              {BET_PRESETS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBet(b)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold cursor-pointer ${
                    bet === b ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/12 text-white/60'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            <Button className="mt-4 w-full" size="lg" onClick={roll} disabled={busy}>
              {busy ? t('dice.rolling') : `🎲 ${t('dice.roll')}`}
            </Button>
          </div>
          {history.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="mb-2 text-xs font-bold text-white/60">{t('dice.history')}</div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((h, i) => (
                  <span
                    key={i}
                    className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${
                      h.won ? 'bg-emerald/15 text-emerald' : 'bg-ruby/15 text-ruby'
                    }`}
                  >
                    {h.roll.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
