import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { CardView, type DisplayCard } from '@/components/blackjack/CardView'
import { Button } from '@/components/ui/Button'

const CHIPS = [25, 50, 100, 250, 500]

interface BjView {
  status: 'player' | 'done'
  bet: number
  doubled: boolean
  player: DisplayCard[]
  dealer: DisplayCard[]
  dealerHidden: boolean
  playerTotal: number
  dealerTotal: number
  result: { outcome: string; payout: number; playerTotal: number; dealerTotal: number } | null
  canDouble: boolean
  balance: number
  fair: FairInfo
}

const OUTCOME_KEY: Record<string, string> = {
  player_blackjack: 'blackjack.blackjack',
  win: 'blackjack.youWin',
  dealer_bust: 'blackjack.dealerBust',
  lose: 'blackjack.youLose',
  push: 'blackjack.push',
  bust: 'blackjack.bust',
}

function errorMessage(t: (k: string) => string, code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'loginToPlay'
    case 'self_excluded':
      return t('slots.selfExcluded')
    case 'bet_over_limit':
    case 'loss_limit_reached':
      return t('slots.limitReached')
    default:
      return 'insufficientFunds'
  }
}

export function Blackjack() {
  const { t } = useTranslation()
  const isAuthenticated = useSession((s) => Boolean(s.user))
  const balance = useWallet((s) => s.balance)
  const setBalance = useWallet((s) => s.setBalance)

  const [view, setView] = useState<BjView | null>(null)
  const [bet, setBet] = useState(CHIPS[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resume an in-progress hand if the player navigates back.
  useEffect(() => {
    if (!isAuthenticated) return
    void api
      .get<BjView>('/games/blackjack/state')
      .then((v) => {
        if (v.status === 'player') setView(v)
      })
      .catch(() => {})
  }, [isAuthenticated])

  async function act(fn: () => Promise<BjView>) {
    setBusy(true)
    setError(null)
    try {
      const v = await fn()
      setView(v)
      setBalance(v.balance)
    } catch (err) {
      setError(errorMessage(t, err instanceof ApiError ? err.code : undefined))
    } finally {
      setBusy(false)
    }
  }

  function handleDeal() {
    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet > balance) {
      setError('insufficientFunds')
      return
    }
    void act(() => api.post<BjView>('/games/blackjack/deal', { bet }))
  }

  function handleNewRound() {
    setView(null)
    setError(null)
  }

  const phase: 'betting' | 'player' | 'result' = !view
    ? 'betting'
    : view.status === 'player'
      ? 'player'
      : 'result'

  const result = view?.result ?? null
  const net = result ? result.payout - view!.bet : 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          {t('blackjack.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('blackjack.subtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 card-felt p-6 sm:p-10">
        {/* Dealer */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
            {t('blackjack.dealer')}
            {view && !view.dealerHidden && (
              <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs text-gold-soft">
                {view.dealerTotal}
              </span>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3">
            {!view || view.dealer.length === 0 ? (
              <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
            ) : (
              <>
                {view.dealer.map((card, i) => (
                  <CardView key={i} card={card} />
                ))}
                {view.dealerHidden && <CardView hidden />}
              </>
            )}
          </div>
        </div>

        {/* Result */}
        {result && phase === 'result' && (
          <div
            className={`mb-8 rounded-2xl border px-5 py-4 text-center font-display text-lg font-bold ${
              net > 0
                ? 'border-emerald/40 bg-emerald/10 text-emerald'
                : net < 0
                  ? 'border-ruby/40 bg-ruby/10 text-ruby'
                  : 'border-white/10 bg-white/5 text-white/70'
            }`}
          >
            {t(OUTCOME_KEY[result.outcome] ?? 'blackjack.push')}
            {net !== 0 && (
              <span className="ml-2 font-mono">
                {net > 0 ? '+' : ''}
                {net} {t('common.currencyShort')}
              </span>
            )}
          </div>
        )}

        {/* Player */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
            {t('blackjack.you')}
            {view && view.player.length > 0 && (
              <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs text-gold-soft">
                {view.playerTotal}
              </span>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3">
            {!view || view.player.length === 0 ? (
              <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
            ) : (
              view.player.map((card, i) => <CardView key={i} card={card} />)
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-10 flex flex-col items-center gap-5">
          {error && (
            <div className="rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2 text-center text-sm text-ruby">
              {error === 'loginToPlay' ? (
                <>
                  {t('blackjack.loginToPlay')}{' '}
                  <Link to="/login" className="font-semibold underline">
                    {t('nav.login')}
                  </Link>
                </>
              ) : error === 'insufficientFunds' ? (
                <>
                  {t('blackjack.insufficientFunds')}{' '}
                  <Link to="/wallet" className="font-semibold underline">
                    {t('slots.goToWallet')}
                  </Link>
                </>
              ) : (
                error
              )}
            </div>
          )}

          {phase === 'betting' && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="mr-1 text-xs font-semibold text-white/50">
                  {t('blackjack.chooseBet')}
                </span>
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setBet(chip)}
                    disabled={isAuthenticated && chip > balance}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-30 cursor-pointer ${
                      bet === chip
                        ? 'border-gold bg-gold/20 text-gold-soft'
                        : 'border-white/20 bg-black/30 text-white/60'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <Button size="lg" onClick={handleDeal} disabled={busy || bet <= 0}>
                {t('blackjack.deal')} · {bet}
              </Button>
            </>
          )}

          {phase === 'player' && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => act(() => api.post<BjView>('/games/blackjack/hit'))}
              >
                {t('blackjack.hit')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => act(() => api.post<BjView>('/games/blackjack/stand'))}
              >
                {t('blackjack.stand')}
              </Button>
              {view?.canDouble && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act(() => api.post<BjView>('/games/blackjack/double'))}
                >
                  {t('blackjack.double')}
                </Button>
              )}
            </div>
          )}

          {phase === 'result' && (
            <Button size="lg" onClick={handleNewRound}>
              {t('blackjack.newRound')}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-surface p-5 text-center">
          <div className="text-[11px] uppercase tracking-wide text-white/40">
            {t('blackjack.balance')}
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-gold-soft">
            {balance.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <h3 className="mb-1 text-sm font-bold text-white/80">{t('blackjack.rules')}</h3>
          <p className="text-xs leading-relaxed text-white/45">{t('blackjack.rulesText')}</p>
        </div>
      </div>
    </div>
  )
}
