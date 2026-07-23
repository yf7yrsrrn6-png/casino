import { Router } from 'express'
import { z } from 'zod'
import { handler, badRequest, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { SLOT_CONFIGS, spinSlot } from '../games/slots.ts'
import { assertBetAllowed, getWallet, settleRound } from '../services/wallet.ts'
import { nextRandom, publicSeedInfo } from '../services/fairness.ts'
import { recordRound } from '../services/rounds.ts'

export const slotsRouter = Router()
slotsRouter.use(requireAuth, requirePlayable)

const spinSchema = z.object({
  gameId: z.string().min(1).max(64),
  bet: z.number().int().positive().max(1_000_000),
})

slotsRouter.post(
  '/spin',
  handler(async (req, res) => {
    const { gameId, bet } = parse(spinSchema, req.body)
    const cfg = SLOT_CONFIGS[gameId]
    if (!cfg) throw notFound('unknown_game')

    const wallet = getWallet(req.user!.id)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')
    assertBetAllowed(req.user!.id, bet)

    const { next, meta } = nextRandom(req.user!.id)
    const result = spinSlot(cfg, bet, next)

    settleRound({ userId: req.user!.id, bet, payout: result.totalWin, label: gameId })
    recordRound({
      userId: req.user!.id,
      game: 'slots',
      gameId,
      bet,
      payout: result.totalWin,
      outcome: result,
      fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
    })

    const updated = getWallet(req.user!.id)
    res.json({
      result,
      balance: updated.balance,
      fair: { ...publicSeedInfo(req.user!.id), nonce: meta.nonce },
    })
  }),
)
