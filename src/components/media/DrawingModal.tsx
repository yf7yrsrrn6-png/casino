import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import {
  IconClose,
  IconPen,
  IconLineTool,
  IconArrowTool,
  IconSquare,
  IconCircle,
  IconTextTool,
  IconEraser,
  IconUndo,
  IconRedo,
} from '@/components/ui/icons'

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser'

type Shape =
  | { kind: 'path'; color: string; width: number; points: [number, number][] }
  | { kind: 'line' | 'arrow'; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rect' | 'ellipse'; color: string; width: number; x: number; y: number; w: number; h: number }
  | { kind: 'text'; color: string; size: number; x: number; y: number; text: string }

const COLORS = ['#ffffff', '#ff5d67', '#4a86ff', '#f5b544', '#35c98a', '#111111']
const WIDTHS = [2, 3, 5, 8]

const TOOLS: { key: Tool; icon: typeof IconPen; label: string }[] = [
  { key: 'pen', icon: IconPen, label: 'Олівець' },
  { key: 'line', icon: IconLineTool, label: 'Лінія' },
  { key: 'arrow', icon: IconArrowTool, label: 'Стрілка' },
  { key: 'rect', icon: IconSquare, label: 'Прямокутник' },
  { key: 'ellipse', icon: IconCircle, label: 'Овал' },
  { key: 'text', icon: IconTextTool, label: 'Текст' },
  { key: 'eraser', icon: IconEraser, label: 'Гумка' },
]

function dist2seg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function hitShape(s: Shape, x: number, y: number): boolean {
  const tol = 10
  if (s.kind === 'path')
    return s.points.some(([px, py]) => Math.hypot(px - x, py - y) < tol + s.width)
  if (s.kind === 'line' || s.kind === 'arrow')
    return dist2seg(x, y, s.x1, s.y1, s.x2, s.y2) < tol + s.width
  if (s.kind === 'rect' || s.kind === 'ellipse') {
    const x1 = Math.min(s.x, s.x + s.w)
    const x2 = Math.max(s.x, s.x + s.w)
    const y1 = Math.min(s.y, s.y + s.h)
    const y2 = Math.max(s.y, s.y + s.h)
    return x >= x1 - tol && x <= x2 + tol && y >= y1 - tol && y <= y2 + tol
  }
  if (s.kind === 'text')
    return (
      x >= s.x - tol &&
      x <= s.x + s.text.length * s.size * 0.6 + tol &&
      y >= s.y - s.size - tol &&
      y <= s.y + tol
    )
  return false
}

export function DrawingModal({
  open,
  onClose,
  backgroundUrl,
  title,
  saving,
  onSave,
}: {
  open: boolean
  onClose: () => void
  backgroundUrl?: string
  title?: string
  saving?: boolean
  onSave: (dataUrl: string) => void | Promise<void>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLImageElement | null>(null)
  const [dims, setDims] = useState({ w: 900, h: 540 })
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [redo, setRedo] = useState<Shape[]>([])
  const draftRef = useRef<Shape | null>(null)
  const drawingRef = useRef(false)
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; value: string } | null>(null)

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setShapes([])
      setRedo([])
      draftRef.current = null
      setTextEdit(null)
    }
  }, [open, backgroundUrl])

  // Compute canvas size from the container (and background aspect if any).
  const computeDims = useCallback(() => {
    const cw = Math.min(wrapRef.current?.clientWidth ?? 900, 1100)
    const maxH = Math.min(window.innerHeight - 260, 640)
    const img = bgRef.current
    if (img && img.naturalWidth) {
      let w = cw
      let h = (img.naturalHeight / img.naturalWidth) * w
      if (h > maxH) {
        h = maxH
        w = (img.naturalWidth / img.naturalHeight) * h
      }
      setDims({ w: Math.round(w), h: Math.round(h) })
    } else {
      setDims({ w: cw, h: Math.min(maxH, 560) })
    }
  }, [])

  // Load background image.
  useEffect(() => {
    if (!open) return
    if (!backgroundUrl) {
      bgRef.current = null
      computeDims()
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      bgRef.current = img
      computeDims()
    }
    img.src = backgroundUrl
  }, [open, backgroundUrl, computeDims])

  useEffect(() => {
    if (!open) return
    const onResize = () => computeDims()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, computeDims])

  // Draw a single shape onto a context.
  const paintShape = (ctx: CanvasRenderingContext2D, s: Shape) => {
    ctx.strokeStyle = s.kind === 'text' ? s.color : s.color
    ctx.fillStyle = s.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (s.kind === 'path') {
      ctx.lineWidth = s.width
      ctx.beginPath()
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    } else if (s.kind === 'line' || s.kind === 'arrow') {
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
      if (s.kind === 'arrow') {
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
        const head = 8 + s.width * 2
        ctx.beginPath()
        ctx.moveTo(s.x2, s.y2)
        ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI / 6), s.y2 - head * Math.sin(ang - Math.PI / 6))
        ctx.moveTo(s.x2, s.y2)
        ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI / 6), s.y2 - head * Math.sin(ang + Math.PI / 6))
        ctx.stroke()
      }
    } else if (s.kind === 'rect') {
      ctx.lineWidth = s.width
      ctx.strokeRect(s.x, s.y, s.w, s.h)
    } else if (s.kind === 'ellipse') {
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.kind === 'text') {
      ctx.font = `600 ${s.size}px Inter, sans-serif`
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(s.text, s.x, s.y)
    }
  }

  // Full redraw.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, dims.w, dims.h)
    // Background: chart image, or a subtle dark board for blank sketches.
    if (bgRef.current) {
      ctx.drawImage(bgRef.current, 0, 0, dims.w, dims.h)
    } else {
      ctx.fillStyle = '#0d0f12'
      ctx.fillRect(0, 0, dims.w, dims.h)
    }
    for (const s of shapes) paintShape(ctx, s)
    if (draftRef.current) paintShape(ctx, draftRef.current)
  }, [dims, shapes])

  // Size the backing store then redraw whenever dims/shapes change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = dims.w * dpr
    canvas.height = dims.h * dpr
    canvas.style.width = `${dims.w}px`
    canvas.style.height = `${dims.h}px`
    redraw()
  }, [dims, redraw])

  useEffect(() => {
    redraw()
  }, [shapes, redraw])

  if (!open) return null

  const getPos = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) / rect.width) * dims.w,
      ((e.clientY - rect.top) / rect.height) * dims.h,
    ]
  }

  const commit = (s: Shape) => {
    setShapes((prev) => [...prev, s])
    setRedo([])
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (textEdit) return
    const [x, y] = getPos(e)
    if (tool === 'text') {
      setTextEdit({ x, y, value: '' })
      return
    }
    if (tool === 'eraser') {
      drawingRef.current = true
      eraseAt(x, y)
      return
    }
    drawingRef.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    if (tool === 'pen') {
      draftRef.current = { kind: 'path', color, width, points: [[x, y]] }
    } else if (tool === 'line' || tool === 'arrow') {
      draftRef.current = { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y }
    } else {
      draftRef.current = { kind: tool, color, width, x, y, w: 0, h: 0 }
    }
    redraw()
  }

  const eraseAt = (x: number, y: number) => {
    setShapes((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (hitShape(prev[i], x, y)) {
          const next = prev.slice()
          next.splice(i, 1)
          return next
        }
      }
      return prev
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    const [x, y] = getPos(e)
    if (tool === 'eraser') {
      eraseAt(x, y)
      return
    }
    const d = draftRef.current
    if (!d) return
    if (d.kind === 'path') d.points.push([x, y])
    else if (d.kind === 'line' || d.kind === 'arrow') {
      d.x2 = x
      d.y2 = y
    } else if (d.kind === 'rect' || d.kind === 'ellipse') {
      d.w = x - d.x
      d.h = y - d.y
    }
    redraw()
  }

  const onPointerUp = () => {
    if (tool === 'eraser') {
      drawingRef.current = false
      return
    }
    const d = draftRef.current
    drawingRef.current = false
    draftRef.current = null
    if (!d) return
    // Ignore accidental zero-size shapes.
    const tiny =
      (d.kind === 'line' || d.kind === 'arrow') && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3
    const tinyBox = (d.kind === 'rect' || d.kind === 'ellipse') && Math.abs(d.w) < 3 && Math.abs(d.h) < 3
    if (!tiny && !tinyBox) commit(d)
    else redraw()
  }

  const commitText = () => {
    if (textEdit && textEdit.value.trim()) {
      commit({ kind: 'text', color, size: Math.max(14, width * 5), x: textEdit.x, y: textEdit.y, text: textEdit.value })
    }
    setTextEdit(null)
  }

  const undo = () => {
    setShapes((prev) => {
      if (!prev.length) return prev
      const next = prev.slice(0, -1)
      setRedo((r) => [...r, prev[prev.length - 1]])
      return next
    })
  }
  const doRedo = () => {
    setRedo((r) => {
      if (!r.length) return r
      const s = r[r.length - 1]
      setShapes((prev) => [...prev, s])
      return r.slice(0, -1)
    })
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    await onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="animate-overlay fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet surface-card relative z-10 flex max-h-[92svh] w-full max-w-5xl flex-col rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold text-text">{title ?? 'Малювання'}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {TOOLS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                title={label}
                onClick={() => setTool(key)}
                className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
                  tool === key ? 'bg-white text-[#0a0b0d]' : 'text-muted hover:text-text'
                }`}
              >
                <Icon width={16} height={16} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 p-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-6 w-6 rounded-full border transition-transform ${
                  color === c ? 'scale-110 border-white' : 'border-border-strong'
                }`}
                aria-label={c}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`grid h-8 w-8 place-items-center rounded-md ${
                  width === w ? 'bg-surface-3' : 'hover:bg-surface-3'
                }`}
                title={`${w}px`}
              >
                <span className="rounded-full bg-text" style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!shapes.length}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text disabled:opacity-40"
              title="Скасувати"
            >
              <IconUndo width={16} height={16} />
            </button>
            <button
              onClick={doRedo}
              disabled={!redo.length}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text disabled:opacity-40"
              title="Повторити"
            >
              <IconRedo width={16} height={16} />
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div ref={wrapRef} className="relative flex-1 overflow-auto bg-black/30 p-4">
          <div className="relative mx-auto" style={{ width: dims.w, height: dims.h }}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="touch-none rounded-lg border border-border"
              style={{ cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair' }}
            />
            {textEdit && (
              <input
                autoFocus
                value={textEdit.value}
                onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText()
                  if (e.key === 'Escape') setTextEdit(null)
                }}
                onBlur={commitText}
                placeholder="текст…"
                style={{
                  left: textEdit.x,
                  top: textEdit.y - Math.max(14, width * 5),
                  color,
                  fontSize: Math.max(14, width * 5),
                }}
                className="absolute z-10 min-w-24 border-b border-white/50 bg-transparent font-semibold outline-none"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-[12px] text-subtle">
            {backgroundUrl ? 'Розмітьте графік і збережіть як новий знімок' : 'Намалюйте нотатку і збережіть'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Скасувати
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner /> : 'Зберегти зображення'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
