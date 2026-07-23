import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { playBaccarat } from '../games/baccarat.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const baccaratRouter = Router()
baccaratRouter.use(requireAuth, requirePlayable)

const dealSchema = z.object({
  bets: z.object({
    player: z.number().int().nonnegative().max(1_000_000).optional(),
    banker: z.number().int().nonnegative().max(1_000_000).optional(),
    tie: z.number().int().nonnegative().max(1_000_000).optional(),
  }),
})

baccaratRouter.post(
  '/deal',
  handler(async (req, res) => {
    const { bets } = parse(dealSchema, req.body)
    const stake = (bets.player ?? 0) + (bets.banker ?? 0) + (bets.tie ?? 0)
    if (stake <= 0) throw badRequest('no_bet')

    const wallet = getWallet(req.user!.id)
    if (wallet.balance < stake) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, stake)

    const { next, meta } = nextRandom(req.user!.id)
    const result = playBaccarat(bets, next)

    settleRound({ userId: req.user!.id, bet: stake, payout: result.totalPayout, label: 'baccarat' })
    recordRound({
      userId: req.user!.id,
      game: 'baccarat',
      gameId: 'baccarat',
      bet: stake,
      payout: result.totalPayout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })
    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'baccarat',
      gameId: 'baccarat',
      bet: stake,
      payout: result.totalPayout,
    })

    res.json({
      result,
      balance: extras.balance,
      fair: { ...publicSeedInfo(req.user!.id), nonce: meta.nonce },
    })
  }),
)
