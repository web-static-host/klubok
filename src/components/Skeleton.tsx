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

/**
 * Строка текста: серая полоска внутри обычной строки. Ставится в элемент с теми же классами шрифта, что у настоящего текста, —
 * поэтому высота строки совпадает с настоящей до пикселя.
 */
export function Line({ w }: { w: number | string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[0.8em] max-w-full animate-pulse rounded-md bg-elevated align-middle"
      style={{ width: w }}
    />
  )
}

/** Пропорции «картинок» — как у настоящих в среднем (1,0–1,5), одинаковые при каждом показе */
const RATIOS = [1.25, 1.1, 1.4, 1, 1.3, 1.2, 1.5, 1.15, 1.35, 0.9, 1.25, 1.3]
/** Длины названий (в буквах) — как у настоящих: в узкой колонке часть переносится на вторую строку */
const TITLES = [26, 20, 33, 24, 30, 18, 28, 22, 35, 25]

/** Ширина колонки ленты — как у Masonry (те же отступы страницы и промежутки) */
function columnWidth(n: number) {
  const w = Math.min(document.documentElement.clientWidth, 1600)
  const pad = w >= 1024 ? 24 : w >= 768 ? 16 : w >= 640 ? 12 : 8
  const gap = w >= 640 ? 12 : 8
  return (w - pad * 2 - gap * (n - 1)) / n
}

