import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'

const CHIPS = [10, 25, 50, 100]
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

type OutsideBet =
  | { type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' }
  | { type: 'dozen' | 'column'; value: number }

interface PlacedBet {
  key: string
  type: string
  value?: number
  amount: number
}

interface SpinResult {
  result: {
    pocket: number
    color: 'green' | 'red' | 'black'
    totalStake: number
    totalPayout: number
    winningBetIndexes: number[]
  }
  balance: number
  fair: FairInfo
}

function colorClass(n: number) {
  if (n === 0) return 'bg-emerald text-ink'
  return RED.has(n) ? 'bg-ruby text-white' : 'bg-black text-white'
}

export function Roulette() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [chip, setChip] = useState(CHIPS[1])
  const [bets, setBets] = useState<PlacedBet[]>([])
  const [spinning, setSpinning] = useState(false)
  const [last, setLast] = useState<SpinResult['result'] | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const totalStake = bets.reduce((s, b) => s + b.amount, 0)

  function addBet(key: string, type: string, value?: number) {
    if (spinning) return
    setError(null)
    setBets((prev) => {
      const existing = prev.find((b) => b.key === key)
      if (existing) {
        return prev.map((b) => (b.key === key ? { ...b, amount: b.amount + chip } : b))
      }
      return [...prev, { key, type, value, amount: chip }]
    })
  }

  const straight = (n: number) => addBet(`straight-${n}`, 'straight', n)
  const outside = (b: OutsideBet) =>
    addBet('value' in b ? `${b.type}-${b.value}` : b.type, b.type, 'value' in b ? b.value : undefined)

  async function spin() {
    if (spinning || bets.length === 0) return
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (totalStake > balance) {
      setError('insufficientFunds')
      return
    }
    setSpinning(true)
    setError(null)
    setLast(null)
    try {
      const res = await api.post<SpinResult>('/games/roulette/spin', {
        bets: bets.map((b) => ({ type: b.type, value: b.value, amount: b.amount })),
      })
      // brief suspense
      await new Promise((r) => setTimeout(r, 700))
      setLast(res.result)
      setBalance(res.balance)
      setHistory((h) => [res.result.pocket, ...h].slice(0, 12))
      setBets([])
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'unauthorized' ? 'loginToPlay' : 'insufficientFunds')
    } finally {
      setSpinning(false)
    }
  }

  const numbers = Array.from({ length: 36 }, (_, i) => i + 1)
  const betAmount = (key: string) => bets.find((b) => b.key === key)?.amount ?? 0

  const outsideBtn =
    'rounded-lg border border-white/12 bg-black/30 py-2.5 text-xs font-bold text-white/80 hover:border-gold/50 cursor-pointer relative'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          {t('roulette.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('roulette.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-white/10 card-felt p-5 sm:p-7">
          {/* Result */}
          <div className="mb-5 flex items-center justify-center gap-4">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full font-display text-2xl font-black shadow-glow-gold ${
                last ? colorClass(last.pocket) : 'bg-black/40 text-white/40'
              }`}
            >
              {last ? last.pocket : '?'}
            </div>
            {last && (
              <div
                className={`font-display font-bold ${last.totalPayout > 0 ? 'text-emerald' : 'text-white/50'}`}
              >
                {last.totalPayout > 0
                  ? `${t('roulette.youWin')} +${last.totalPayout.toLocaleString('en-US')}`
                  : t('roulette.noWin')}
              </div>
            )}
          </div>

          {/* Number grid */}
          <div className="flex gap-1.5">
            <button
              onClick={() => straight(0)}
              className="w-10 shrink-0 rounded-lg bg-emerald text-sm font-black text-ink relative"
            >
              0
              {betAmount('straight-0') > 0 && <ChipDot amount={betAmount('straight-0')} />}
            </button>
            <div className="grid flex-1 grid-cols-9 gap-1.5">
              {numbers.map((n) => (
                <button
                  key={n}
                  onClick={() => straight(n)}
                  className={`relative aspect-square rounded-lg text-xs font-bold ${colorClass(n)} hover:ring-2 hover:ring-gold cursor-pointer`}
                >
                  {n}
                  {betAmount(`straight-${n}`) > 0 && <ChipDot amount={betAmount(`straight-${n}`)} />}
                </button>
              ))}
            </div>
          </div>

          {/* Dozens */}
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((dz) => (
              <button key={dz} onClick={() => outside({ type: 'dozen', value: dz })} className={outsideBtn}>
                {t(`roulette.dozen${dz}`)}
                {betAmount(`dozen-${dz}`) > 0 && <ChipDot amount={betAmount(`dozen-${dz}`)} />}
              </button>
            ))}
          </div>

          {/* Even-money bets */}
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {([
              { k: 'low', label: t('roulette.low') },
              { k: 'even', label: t('roulette.even') },
              { k: 'red', label: t('roulette.red') },
              { k: 'black', label: t('roulette.black') },
              { k: 'odd', label: t('roulette.odd') },
              { k: 'high', label: t('roulette.high') },
            ] as const).map((b) => (
              <button
                key={b.k}
                onClick={() => outside({ type: b.k })}
                className={`${outsideBtn} ${b.k === 'red' ? 'text-ruby' : ''}`}
              >
                {b.label}
                {betAmount(b.k) > 0 && <ChipDot amount={betAmount(b.k)} />}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('roulette.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : (
                t('roulette.insufficientFunds')
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="text-[11px] uppercase tracking-wide text-white/40">
              {t('roulette.balance')}
            </div>
            <div className="font-mono text-xl font-bold text-gold-soft">
              {balance.toLocaleString('en-US')}
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-white/40">
              {t('roulette.totalBet')}
            </div>
            <div className="font-mono text-lg font-bold text-white/80">{totalStake}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold text-white/60">{t('roulette.chip')}</div>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  className={`h-10 w-10 rounded-full border-2 text-xs font-bold cursor-pointer ${
                    chip === c ? 'border-gold bg-gold/20 text-gold-soft' : 'border-white/20 text-white/60'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBets([])}
                disabled={spinning || bets.length === 0}
              >
                {t('roulette.clearBets')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBets((p) => p.slice(0, -1))}
                disabled={spinning || bets.length === 0}
              >
                {t('roulette.undo')}
              </Button>
            </div>
            <Button
              className="mt-3 w-full"
              size="lg"
              onClick={spin}
              disabled={spinning || bets.length === 0}
            >
              {spinning ? t('roulette.spinning') : `🎡 ${t('roulette.spin')}`}
            </Button>
            {bets.length === 0 && !spinning && (
              <p className="mt-2 text-center text-xs text-white/35">{t('roulette.placeBets')}</p>
            )}
          </div>

          {history.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="mb-2 text-xs font-bold text-white/60">{t('roulette.history')}</div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((n, i) => (
                  <span
                    key={i}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${colorClass(n)}`}
                  >
                    {n}
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

function ChipDot({ amount }: { amount: number }) {
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-ink bg-gold px-1 text-[9px] font-black text-ink">
      {amount}
    </span>
  )
}
