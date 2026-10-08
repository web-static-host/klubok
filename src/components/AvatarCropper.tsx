import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, FlipHorizontal2, RotateCcwSquare, X } from 'lucide-react'
import type { Img } from '../data/types'
import { cx } from '../lib'

/** Итоговый аватар — квадрат OUT×OUT (маленький файл — грузится быстро) */
const OUT = 256
const MAX_ZOOM = 8
/** Линейка наклона: пикселей на градус */
const PX_PER_DEG = 8

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const rad = (d: number) => (d * Math.PI) / 180

interface View {
  /** смещение центра фото от центра круга, px экрана */
  x: number
  y: number
  /** масштаб: px экрана на 1 px фото */
  s: number
}
interface Adjust {
  brightness: number
  contrast: number
  saturation: number
}
const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0 }

/** Ползунки −100…100 → множители как у CSS-фильтров */
const factors = (a: Adjust) => ({ b: 1 + a.brightness / 200, c: 1 + a.contrast / 200, s: 1 + a.saturation / 100 })
const cssFilter = (a: Adjust) => {
  const f = factors(a)
  return `brightness(${f.b}) contrast(${f.c}) saturate(${f.s})`
}

/** Те же поправки цвета — по пикселям (в любом браузере результат как в предпросмотре) */
function applyAdjust(ctx: CanvasRenderingContext2D, a: Adjust) {
  if (!a.brightness && !a.contrast && !a.saturation) return
  const { b, c, s } = factors(a)
  const d = ctx.getImageData(0, 0, OUT, OUT)
  const px = d.data
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * b
    let g = px[i + 1] * b
    let bl = px[i + 2] * b
    r = (r - 128) * c + 128
    g = (g - 128) * c + 128
    bl = (bl - 128) * c + 128
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    px[i] = l + (r - l) * s
    px[i + 1] = l + (g - l) * s
    px[i + 2] = l + (bl - l) * s
  }
  ctx.putImageData(d, 0, 0)
}

/**
 * Редактор фото профиля как в Telegram: круг поверх фото, двигать и увеличивать (пальцами, мышью, колёсиком),
 * выровнять наклон по линейке, повернуть на 90°, отразить; вкладка «Цвет» — яркость, контраст, насыщенность.
 */
