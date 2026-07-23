import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { config } from './config.ts'
import './db/index.ts' // run migrations on boot
import { attachUser } from './middleware/auth.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { authRouter } from './routes/auth.ts'
import { walletRouter } from './routes/wallet.ts'
import { accountRouter } from './routes/account.ts'
import { slotsRouter } from './routes/slots.ts'
import { blackjackRouter } from './routes/blackjack.ts'
import { rouletteRouter } from './routes/roulette.ts'
import { paymentsRouter } from './routes/payments.ts'
import { adminRouter } from './routes/admin.ts'
import { SLOT_CONFIGS } from './games/slots.ts'

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '64kb' }))
app.use(cookieParser())
app.use(attachUser)

// A broad limiter as defense-in-depth; individual routes add tighter ones.
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, realMoneyEnabled: config.realMoneyEnabled })
})

// Authoritative game catalog (RTP etc.) — the client renders art, server owns math.
app.get('/api/games/catalog', (_req, res) => {
  res.json({
    slots: Object.values(SLOT_CONFIGS).map((c) => ({ id: c.id, rtp: c.rtp })),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/account', accountRouter)
app.use('/api/games/slots', slotsRouter)
app.use('/api/games/blackjack', blackjackRouter)
app.use('/api/games/roulette', rouletteRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/admin', adminRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

// In production the Express server also serves the built SPA and handles
// client-side routing by falling back to index.html.
const distDir = path.join(config.rootDir, 'dist')
if (config.isProd && existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback for client-side routes (Express 5 has no bare '*' route).
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(config.port, () => {
  console.log(`[server] TakeMyLucky API listening on http://localhost:${config.port}`)
  console.log(`[server] real-money cashier: ${config.realMoneyEnabled ? 'ENABLED' : 'disabled (demo credits)'}`)
})
