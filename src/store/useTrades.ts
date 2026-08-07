import { create } from 'zustand'
import { api, type Trade, type TradeStats } from '@/lib/api'

export interface TradeFormInput {
  symbol: string
  direction: 'long' | 'short'
  status: 'open' | 'closed'
  entryPrice: number | null
  exitPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  size: number | null
  riskAmount: number | null
  pnl: number | null
  fees: number | null
  session: string | null
  setup: string | null
  plan: string | null
  notes: string | null
  rating: number | null
  tags: string[]
  timeframe: string | null
  emotion: string | null
  mistakes: string | null
  openedAt: number | null
  closedAt: number | null
}

interface TradesState {
  trades: Trade[]
  stats: TradeStats | null
  loaded: boolean
  loading: boolean
  editorOpen: boolean
  editing: Trade | null
  load: () => Promise<void>
  refreshStats: () => Promise<void>
  openEditor: (trade?: Trade | null) => void
  closeEditor: () => void
  save: (input: TradeFormInput, id?: string) => Promise<Trade>
  remove: (id: string) => Promise<void>
}

export const useTrades = create<TradesState>((set, get) => ({
  trades: [],
  stats: null,
  loaded: false,
  loading: false,
  editorOpen: false,
  editing: null,

  load: async () => {
    set({ loading: true })
    try {
      const [{ trades }, { stats }] = await Promise.all([
        api.get<{ trades: Trade[] }>('/trades'),
        api.get<{ stats: TradeStats }>('/trades/stats'),
      ])
      set({ trades, stats, loaded: true, loading: false })
    } catch {
      set({ loading: false, loaded: true })
    }
  },

  refreshStats: async () => {
    try {
      const { stats } = await api.get<{ stats: TradeStats }>('/trades/stats')
      set({ stats })
    } catch {
      /* ignore */
    }
  },

  openEditor: (trade = null) => set({ editorOpen: true, editing: trade }),
  closeEditor: () => set({ editorOpen: false, editing: null }),

  save: async (input, id) => {
    const { trade } = id
      ? await api.put<{ trade: Trade }>(`/trades/${id}`, input)
      : await api.post<{ trade: Trade }>('/trades', input)
    const trades = id
      ? get().trades.map((t) => (t.id === id ? trade : t))
      : [trade, ...get().trades]
    set({ trades })
    void get().refreshStats()
    return trade
  },

  remove: async (id) => {
    await api.del(`/trades/${id}`)
    set({ trades: get().trades.filter((t) => t.id !== id) })
    void get().refreshStats()
  },
}))
