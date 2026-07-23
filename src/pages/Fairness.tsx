import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SLOTS } from '@/data/slots'
import { makeFloats, pickSymbolIndex, roulettePocket, crashPointOf } from '@/lib/provablyFairClient'
import { Button } from '@/components/ui/Button'

type Game = 'slots' | 'roulette' | 'crash'

export function Fairness() {
  const { t } = useTranslation()
  const [game, setGame] = useState<Game>('slots')
  const [slotId, setSlotId] = useState(SLOTS[0].id)
  const [serverSeed, setServerSeed] = useState('')
  const [clientSeed, setClientSeed] = useState('')
  const [nonce, setNonce] = useState('1')
  const [output, setOutput] = useState<string | null>(null)

  async function verify() {
    const n = Number(nonce) || 0
    if (game === 'slots') {
      const cfg = SLOTS.find((s) => s.id === slotId) ?? SLOTS[0]
      const weights = cfg.symbols.map((s) => s.weight)
      const floats = await makeFloats(serverSeed, clientSeed, n, 9)
      const grid: string[][] = []
      let idx = 0
      for (let reel = 0; reel < 3; reel++) {
        const col: string[] = []
        for (let row = 0; row < 3; row++) {
          col.push(cfg.symbols[pickSymbolIndex(weights, floats[idx++])].glyph)
        }
        grid.push(col)
      }
      // Print row-major so it reads like the machine.
      const rows = [0, 1, 2].map((row) => grid.map((c) => c[row]).join('  ')).join('\n')
      setOutput(rows)
    } else if (game === 'roulette') {
      const [f] = await makeFloats(serverSeed, clientSeed, n, 1)
      setOutput(`${t('fair.pocket')}: ${roulettePocket(f)}`)
    } else {
      const [f] = await makeFloats(serverSeed, clientSeed, n, 1)
      setOutput(`${t('fair.crashPoint')}: ${crashPointOf(f).toFixed(2)}×`)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50 placeholder:text-white/25 font-mono'
  const canVerify = serverSeed.trim() && clientSeed.trim()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🔐 {t('fair.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('fair.subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface p-6">
        <div className="mb-4 flex gap-2">
          {(['slots', 'roulette', 'crash'] as const).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGame(g)
                setOutput(null)
              }}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
                game === g
                  ? 'bg-gradient-to-br from-gold to-magenta text-ink'
                  : 'border border-white/12 bg-white/5 text-lilac hover:text-white'
              }`}
            >
              {t(`fair.game${g.charAt(0).toUpperCase()}${g.slice(1)}`)}
            </button>
          ))}
        </div>

        {game === 'slots' && (
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/60">{t('fair.game')}</span>
            <select
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className="rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50"
            >
              {SLOTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/60">{t('fair.serverSeed')}</span>
            <input value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} className={inputCls} placeholder="64 hex chars" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('fair.clientSeed')}</span>
              <input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('fair.nonce')}</span>
              <input value={nonce} onChange={(e) => setNonce(e.target.value)} className={inputCls} inputMode="numeric" />
            </label>
          </div>
          <Button onClick={verify} disabled={!canVerify} className="self-start">
            {t('fair.verify')}
          </Button>
        </div>

        {output !== null && (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold/10 p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gold-soft">
              {t('fair.result')}
            </div>
            <pre className="whitespace-pre-wrap font-mono text-2xl leading-relaxed text-white">{output}</pre>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-surface p-6">
        <h2 className="mb-2 font-display text-base font-bold text-white">{t('fair.howItWorks')}</h2>
        <p className="text-sm leading-relaxed text-lilac">{t('fair.howText')}</p>
      </div>
    </div>
  )
}
