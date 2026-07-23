import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { CardView, type DisplayCard } from '@/components/blackjack/CardView'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

const CHIPS = [25, 50, 100, 250]
type Spot = 'player' | 'banker' | 'tie'

interface BaccaratResult {
  player: DisplayCard[]
  banker: DisplayCard[]
  playerTotal: number
  bankerTotal: number
  outcome: Spot
  totalStake: number
  totalPayout: number
  winning: string[]
}

export function Baccarat() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [chip, setChip] = useState(CHIPS[1])
  const [bets, setBets] = useState<Record<Spot, number>>({ player: 0, banker: 0, tie: 0 })
  const [result, setResult] = useState<BaccaratResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setFair] = useState<FairInfo | null>(null)

  const totalStake = bets.player + bets.banker + bets.tie

  function place(spot: Spot) {
    if (busy) return
    setError(null)
    setBets((b) => ({ ...b, [spot]: b[spot] + chip }))
  }

  async function deal() {
    if (totalStake <= 0) return
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (totalStake > balance) {
      setError('insufficientFunds')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.post<{ result: BaccaratResult; balance: number; fair: FairInfo }>(
        '/games/baccarat/deal',
        { bets },
      )
      setResult(res.result)
      setBalance(res.balance)
      setFair(res.fair)
      if (res.result.totalPayout > 0) {
        confettiBurst(res.result.totalPayout >= totalStake * 5 ? 140 : 80)
        playSound(res.result.totalPayout >= totalStake * 5 ? 'big' : 'win')
      } else {
        playSound('lose')
      }
      setBets({ player: 0, banker: 0, tie: 0 })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'unauthorized' ? 'loginToPlay' : 'insufficientFunds')
    } finally {
      setBusy(false)
    }
  }

  const spot = (id: Spot, label: string, sub: string, colour: string) => (
    <button
      onClick={() => place(id)}
      disabled={busy}
      className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 py-5 transition-transform hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer ${colour} ${
        result?.outcome === id ? 'ring-2 ring-gold' : ''
      }`}
    >
      <span className="font-display text-lg font-black text-white">{label}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">{sub}</span>
      {bets[id] > 0 && (
        <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-ink bg-gold px-1 text-xs font-black text-ink">
          {bets[id]}
        </span>
      )}
    </button>
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          {t('baccarat.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('baccarat.subtitle')}</p>
      </div>

      <div className="rounded-3xl border border-white/10 card-felt p-6 sm:p-10">
        {/* Hands */}
        <div className="grid grid-cols-2 gap-6">
          <HandColumn label={t('baccarat.player')} total={result?.playerTotal} cards={result?.player} highlight={result?.outcome === 'player'} />
          <HandColumn label={t('baccarat.banker')} total={result?.bankerTotal} cards={result?.banker} highlight={result?.outcome === 'banker'} />
        </div>

        {result && (
          <div
            className={`mx-auto mt-6 max-w-xs rounded-2xl border px-5 py-3 text-center font-display text-lg font-bold ${
              result.totalPayout > 0
                ? 'border-emerald/40 bg-emerald/10 text-emerald'
                : 'border-ruby/40 bg-ruby/10 text-ruby'
            }`}
          >
            {t(`baccarat.${result.outcome}Wins`)}
            {result.totalPayout > 0 && (
              <span className="ml-2 font-mono">+{result.totalPayout.toLocaleString('en-US')}</span>
            )}
          </div>
        )}

        {/* Bet spots */}
        <div className="mt-8 flex gap-3">
          {spot('player', t('baccarat.player'), '1:1', 'border-azure/50 bg-azure/10')}
          {spot('tie', t('baccarat.tie'), '8:1', 'border-emerald/50 bg-emerald/10')}
          {spot('banker', t('baccarat.banker'), '1:1', 'border-magenta/50 bg-magenta/10')}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
            {error === 'loginToPlay' ? (
              <>
                {t('baccarat.loginToPlay')}{' '}
                <Link to="/login" className="font-semibold underline">
                  {t('nav.login')}
                </Link>
              </>
            ) : (
              t('baccarat.insufficientFunds')
            )}
          </div>
        )}

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/50">{t('baccarat.chip')}</span>
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
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBets({ player: 0, banker: 0, tie: 0 })} disabled={busy || totalStake === 0}>
              {t('baccarat.clear')}
            </Button>
            <Button size="lg" onClick={deal} disabled={busy || totalStake === 0}>
              {t('baccarat.deal')} · {totalStake}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-surface p-5 text-center">
          <div className="text-[11px] uppercase tracking-wide text-white/40">{t('baccarat.balance')}</div>
          <div className="mt-1 font-mono text-xl font-bold text-gold-soft">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <div className="text-[11px] uppercase tracking-wide text-white/40">{t('baccarat.payoutInfo')}</div>
        </div>
      </div>
    </div>
  )
}

function HandColumn({
  label,
  total,
  cards,
  highlight,
}: {
  label: string
  total?: number
  cards?: DisplayCard[]
  highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? 'bg-gold/10' : ''}`}>
      <div className="mb-2 flex items-center justify-center gap-2 text-sm font-bold text-white/70">
        {label}
        {total !== undefined && (
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs text-gold-soft">{total}</span>
        )}
      </div>
      <div className="flex justify-center gap-2">
        {!cards || cards.length === 0 ? (
          <>
            <div className="h-24 w-16 rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
            <div className="h-24 w-16 rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
          </>
        ) : (
          cards.map((c, i) => <CardView key={i} card={c} />)
        )}
      </div>
    </div>
  )
}
