import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSlotById } from '@/data/slots'
import { SlotMachine } from '@/components/slots/SlotMachine'

export function SlotGame() {
  const { t } = useTranslation()
  const { slotId } = useParams()
  const slot = slotId ? getSlotById(slotId) : undefined

  if (!slot) {
    return <Navigate to="/slots" replace />
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/slots" className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
        ← {t('slots.back')}
      </Link>
      <SlotMachine slot={slot} />
    </div>
  )
}
