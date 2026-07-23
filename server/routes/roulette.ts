import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { spinRoulette, validateBet, type RouletteBet } from '../games/roulette.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const rouletteRouter = Router()
rouletteRouter.use(requireAuth, requirePlayable)

const betSchema = z.object({
  type: z.enum(['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'column']),
  value: z.number().int().optional(),
  amount: z.number().int().positive().max(1_000_000),
})
const spinSchema = z.object({ bets: z.array(betSchema).min(1).max(20) })

rouletteRouter.post(
  '/spin',
  handler(async (req, res) => {
    const { bets } = parse(spinSchema, req.body)
    if (!bets.every((b) => validateBet(b as RouletteBet))) throw badRequest('invalid_bet')

    const totalStake = bets.reduce((sum, b) => sum + b.amount, 0)
    const wallet = getWallet(req.user!.id)
    if (wallet.balance < totalStake) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, totalStake)

    const { next, meta } = nextRandom(req.user!.id)
    const result = spinRoulette(bets as RouletteBet[], next)

    settleRound({
      userId: req.user!.id,
      bet: totalStake,
      payout: result.totalPayout,
      label: 'roulette',
    })
    recordRound({
      userId: req.user!.id,
      game: 'roulette',
      gameId: 'roulette',
      bet: totalStake,
      payout: result.totalPayout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })

    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'roulette',
      gameId: 'roulette',
      bet: totalStake,
      payout: result.totalPayout,
    })

    res.json({
      result,
      balance: extras.balance,
      fair: { ...publicSeedInfo(req.user!.id), nonce: meta.nonce },
    })
  }),
)
