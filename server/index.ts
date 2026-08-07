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
import { accountRouter } from './routes/account.ts'
import { tradesRouter } from './routes/trades.ts'
import { plansRouter } from './routes/plans.ts'
import { imagesRouter } from './routes/images.ts'

const app = express()
app.set('trust proxy', 1)
app.use(securityHeaders)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(attachUser)

// Defense-in-depth: broad limiter + CSRF origin check on API mutations.
app.use('/api', rateLimit({ windowMs: 60_000, max: 600 }))
app.use('/api', sameOriginMutations)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)
app.use('/api/account', accountRouter)
app.use('/api/trades', tradesRouter)
app.use('/api/plans', plansRouter)
app.use('/api/images', imagesRouter)

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

server.listen(config.port, () => {
  console.log(`[server] Trading Journal listening on http://localhost:${config.port}`)
})
