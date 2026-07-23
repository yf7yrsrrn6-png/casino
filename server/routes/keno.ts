import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { playKeno, KENO_POOL, KENO_MAX_PICKS } from '../games/keno.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'
import { afterRound } from '../services/gameplay.ts'

export const kenoRouter = Router()
kenoRouter.use(requireAuth, requirePlayable)

const schema = z.object({
  bet: z.number().int().positive().max(1_000_000),
  picks: z.array(z.number().int().min(1).max(KENO_POOL)).min(1).max(KENO_MAX_PICKS),
})

kenoRouter.post(
  '/play',
  handler(async (req, res) => {
    const { bet, picks } = parse(schema, req.body)
    const unique = [...new Set(picks)]
    if (unique.length !== picks.length) throw badRequest('duplicate_picks')

    const wallet = getWallet(req.user!.id)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, bet)

    const { next, meta } = nextRandom(req.user!.id)
    const result = playKeno(bet, unique, next)

    settleRound({ userId: req.user!.id, bet, payout: result.payout, label: 'keno' })
    recordRound({
      userId: req.user!.id,
      game: 'keno',
      gameId: 'keno',
      bet,
      payout: result.payout,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })
    const extras = afterRound({
      userId: req.user!.id,
      displayName: req.user!.displayName,
      game: 'keno',
      gameId: 'keno',
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
