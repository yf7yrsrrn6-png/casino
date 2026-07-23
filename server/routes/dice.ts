import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { rollDice, MIN_TARGET, MAX_TARGET } from '../games/dice.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const diceRouter = Router()
diceRouter.use(requireAuth, requirePlayable)

const schema = z.object({
  bet: z.number().int().positive().max(1_000_000),
  target: z.number().int().min(MIN_TARGET).max(MAX_TARGET),
  direction: z.enum(['under', 'over']),
})

diceRouter.post(
  '/roll',
  handler(async (req, res) => {
    const { bet, target, direction } = parse(schema, req.body)
    const wallet = getWallet(req.user!.id)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, bet)

    const { next, meta } = nextRandom(req.user!.id)
    const result = rollDice(bet, target, direction, next())

    settleRound({ userId: req.user!.id, bet, payout: result.payout, label: 'dice' })
    recordRound({
      userId: req.user!.id,
      game: 'dice',
      gameId: 'dice',
      bet,
      payout: result.payout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })
    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'dice',
      gameId: 'dice',
      bet,
      payout: result.payout,
    })

    res.json({
      result,
      balance: extras.balance,
      fair: { ...publicSeedInfo(req.user!.id), nonce: meta.nonce },
    })
  }),
)
