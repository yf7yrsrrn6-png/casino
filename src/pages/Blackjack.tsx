import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  createShoe,
  dealerShouldHit,
  handValue,
  isBlackjack,
  isBust,
  type PlayingCard,
} from '@/lib/blackjackEngine'
import { useCurrentWallet } from '@/store/useCurrentWallet'
import { CardView } from '@/components/blackjack/CardView'
import { Button } from '@/components/ui/Button'

const CHIPS = [25, 50, 100, 250, 500]

type Phase = 'betting' | 'player' | 'dealer' | 'result'
type ResultKey = 'youWin' | 'youLose' | 'push' | 'blackjack' | 'bust' | 'dealerBust'

export function Blackjack() {
  const { t } = useTranslation()
  const { isAuthenticated, balance, placeBet, registerWin } = useCurrentWallet()

  const [shoe, setShoe] = useState<PlayingCard[]>(() => createShoe())
  const [playerCards, setPlayerCards] = useState<PlayingCard[]>([])
  const [dealerCards, setDealerCards] = useState<PlayingCard[]>([])
  const [bet, setBet] = useState(CHIPS[1])
  const [activeBet, setActiveBet] = useState(0)
  const [phase, setPhase] = useState<Phase>('betting')
  const [result, setResult] = useState<{ key: ResultKey; amount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canDouble, setCanDouble] = useState(false)

  function draw(deck: PlayingCard[]): [PlayingCard, PlayingCard[]] {
    let working = deck
    if (working.length < 15) working = createShoe()
    const [card, ...rest] = working
    return [card, rest]
  }

  function settle(key: ResultKey, totalBet: number, multiplier: number) {
    const amount = Math.round(totalBet * multiplier)
    if (amount > 0) registerWin(amount, 'Blackjack')
    setResult({ key, amount: amount - totalBet })
    setPhase('result')
  }

  function resolveDealerTurn(playerHand: PlayingCard[], startingDealer: PlayingCard[], totalBet: number) {
    let dealerHand = [...startingDealer]
    let workingShoe = shoe

    while (dealerShouldHit(dealerHand)) {
      const [card, rest] = draw(workingShoe)
      dealerHand = [...dealerHand, card]
      workingShoe = rest
    }

    setDealerCards(dealerHand)
    setShoe(workingShoe)

    const playerTotal = handValue(playerHand).total
    const dealerTotal = handValue(dealerHand).total

    if (isBust(dealerHand)) {
      settle('dealerBust', totalBet, 2)
    } else if (dealerTotal > playerTotal) {
      settle('youLose', totalBet, 0)
    } else if (dealerTotal < playerTotal) {
      settle('youWin', totalBet, 2)
    } else {
      settle('push', totalBet, 1)
    }
  }

  function handleDeal() {
    setError(null)
    setResult(null)

    if (!isAuthenticated) {
      setError('loginToPlay')
      return
    }
    if (bet > balance || bet <= 0) {
      setError('insufficientFunds')
      return
    }
    if (!placeBet(bet, 'Blackjack')) {
      setError('insufficientFunds')
      return
    }

    let workingShoe = shoe.length < 15 ? createShoe() : shoe
    const p1 = workingShoe[0]
    const d1 = workingShoe[1]
    const p2 = workingShoe[2]
    const d2 = workingShoe[3]
    workingShoe = workingShoe.slice(4)

    const player = [p1, p2]
    const dealer = [d1, d2]

    setPlayerCards(player)
    setDealerCards(dealer)
    setShoe(workingShoe)
    setActiveBet(bet)
    setCanDouble(bet * 2 <= balance)

    if (isBlackjack(player)) {
      if (isBlackjack(dealer)) {
        setResult({ key: 'push', amount: 0 })
        registerWin(bet, 'Blackjack')
        setPhase('result')
      } else {
        registerWin(Math.round(bet * 2.5), 'Blackjack')
        setResult({ key: 'blackjack', amount: Math.round(bet * 1.5) })
        setPhase('result')
      }
      return
    }

    setPhase('player')
  }

  function handleHit() {
    const [card, rest] = draw(shoe)
    const next = [...playerCards, card]
    setPlayerCards(next)
    setShoe(rest)
    setCanDouble(false)

    if (isBust(next)) {
      setResult({ key: 'bust', amount: -activeBet })
      setPhase('result')
    }
  }

  function handleStand() {
    setPhase('dealer')
    resolveDealerTurn(playerCards, dealerCards, activeBet)
  }

  function handleDouble() {
    if (!placeBet(activeBet, 'Blackjack (double)')) return
    const newTotalBet = activeBet * 2
    setActiveBet(newTotalBet)

    const [card, rest] = draw(shoe)
    const next = [...playerCards, card]
    setPlayerCards(next)
    setShoe(rest)
    setCanDouble(false)

    if (isBust(next)) {
      setResult({ key: 'bust', amount: -newTotalBet })
      setPhase('result')
    } else {
      setPhase('dealer')
      resolveDealerTurn(next, dealerCards, newTotalBet)
    }
  }

  function handleNewRound() {
    setPlayerCards([])
    setDealerCards([])
    setResult(null)
    setError(null)
    setActiveBet(0)
    setPhase('betting')
  }

  const playerTotal = playerCards.length ? handValue(playerCards).total : 0
  const dealerTotal = dealerCards.length ? handValue(dealerCards).total : 0
  const dealerHideSecond = phase === 'player'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {t('blackjack.title')}
        </h1>
        <p className="mt-2 text-white/50">{t('blackjack.subtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border card-felt p-6 sm:p-10">
        {/* Dealer area */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
            {t('blackjack.dealer')}
            {phase !== 'betting' && !dealerHideSecond && (
              <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs text-gold-soft">
                {dealerTotal}
              </span>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3">
            {dealerCards.length === 0 && (
              <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
            )}
            {dealerCards.map((card, i) => (
              <CardView key={card.id} card={card} hidden={dealerHideSecond && i === 1} />
            ))}
          </div>
        </div>

        {/* Result banner */}
        {result && phase === 'result' && (
          <div
            className={`mb-8 rounded-2xl border px-5 py-4 text-center font-display text-lg font-bold ${
              result.amount > 0
                ? 'border-emerald/40 bg-emerald/10 text-emerald'
                : result.amount < 0
                  ? 'border-ruby/40 bg-ruby/10 text-ruby'
                  : 'border-border bg-white/5 text-white/70'
            }`}
          >
            {t(`blackjack.${result.key}`)}
            {result.amount !== 0 && (
              <span className="ml-2 font-mono">
                {result.amount > 0 ? '+' : ''}
                {result.amount} {t('common.currencyShort')}
              </span>
            )}
          </div>
        )}

        {/* Player area */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
            {t('blackjack.you')}
            {playerCards.length > 0 && (
              <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs text-gold-soft">
                {playerTotal}
              </span>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3">
            {playerCards.length === 0 && (
              <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 sm:h-28 sm:w-20" />
            )}
            {playerCards.map((card) => (
              <CardView key={card.id} card={card} />
            ))}
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
              ) : (
                <>
                  {t('blackjack.insufficientFunds')}{' '}
                  <Link to="/wallet" className="font-semibold underline">
                    {t('slots.goToWallet')}
                  </Link>
                </>
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
              <Button
                size="lg"
                onClick={handleDeal}
                disabled={bet <= 0 || (isAuthenticated && bet > balance)}
              >
                {t('blackjack.deal')} · {bet}
              </Button>
            </>
          )}

          {phase === 'player' && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={handleHit}>
                {t('blackjack.hit')}
              </Button>
              <Button variant="secondary" onClick={handleStand}>
                {t('blackjack.stand')}
              </Button>
              {canDouble && (
                <Button variant="secondary" onClick={handleDouble}>
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
        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          <div className="text-[11px] uppercase tracking-wide text-white/40">
            {t('blackjack.balance')}
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-gold-soft">
            {balance.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-1 text-sm font-bold text-white/80">{t('blackjack.rules')}</h3>
          <p className="text-xs leading-relaxed text-white/45">{t('blackjack.rulesText')}</p>
        </div>
      </div>
    </div>
  )
}
