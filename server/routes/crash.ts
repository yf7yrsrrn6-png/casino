import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { settleCrash, MAX_MULTIPLIER } from '../games/crash.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const crashRouter = Router()
crashRouter.use(requireAuth, requirePlayable)

const betSchema = z.object({
  bet: z.number().int().positive().max(1_000_000),
  target: z.number().min(1.01).max(MAX_MULTIPLIER),
})

crashRouter.post(
  '/bet',
  handler(async (req, res) => {
    const { bet, target } = parse(betSchema, req.body)
    const roundedTarget = Math.floor(target * 100) / 100

    const wallet = getWallet(req.user!.id)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, bet)

    const { next, meta } = nextRandom(req.user!.id)
    const result = settleCrash(bet, roundedTarget, next())

    settleRound({ userId: req.user!.id, bet, payout: result.payout, label: 'crash' })
    recordRound({
      userId: req.user!.id,
      game: 'crash',
      gameId: 'crash',
      bet,
      payout: result.payout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })
    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'crash',
      gameId: 'crash',
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
