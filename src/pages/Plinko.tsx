import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

const ROWS = 12
const BET_PRESETS = [10, 25, 50, 100, 250]
type Risk = 'low' | 'medium' | 'high'

const TABLES: Record<Risk, number[]> = {
  low: [7.77, 2.91, 1.46, 1.17, 1.07, 0.97, 0.68, 0.97, 1.07, 1.17, 1.46, 2.91, 7.77],
  medium: [29.97, 7.49, 2.75, 1.5, 1, 0.75, 0.62, 0.75, 1, 1.5, 2.75, 7.49, 29.97],
  high: [162.31, 24.97, 6.24, 1.87, 0.62, 0.37, 0.25, 0.37, 0.62, 1.87, 6.24, 24.97, 162.31],
}

function bucketColor(m: number) {
  if (m >= 10) return 'bg-magenta text-white'
  if (m >= 2) return 'bg-gold text-ink'
  if (m >= 1) return 'bg-emerald/80 text-ink'
  return 'bg-surface-3 text-white/70'
}

interface PlinkoResult {
  path: ('L' | 'R')[]
  bucket: number
  multiplier: number
  payout: number
  risk: Risk
}

export function Plinko() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [risk, setRisk] = useState<Risk>('medium')
  const [dropping, setDropping] = useState(false)
  const [ball, setBall] = useState<{ row: number; offset: number } | null>(null)
  const [landed, setLanded] = useState<PlinkoResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const timers = useRef<number[]>([])

  function animate(res: PlinkoResult) {
    timers.current.forEach(clearTimeout)
    timers.current = []
    let rights = 0
    setBall({ row: 0, offset: 0 })
    for (let r = 0; r < ROWS; r++) {
      const id = window.setTimeout(() => {
        if (res.path[r] === 'R') rights += 1
        const offset = (2 * rights - (r + 1)) * (42 / ROWS)
        setBall({ row: r + 1, offset })
        if (r === ROWS - 1) {
          setLanded(res)
          setDropping(false)
          setHistory((h) => [res.multiplier, ...h].slice(0, 12))
          if (res.payout > bet) {
            confettiBurst(res.multiplier >= 10 ? 150 : 80)
            playSound(res.multiplier >= 10 ? 'big' : 'win')
          } else {
            playSound('lose')
          }
        }
      }, (r + 1) * 130)
      timers.current.push(id)
    }
  }

  async function drop() {
    if (dropping) return
    setError(null)
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet > balance) {
      setError('insufficientFunds')
      return
    }
    setDropping(true)
    setLanded(null)
    try {
      const res = await api.post<{ result: PlinkoResult; balance: number; fair: FairInfo }>(
        '/games/plinko/drop',
        { bet, risk },
      )
      setBalance(res.balance)
      animate(res.result)
    } catch (err) {
      setDropping(false)
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'unauthorized' ? 'loginToPlay' : 'insufficientFunds')
    }
  }

  const table = TABLES[risk]

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🔵 {t('plinko.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('plinko.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-violet/10 to-ink p-5 sm:p-7">
          {/* Board */}
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md">
            {/* pegs */}
            {Array.from({ length: ROWS }).map((_, r) => (
              <div
                key={r}
                className="absolute flex w-full justify-center gap-[4.5%]"
                style={{ top: `${(r / ROWS) * 82}%` }}
              >
                {Array.from({ length: r + 2 }).map((__, c) => (
                  <span key={c} className="h-1.5 w-1.5 rounded-full bg-white/30" />
                ))}
              </div>
            ))}
            {/* ball */}
            {ball && (
              <div
                className="absolute h-3 w-3 rounded-full bg-gold shadow-glow-gold transition-all duration-100"
                style={{
                  top: `${(ball.row / ROWS) * 82}%`,
                  left: `calc(50% + ${ball.offset}% - 6px)`,
                }}
              />
            )}
          </div>

          {/* buckets */}
          <div className="mt-3 flex gap-1">
            {table.map((m, i) => (
              <div
                key={i}
                className={`flex-1 rounded-md py-1.5 text-center text-[10px] font-black sm:text-xs ${bucketColor(m)} ${
                  landed && landed.bucket === i ? 'ring-2 ring-white scale-110' : ''
                } transition-transform`}
              >
                {m}×
              </div>
            ))}
          </div>

          {landed && (
            <div
              className={`mt-4 text-center font-display text-lg font-bold ${
                landed.payout > bet ? 'text-emerald' : 'text-white/60'
              }`}
            >
              {landed.multiplier}× ·{' '}
              {landed.payout > 0 ? `+${landed.payout.toLocaleString('en-US')}` : '—'}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('plinko.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : (
                t('plinko.insufficientFunds')
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="text-[11px] uppercase tracking-wide text-white/40">{t('plinko.balance')}</div>
            <div className="font-mono text-xl font-bold text-gold-soft">{balance.toLocaleString('en-US')}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold text-white/60">{t('plinko.risk')}</div>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  disabled={dropping}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer ${
                    risk === r ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/12 text-white/60'
                  }`}
                >
                  {t(`plinko.${r}`)}
                </button>
              ))}
            </div>
            <div className="mb-2 mt-4 text-xs font-bold text-white/60">{t('plinko.bet')}</div>
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
            <Button className="mt-4 w-full" size="lg" onClick={drop} disabled={dropping}>
              {dropping ? t('plinko.dropping') : `🔵 ${t('plinko.drop')}`}
            </Button>
          </div>
          {history.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="mb-2 text-xs font-bold text-white/60">{t('plinko.history')}</div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((m, i) => (
                  <span
                    key={i}
                    className={`rounded-md px-2 py-1 text-xs font-bold ${m >= 1 ? 'bg-emerald/15 text-emerald' : 'bg-ruby/15 text-ruby'}`}
                  >
                    {m}×
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
