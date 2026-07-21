import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  soundEnabled: boolean
  reducedAnimations: boolean
  toggleSound: () => void
  toggleReducedAnimations: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      reducedAnimations: false,
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
      toggleReducedAnimations: () =>
        set((state) => ({ reducedAnimations: !state.reducedAnimations })),
    }),
    { name: 'lucky7_settings' },
  ),
)
