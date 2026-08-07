import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { existsSync } from 'node:fs'
import { handler, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  saveImage,
  getImage,
  deleteImage,
  serializeImage,
  imageAbsolutePath,
} from '../services/images.ts'
import { getTrade } from '../services/trades.ts'
import { getPlan } from '../services/plans.ts'

export const imagesRouter = Router()
imagesRouter.use(requireAuth)

// Images travel as base64 data URLs, so allow a larger body just here.
const uploadSchema = z.object({
  dataUrl: z.string().min(1).max(15_000_000),
  tradeId: z.string().uuid().nullable().optional(),
  planId: z.string().uuid().nullable().optional(),
  caption: z.string().trim().max(200).nullable().optional(),
})

imagesRouter.post(
  '/',
  express.json({ limit: '15mb' }),
  handler(async (req, res) => {
    const { dataUrl, tradeId, planId, caption } = parse(uploadSchema, req.body)
    // Ownership check on the target, if any.
    if (tradeId && !getTrade(req.user!.id, tradeId)) throw notFound('trade_not_found')
    if (planId && !getPlan(req.user!.id, planId)) throw notFound('plan_not_found')
    const image = saveImage(req.user!.id, dataUrl, { tradeId, planId, caption })
    res.status(201).json({ image: serializeImage(image) })
  }),
)

imagesRouter.get(
  '/:id/raw',
  handler(async (req, res) => {
    const row = getImage(req.user!.id, String(req.params.id))
    if (!row) throw notFound('image_not_found')
    const abs = imageAbsolutePath(row)
    if (!existsSync(abs)) throw notFound('file_missing')
    res.setHeader('Content-Type', row.mime)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.sendFile(abs)
  }),
)

imagesRouter.delete(
  '/:id',
  handler(async (req, res) => {
    if (!deleteImage(req.user!.id, String(req.params.id))) throw notFound('image_not_found')
    res.json({ ok: true })
  }),
)
