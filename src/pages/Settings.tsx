import { useEffect, useState } from 'react'
import { api, ApiError, type QuickLink } from '@/lib/api'
import { useSettings } from '@/store/useSettings'
import { useSession } from '@/store/useSession'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Feedback'
import { IconPlus, IconTrash, IconCheck } from '@/components/ui/icons'
import { NumberInput } from '@/components/trades/parts'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'UAH', 'JPY', 'PLN']

function Saved() {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-profit">
      <IconCheck width={15} height={15} /> Збережено
    </span>
  )
}

export function Settings() {
  const settings = useSettings((s) => s.settings)
  const save = useSettings((s) => s.save)
  const user = useSession((s) => s.user)
  const setUser = useSession((s) => s.setUser)

  // Trading defaults
  const [balance, setBalance] = useState<number | null>(settings.accountBalance)
  const [currency, setCurrency] = useState(settings.currency)
  const [risk, setRisk] = useState<number | null>(settings.defaultRiskPct)
  const [links, setLinks] = useState<QuickLink[]>(settings.quickLinks)
  const [checklist, setChecklist] = useState<string[]>(settings.checklistTemplate)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [savedDefaults, setSavedDefaults] = useState(false)

  useEffect(() => {
    setBalance(settings.accountBalance)
    setCurrency(settings.currency)
    setRisk(settings.defaultRiskPct)
    setLinks(settings.quickLinks)
    setChecklist(settings.checklistTemplate)
  }, [settings])

  // Profile
  const [name, setName] = useState(user?.displayName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)

  // Password
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  async function saveDefaults() {
    setSavingDefaults(true)
    setSavedDefaults(false)
    try {
      await save({
        accountBalance: balance ?? 0,
        currency,
        defaultRiskPct: risk ?? 0,
        quickLinks: links.filter((l) => l.label.trim() && l.url.trim()),
        checklistTemplate: checklist.map((c) => c.trim()).filter(Boolean),
      })
      setSavedDefaults(true)
      setTimeout(() => setSavedDefaults(false), 2500)
    } finally {
      setSavingDefaults(false)
    }
  }

  async function saveName() {
    setSavingName(true)
    setSavedName(false)
    try {
      const { user: updated } = await api.post<{ user: typeof user }>('/account/display-name', {
        displayName: name,
      })
      setUser(updated)
      setSavedName(true)
      setTimeout(() => setSavedName(false), 2500)
    } finally {
      setSavingName(false)
    }
  }

  async function changePassword() {
    setSavingPw(true)
    setPwMsg(null)
    try {
      await api.post('/account/password', { currentPassword: curPw, newPassword: newPw })
      setPwMsg({ ok: true, text: 'Пароль оновлено.' })
      setCurPw('')
      setNewPw('')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error'
      setPwMsg({
        ok: false,
        text: code === 'invalid_credentials' ? 'Поточний пароль невірний.' : 'Не вдалося змінити пароль.',
      })
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Trading defaults */}
      <Card>
        <CardHeader
          title="Торгові налаштування"
          subtitle="Використовуються в калькуляторах і статистиці"
        />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Депозит">
              <NumberInput value={balance} onChange={setBalance} />
            </Field>
            <Field label="Валюта">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ризик за замовч., %">
              <NumberInput value={risk} onChange={setRisk} />
            </Field>
          </div>

          {/* Quick links */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">Швидкі посилання (топбар)</span>
              <button
                onClick={() => setLinks([...links, { label: '', url: '' }])}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
              >
                <IconPlus width={14} height={14} /> Додати
              </button>
            </div>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={l.label}
                    onChange={(e) => {
                      const next = [...links]
                      next[i] = { ...next[i], label: e.target.value }
                      setLinks(next)
                    }}
                    placeholder="Назва"
                    className="w-40"
                  />
                  <Input
                    value={l.url}
                    onChange={(e) => {
                      const next = [...links]
                      next[i] = { ...next[i], url: e.target.value }
                      setLinks(next)
                    }}
                    placeholder="https://…"
                    className="flex-1"
                  />
                  <button
                    onClick={() => setLinks(links.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-subtle hover:text-loss"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
              ))}
              {links.length === 0 && (
                <p className="text-[12px] text-subtle">
                  Додайте посилання на TradingView, Forex Factory тощо — вони з’являться у шапці.
                </p>
              )}
            </div>
          </div>

          {/* Pre-trade checklist template */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">
                Пре-трейд чеклист (шаблон для нових угод)
              </span>
              <button
                onClick={() => setChecklist([...checklist, ''])}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
              >
                <IconPlus width={14} height={14} /> Додати пункт
              </button>
            </div>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={item}
                    onChange={(e) => {
                      const next = [...checklist]
                      next[i] = e.target.value
                      setChecklist(next)
                    }}
                    placeholder="напр. Тренд на боці угоди"
                    className="flex-1"
                  />
                  <button
                    onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-subtle hover:text-loss"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
              ))}
              {checklist.length === 0 && (
                <p className="text-[12px] text-subtle">
                  Ці пункти автоматично додаються до кожної нової позиції для контролю дисципліни.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {savedDefaults && <Saved />}
            <Button onClick={saveDefaults} disabled={savingDefaults}>
              {savingDefaults ? <Spinner /> : 'Зберегти'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader title="Профіль" subtitle={user?.email} />
        <div className="space-y-4 p-5">
          <Field label="Ім'я">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-center justify-end gap-3">
            {savedName && <Saved />}
            <Button variant="secondary" onClick={saveName} disabled={savingName || !name.trim()}>
              {savingName ? <Spinner /> : 'Оновити ім’я'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader title="Зміна пароля" />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Поточний пароль">
              <Input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="Новий пароль" hint="мін. 6 символів">
              <Input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
          {pwMsg && (
            <p className={`text-[13px] font-medium ${pwMsg.ok ? 'text-profit' : 'text-loss'}`}>
              {pwMsg.text}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={changePassword}
              disabled={savingPw || curPw.length < 1 || newPw.length < 6}
            >
              {savingPw ? <Spinner /> : 'Змінити пароль'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
