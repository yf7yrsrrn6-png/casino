export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message || code)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, err.error ?? 'request_failed', err.message, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
}

// ---- Shared response types ----
export interface ApiUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  selfExcludedUntil: number | null
  createdAt: number
  xp?: number
  vipLevel?: number
  referralCode?: string | null
}

export interface WalletSummary {
  balance: number
  totalWagered: number
  totalWon: number
  gamesPlayed: number
}

export interface ApiTransaction {
  id: string
  type: 'deposit' | 'bet' | 'win' | 'bonus' | 'adjustment' | 'refund'
  amount: number
  balance_after: number
  label: string | null
  created_at: number
}

export interface FairInfo {
  serverSeedHash: string
  clientSeed: string
  nonce: number
}
