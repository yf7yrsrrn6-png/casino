import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useRealtime } from '@/store/useRealtime'

/** Opens the realtime connection, seeds the jackpot, and renders live toasts. */
export function RealtimeProvider() {
  const { t } = useTranslation()
  const connect = useRealtime((s) => s.connect)
  const setJackpot = useRealtime((s) => s.setJackpot)
  const toasts = useRealtime((s) => s.toasts)
  const dismissToast = useRealtime((s) => s.dismissToast)

  useEffect(() => {
    connect()
    void api
      .get<{ amount: number }>('/engagement/jackpot')
      .then(({ amount }) => setJackpot(amount))
      .catch(() => {})
  }, [connect, setJackpot])

  // Auto-dismiss toasts after a few seconds.
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), 5000),
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9998] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto animate-coin rounded-2xl border p-4 shadow-glow-violet backdrop-blur-md ${
            toast.kind === 'jackpot'
              ? 'border-gold/50 bg-gold/15'
              : 'border-white/12 bg-surface-2/95'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">
              {toast.kind === 'jackpot' ? '👑' : toast.kind === 'win' ? '🎉' : '🔔'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white">{t(toast.title)}</div>
              {toast.body && (
                <div className="truncate text-xs text-lilac">
                  {/^\d+$/.test(toast.body) ? `+${Number(toast.body).toLocaleString('en-US')}` : t(toast.body, { defaultValue: toast.body })}
                </div>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/40 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
