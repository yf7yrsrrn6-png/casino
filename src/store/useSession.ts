import { create } from 'zustand'
import { api, ApiError, type ApiUser } from '@/lib/api'

interface SessionState {
  user: ApiUser | null
  ready: boolean // true once the initial /me check has completed
  bootstrap: () => Promise<void>
  register: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ ok: boolean; error?: string }>
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  setUser: (user: ApiUser | null) => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,

  bootstrap: async () => {
    try {
      const { user } = await api.get<{ user: ApiUser }>('/auth/me')
      set({ user, ready: true })
    } catch {
      set({ user: null, ready: true })
    }
  },

  register: async (email, password, displayName) => {
    try {
      const { user } = await api.post<{ user: ApiUser }>('/auth/register', {
        email,
        password,
        displayName,
      })
      set({ user })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.code : 'request_failed' }
    }
  },

  login: async (email, password) => {
    try {
      const { user } = await api.post<{ user: ApiUser }>('/auth/login', { email, password })
      set({ user })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.code : 'request_failed' }
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      set({ user: null })
    }
  },

  setUser: (user) => set({ user }),
}))
