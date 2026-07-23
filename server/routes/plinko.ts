import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { dropPlinko } from '../games/plinko.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const plinkoRouter = Router()
plinkoRouter.use(requireAuth, requirePlayable)

const schema = z.object({
  bet: z.number().int().positive().max(1_000_000),
  risk: z.enum(['low', 'medium', 'high']),
})

plinkoRouter.post(
  '/drop',
  handler(async (req, res) => {
    const { bet, risk } = parse(schema, req.body)
    const wallet = getWallet(req.user!.id)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, bet)

    const { next, meta } = nextRandom(req.user!.id)
    const result = dropPlinko(bet, risk, next)

    settleRound({ userId: req.user!.id, bet, payout: result.payout, label: 'plinko' })
    recordRound({
      userId: req.user!.id,
      game: 'plinko',
      gameId: 'plinko',
      bet,
      payout: result.payout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })
    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'plinko',
      gameId: 'plinko',
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
