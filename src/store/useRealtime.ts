import { create } from 'zustand'
import { useWallet } from '@/store/useWallet'

export interface WinItem {
  id: string
  user: string
  amount: number
  game: string
  jackpot?: boolean
}

export interface ToastItem {
  id: string
  title: string
  body?: string
  kind: 'notification' | 'jackpot' | 'win'
}

interface RealtimeState {
  connected: boolean
  online: number
  jackpot: number
  wins: WinItem[]
  unread: number
  toasts: ToastItem[]
  connect: () => void
  setJackpot: (n: number) => void
  setUnread: (n: number) => void
  dismissToast: (id: string) => void
}

let socket: WebSocket | null = null
let reconnectTimer: number | null = null

export const useRealtime = create<RealtimeState>((set, get) => ({
  connected: false,
  online: 0,
  jackpot: 0,
  wins: [],
  unread: 0,
  toasts: [],

  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    socket = ws

    ws.onopen = () => set({ connected: true })

    ws.onmessage = (ev) => {
      let msg: { type: string; [k: string]: unknown }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'online':
          set({ online: Number(msg.count) || 0 })
          break
        case 'jackpot':
          set({ jackpot: Number(msg.amount) || 0 })
          break
        case 'win':
          set((s) => ({
            wins: [
              {
                id: crypto.randomUUID(),
                user: String(msg.user),
                amount: Number(msg.amount),
                game: String(msg.game),
              },
              ...s.wins,
            ].slice(0, 30),
          }))
          break
        case 'jackpotWin':
          set((s) => ({
            wins: [
              {
                id: crypto.randomUUID(),
                user: String(msg.user),
                amount: Number(msg.amount),
                game: String(msg.game),
                jackpot: true,
              },
              ...s.wins,
            ].slice(0, 30),
            toasts: [
              ...s.toasts,
              { id: crypto.randomUUID(), title: 'notif.jackpotTitle', body: String(msg.amount), kind: 'jackpot' },
            ],
          }))
          break
        case 'unread':
          set({ unread: Number(msg.unread) || 0 })
          break
        case 'notification': {
          const notif = msg.notification as { title: string; body?: string } | undefined
          set((s) => ({
            unread: Number(msg.unread) || s.unread + 1,
            toasts: notif
              ? [
                  ...s.toasts,
                  { id: crypto.randomUUID(), title: notif.title, body: notif.body, kind: 'notification' },
                ]
              : s.toasts,
          }))
          // A balance-affecting notification (bonus/jackpot) — refresh the wallet.
          void useWallet.getState().refresh().catch(() => {})
          break
        }
      }
    }

    const scheduleReconnect = () => {
      set({ connected: false })
      if (reconnectTimer) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        get().connect()
      }, 2500)
    }
    ws.onclose = scheduleReconnect
    ws.onerror = () => ws.close()
  },

  setJackpot: (n) => set({ jackpot: n }),
  setUnread: (n) => set({ unread: n }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
