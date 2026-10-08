import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { FlipHorizontal2, RotateCcwSquare } from 'lucide-react'
import type { Img } from '../data/types'
import { cx } from '../lib'
import { Sheet } from './Sheet'
import { Button, Segmented } from './ui'

/** Итоговый аватар — квадрат OUT×OUT (маленький файл — грузится быстро) */
const OUT = 256
/** Самая маленькая рамка, px на экране */
const MIN_BOX = 48
/** Линейка наклона: пикселей на градус */
const PX_PER_DEG = 6
const PAD = 12

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const rad = (d: number) => (d * Math.PI) / 180

interface Box {
  x: number
  y: number
  size: number
}
interface Adjust {
  brightness: number
  contrast: number
  saturation: number
}
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move'
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
    const r = (px[i] * b - 128) * c + 128
    const g = (px[i + 1] * b - 128) * c + 128
    const bl = (px[i + 2] * b - 128) * c + 128
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    px[i] = l + (r - l) * s
    px[i + 1] = l + (g - l) * s
    px[i + 2] = l + (bl - l) * s
  }
  ctx.putImageData(d, 0, 0)
}

/**
 * Редактор фото профиля (окно поверх профиля): фото целиком, поверх — квадратная рамка с кругом.
 * Рамку двигают и растягивают за углы (или колёсиком / двумя пальцами), можно выровнять наклон,
 * повернуть на 90°, отразить; вкладка «Цвет» — яркость, контраст, насыщенность.
 */
