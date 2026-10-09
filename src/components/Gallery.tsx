import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Img, Post } from '../data/types'
import { cx, imgSrc } from '../lib'
import { Picture } from './ui'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * Картинки поста. Несколько — листаются пальцем, как карусель в Instagram.
 * «До и после»: первый слайд — две первые картинки рядом, дальше листаются остальные (как сделали).
 * Картинки с содержимым не обрезаются (на них текст), нажатие — просмотр на весь экран с увеличением.
 */
export function Gallery({ post, maxRatio = 1.6, className }: { post: Post; maxRatio?: number; className?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [index, setIndex] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const imgs = post.images
  const pair = post.type === 'beforeafter' && imgs.length >= 2
  // слайд — номера картинок на нём: у «до и после» первый слайд из двух
  const slides: number[][] = pair ? [[0, 1], ...imgs.slice(2).map((_, i) => [i + 2])] : imgs.map((_, i) => [i])
  const many = slides.length > 1

  // высота — общая для всех слайдов. Обычно по первой картинке. У «до и после» — между парой (две рядом — вдвое ниже)
  // и первой картинкой с шагами: и пара видна крупно, и картинки с текстом не мельчат.
  const pairRatio = pair ? (imgs[0].ratio + imgs[1].ratio) / 4 : 0
  const ratio = clamp(pair ? (imgs[2] ? (pairRatio + imgs[2].ratio) / 2 : pairRatio) : (imgs[0]?.ratio ?? 1), 0.6, maxRatio)

  const go = (i: number) => {
    const el = strip.current
    if (el) el.scrollTo({ left: clamp(i, 0, slides.length - 1) * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className={cx('relative', className)}>
      <div
        ref={strip}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-2xl"
      >
        {slides.map((slide, k) =>
          slide.length === 2 ? (
            // «до» и «после» рядом — каждая половина заполняется целиком (это фото, а не картинки с текстом)
            <div key={k} className="grid w-full shrink-0 snap-center grid-cols-2 gap-0.5" style={{ aspectRatio: `1 / ${ratio}` }}>
              {slide.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOpen(i)}
                  className="relative"
                  aria-label={`${i ? 'После' : 'До'} — открыть`}
                >
                  <Picture fill img={imgs[i]} w={600} className="h-full" alt={`${post.title} — ${i ? 'после' : 'до'}`} />
                  <span className="glass-strong pointer-events-none absolute bottom-2 left-2 rounded-full px-3 py-1 text-xs font-bold">
                    {i ? 'После' : 'До'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => setOpen(slide[0])}
              className="w-full shrink-0 snap-center"
              aria-label={many ? `Картинка ${k + 1} из ${slides.length} — открыть` : 'Открыть картинку'}
            >
              <Picture img={{ ...imgs[slide[0]], ratio }} w={900} contain alt={`${post.title}${many ? ` — ${k + 1}` : ''}`} />
            </button>
          ),
        )}
      </div>
      {many && (
        <>
          <span className="glass-strong pointer-events-none absolute top-2 right-2 rounded-full px-2.5 py-1 text-xs font-bold">
            {index + 1} / {slides.length}
          </span>
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {slides.map((_, i) => (
              <span key={i} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-accent' : 'w-1.5 bg-line-strong')} />
            ))}
          </div>
          {index > 0 && <Arrow dir={-1} onClick={() => go(index - 1)} />}
          {index < slides.length - 1 && <Arrow dir={1} onClick={() => go(index + 1)} />}
        </>
      )}
      {open !== null && <Lightbox images={imgs} start={open} title={post.title} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Arrow({ dir, onClick, dark }: { dir: 1 | -1; onClick: () => void; dark?: boolean }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? 'Предыдущая' : 'Следующая'}
      className={cx(
        'press absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full md:inline-flex',
        dir < 0 ? 'left-2' : 'right-2',
        dark ? 'bg-white/15 text-white hover:bg-white/25' : 'glass-strong',
      )}
    >
      <Icon size={22} />
    </button>
  )
}

/** Просмотр на весь экран: листать — свайпом или стрелками, увеличивать — двумя пальцами, колёсиком или двойным нажатием */
function Lightbox({ images, start, title, onClose }: { images: Img[]; start: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(start)
  const go = (d: 1 | -1) => setI((x) => clamp(x + d, 0, images.length - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      if (e.key === 'ArrowRight') setI((x) => Math.min(images.length - 1, x + 1))
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [images.length, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/95 text-white" role="dialog" aria-modal aria-label={title}>
      <ZoomView key={i} img={images[i]} alt={title} onSwipe={go} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        {images.length > 1 && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
            {i + 1} / {images.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="press pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <X size={22} />
        </button>
      </div>
      {i > 0 && <Arrow dir={-1} onClick={() => go(-1)} dark />}
      {i < images.length - 1 && <Arrow dir={1} onClick={() => go(1)} dark />}
    </div>,
    document.body,
  )
}

interface Gesture {
  s: number
  x: number
  y: number
  /** расстояние между пальцами в начале */
  d: number
  /** точка начала (палец или середина между пальцами) */
  px: number
  py: number
  moved: number
}

function ZoomView({ img, alt, onSwipe }: { img: Img; alt: string; onSwipe: (d: 1 | -1) => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef<Gesture | null>(null)
  const lastTap = useRef(0)

  const snapshot = (cur: typeof t) => {
    const p = [...pts.current.values()]
    const mid = p.length === 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0]
    const d = p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0
    g.current = { ...cur, d, px: mid.x, py: mid.y, moved: g.current?.moved ?? 0 }
  }

  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (pts.current.size === 0) g.current = null
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    snapshot(t)
    setDragging(true)
  }

  const move = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = [...pts.current.values()]
    const st = g.current
    if (p.length === 2) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }
      st.moved = 99
      setT({ s: clamp((st.s * d) / st.d, 1, 5), x: st.x + mid.x - st.px, y: st.y + mid.y - st.py })
    } else {
      const dx = p[0].x - st.px
      const dy = p[0].y - st.py
      st.moved = Math.max(st.moved, Math.hypot(dx, dy))
      // увеличено — двигаем картинку; нет — тянем вбок для перелистывания
      setT(st.s > 1 ? { s: st.s, x: st.x + dx, y: st.y + dy } : { s: 1, x: dx, y: 0 })
    }
  }

  const up = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.delete(e.pointerId)
    const st = g.current
    if (pts.current.size > 0) return snapshot(t) // убрали один палец из двух
    setDragging(false)
    if (!st) return
    if (t.s <= 1.02) {
      if (Math.abs(t.x) > 60) onSwipe(t.x < 0 ? 1 : -1)
      setT({ s: 1, x: 0, y: 0 })
    }
    // двойное нажатие — увеличить / вернуть
    if (st.moved < 8) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        setT(t.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 })
        lastTap.current = 0
      } else lastTap.current = now
    }
  }

  return (
    <div
      className="absolute inset-0 flex touch-none items-center justify-center overflow-hidden select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onWheel={(e) =>
        setT((c) => {
          const s = clamp(c.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 5)
          return s === 1 ? { s, x: 0, y: 0 } : { ...c, s }
        })
      }
    >
      <img
        src={imgSrc(img)}
        alt={alt}
        draggable={false}
        className={cx('max-h-full max-w-full object-contain', !dragging && 'transition-transform duration-200')}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
      />
    </div>
  )
}