export function AvatarCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (img: Img) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const [rot90, setRot90] = useState(0)
  const [tilt, setTilt] = useState(0)
  const [flip, setFlip] = useState(false)
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST)
  const [tab, setTab] = useState<'crop' | 'color'>('crop')
  const [dragging, setDragging] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ view: View; px: number; py: number; d: number } | null>(null)
  const lastTap = useRef(0)

  // диаметр круга — по размеру свободного места
  const D = Math.max(120, Math.min(stage.w, stage.h, 420) - 32)
  const r = D / 2
  const angle = rad(tilt - rot90 * 90)
  const W = img?.width ?? 1
  const H = img?.height ?? 1
  const sMin = D / Math.min(W, H)

  /** круг всегда закрыт фото: ограничиваем масштаб и сдвиг (с учётом поворота) */
  const fit = useCallback(
    (v: View, a = angle): View => {
      const s = clamp(v.s, sMin, sMin * MAX_ZOOM)
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      // центр круга в координатах фото
      let lx = (-v.x * cos - v.y * sin) / s
      let ly = (v.x * sin - v.y * cos) / s
      const mx = Math.max(0, W / 2 - r / s)
      const my = Math.max(0, H / 2 - r / s)
      lx = clamp(lx, -mx, mx)
      ly = clamp(ly, -my, my)
      return { s, x: -s * (lx * cos - ly * sin), y: -s * (lx * sin + ly * cos) }
    },
    [angle, sMin, W, H, r],
  )

  // загрузка файла
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setRot90(0)
      setTilt(0)
      setFlip(false)
      setAdjust(NO_ADJUST)
      setTab('crop')
      setView({ x: 0, y: 0, s: 0 }) // уточнится в fit, когда известен размер круга
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // размер области под фото
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [img])

  // после смены размера, поворота или загрузки — снова закрыть круг
  useEffect(() => {
    if (img && stage.w) setView((v) => fit(v))
  }, [img, stage.w, stage.h, fit])

  // Esc — отмена, Enter — готово; страница под редактором не прокручивается
  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [file, onCancel])

  const zoomTo = (s: number) => setView((v) => fit({ x: (v.x * s) / v.s, y: (v.y * s) / v.s, s }))

  const snapshot = () => {
    const p = [...pts.current.values()]
    const mid = p.length === 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0]
    start.current = { view, px: mid.x, py: mid.y, d: p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 }
  }
  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    snapshot()
    setDragging(true)
  }
  const move = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = [...pts.current.values()]
    const st = start.current
    if (p.length === 2 && st.d) {
      const k = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / st.d
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }
      setView(fit({ s: st.view.s * k, x: st.view.x * k + mid.x - st.px, y: st.view.y * k + mid.y - st.py }))
    } else if (p.length === 1) {
      setView(fit({ ...st.view, x: st.view.x + p[0].x - st.px, y: st.view.y + p[0].y - st.py }))
    }
  }
  const up = (e: PointerEvent) => {
    const st = start.current
    pts.current.delete(e.pointerId)
    if (pts.current.size) return snapshot()
    setDragging(false)
    start.current = null
    // двойное нажатие — приблизить / вернуть
    if (st && Math.hypot(e.clientX - st.px, e.clientY - st.py) < 6) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        zoomTo(view.s > sMin * 1.05 ? sMin : sMin * 2.5)
        lastTap.current = 0
      } else lastTap.current = now
    }
  }

  const reset = () => {
    setRot90(0)
    setTilt(0)
    setFlip(false)
    setAdjust(NO_ADJUST)
    setView(fit({ x: 0, y: 0, s: sMin }, 0))
  }

  const done = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(OUT / 2, OUT / 2)
    ctx.scale(OUT / D, OUT / D)
    ctx.translate(view.x, view.y)
    ctx.rotate(angle)
    ctx.scale(view.s * (flip ? -1 : 1), view.s)
    ctx.drawImage(img, -W / 2, -H / 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    applyAdjust(ctx, adjust)
    onDone({ src: c.toDataURL('image/jpeg', 0.72), ratio: 1 })
  }

  if (!file) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f13] text-white select-none"
      role="dialog"
      aria-modal
      aria-label="Фото профиля"
    >
      {/* верх */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Отмена"
          className="press inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X size={22} />
        </button>
        <p className="flex-1 text-center text-base font-bold">Фото профиля</p>
        <button
          type="button"
          onClick={reset}
          className="press rounded-full px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          aria-label="Сбросить всё"
        >
          Сбросить
        </button>
      </div>

      {/* фото и круг */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => zoomTo(view.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
      >
        {img && view.s > 0 && (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className={cx('pointer-events-none absolute max-w-none', !dragging && 'transition-transform duration-150')}
            style={{
              width: W,
              height: H,
              left: stage.w / 2 - W / 2,
              top: stage.h / 2 - H / 2,
              transform: `translate(${view.x}px, ${view.y}px) rotate(${angle}rad) scale(${view.s * (flip ? -1 : 1)}, ${view.s})`,
              filter: cssFilter(adjust),
            }}
          />
        )}
        {/* затемнение вокруг круга и сетка третей внутри, пока двигают */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            width: D,
            height: D,
            left: stage.w / 2 - r,
            top: stage.h / 2 - r,
            boxShadow: '0 0 0 9999px rgba(11, 15, 19, 0.72)',
            outline: '2px solid rgba(255,255,255,0.9)',
          }}
        >
          {dragging && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              {[1, 2].map((i) => (
                <span key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: `${(i * 100) / 3}%` }} />
              ))}
              {[1, 2].map((i) => (
                <span key={`h${i}`} className="absolute right-0 left-0 h-px bg-white/40" style={{ top: `${(i * 100) / 3}%` }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* инструменты */}
      <div className="mx-auto w-full max-w-xl px-4 pt-3" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        {tab === 'crop' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRot90((v) => (v + 1) % 4)}
              aria-label="Повернуть на 90°"
              title="Повернуть на 90°"
              className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
            >
              <RotateCcwSquare size={22} />
            </button>
            <TiltRuler value={tilt} onChange={setTilt} />
            <button
              type="button"
              onClick={() => setFlip((f) => !f)}
              aria-label="Отразить"
              aria-pressed={flip}
              title="Отразить"
              className={cx(
                'press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10',
                flip && 'text-accent',
              )}
            >
              <FlipHorizontal2 size={22} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(
              [
                ['brightness', 'Яркость'],
                ['contrast', 'Контраст'],
                ['saturation', 'Насыщенность'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-white/80">{label}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjust[k]}
                  onChange={(e) => setAdjust((a) => ({ ...a, [k]: Number(e.target.value) }))}
                  onDoubleClick={() => setAdjust((a) => ({ ...a, [k]: 0 }))}
                  className="min-w-0 flex-1 cursor-pointer accent-accent"
                  aria-label={label}
                />
                <span className="w-9 text-right text-xs text-white/60 tabular-nums">{adjust[k] > 0 ? `+${adjust[k]}` : adjust[k]}</span>
              </label>
            ))}
          </div>
        )}

        {/* низ: отмена, вкладки, готово */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Отмена"
            className="press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
          >
            <X size={22} />
          </button>
          <div className="mx-auto flex rounded-full bg-white/10 p-1 text-sm font-semibold">
            {(
              [
                ['crop', 'Кадр'],
                ['color', 'Цвет'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cx('press rounded-full px-4 py-2', tab === id ? 'bg-white text-[#0b0f13]' : 'text-white/80')}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={done}
            disabled={!img}
            aria-label="Готово"
            className="press grad inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          >
            <Check size={24} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Линейка наклона −45°…45°: тянуть влево-вправо; нажатие на число — сбросить в 0 */
function TiltRuler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const start = useRef<{ x: number; v: number } | null>(null)
  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onChange(0)}
        className={cx('press mx-auto mb-1 block rounded-full px-2 text-xs font-bold tabular-nums', value ? 'text-accent' : 'text-white/70')}
        aria-label="Наклон: сбросить в 0"
      >
        {value > 0 ? `+${Math.round(value)}` : Math.round(value)}°
      </button>
      <div
        className="relative h-8 cursor-ew-resize touch-none overflow-hidden"
        style={{ maskImage: 'linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)' }}
        role="slider"
        aria-label="Наклон"
        aria-valuemin={-45}
        aria-valuemax={45}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onChange(clamp(value - 1, -45, 45))
          if (e.key === 'ArrowRight') onChange(clamp(value + 1, -45, 45))
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, v: value }
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const v = clamp(start.current.v - (e.clientX - start.current.x) / PX_PER_DEG, -45, 45)
          onChange(Math.abs(v) < 0.6 ? 0 : v) // у нуля — «прилипает»
        }}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
        onWheel={(e) => onChange(clamp(value + (e.deltaY > 0 ? 1 : -1), -45, 45))}
      >
        <div className="absolute top-0 left-1/2 h-full" style={{ transform: `translateX(${-value * PX_PER_DEG}px)` }}>
          {Array.from({ length: 91 }, (_, i) => i - 45).map((d) => (
            <span
              key={d}
              className={cx(
                'absolute bottom-1 w-px rounded-full',
                d % 15 === 0 ? 'h-4 bg-white/90' : d % 5 === 0 ? 'h-3 bg-white/60' : 'h-2 bg-white/35',
              )}
              style={{ left: d * PX_PER_DEG }}
            />
          ))}
        </div>
        <span className="absolute bottom-0 left-1/2 h-6 w-0.5 -translate-x-1/2 rounded-full bg-accent" />
      </div>
    </div>
  )
}
