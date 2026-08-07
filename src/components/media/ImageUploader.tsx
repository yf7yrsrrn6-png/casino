import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type TradeImage } from '@/lib/api'
import { IconImage, IconTrash, IconClose, IconPen, IconDraw } from '@/components/ui/icons'
import { Spinner } from '@/components/ui/Feedback'
import { DrawingModal } from './DrawingModal'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Chart / analysis image gallery with drag-drop, click-to-pick and paste.
 * Attaches uploads to a trade or a plan. `disabled` (no target id yet) shows a hint.
 */
export function ImageUploader({
  tradeId,
  planId,
  images,
  onChange,
  disabledHint,
}: {
  tradeId?: string
  planId?: string
  images: TradeImage[]
  onChange: (images: TradeImage[]) => void
  disabledHint?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [draw, setDraw] = useState<{ open: boolean; bg?: string }>({ open: false })
  const [drawSaving, setDrawSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const disabled = !tradeId && !planId

  const uploadDataUrl = useCallback(
    async (dataUrl: string) => {
      const { image } = await api.post<{ image: TradeImage }>('/images', {
        dataUrl,
        tradeId: tradeId ?? null,
        planId: planId ?? null,
      })
      onChange([...images, image])
    },
    [tradeId, planId, images, onChange],
  )

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return
      setError(null)
      setBusy(true)
      try {
        const added: TradeImage[] = []
        for (const file of Array.from(files)) {
          if (!file.type.startsWith('image/')) continue
          const dataUrl = await fileToDataUrl(file)
          const { image } = await api.post<{ image: TradeImage }>('/images', {
            dataUrl,
            tradeId: tradeId ?? null,
            planId: planId ?? null,
          })
          added.push(image)
        }
        if (added.length) onChange([...images, ...added])
      } catch {
        setError('Не вдалося завантажити зображення (макс. 10 МБ).')
      } finally {
        setBusy(false)
      }
    },
    [disabled, tradeId, planId, images, onChange],
  )

  // Paste screenshots straight from the clipboard (⌘V).
  useEffect(() => {
    if (disabled) return
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) {
        e.preventDefault()
        void upload(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [disabled, upload])

  async function remove(id: string) {
    await api.del(`/images/${id}`)
    onChange(images.filter((i) => i.id !== id))
  }

  return (
    <div>
      {images.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-surface-2"
            >
              <img
                src={img.url}
                alt={img.caption ?? 'chart'}
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => setLightbox(img.url)}
              />
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => setDraw({ open: true, bg: img.url })}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-accent"
                  aria-label="Розмітити графік"
                  title="Розмітити"
                >
                  <IconPen width={13} height={13} />
                </button>
                <button
                  onClick={() => void remove(img.id)}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-loss"
                  aria-label="Видалити зображення"
                >
                  <IconTrash width={13} height={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {disabled ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-2/50 px-4 py-6 text-center text-[13px] text-muted">
          {disabledHint ?? 'Збережіть спочатку, щоб додати зображення.'}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void upload(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
        >
          {busy ? (
            <Spinner className="h-5 w-5 text-accent" />
          ) : (
            <>
              <IconImage width={22} height={22} className="text-subtle" />
              <div className="text-[13px] font-medium text-text">
                Перетягніть, вставте (⌘V) або натисніть
              </div>
              <div className="text-[11px] text-subtle">PNG, JPG, WEBP · до 10 МБ</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={() => setDraw({ open: true })}
          className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text transition-colors hover:border-accent-line hover:text-accent"
        >
          <IconDraw width={15} height={15} /> Намалювати нотатку
        </button>
      )}

      {error && <p className="mt-2 text-[12px] font-medium text-loss">{error}</p>}

      <DrawingModal
        open={draw.open}
        backgroundUrl={draw.bg}
        title={draw.bg ? 'Розмітка графіка' : 'Нотатка-малюнок'}
        saving={drawSaving}
        onClose={() => setDraw({ open: false })}
        onSave={async (dataUrl) => {
          setDrawSaving(true)
          try {
            await uploadDataUrl(dataUrl)
            setDraw({ open: false })
          } catch {
            setError('Не вдалося зберегти малюнок.')
          } finally {
            setDrawSaving(false)
          }
        }}
      />

      {lightbox && (
        <div
          className="animate-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <IconClose />
          </button>
        </div>
      )}
    </div>
  )
}
