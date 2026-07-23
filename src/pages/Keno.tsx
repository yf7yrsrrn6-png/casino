import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

const POOL = 40
const MAX_PICKS = 10
const BET_PRESETS = [10, 25, 50, 100, 250]

interface KenoResult {
  picks: number[]
  drawn: number[]
  hits: number[]
  hitCount: number
  multiplier: number
  payout: number
}

export function Keno() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [bet, setBet] = useState(BET_PRESETS[1])
  const [picks, setPicks] = useState<number[]>([])
  const [result, setResult] = useState<KenoResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const drawnSet = new Set(result?.drawn ?? [])
  const hitSet = new Set(result?.hits ?? [])

  function toggle(n: number) {
    if (busy) return
    setResult(null)
    setPicks((p) =>
      p.includes(n) ? p.filter((x) => x !== n) : p.length < MAX_PICKS ? [...p, n] : p,
    )
  }

  function quickPick() {
    if (busy) return
    setResult(null)
    const set = new Set<number>()
    while (set.size < MAX_PICKS) set.add(1 + Math.floor(Math.random() * POOL))
    setPicks([...set])
  }

  async function play() {
    if (busy || picks.length === 0) return
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
    setResult(null)
    try {
      const res = await api.post<{ result: KenoResult; balance: number; fair: FairInfo }>(
        '/games/keno/play',
        { bet, picks },
      )
      setResult(res.result)
      setBalance(res.balance)
      if (res.result.payout > 0) {
        confettiBurst(res.result.multiplier >= 20 ? 150 : 80)
        playSound(res.result.multiplier >= 20 ? 'big' : 'win')
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🔢 {t('keno.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('keno.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-3xl border border-white/10 bg-surface p-5 sm:p-7">
          <div className="grid grid-cols-8 gap-2">
            {Array.from({ length: POOL }, (_, i) => i + 1).map((n) => {
              const picked = picks.includes(n)
              const drawn = drawnSet.has(n)
              const hit = hitSet.has(n)
              return (
                <button
                  key={n}
                  onClick={() => toggle(n)}
                  className={`aspect-square rounded-lg text-sm font-bold transition-all cursor-pointer ${
                    hit
                      ? 'bg-gradient-to-br from-gold to-magenta text-ink ring-2 ring-white'
                      : picked
                        ? 'bg-violet/40 text-white ring-1 ring-violet'
                        : drawn
                          ? 'bg-surface-3 text-gold-soft'
                          : 'bg-surface-2 text-white/60 hover:bg-surface-3'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-mist">
              {t('keno.picks')}: <b className="text-white">{picks.length}</b>/{MAX_PICKS}
            </span>
            {result && (
              <span className={result.payout > 0 ? 'font-bold text-emerald' : 'text-white/50'}>
                {t('keno.hits')}: {result.hitCount} ·{' '}
                {result.payout > 0
                  ? `${t('keno.youWon')} +${result.payout.toLocaleString('en-US')}`
                  : t('keno.youLost')}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('keno.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : (
                t('keno.insufficientFunds')
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="text-[11px] uppercase tracking-wide text-white/40">{t('keno.balance')}</div>
            <div className="font-mono text-xl font-bold text-gold-soft">{balance.toLocaleString('en-US')}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold text-white/60">{t('keno.bet')}</div>
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
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={quickPick}>
                🎲 {t('keno.quickPick')}
              </Button>
              <Button variant="secondary" onClick={() => { setPicks([]); setResult(null) }} disabled={picks.length === 0}>
                {t('keno.clear')}
              </Button>
            </div>
            <Button className="mt-3 w-full" size="lg" onClick={play} disabled={busy || picks.length === 0}>
              {busy ? t('keno.playing') : t('keno.play')}
            </Button>
            {picks.length === 0 && <p className="mt-2 text-center text-xs text-white/35">{t('keno.pickSome')}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
