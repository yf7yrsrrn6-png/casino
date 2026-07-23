import { create } from 'zustand'
import { api, type ApiTransaction, type WalletSummary } from '@/lib/api'

interface WalletState extends WalletSummary {
  transactions: ApiTransaction[]
  loaded: boolean
  refresh: () => Promise<void>
  deposit: (amount: number) => Promise<void>
  reset: () => Promise<void>
  setBalance: (balance: number) => void
  clear: () => void
}

const EMPTY: WalletSummary = { balance: 0, totalWagered: 0, totalWon: 0, gamesPlayed: 0 }

export const useWallet = create<WalletState>((set) => ({
  ...EMPTY,
  transactions: [],
  loaded: false,

  refresh: async () => {
    const { wallet, transactions } = await api.get<{
      wallet: WalletSummary
      transactions: ApiTransaction[]
    }>('/wallet')
    set({ ...wallet, transactions, loaded: true })
  },

  deposit: async (amount) => {
    const { wallet, transactions } = await api.post<{
      wallet: WalletSummary
      transactions: ApiTransaction[]
    }>('/wallet/deposit', { amount })
    set({ ...wallet, transactions, loaded: true })
  },

  reset: async () => {
    const { wallet, transactions } = await api.post<{
      wallet: WalletSummary
      transactions: ApiTransaction[]
    }>('/wallet/reset')
    set({ ...wallet, transactions, loaded: true })
  },

  // Games return an authoritative balance; reflect it immediately, aggregates
  // refresh on the next full load (wallet/profile pages call refresh()).
  setBalance: (balance) => set({ balance }),

  clear: () => set({ ...EMPTY, transactions: [], loaded: false }),
}))
