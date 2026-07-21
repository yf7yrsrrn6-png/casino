import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hashPassword } from '@/lib/hash'
import type { AccountRecord } from '@/types'

interface AuthState {
  accounts: Record<string, AccountRecord>
  currentUserEmail: string | null
  register: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  changePassword: (
    current: string,
    next: string,
  ) => Promise<{ ok: boolean; error?: string }>
  deleteAccount: () => void
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: {},
      currentUserEmail: null,

      register: async (email, password) => {
        const normalized = normalizeEmail(email)
        if (get().accounts[normalized]) {
          return { ok: false, error: 'errorUserExists' }
        }
        const passwordHash = await hashPassword(password)
        set((state) => ({
          accounts: {
            ...state.accounts,
            [normalized]: { passwordHash, createdAt: Date.now() },
          },
          currentUserEmail: normalized,
        }))
        return { ok: true }
      },

      login: async (email, password) => {
        const normalized = normalizeEmail(email)
        const account = get().accounts[normalized]
        if (!account) {
          return { ok: false, error: 'errorInvalidCredentials' }
        }
        const passwordHash = await hashPassword(password)
        if (passwordHash !== account.passwordHash) {
          return { ok: false, error: 'errorInvalidCredentials' }
        }
        set({ currentUserEmail: normalized })
        return { ok: true }
      },

      logout: () => set({ currentUserEmail: null }),

      changePassword: async (current, next) => {
        const email = get().currentUserEmail
        if (!email) return { ok: false, error: 'errorInvalidCredentials' }
        const account = get().accounts[email]
        const currentHash = await hashPassword(current)
        if (!account || currentHash !== account.passwordHash) {
          return { ok: false, error: 'errorInvalidCredentials' }
        }
        const nextHash = await hashPassword(next)
        set((state) => ({
          accounts: {
            ...state.accounts,
            [email]: { ...account, passwordHash: nextHash },
          },
        }))
        return { ok: true }
      },

      deleteAccount: () => {
        const email = get().currentUserEmail
        if (!email) return
        set((state) => {
          const accounts = { ...state.accounts }
          delete accounts[email]
          return { accounts, currentUserEmail: null }
        })
      },
    }),
    { name: 'lucky7_auth' },
  ),
)
