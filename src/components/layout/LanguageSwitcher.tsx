import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'

const LABELS: Record<SupportedLanguage, { short: string; full: string; flag: string }> = {
  uk: { short: 'UKR', full: 'Українська', flag: '🇺🇦' },
  ru: { short: 'RUS', full: 'Русский', flag: '🇷🇺' },
  en: { short: 'ENG', full: 'English', flag: '🇬🇧' },
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = (i18n.language?.slice(0, 2) as SupportedLanguage) || 'uk'

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:border-gold/50 hover:text-white transition-colors cursor-pointer"
      >
        <span>{LABELS[current]?.flag}</span>
        <span>{LABELS[current]?.short}</span>
        <svg width="10" height="10" viewBox="0 0 10 6" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-glow-violet z-50">
          {SUPPORTED_LANGUAGES.map((lng) => (
            <button
              key={lng}
              onClick={() => {
                void i18n.changeLanguage(lng)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                lng === current ? 'bg-gold/15 text-gold-soft' : 'text-white/80 hover:bg-white/5'
              }`}
            >
              <span>{LABELS[lng].flag}</span>
              <span>{LABELS[lng].full}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
