import express from 'express'
import cookieParser from 'cookie-parser'
import { createServer } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { config } from './config.ts'
import './db/index.ts' // run migrations on boot
import { attachUser } from './middleware/auth.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { securityHeaders, sameOriginMutations } from './middleware/security.ts'
import { authRouter } from './routes/auth.ts'
import { walletRouter } from './routes/wallet.ts'
import { accountRouter } from './routes/account.ts'
import { slotsRouter } from './routes/slots.ts'
import { blackjackRouter } from './routes/blackjack.ts'
import { rouletteRouter } from './routes/roulette.ts'
import { baccaratRouter } from './routes/baccarat.ts'
import { crashRouter } from './routes/crash.ts'
import { diceRouter } from './routes/dice.ts'
import { plinkoRouter } from './routes/plinko.ts'
import { kenoRouter } from './routes/keno.ts'
import { engagementRouter } from './routes/engagement.ts'
import { paymentsRouter } from './routes/payments.ts'
import { adminRouter } from './routes/admin.ts'
import { SLOT_CONFIGS } from './games/slots.ts'
import { initRealtime, onlineCount } from './realtime/hub.ts'
import { getJackpot } from './services/jackpot.ts'
import { unreadCount } from './services/notifications.ts'
import { bootstrapData } from './services/bootstrap.ts'

bootstrapData()

const app = express()
app.set('trust proxy', 1)
app.use(securityHeaders)
app.use(express.json({ limit: '64kb' }))
app.use(cookieParser())
app.use(attachUser)

// Defense-in-depth: broad limiter + CSRF origin check on API mutations.
app.use('/api', rateLimit({ windowMs: 60_000, max: 600 }))
app.use('/api', sameOriginMutations)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, realMoneyEnabled: config.realMoneyEnabled, online: onlineCount() })
})

app.get('/api/games/catalog', (_req, res) => {
  res.json({
    slots: Object.values(SLOT_CONFIGS).map((c) => ({ id: c.id, rtp: c.rtp })),
    tables: ['blackjack', 'roulette', 'baccarat', 'crash', 'dice', 'plinko', 'keno'],
  })
})

app.use('/api/auth', authRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/account', accountRouter)
app.use('/api/games/slots', slotsRouter)
app.use('/api/games/blackjack', blackjackRouter)
app.use('/api/games/roulette', rouletteRouter)
app.use('/api/games/baccarat', baccaratRouter)
app.use('/api/games/crash', crashRouter)
app.use('/api/games/dice', diceRouter)
app.use('/api/games/plinko', plinkoRouter)
app.use('/api/games/keno', kenoRouter)
app.use('/api/engagement', engagementRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/admin', adminRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

const distDir = path.join(config.rootDir, 'dist')
if (config.isProd && existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const server = createServer(app)

// Realtime: send each new socket a snapshot of live state.
initRealtime(server, ({ userId }) => {
  const events: { type: string; [k: string]: unknown }[] = [
    { type: 'jackpot', amount: getJackpot() },
    { type: 'online', count: onlineCount() },
  ]
  if (userId) events.push({ type: 'unread', unread: unreadCount(userId) })
  return events
})

server.listen(config.port, () => {
  console.log(`[server] TakeMyLucky listening on http://localhost:${config.port}`)
  console.log(
    `[server] real-money cashier: ${config.realMoneyEnabled ? 'ENABLED' : 'disabled (demo credits)'}`,
  )
})
