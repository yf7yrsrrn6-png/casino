import { Router } from 'express'
import { handler, ApiError } from '../lib/http.ts'
import { requireAuth } from '../middleware/auth.ts'
import { paymentsStatus, getPaymentProvider } from '../services/payments.ts'

export const paymentsRouter = Router()

// Public: lets the UI show whether real cashier is live or demo-only.
paymentsRouter.get(
  '/status',
  handler(async (_req, res) => {
    res.json(paymentsStatus)
  }),
)

paymentsRouter.use(requireAuth)

// These endpoints exist so a licensed provider can be dropped in later. Until
// REAL_MONEY_ENABLED is true they always report the cashier as unavailable.
paymentsRouter.post(
  '/deposit-intent',
  handler(async (_req, res) => {
    if (!paymentsStatus.realMoneyEnabled) {
      throw new ApiError(
        503,
        'real_money_disabled',
        'Real-money cashier is not enabled. This build uses demo credits only.',
      )
    }
    void getPaymentProvider()
    res.json({ ok: true })
  }),
)

paymentsRouter.post(
  '/withdraw',
  handler(async (_req, res) => {
    if (!paymentsStatus.realMoneyEnabled) {
      throw new ApiError(
        503,
        'real_money_disabled',
        'Withdrawals require the licensed cashier, which is not enabled in this build.',
      )
    }
    res.json({ ok: true })
  }),
)
