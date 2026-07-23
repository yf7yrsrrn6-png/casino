import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { Button } from '@/components/ui/Button'

interface AdminStats {
  users: number
  admins: number
  banned: number
  creditsInPlay: number
  rounds: number
}

interface AdminUser {
  id: string
  email: string
  display_name: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  balance: number | null
  total_wagered: number | null
  games_played: number | null
}

interface Analytics {
  rounds: { day: string; rounds: number; wagered: number; payout: number }[]
  signups: { day: string; signups: number }[]
  byGame: { game: string; rounds: number; wagered: number; payout: number }[]
  jackpot: { amount: number; won_count: number }
}

function MiniBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data)
  return (
    <div className="flex h-16 items-end gap-1">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t"
          style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: color, minWidth: 3 }}
          title={String(v)}
        />
      ))}
    </div>
  )
}

export function Admin() {
  const { t } = useTranslation()
  const me = useSession((s) => s.user)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [query, setQuery] = useState('')
  const [adjustFor, setAdjustFor] = useState<AdminUser | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)

  const loadStats = useCallback(() => {
    void api.get<{ stats: AdminStats }>('/admin/stats').then(({ stats }) => setStats(stats)).catch(() => {})
    void api.get<Analytics>('/admin/analytics').then(setAnalytics).catch(() => {})
  }, [])

  const loadUsers = useCallback((q: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ''
    void api.get<{ users: AdminUser[] }>(`/admin/users${qs}`).then(({ users }) => setUsers(users)).catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    loadUsers('')
  }, [loadStats, loadUsers])

  async function submitAdjust() {
    if (!adjustFor) return
    const amount = Math.trunc(Number(adjustAmount))
    if (!amount) return
    await api.post(`/admin/users/${adjustFor.id}/adjust`, { amount, note: adjustNote || undefined })
    setAdjustFor(null)
    setAdjustAmount('')
    setAdjustNote('')
    loadStats()
    loadUsers(query)
  }

  async function toggleBan(u: AdminUser) {
    const status = u.status === 'banned' ? 'active' : 'banned'
    await api.post(`/admin/users/${u.id}/status`, { status })
    loadStats()
    loadUsers(query)
  }

  const statCards: [string, string | number][] = stats
    ? [
        [t('admin.statUsers'), stats.users],
        [t('admin.statAdmins'), stats.admins],
        [t('admin.statBanned'), stats.banned],
        [t('admin.statCredits'), stats.creditsInPlay.toLocaleString('en-US')],
        [t('admin.statRounds'), stats.rounds],
      ]
    : []

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          {t('admin.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('admin.subtitle')}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-surface p-5 text-center">
            <div className="font-display text-2xl font-extrabold text-gold-soft">{value}</div>
            <div className="mt-1 text-xs text-white/40">{label}</div>
          </div>
        ))}
      </div>

      {analytics && (
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/40">
              {t('admin.roundsPerDay')}
            </div>
            <MiniBars data={analytics.rounds.map((r) => r.rounds)} color="var(--color-violet)" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/40">
              {t('admin.wageredPerDay')}
            </div>
            <MiniBars data={analytics.rounds.map((r) => r.wagered)} color="var(--color-gold)" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/40">
              {t('admin.signupsPerDay')}
            </div>
            <MiniBars data={analytics.signups.map((s) => s.signups)} color="var(--color-emerald)" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-5 lg:col-span-3">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-white/40">
              {t('admin.byGame')}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {analytics.byGame.map((g) => {
                const edge = g.wagered > 0 ? ((g.wagered - g.payout) / g.wagered) * 100 : 0
                return (
                  <div key={g.game} className="rounded-xl bg-surface-2 p-3 text-center">
                    <div className="text-sm font-bold capitalize text-white">{g.game}</div>
                    <div className="mt-1 font-mono text-xs text-gold-soft">
                      {g.wagered.toLocaleString('en-US')}
                    </div>
                    <div className="text-[10px] text-mist">
                      {g.rounds} · {t('admin.edge')} {edge.toFixed(1)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadUsers(query)}
          placeholder={t('admin.search')}
          className="flex-1 rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold/50"
        />
        <Button variant="secondary" onClick={() => loadUsers(query)}>
          🔍
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">{t('admin.email')}</th>
              <th className="px-4 py-3">{t('admin.role')}</th>
              <th className="px-4 py-3">{t('admin.status')}</th>
              <th className="px-4 py-3 text-right">{t('admin.balance')}</th>
              <th className="px-4 py-3 text-right">{t('admin.wagered')}</th>
              <th className="px-4 py-3 text-right">{t('admin.played')}</th>
              <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                  {t('admin.noUsers')}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{u.display_name}</div>
                  <div className="text-xs text-mist">
                    {u.email}
                    {u.id === me?.id && <span className="ml-1 text-gold-soft">({t('admin.you')})</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={u.role === 'admin' ? 'text-gold-soft' : 'text-white/60'}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      u.status === 'banned' ? 'bg-ruby/20 text-ruby' : 'bg-emerald/15 text-emerald'
                    }`}
                  >
                    {u.status === 'banned' ? t('admin.bannedStatus') : t('admin.active')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gold-soft">
                  {(u.balance ?? 0).toLocaleString('en-US')}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white/60">
                  {(u.total_wagered ?? 0).toLocaleString('en-US')}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white/60">{u.games_played ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setAdjustFor(u)}
                      className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-semibold text-lilac hover:text-white cursor-pointer"
                    >
                      {t('admin.adjust')}
                    </button>
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => toggleBan(u)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          u.status === 'banned'
                            ? 'bg-emerald/15 text-emerald'
                            : 'bg-ruby/15 text-ruby'
                        }`}
                      >
                        {u.status === 'banned' ? t('admin.unban') : t('admin.ban')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjustFor && (
        <div
          onClick={() => setAdjustFor(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/12 bg-surface p-6"
          >
            <h3 className="font-display text-lg font-bold text-white">{t('admin.adjustTitle')}</h3>
            <p className="mt-1 text-sm text-mist">{adjustFor.email}</p>
            <input
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder={t('admin.adjustAmount')}
              className="mt-4 w-full rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50"
            />
            <input
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder={t('admin.note')}
              className="mt-3 w-full rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdjustFor(null)}>
                {t('admin.cancel')}
              </Button>
              <Button onClick={submitAdjust} disabled={!Number(adjustAmount)}>
                {t('admin.apply')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
