import { create } from 'zustand'
import { api, type Settings } from '@/lib/api'

const DEFAULTS: Settings = {
  accountBalance: 10000,
  currency: 'USD',
  defaultRiskPct: 1,
  quickLinks: [],
  theme: 'dark',
}

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  save: (patch: Partial<Settings>) => Promise<void>
  applyTheme: (theme: 'light' | 'dark') => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const { settings } = await api.get<{ settings: Settings }>('/account/profile')
      set({ settings, loaded: true })
      get().applyTheme(settings.theme)
    } catch {
      set({ loaded: true })
    }
  },

  save: async (patch) => {
    const { settings } = await api.put<{ settings: Settings }>('/account/settings', patch)
    set({ settings })
    if (patch.theme) get().applyTheme(patch.theme)
  },

  applyTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('tj_theme', theme)
    } catch {
      /* ignore */
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#060708' : '#f5f6f8')
  },
}))
