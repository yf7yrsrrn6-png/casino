import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TransactionRecord, WalletData } from '@/types'

export const STARTING_BALANCE = 10000

function createWallet(): WalletData {
  return {
    balance: STARTING_BALANCE,
    transactions: [
      {
        id: crypto.randomUUID(),
        type: 'bonus',
        amount: STARTING_BALANCE,
        balanceAfter: STARTING_BALANCE,
        date: Date.now(),
      },
    ],
    totalWagered: 0,
    totalWon: 0,
    gamesPlayed: 0,
    createdAt: Date.now(),
  }
}

interface WalletState {
  wallets: Record<string, WalletData>
  ensureWallet: (email: string) => void
  removeWallet: (email: string) => void
  deposit: (email: string, amount: number) => void
  placeBet: (email: string, amount: number, label?: string) => boolean
  registerWin: (email: string, amount: number, label?: string) => void
  resetBalance: (email: string) => void
}

function pushTransaction(
  wallet: WalletData,
  record: Omit<TransactionRecord, 'id' | 'date'>,
): WalletData {
  const transaction: TransactionRecord = {
    ...record,
    id: crypto.randomUUID(),
    date: Date.now(),
  }
  return {
    ...wallet,
    transactions: [transaction, ...wallet.transactions].slice(0, 200),
  }
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallets: {},

      ensureWallet: (email) => {
        if (get().wallets[email]) return
        set((state) => ({
          wallets: { ...state.wallets, [email]: createWallet() },
        }))
      },

      removeWallet: (email) => {
        set((state) => {
          const wallets = { ...state.wallets }
          delete wallets[email]
          return { wallets }
        })
      },

      deposit: (email, amount) => {
        set((state) => {
          const wallet = state.wallets[email]
          if (!wallet) return state
          const balance = wallet.balance + amount
          const updated = pushTransaction(
            { ...wallet, balance },
            { type: 'deposit', amount, balanceAfter: balance },
          )
          return { wallets: { ...state.wallets, [email]: updated } }
        })
      },

      placeBet: (email, amount, label) => {
        const wallet = get().wallets[email]
        if (!wallet || wallet.balance < amount) return false
        set((state) => {
          const current = state.wallets[email]
          const balance = current.balance - amount
          const updated = pushTransaction(
            {
              ...current,
              balance,
              totalWagered: current.totalWagered + amount,
              gamesPlayed: current.gamesPlayed + 1,
            },
            { type: 'bet', amount: -amount, balanceAfter: balance, label },
          )
          return { wallets: { ...state.wallets, [email]: updated } }
        })
        return true
      },

      registerWin: (email, amount, label) => {
        if (amount <= 0) return
        set((state) => {
          const wallet = state.wallets[email]
          if (!wallet) return state
          const balance = wallet.balance + amount
          const updated = pushTransaction(
            { ...wallet, balance, totalWon: wallet.totalWon + amount },
            { type: 'win', amount, balanceAfter: balance, label },
          )
          return { wallets: { ...state.wallets, [email]: updated } }
        })
      },

      resetBalance: (email) => {
        set((state) => ({
          wallets: { ...state.wallets, [email]: createWallet() },
        }))
      },
    }),
    { name: 'lucky7_wallet' },
  ),
)
