import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.ts'
import { handler, forbidden } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  getWallet,
  deposit,
  resetToStarting,
  listTransactions,
  getLimits,
} from '../services/wallet.ts'

export const walletRouter = Router()
walletRouter.use(requireAuth)

function walletPayload(userId: string) {
  const w = getWallet(userId)
  return {
    balance: w.balance,
    totalWagered: w.total_wagered,
    totalWon: w.total_won,
    gamesPlayed: w.games_played,
  }
}

walletRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({
      wallet: walletPayload(req.user!.id),
      transactions: listTransactions(req.user!.id, 100),
    })
  }),
)

const depositSchema = z.object({ amount: z.number().int().positive().max(1_000_000) })

// Demo top-up. Real cash deposits are handled by the payments router and are
// disabled until a licensed provider is wired in (config.realMoneyEnabled).
walletRouter.post(
  '/deposit',
  handler(async (req, res) => {
    const { amount } = parse(depositSchema, req.body)
    const limits = getLimits(req.user!.id)
    if (limits?.deposit_limit_daily != null && amount > limits.deposit_limit_daily) {
      throw forbidden('deposit_over_limit', `Exceeds your daily deposit limit of ${limits.deposit_limit_daily}.`)
    }
    deposit(req.user!.id, amount, 'deposit', 'demo_topup')
    res.json({ wallet: walletPayload(req.user!.id), transactions: listTransactions(req.user!.id, 100) })
  }),
)

walletRouter.post(
  '/reset',
  handler(async (req, res) => {
    resetToStarting(req.user!.id)
    res.json({
      wallet: walletPayload(req.user!.id),
      transactions: listTransactions(req.user!.id, 100),
      startingBalance: config.startingBalance,
    })
  }),
)
