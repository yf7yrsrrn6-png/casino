import { useTranslation } from 'react-i18next'

const SIZE_CLASSES = {
  sm: { mark: 'h-8 w-8 rounded-lg text-base', text: 'text-lg' },
  md: { mark: 'h-9 w-9 rounded-xl text-lg', text: 'text-xl' },
  lg: { mark: 'h-12 w-12 rounded-2xl text-2xl', text: 'text-2xl' },
} as const

export function Logo({ size = 'md' }: { size?: keyof typeof SIZE_CLASSES }) {
  const { t } = useTranslation()
  const s = SIZE_CLASSES[size]
  return (
    <span className="flex items-center gap-2">
      <span
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-gold to-magenta font-display font-black text-ink shadow-glow-magenta ${s.mark}`}
      >
        7
      </span>
      <span className={`font-display font-extrabold text-gradient-gold ${s.text}`}>
        {t('brand.name')}
      </span>
    </span>
  )
}
