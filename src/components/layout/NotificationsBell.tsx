import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useRealtime } from '@/store/useRealtime'

interface Notif {
  id: string
  type: string
  title: string
  body: string | null
  read: number
  created_at: number
}

export function NotificationsBell() {
  const { t, i18n } = useTranslation()
  const unread = useRealtime((s) => s.unread)
  const setUnread = useRealtime((s) => s.setUnread)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api
      .get<{ unread: number }>('/engagement/notifications')
      .then(({ unread: u }) => setUnread(u))
      .catch(() => {})
  }, [setUnread])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      const { notifications } = await api.get<{ notifications: Notif[] }>('/engagement/notifications')
      setItems(notifications)
      if (unread > 0) {
        await api.post('/engagement/notifications/read').catch(() => {})
        setUnread(0)
      }
    }
  }

  const fmt = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  function body(n: Notif): string {
    if (!n.body) return ''
    if (/^\d+$/.test(n.body)) return `+${Number(n.body).toLocaleString('en-US')}`
    return t(n.body, { defaultValue: n.body })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-surface-2 text-base hover:border-gold/50 cursor-pointer"
        title={t('header.notifications')}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-magenta px-1 text-[10px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/12 bg-surface-2 shadow-glow-violet">
          <div className="border-b border-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white/50">
            {t('header.notifications')}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/35">
                {t('header.noNotifications')}
              </div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="flex items-start gap-3 border-b border-white/6 px-4 py-3 last:border-0">
                  <span className="text-lg">
                    {n.type === 'jackpot' ? '👑' : n.type === 'levelup' ? '⭐' : n.type === 'achievement' ? '🏆' : '🎁'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{t(n.title, { defaultValue: n.title })}</div>
                    {n.body && <div className="text-xs text-lilac">{body(n)}</div>}
                    <div className="mt-0.5 text-[10px] text-white/30">{fmt.format(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
