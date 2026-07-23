import { z } from 'zod'
import { badRequest } from './http.ts'

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const first = result.error.issues[0]
    throw badRequest('validation_error', first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input')
  }
  return result.data
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const passwordSchema = z.string().min(6).max(200)
export const betSchema = z.number().int().positive().max(1_000_000)
