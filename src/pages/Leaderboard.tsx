import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useSession } from '@/store/useSession'

interface Entry {
  userId: string
  displayName: string
  vipLevel: number
  wagered: number
  profit: number
  rounds: number
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const { t } = useTranslation()
  const me = useSession((s) => s.user)
  const [metric, setMetric] = useState<'wagered' | 'profit'>('wagered')
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    void api
      .get<{ entries: Entry[] }>(`/engagement/leaderboard?metric=${metric}`)
      .then(({ entries: e }) => setEntries(e))
      .catch(() => {})
  }, [metric])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🏆 {t('leaderboard.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('leaderboard.subtitle')}</p>
      </div>

      <div className="mb-5 flex gap-2.5">
        {(['wagered', 'profit'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
              metric === m
                ? 'bg-gradient-to-br from-gold to-magenta text-ink'
                : 'border border-white/12 bg-white/5 text-lilac hover:text-white'
            }`}
          >
            {m === 'wagered' ? t('leaderboard.byWagered') : t('leaderboard.byProfit')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3 w-14">{t('leaderboard.rank')}</th>
              <th className="px-4 py-3">{t('leaderboard.player')}</th>
              <th className="px-4 py-3 text-right">{t('leaderboard.wagered')}</th>
              <th className="px-4 py-3 text-right">{t('leaderboard.profit')}</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">{t('leaderboard.rounds')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                  {t('leaderboard.empty')}
                </td>
              </tr>
            )}
            {entries.map((e, i) => (
              <tr key={e.userId} className={e.userId === me?.id ? 'bg-gold/5' : 'hover:bg-white/[0.02]'}>
                <td className="px-4 py-3 text-center font-display text-lg">
                  {MEDALS[i] ?? <span className="text-white/40">{i + 1}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-white">{e.displayName}</span>
                  {e.userId === me?.id && (
                    <span className="ml-2 text-xs text-gold-soft">({t('leaderboard.you')})</span>
                  )}
                  <span className="ml-2 rounded bg-violet/15 px-1.5 py-0.5 text-[10px] font-bold text-violet">
                    ⭐{e.vipLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gold-soft">
                  {e.wagered.toLocaleString('en-US')}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${e.profit >= 0 ? 'text-emerald' : 'text-ruby'}`}
                >
                  {e.profit >= 0 ? '+' : ''}
                  {e.profit.toLocaleString('en-US')}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono text-white/50 sm:table-cell">
                  {e.rounds}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