/** Карточка ленты: картинка + название + автор — та же разметка, что у PinCard */
function PinSkeleton({ ratio, title, colW }: { ratio: number; title: number; colW: number }) {
  // сколько букв названия влезает в строку (text-sm, полужирный: ~7,6 px на букву)
  const perLine = Math.max(8, Math.floor((colW - 8) / 7.6))
  const lines = Math.min(2, Math.ceil(title / perLine))
  return (
    <div className="min-w-0">
      <Bone className="rounded-2xl" style={{ aspectRatio: `1 / ${ratio}` }} />
      <div className="px-1 pt-2">
        <div className="text-sm leading-5 font-semibold">
          {lines === 2 ? (
            <>
              <Line w="95%" />
              <br />
              <Line w="55%" />
            </>
          ) : (
            <Line w={`${Math.min(95, Math.round((title / perLine) * 100))}%`} />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Bone className="h-5 w-5 rounded-full" />
          <span className="min-w-0 flex-1 text-xs">
            <Line w="55%" />
          </span>
        </div>
      </div>
    </div>
  )
}

/** Плитка-заглушка: столько же колонок и такие же отступы, как у Masonry */
export function MasonrySkeleton({ rows = 3 }: { rows?: number }) {
  const n = useColumns()
  const colW = columnWidth(n)
  const cols: { r: number; t: number }[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (let k = 0; k < n * rows; k++) {
    const r = RATIOS[k % RATIOS.length]
    const i = heights.indexOf(Math.min(...heights))
    cols[i].push({ r, t: TITLES[k % TITLES.length] })
    heights[i] += r + 0.28
  }
  return (
    // не короче экрана (см. PostSkeleton)
    <div className="flex min-h-dvh items-start gap-2 sm:gap-3" role="status" aria-label="Загрузка">
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
          {col.map((c, j) => (
            <PinSkeleton key={j} ratio={c.r} title={c.t} colW={colW} />
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

/** Шапка профиля — та же разметка, что в Profile: карточка автора (с кнопками), цифры; у себя на компьютере — тема и правила; вкладки */
export function ProfileHeadSkeleton({ self }: { self?: boolean }) {
  return (
    <div className="relative" role="status" aria-label="Загрузка">
      <Bone className="absolute top-0 left-0 h-10 w-10 rounded-2xl max-xl:hidden" />
      <section className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-center">
        <div className="card flex min-w-0 items-center gap-3 p-3 md:max-w-[560px] md:py-2">
          <Bone className="h-10 w-10 shrink-0 rounded-2xl xl:hidden" />
          <Bone className="h-14 w-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-7 font-bold">
              <Line w="9em" />
            </h1>
            <p className="text-sm">
              <Line w="7em" />
            </p>
          </div>
          {/* у себя: на компьютере «Изменить профиль» и «Выйти» столбиком, на телефоне — шестерёнка; у чужого — «Подписаться» */}
          <Bone className={cx('ml-1 shrink-0 rounded-2xl', self ? 'h-10 w-10 md:h-[68px] md:w-[188px]' : 'h-9 w-[120px] max-md:hidden')} />
        </div>
        {!self && <Bone className="min-h-12 rounded-2xl md:hidden" />}
        <div className="grid grid-cols-3 gap-2 md:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex flex-col justify-center px-3 py-2 text-center md:min-w-[120px]">
              <div className="text-lg leading-6 font-bold">
                <Line w="2em" />
              </div>
              <div className="text-xs">
                <Line w="6em" />
              </div>
            </div>
          ))}
        </div>
      </section>
      {self && (
        <div className="mt-2 flex justify-center gap-2 max-md:hidden">
          <Bone className="h-[52px] w-[380px] rounded-2xl" />
          <Bone className="h-[52px] w-[178px] rounded-2xl" />
        </div>
      )}
      <div className="mx-auto mt-2 w-full max-w-sm">
        <div className="card grid grid-cols-2 gap-1 p-1">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-transparent px-2 py-2.5 text-sm font-semibold">
              <Line w="6em" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Страница идеи — та же разметка, что в PostPage: картинка слева, справа плашки, название, автор, кнопка, отзывы */
export function PostSkeleton() {
  return (
    // не короче экрана: полоса прокрутки есть сразу и не сдвигает страницу, когда появится настоящая (длинная) страница
    <div className="mx-auto min-h-dvh max-w-6xl px-3 pt-3 md:px-6 md:pt-6 md:pl-[72px] xl:pl-6" role="status" aria-label="Загрузка">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        <div className="relative">
          <Bone className="aspect-[4/5] rounded-2xl" />
          <Bone className="absolute top-0 -left-12 h-10 w-10 rounded-2xl max-md:hidden" />
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex items-start gap-2">
            <div className="flex flex-1 flex-wrap gap-2">
              {[88, 76, 92].map((w) => (
                <Bone key={w} className="h-[26px] rounded-full" style={{ width: w }} />
              ))}
            </div>
            <Bone className="h-10 w-10 rounded-2xl" />
          </div>
          {/* на телефоне название обычно в две строки */}
          <h1 className="text-2xl leading-8 font-bold md:text-[28px] md:leading-9">
            <Line w="90%" />
            <br className="md:hidden" />
            <span className="md:hidden">
              <Line w="45%" />
            </span>
          </h1>
          <div className="card mt-4 flex items-center gap-3 p-3">
            <Bone className="h-11 w-11 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">
                <Line w="9em" />
              </div>
              {/* «подписчики · когда»: рядом с кнопкой на узком экране занимает 2–3 строки */}
              <div className="text-xs">
                <Line w="90%" />
                <br className="md:hidden" />
                <span className="md:hidden">
                  <Line w="90%" />
                </span>
                <br className="sm:hidden" />
                <span className="sm:hidden">
                  <Line w="40%" />
                </span>
              </div>
            </div>
            <Bone className="h-9 w-[124px] rounded-2xl" />
          </div>
          <div className="mt-5 hidden gap-2 md:flex">
            <Bone className="h-12 flex-1 rounded-2xl" />
            <Bone className="h-12 w-[72px] rounded-2xl" />
          </div>
          <div className="section-label mt-8 mb-2">
            <Line w="7em" />
          </div>
          <Bone className="h-[72px] rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

/** Карточка ленты подписок — та же разметка, что FeedCard */
export function FeedCardSkeleton() {
  return (
    <div className="card p-3" aria-hidden>
      <div className="mb-3 flex items-center gap-3">
        <Bone className="h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            <Line w="9em" />
          </div>
          <div className="text-xs">
            <Line w="5em" />
          </div>
        </div>
        <Bone className="h-[26px] w-20 rounded-full" />
      </div>
      <Bone className="aspect-[4/5] rounded-2xl" />
      <div className="mt-2 flex items-center gap-1">
        <Bone className="h-10 w-14 rounded-2xl" />
        <Bone className="ml-1 h-9 w-36 rounded-2xl" />
        <div className="flex-1" />
        <Bone className="h-10 w-10 rounded-2xl" />
      </div>
      <div className="mt-1 px-1 text-sm font-semibold">
        <Line w="60%" />
      </div>
    </div>
  )
}

/** Сетка папок — та же разметка, что FolderCard: обложка, название, сколько идей */
export function FoldersSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="status" aria-label="Загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bone className="aspect-[4/3] rounded-2xl" />
          <p className="mt-2 px-1 text-sm font-semibold">
            <Line w="65%" />
          </p>
          <p className="px-1 text-xs">
            <Line w="40%" />
          </p>
        </div>
      ))}
    </div>
  )
}