export function AvatarCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (img: Img) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [stageW, setStageW] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [rot90, setRot90] = useState(0)
  const [tilt, setTilt] = useState(0)
  const [flip, setFlip] = useState(false)
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST)
  const [tab, setTab] = useState<'crop' | 'color'>('crop')
  const [active, setActive] = useState<Handle | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ box: Box; px: number; py: number; d: number; mode: Handle } | null>(null)

  // загрузка файла — всё с начала
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
      setBox(null)
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ширина области под фото
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [img, file])

  // ─── геометрия: фото (с поворотом на 90°) вписано в область целиком ───
  const W = img?.width ?? 1
  const H = img?.height ?? 1
  const side = rot90 % 2 === 1
  const Wr = side ? H : W
  const Hr = side ? W : H
  const stageH = Math.round(Math.min(stageW * 0.85, 400)) || 320
  const f = Math.min((stageW - 2 * PAD) / Wr, (stageH - 2 * PAD) / Hr) || 1
  const dw = Wr * f
  const dh = Hr * f
  const R = { x: (stageW - dw) / 2, y: (stageH - dh) / 2, w: dw, h: dh }
  // наклон: фото чуть увеличивается, чтобы без пустых углов закрывать ту же область
  const t = Math.abs(rad(tilt))
  const k = Math.max((dw * Math.cos(t) + dh * Math.sin(t)) / dw, (dw * Math.sin(t) + dh * Math.cos(t)) / dh)
  const angle = rad(tilt - rot90 * 90)

  /** рамка не выходит за фото и не меньше MIN_BOX */
  const fitBox = (bx: Box): Box => {
    const size = clamp(bx.size, Math.min(MIN_BOX, R.w, R.h), Math.min(R.w, R.h))
    return { size, x: clamp(bx.x, R.x, R.x + R.w - size), y: clamp(bx.y, R.y, R.y + R.h - size) }
  }
  const fullBox = (): Box => {
    const size = Math.min(R.w, R.h)
    return { size, x: R.x + (R.w - size) / 2, y: R.y + (R.h - size) / 2 }
  }

  // новая картинка, поворот на 90° или другой размер окна — рамка снова по центру во всю ширину
  const key = `${img?.src}|${stageW}|${rot90}`
  const [boxKey, setBoxKey] = useState('')
  if (img && stageW && key !== boxKey) {
    setBoxKey(key)
    setBox(fullBox())
  }
  const b = box ?? fullBox()

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const snapshot = (mode: Handle) => {
    const p = [...pts.current.values()]
    const mid = p.length === 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0]
    start.current = { box: b, px: mid.x, py: mid.y, d: p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, mode }
  }

  const down = (e: PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, local(e))
    const mode = ((e.target as HTMLElement).dataset.handle as Handle | undefined) ?? 'move'
    snapshot(pts.current.size === 2 ? 'move' : mode)
    setActive(mode)
  }

  const move = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return
    pts.current.set(e.pointerId, local(e))
    const p = [...pts.current.values()]
    const st = start.current
    const s0 = st.box
    if (p.length === 2 && st.d) {
      // двумя пальцами — размер рамки вокруг её центра
      const size = s0.size * (Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / st.d)
      setBox(fitBox({ size, x: s0.x + (s0.size - size) / 2, y: s0.y + (s0.size - size) / 2 }))
      return
    }
    const dx = p[0].x - st.px
    const dy = p[0].y - st.py
    if (st.mode === 'move') return setBox(fitBox({ ...s0, x: s0.x + dx, y: s0.y + dy }))
    // угол: противоположный угол стоит на месте, рамка остаётся квадратной
    const sx = st.mode.endsWith('w') ? -1 : 1
    const sy = st.mode.startsWith('n') ? -1 : 1
    const ax = sx < 0 ? s0.x + s0.size : s0.x
    const ay = sy < 0 ? s0.y + s0.size : s0.y
    const want = s0.size + (sx * dx + sy * dy) / 2
    const room = Math.min(sx > 0 ? R.x + R.w - ax : ax - R.x, sy > 0 ? R.y + R.h - ay : ay - R.y)
    const size = clamp(want, Math.min(MIN_BOX, room), room)
    setBox({ size, x: sx > 0 ? ax : ax - size, y: sy > 0 ? ay : ay - size })
  }

  const up = (e: PointerEvent) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size) return snapshot('move')
    start.current = null
    setActive(null)
  }

  const reset = () => {
    setRot90(0)
    setTilt(0)
    setFlip(false)
    setAdjust(NO_ADJUST)
    setBoxKey('')
  }

  const done = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.imageSmoothingQuality = 'high'
    // от центра рамки к центру фото, в масштабе итоговой картинки
    ctx.translate(OUT / 2, OUT / 2)
    ctx.scale(OUT / b.size, OUT / b.size)
    ctx.translate(R.x + R.w / 2 - (b.x + b.size / 2), R.y + R.h / 2 - (b.y + b.size / 2))
    ctx.rotate(angle)
    ctx.scale(f * k * (flip ? -1 : 1), f * k)
    ctx.drawImage(img, -W / 2, -H / 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    applyAdjust(ctx, adjust)
    onDone({ src: c.toDataURL('image/jpeg', 0.72), ratio: 1 })
  }

  const handles: Handle[] = ['nw', 'ne', 'sw', 'se']

  return (
    <Sheet open={!!file} onClose={onCancel} title="Фото профиля">
      <div
        ref={stageRef}
        className="relative w-full touch-none overflow-hidden rounded-2xl bg-elevated select-none"
        style={{ height: stageH, cursor: active === 'move' ? 'grabbing' : 'grab' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => {
          const size = b.size * (e.deltaY < 0 ? 1.06 : 1 / 1.06)
          setBox(fitBox({ size, x: b.x + (b.size - size) / 2, y: b.y + (b.size - size) / 2 }))
        }}
      >
        {img && stageW > 0 && (
          <>
            {/* фото целиком (с наклоном — чуть крупнее, без пустых углов) */}
            <div className="pointer-events-none absolute overflow-hidden" style={{ left: R.x, top: R.y, width: R.w, height: R.h }}>
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  width: W,
                  height: H,
                  left: R.w / 2 - W / 2,
                  top: R.h / 2 - H / 2,
                  transform: `rotate(${angle}rad) scale(${f * k * (flip ? -1 : 1)}, ${f * k})`,
                  filter: cssFilter(adjust),
                }}
              />
            </div>
            {/* рамка: вокруг круга затемнено, по углам — ручки */}
            <div className="absolute" style={{ left: b.x, top: b.y, width: b.size, height: b.size }}>
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 32, 0.5)' }}
              />
              <div className="pointer-events-none absolute inset-0 border border-white/70" />
              <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white" />
              {active && (
                <div className="pointer-events-none absolute inset-0">
                  {[1, 2].map((i) => (
                    <span key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${(i * 100) / 3}%` }} />
                  ))}
                  {[1, 2].map((i) => (
                    <span key={`h${i}`} className="absolute right-0 left-0 h-px bg-white/50" style={{ top: `${(i * 100) / 3}%` }} />
                  ))}
                </div>
              )}
              {handles.map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  aria-hidden
                  className={cx(
                    'absolute h-8 w-8',
                    h.startsWith('n') ? '-top-3' : '-bottom-3',
                    h.endsWith('w') ? '-left-3' : '-right-3',
                    h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
                  )}
                >
                  {/* уголок-«Г» */}
                  <span
                    data-handle={h}
                    className={cx(
                      'absolute h-4 w-4 border-white',
                      h.startsWith('n') ? 'top-3 border-t-[3px]' : 'bottom-3 border-b-[3px]',
                      h.endsWith('w') ? 'left-3 border-l-[3px]' : 'right-3 border-r-[3px]',
                    )}
                  />
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-center text-xs">Двигайте рамку и тяните за углы. Колёсико или два пальца — тоже меняют размер</p>

      <div className="mt-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'crop', label: 'Кадр' },
            { id: 'color', label: 'Цвет' },
          ]}
        />
      </div>

      {tab === 'crop' ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRot90((v) => (v + 1) % 4)}
            aria-label="Повернуть на 90°"
            title="Повернуть на 90°"
            className="press card inline-flex h-11 w-11 shrink-0 items-center justify-center hover:bg-active"
          >
            <RotateCcwSquare size={20} />
          </button>
          <TiltRuler value={tilt} onChange={setTilt} />
          <button
            type="button"
            onClick={() => setFlip((v) => !v)}
            aria-label="Отразить"
            aria-pressed={flip}
            title="Отразить"
            className={cx('press card inline-flex h-11 w-11 shrink-0 items-center justify-center hover:bg-active', flip && 'chip-on')}
          >
            <FlipHorizontal2 size={20} />
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {(
            [
              ['brightness', 'Яркость'],
              ['contrast', 'Контраст'],
              ['saturation', 'Насыщенность'],
            ] as const
          ).map(([k2, label]) => (
            <label key={k2} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0">{label}</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={adjust[k2]}
                onChange={(e) => setAdjust((a) => ({ ...a, [k2]: Number(e.target.value) }))}
                onDoubleClick={() => setAdjust((a) => ({ ...a, [k2]: 0 }))}
                className="min-w-0 flex-1 cursor-pointer accent-accent"
                aria-label={label}
              />
              <span className="w-9 text-right text-xs tabular-nums">{adjust[k2] > 0 ? `+${adjust[k2]}` : adjust[k2]}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-[auto_1fr_1fr] gap-2">
        <Button kind="neutral" onClick={reset}>
          Сбросить
        </Button>
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

/** Линейка наклона −45°…45°: тянуть влево-вправо; нажатие на число — сбросить в 0 */
function TiltRuler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const start = useRef<{ x: number; v: number } | null>(null)
  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onChange(0)}
        className={cx('press mx-auto block rounded-full px-2 text-xs font-bold tabular-nums', value ? 'text-accent' : '')}
        aria-label="Наклон: сбросить в 0"
        title="Наклон. Нажмите, чтобы сбросить"
      >
        {value > 0 ? `+${Math.round(value)}` : Math.round(value)}°
      </button>
      <div
        className="relative h-7 cursor-ew-resize touch-none overflow-hidden"
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
                'absolute bottom-1 w-px rounded-full bg-ink',
                d % 15 === 0 ? 'h-4 opacity-80' : d % 5 === 0 ? 'h-3 opacity-50' : 'h-2 opacity-25',
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
