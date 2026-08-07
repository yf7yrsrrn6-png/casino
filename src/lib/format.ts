const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  UAH: '₴',
  JPY: '¥',
  PLN: 'zł',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code] ?? `${code} `
}

/** Money with a sign, e.g. +$1,240.50 / −$320.00 */
export function money(value: number | null | undefined, currency = 'USD', signed = false): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sym = currencySymbol(currency)
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const sign = value < 0 ? '−' : signed ? '+' : ''
  return `${sign}${sym}${formatted}`
}

export function num(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

/** Price with adaptive precision (forex vs indices vs crypto). */
export function price(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 5
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function rMultiple(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`
}

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`
}

/** For <input type="datetime-local"> value (local time, no seconds). */
export function toDatetimeLocal(ts: number | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(value: string): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? null : ts
}

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `${hrs} год тому`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} дн тому`
  return formatDate(ts)
}
