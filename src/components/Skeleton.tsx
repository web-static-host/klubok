import type { CSSProperties } from 'react'
import { cx } from '../lib'
import { useColumns } from './Masonry'

/**
 * Заглушки, пока грузятся данные: та же разметка, что у настоящих блоков (колонки, отступы, подписи),
 * поэтому после загрузки ничего не прыгает — только серые места заполняются.
 */
export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  // скругление по умолчанию — только если своё не задано (иначе два скругления спорят и побеждает случайное)
  return (
    <span
      aria-hidden
      className={cx('block animate-pulse bg-elevated', !className?.includes('rounded-') && 'rounded-lg', className)}
      style={style}
    />
  )
}

/** Пропорции «картинок» — разные, как в настоящей ленте; одинаковые при каждом показе */
const RATIOS = [1.25, 1, 1.4, 0.8, 1.15, 1.33, 0.95, 1.5, 1.1, 1.2, 0.9, 1.3]

/** Карточка ленты: картинка + название + автор (как PinCard) */
function PinSkeleton({ ratio }: { ratio: number }) {
  return (
    <div className="min-w-0">
      <Bone className="rounded-2xl" style={{ aspectRatio: `1 / ${ratio}` }} />
      <div className="px-1 pt-2">
        <Bone className="mt-0.5 h-4 w-4/5" />
        <div className="mt-2 flex items-center gap-1.5">
          <Bone className="h-5 w-5 rounded-full" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

/** Плитка-заглушка: столько же колонок и такие же отступы, как у Masonry */
export function MasonrySkeleton({ rows = 3 }: { rows?: number }) {
  const n = useColumns()
  const cols: number[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (let k = 0; k < n * rows; k++) {
    const r = RATIOS[k % RATIOS.length]
    const i = heights.indexOf(Math.min(...heights))
    cols[i].push(r)
    heights[i] += r + 0.28
  }
  return (
    <div className="flex items-start gap-2 sm:gap-3" role="status" aria-label="Загрузка">
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
          {col.map((r, j) => (
            <PinSkeleton key={j} ratio={r} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Полоска категорий: таблетки до самого края (с затуханием, как у настоящей) и кружок стрелки справа на компьютере */
export function ChipsSkeleton() {
  const fade = 'linear-gradient(to right, #000 0, #000 calc(100% - 56px), transparent 100%)'
  return (
    <div className="relative" aria-hidden>
      <div className="flex gap-2 overflow-hidden" style={{ maskImage: fade, WebkitMaskImage: fade }}>
        {[52, 96, 88, 96, 136, 100, 84, 96, 104, 84, 124, 112, 92, 80, 96, 120, 88, 104].map((w, i) => (
          <Bone key={i} className="h-[38px] shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <Bone className="absolute top-1/2 right-0 hidden h-9 w-9 -translate-y-1/2 rounded-full md:block" />
    </div>
  )
}

/** Шапка профиля: аватар, имя, ник, три счётчика, кнопка, вкладки (как в Profile) */
export function ProfileHeadSkeleton() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center" role="status" aria-label="Загрузка">
      <Bone className="h-[88px] w-[88px] rounded-full" />
      <Bone className="mt-4 h-7 w-48" />
      <Bone className="mt-2 h-4 w-24" />
      <div className="mt-4 grid w-full max-w-sm grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-[62px] rounded-2xl" />
        ))}
      </div>
      <Bone className="mt-4 h-12 w-full max-w-sm rounded-2xl" />
      <Bone className="mt-5 h-11 w-full max-w-sm rounded-2xl" />
    </section>
  )
}

/** Страница идеи: картинка слева, справа плашки, название, автор, кнопка (как PostPage) */
export function PostSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-3 pt-3 md:px-6 md:pt-6" role="status" aria-label="Загрузка">
      <div className="mb-3 flex items-center gap-2">
        <Bone className="h-10 w-10 rounded-2xl" />
        <div className="flex-1" />
        <Bone className="h-10 w-10 rounded-2xl" />
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        <Bone className="aspect-[4/5] rounded-2xl" />
        <div className="min-w-0">
          <div className="mb-3 flex gap-2">
            {[88, 76, 92].map((w) => (
              <Bone key={w} className="h-[26px] rounded-full" style={{ width: w }} />
            ))}
          </div>
          <Bone className="h-8 w-3/4" />
          <Bone className="mt-4 h-[70px] rounded-2xl" />
          <Bone className="mt-5 hidden h-12 rounded-2xl md:block" />
          <Bone className="mt-8 h-4 w-28" />
          <Bone className="mt-2 h-[72px] rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

/** Карточка ленты подписок: автор, картинка, кнопки, название (как FeedCard) */
export function FeedCardSkeleton() {
  return (
    <div className="card p-3" aria-hidden>
      <div className="mb-3 flex items-center gap-3">
        <Bone className="h-9 w-9 rounded-full" />
        <div className="flex-1">
          <Bone className="h-4 w-32" />
          <Bone className="mt-1.5 h-3 w-16" />
        </div>
        <Bone className="h-7 w-20 rounded-full" />
      </div>
      <Bone className="aspect-[4/5] rounded-2xl" />
      <div className="mt-2 flex items-center gap-2">
        <Bone className="h-10 w-14 rounded-2xl" />
        <Bone className="h-9 w-36 rounded-2xl" />
        <div className="flex-1" />
        <Bone className="h-10 w-10 rounded-2xl" />
      </div>
      <Bone className="mt-2 h-4 w-2/3" />
    </div>
  )
}

/** Сетка папок (как FolderCard) */
export function FoldersSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="status" aria-label="Загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bone className="aspect-[4/3] rounded-2xl" />
          <Bone className="mt-2.5 h-4 w-2/3" />
          <Bone className="mt-1.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
