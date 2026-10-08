import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import type { Img } from '../data/types'
import { Sheet } from './Sheet'
import { Button } from './ui'

/** Размер окошка кадрирования и итогового фото (маленький файл — грузится быстро) */
const VIEW = 280
const OUT = 192
const MAX_ZOOM = 4

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * Кадрирование фото профиля: двигать пальцем или мышью, увеличивать — ползунком, колёсиком или двумя пальцами.
 * Круг показывает, что попадёт в аватар.
 */
export function AvatarCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (img: Img) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ x: number; y: number; px: number; py: number; d: number; zoom: number } | null>(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setZoom(1)
      const s = VIEW / Math.min(image.width, image.height)
      setPos({ x: (VIEW - image.width * s) / 2, y: (VIEW - image.height * s) / 2 })
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const base = img ? VIEW / Math.min(img.width, img.height) : 1
  const scale = base * zoom
  const w = (img?.width ?? 0) * scale
  const h = (img?.height ?? 0) * scale

  /** картинка всегда закрывает окошко целиком */
  const fit = (p: { x: number; y: number }, s: number) => ({
    x: clamp(p.x, VIEW - (img?.width ?? 0) * s, 0),
    y: clamp(p.y, VIEW - (img?.height ?? 0) * s, 0),
  })

  /** новое увеличение — относительно центра окошка */
  const setZoomAt = (z: number) => {
    const nz = clamp(z, 1, MAX_ZOOM)
    const k = nz / zoom
    const c = VIEW / 2
    setPos((p) => fit({ x: c - (c - p.x) * k, y: c - (c - p.y) * k }, base * nz))
    setZoom(nz)
  }

  const snapshot = () => {
    const p = [...pts.current.values()]
    const mid = p.length === 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0]
    start.current = { ...pos, px: mid.x, py: mid.y, d: p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, zoom }
  }

  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    snapshot()
  }
  const move = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = [...pts.current.values()]
    const st = start.current
    if (p.length === 2 && st.d) {
      setZoomAt((st.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) / st.d)
    } else if (p.length === 1) {
      setPos(fit({ x: st.x + p[0].x - st.px, y: st.y + p[0].y - st.py }, scale))
    }
  }
  const up = (e: PointerEvent) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size) snapshot()
    else start.current = null
  }

  const done = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    c.getContext('2d')!.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT)
    onDone({ src: c.toDataURL('image/jpeg', 0.82), ratio: 1 })
  }

  return (
    <Sheet open={!!file} onClose={onCancel} title="Фото профиля">
      <p className="mb-3 text-sm">Подвиньте и увеличьте фото — в аватар попадёт то, что внутри круга.</p>
      <div
        className="relative mx-auto touch-none overflow-hidden rounded-2xl bg-elevated select-none"
        style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => setZoomAt(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
      >
        {img && (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="absolute top-0 left-0 max-w-none"
            style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }}
          />
        )}
        {/* затемнение вокруг круга */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
          style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)' }}
        />
      </div>

      <div className="mx-auto mt-4 flex items-center gap-3" style={{ maxWidth: VIEW }}>
        <button type="button" aria-label="Уменьшить" className="press" onClick={() => setZoomAt(zoom / 1.2)}>
          <ZoomOut size={20} />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomAt(Number(e.target.value))}
          aria-label="Увеличение"
          className="min-w-0 flex-1 cursor-pointer accent-accent"
        />
        <button type="button" aria-label="Увеличить" className="press" onClick={() => setZoomAt(zoom * 1.2)}>
          <ZoomIn size={20} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button kind="neutral" onClick={onCancel}>
          Отмена
        </Button>
        <Button onClick={done} disabled={!img}>
          Готово
        </Button>
      </div>
    </Sheet>
  )
}
