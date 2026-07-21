import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore, STARTING_BALANCE } from '@/store/walletStore'

const EMPTY_WALLET = {
  balance: 0,
  transactions: [],
  totalWagered: 0,
  totalWon: 0,
  gamesPlayed: 0,
  createdAt: 0,
}

export function useCurrentWallet() {
  const email = useAuthStore((s) => s.currentUserEmail)
  const ensureWallet = useWalletStore((s) => s.ensureWallet)
  const wallet = useWalletStore((s) => (email ? s.wallets[email] : undefined))
  const deposit = useWalletStore((s) => s.deposit)
  const placeBet = useWalletStore((s) => s.placeBet)
  const registerWin = useWalletStore((s) => s.registerWin)
  const resetBalance = useWalletStore((s) => s.resetBalance)

  useEffect(() => {
    if (email) ensureWallet(email)
  }, [email, ensureWallet])

  const data = wallet ?? EMPTY_WALLET

  return {
    isAuthenticated: Boolean(email),
    email,
    ...data,
    deposit: (amount: number) => email && deposit(email, amount),
    placeBet: (amount: number, label?: string) =>
      email ? placeBet(email, amount, label) : false,
    registerWin: (amount: number, label?: string) =>
      email && registerWin(email, amount, label),
    resetBalance: () => email && resetBalance(email),
    startingBalance: STARTING_BALANCE,
  }
}
