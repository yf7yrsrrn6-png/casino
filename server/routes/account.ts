import { Router } from 'express'
import { z } from 'zod'
import { db, now } from '../db/index.ts'
import { config } from '../config.ts'
import { handler, unauthorized } from '../lib/http.ts'
import { parse, passwordSchema } from '../lib/validate.ts'
import { verifyPassword } from '../lib/password.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  findById,
  updatePassword,
  setDisplayName,
  deleteUser,
  setSelfExclusion,
  publicUser,
} from '../services/accounts.ts'
import { getWallet, getLimits } from '../services/wallet.ts'
import { favoriteGame, listRounds } from '../services/rounds.ts'
import { publicSeedInfo, rotateSeed } from '../services/fairness.ts'

export const accountRouter = Router()
accountRouter.use(requireAuth)

accountRouter.get(
  '/profile',
  handler(async (req, res) => {
    const user = findById(req.user!.id)!
    const wallet = getWallet(user.id)
    res.json({
      user: publicUser(user),
      stats: {
        balance: wallet.balance,
        totalWagered: wallet.total_wagered,
        totalWon: wallet.total_won,
        gamesPlayed: wallet.games_played,
        favoriteGame: favoriteGame(user.id),
      },
      limits: getLimits(user.id),
    })
  }),
)

accountRouter.get(
  '/history',
  handler(async (req, res) => {
    res.json({ rounds: listRounds(req.user!.id, 50) })
  }),
)

const changePwSchema = z.object({ currentPassword: z.string(), newPassword: passwordSchema })
accountRouter.post(
  '/password',
  handler(async (req, res) => {
    const { currentPassword, newPassword } = parse(changePwSchema, req.body)
    const user = findById(req.user!.id)!
    if (!verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
      throw unauthorized('invalid_credentials')
    }
    updatePassword(user.id, newPassword)
    res.json({ ok: true })
  }),
)

const nameSchema = z.object({ displayName: z.string().trim().min(1).max(40) })
accountRouter.post(
  '/display-name',
  handler(async (req, res) => {
    const { displayName } = parse(nameSchema, req.body)
    setDisplayName(req.user!.id, displayName)
    res.json({ user: publicUser(findById(req.user!.id)!) })
  }),
)

// Responsible-gambling limits.
const limitsSchema = z.object({
  depositLimitDaily: z.number().int().positive().nullable().optional(),
  lossLimitDaily: z.number().int().positive().nullable().optional(),
  maxBet: z.number().int().positive().nullable().optional(),
})
accountRouter.put(
  '/limits',
  handler(async (req, res) => {
    const input = parse(limitsSchema, req.body)
    const existing = getLimits(req.user!.id)
    const next = {
      deposit: input.depositLimitDaily ?? existing?.deposit_limit_daily ?? null,
      loss: input.lossLimitDaily ?? existing?.loss_limit_daily ?? null,
      maxBet: input.maxBet ?? existing?.max_bet ?? null,
    }
    db.prepare(
      `INSERT INTO limits (user_id, deposit_limit_daily, loss_limit_daily, max_bet, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         deposit_limit_daily = excluded.deposit_limit_daily,
         loss_limit_daily = excluded.loss_limit_daily,
         max_bet = excluded.max_bet,
         updated_at = excluded.updated_at`,
    ).run(req.user!.id, next.deposit, next.loss, next.maxBet, now())
    res.json({ limits: getLimits(req.user!.id) })
  }),
)

// Self-exclusion / cool-off for a number of days (responsible gambling).
const exclusionSchema = z.object({ days: z.number().int().min(1).max(365) })
accountRouter.post(
  '/self-exclude',
  handler(async (req, res) => {
    const { days } = parse(exclusionSchema, req.body)
    const until = now() + days * 24 * 60 * 60 * 1000
    setSelfExclusion(req.user!.id, until)
    res.json({ selfExcludedUntil: until })
  }),
)

const deleteSchema = z.object({ password: z.string() })
accountRouter.post(
  '/delete',
  handler(async (req, res) => {
    const { password } = parse(deleteSchema, req.body)
    const user = findById(req.user!.id)!
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      throw unauthorized('invalid_credentials')
    }
    deleteUser(user.id) // cascades to wallet/transactions/rounds/etc.
    res.clearCookie(config.cookieName, { path: '/' })
    res.json({ ok: true })
  }),
)

// Provably-fair: view current commitment, or rotate to reveal the old server seed.
accountRouter.get(
  '/fairness',
  handler(async (req, res) => {
    res.json(publicSeedInfo(req.user!.id))
  }),
)

const rotateSchema = z.object({ clientSeed: z.string().trim().min(1).max(64).optional() })
accountRouter.post(
  '/fairness/rotate',
  handler(async (req, res) => {
    const { clientSeed } = parse(rotateSchema, req.body)
    const { revealed } = rotateSeed(req.user!.id, clientSeed)
    res.json({
      revealed: {
        serverSeed: revealed.server_seed,
        serverSeedHash: revealed.server_seed_hash,
        clientSeed: revealed.client_seed,
        nonce: revealed.nonce,
      },
      current: publicSeedInfo(req.user!.id),
    })
  }),
)
