import { useTranslation } from 'react-i18next'
import { SLOTS } from '@/data/slots'
import { SlotCard } from '@/components/slots/SlotCard'

export function Slots() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {t('slots.title')}
        </h1>
        <p className="mt-2 text-white/50">{t('slots.subtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {SLOTS.map((slot) => (
          <SlotCard key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  )
}
