import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

const TARGETS = [1.5, 2, 3, 5, 10]
const BET_PRESETS = [10, 25, 50, 100, 250]

interface CrashResult {
  crashPoint: number
  target: number
  won: boolean
  payout: number
}

export function Crash() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [target, setTarget] = useState(2)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [mult, setMult] = useState(1)
  const [cashedOut, setCashedOut] = useState(false)
  const [result, setResult] = useState<CrashResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const raf = useRef<number | null>(null)

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  function animate(res: CrashResult) {
    const duration = Math.min(5000, 900 + Math.log(res.crashPoint) * 1400)
    const start = performance.now()
    let flagged = false
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const m = Math.pow(res.crashPoint, p)
      setMult(m)
      if (res.won && !flagged && m >= res.target) {
        flagged = true
        setCashedOut(true)
        confettiBurst(res.payout >= bet * 5 ? 150 : 90)
        playSound(res.payout >= bet * 5 ? 'big' : 'win')
      }
      if (p < 1) {
        raf.current = requestAnimationFrame(frame)
      } else {
        setMult(res.crashPoint)
        setPhase('done')
        if (!res.won) playSound('lose')
        setHistory((h) => [res.crashPoint, ...h].slice(0, 14))
      }
    }
    raf.current = requestAnimationFrame(frame)
  }

  async function launch() {
    if (phase === 'running') return
    setError(null)
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet > balance) {
      setError('insufficientFunds')
      return
    }
    setResult(null)
    setCashedOut(false)
    setMult(1)
    setPhase('running')
    try {
      const res = await api.post<{ result: CrashResult; balance: number; fair: FairInfo }>(
        '/games/crash/bet',
        { bet, target },
      )
      setResult(res.result)
      setBalance(res.balance)
      animate(res.result)
    } catch (err) {
      setPhase('idle')
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'unauthorized' ? 'loginToPlay' : 'insufficientFunds')
    }
  }

  const busted = phase === 'done' && result && !result.won
  const multColor = busted ? 'text-ruby' : cashedOut ? 'text-emerald' : 'text-white'

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🚀 {t('crash.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('crash.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Rocket display */}
        <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-violet/15 to-ink p-6">
          <div
            className="pointer-events-none absolute text-6xl transition-all duration-100"
            style={{
              bottom: `${Math.min(75, (Math.log(mult) / Math.log(10)) * 60 + 8)}%`,
              left: '50%',
              transform: `translateX(-50%) rotate(${busted ? 90 : -10}deg)`,
              opacity: busted ? 0.3 : 1,
            }}
          >
            {busted ? '💥' : '🚀'}
          </div>
          <div className={`font-display text-6xl font-black tabular-nums ${multColor}`}>
            {mult.toFixed(2)}×
          </div>
          <div className="mt-3 h-6 text-sm font-bold">
            {phase === 'done' && result && (
              <span className={result.won ? 'text-emerald' : 'text-ruby'}>
                {result.won
                  ? `${t('crash.youWon')} +${result.payout.toLocaleString('en-US')}`
                  : `${t('crash.youLost')} · ${t('crash.crashedAt')} ${result.crashPoint.toFixed(2)}×`}
              </span>
            )}
            {phase === 'idle' && <span className="text-white/40">{t('crash.hint')}</span>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="text-[11px] uppercase tracking-wide text-white/40">{t('crash.balance')}</div>
            <div className="font-mono text-xl font-bold text-gold-soft">{balance.toLocaleString('en-US')}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold text-white/60">{t('crash.bet')}</div>
            <div className="flex flex-wrap gap-1.5">
              {BET_PRESETS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBet(b)}
                  disabled={phase === 'running'}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold disabled:opacity-40 cursor-pointer ${
                    bet === b ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/12 text-white/60'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="mb-2 mt-4 text-xs font-bold text-white/60">{t('crash.target')}</div>
            <div className="flex flex-wrap gap-1.5">
              {TARGETS.map((tg) => (
                <button
                  key={tg}
                  onClick={() => setTarget(tg)}
                  disabled={phase === 'running'}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold disabled:opacity-40 cursor-pointer ${
                    target === tg ? 'border-magenta bg-magenta/15 text-magenta' : 'border-white/12 text-white/60'
                  }`}
                >
                  {tg}×
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs text-mist">
              {t('crash.potential')}:{' '}
              <span className="font-mono font-bold text-emerald">
                {Math.round(bet * target).toLocaleString('en-US')}
              </span>
            </div>

            <Button className="mt-4 w-full" size="lg" onClick={launch} disabled={phase === 'running'}>
              {phase === 'running' ? '🚀…' : `🚀 ${t('crash.place')}`}
            </Button>

            {error && (
              <div className="mt-3 rounded-xl border border-ruby/40 bg-ruby/10 px-3 py-2 text-center text-xs text-ruby">
                {error === 'loginToPlay' ? (
                  <>
                    {t('crash.loginToPlay')}{' '}
                    <Link to="/login" className="font-semibold underline">
                      {t('nav.login')}
                    </Link>
                  </>
                ) : (
                  t('crash.insufficientFunds')
                )}
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="mb-2 text-xs font-bold text-white/60">{t('crash.history')}</div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((h, i) => (
                  <span
                    key={i}
                    className={`rounded-md px-2 py-1 text-xs font-bold ${
                      h >= 2 ? 'bg-emerald/15 text-emerald' : 'bg-ruby/15 text-ruby'
                    }`}
                  >
                    {h.toFixed(2)}×
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
