import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../lib'

const FADE = 56

/**
 * Горизонтальная полоска (категории): на телефоне листается пальцем, на компьютере — стрелками ‹ › и колесом мыши.
 * У краёв, за которыми есть ещё, — затухание, чтобы было видно, что полоска продолжается.
 */
export function ScrollRow({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
    }
    // колесо мыши (вверх-вниз) листает полоску вбок; у конца полоски — дальше крутится страница
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0 || (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const c of el.children) ro.observe(c)
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', wheel)
    }
  }, [children])

  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' })
  const mask = `linear-gradient(to right, ${edges.left ? `transparent 0, #000 ${FADE}px` : '#000 0'}, ${
    edges.right ? `#000 calc(100% - ${FADE}px), transparent 100%` : '#000 100%'
  })`
  const arrow =
    'press glass-strong absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full shadow-md md:inline-flex'

  return (
    <div className={cx('relative', className)}>
      <div
        ref={ref}
        aria-label={label}
        className="no-scrollbar flex gap-2 overflow-x-auto"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
      {edges.left && (
        <button type="button" aria-label="Листать влево" onClick={() => go(-1)} className={cx(arrow, 'left-0')}>
          <ChevronLeft size={18} />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Листать вправо" onClick={() => go(1)} className={cx(arrow, 'right-0')}>
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}
