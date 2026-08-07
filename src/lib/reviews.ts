import type { Trade } from '@/lib/api'
import { money, formatDate } from '@/lib/format'

function net(t: Trade) {
  return (t.pnl ?? 0) - (t.fees ?? 0)
}

export const PLAYBOOK_TEMPLATE = `## Ідея
Опишіть суть сетапу — що це і чому працює.

## Умови входу
- Ринок / контекст:
- Тригер входу:
- Таймфрейми:

## Інвалідація
- Коли сетап НЕ валідний / де ставлю стоп:

## Управління ризиком
- Ризик на угоду:
- Цільовий R:R:
- Часткові фіксації:

## Приклади
Додайте скріншоти вдалих і невдалих прикладів нижче.
`

/** Build a review markdown pre-filled with the period's real numbers. */
export function buildReviewContent(trades: Trade[], sinceDays: number, currency: string): string {
  const since = Date.now() - sinceDays * 86400_000
  const closed = trades.filter(
    (t) => t.status === 'closed' && (t.closedAt ?? t.createdAt) >= since,
  )
  const wins = closed.filter((t) => net(t) > 0)
  const losses = closed.filter((t) => net(t) < 0)
  const netPnl = closed.reduce((s, t) => s + net(t), 0)
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const rVals = closed.map((t) => t.rr).filter((r): r is number => r != null)
  const avgR = rVals.length ? rVals.reduce((s, r) => s + r, 0) / rVals.length : null
  const best = closed.reduce((m, t) => Math.max(m, net(t)), 0)
  const worst = closed.reduce((m, t) => Math.min(m, net(t)), 0)

  // Top setups by net P&L.
  const bySetup = new Map<string, { n: number; net: number }>()
  for (const t of closed) {
    const k = t.setup || '—'
    const g = bySetup.get(k) ?? { n: 0, net: 0 }
    g.n++
    g.net += net(t)
    bySetup.set(k, g)
  }
  const topSetups = [...bySetup.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .slice(0, 5)
    .map(([k, v]) => `- ${k}: ${money(v.net, currency, true)} (${v.n} угод)`)
    .join('\n')

  return `_Період: ${formatDate(since)} – ${formatDate(Date.now())}_

## Підсумок
- Угод: ${closed.length} (Пв ${wins.length} / Зб ${losses.length})
- Вінрейт: ${winRate.toFixed(1)}%
- Чистий P&L: ${money(netPnl, currency, true)}
- Середній R: ${avgR != null ? `${avgR > 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—'}
- Найкраща: ${money(best, currency, true)} · Найгірша: ${money(worst, currency, true)}

## Найкращі сетапи
${topSetups || '- (немає даних)'}

## Що працювало


## Помилки / чого уникати


## Цілі на наступний період
-
`
}
