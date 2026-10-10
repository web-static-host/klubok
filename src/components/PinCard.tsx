import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, Bookmark, Check, CircleCheck, CircleX, EyeOff, Flag, Images, Loader2, Undo2 } from 'lucide-react'
import { topicLabel, type Post } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num } from '../lib'
import { trackView, type Source } from '../track'
import { Avatar, Menu, Picture, TopicBadge } from './ui'

/** Карточка ленты — DESIGN_WEB 3.3 */
/** source — где показана карточка (для статистики автора: откуда приходят) */
export function PinCard({ post, folderId, source }: { post: Post; folderId?: string; source: Source }) {
  const { user, savedIn, folders, toggleDone, me, fresh, markNotInterested, hiddenNow } = useStore()
  const { openSave, openReport } = useUi()
  const nav = useNavigate()
  const author = user(post.authorId)
  const okCount = post.triesOk
  const failCount = post.tries - post.triesOk
  const saved = savedIn(post.id).length > 0
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined
  const done = folder?.done.includes(post.id)

  // статистика автора: карточку увидели (видна хотя бы наполовину); открытие считает страница идеи. Свои не считаем.
  const mine = post.authorId === me.id
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || mine || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        trackView(post.id, source)
        io.disconnect()
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [post.id, mine, source])
  // откуда открыли — странице идеи (для статистики автора)
  const from = { src: source }

  // скрыли в «Для вас» — на месте карточки «Что не так?»
  if (source === 'home' && hiddenNow[post.id])
    return (
      <article ref={box} className="min-w-0">
        <HiddenPanel post={post} />
      </article>
    )

  return (
    <article ref={box} className="group fade-up min-w-0">
      {/* только что опубликованная — пару секунд в бирюзовой рамке */}
      <div
        className={cx(
          'relative rounded-2xl transition-shadow duration-700',
          // рамка с отступом — только пока нужна: иначе от отступа по углам остаётся тонкая дуга
          fresh === post.id && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
        )}
      >
        <Link
          to={`/p/${post.id}`}
          state={from}
          className={cx('block rounded-2xl', post.hidden && 'opacity-50 grayscale')}
          aria-label={post.title}
        >
          {post.type === 'beforeafter' && post.images[1] ? (
            <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-2xl" style={{ aspectRatio: `1 / ${post.images[0].ratio}` }}>
              {post.images.slice(0, 2).map((im, i) => (
                <div key={i} className="relative">
                  <Picture fill img={im} w={300} className="h-full" alt={i ? 'После' : 'До'} />
                  <span className="glass-strong absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
                    {i ? 'После' : 'До'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Picture img={post.images[0]} w={500} className="rounded-2xl" alt={post.title} />
          )}
          {post.images.length > (post.type === 'beforeafter' ? 2 : 1) && (
            <span
              className={cx(
                'glass-strong pointer-events-none absolute inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition-opacity',
                // у «до и после» внизу надписи — значок наверх (при наведении там категории — прячем)
                post.type === 'beforeafter' ? 'top-2 left-2 md:group-hover:opacity-0' : 'right-2 bottom-2',
              )}
              title={`${post.images.length} картинок`}
            >
              <Images size={12} strokeWidth={2.4} /> {post.images.length}
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
        </Link>
        {/* скрытая (видит только автор): картинка серая, причина — по центру */}
        {post.hidden && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl p-3">
            {/* красный крест от угла до угла */}
            <svg className="absolute inset-0 h-full w-full text-rose-500" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path
                d="M0 0 100 100M100 0 0 100"
                stroke="currentColor"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            </svg>
            <div className="glass-strong relative max-w-full rounded-2xl px-3 py-2 text-center">
              <p className="text-xs font-bold text-rose-500">Скрыто</p>
              <p className="mt-0.5 line-clamp-4 text-xs leading-4 font-semibold">{post.hidden}</p>
            </div>
          </div>
        )}
        {/* категории — только при наведении (на картинке плашки нет) */}
        <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-56px)] flex-wrap gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 max-md:hidden">
          {post.topics.map((t) => (
            <TopicBadge key={t} topic={t} />
          ))}
        </div>
        {folder ? (
          <button
            type="button"
            onClick={() => toggleDone(folder.id, post.id)}
            aria-pressed={done}
            aria-label={done ? 'Снять отметку «Сделано»' : 'Отметить «Сделано»'}
            className={cx(
              'press absolute top-2 right-2 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold',
              done ? 'grad' : 'glass-strong',
            )}
          >
            <Check size={14} strokeWidth={2.6} />
            {done ? 'Сделано' : 'Сделать'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openSave(post.id)}
            aria-label={saved ? 'Сохранено. Изменить папки' : 'Сохранить в папку'}
            title={saved ? 'Сохранено' : 'Сохранить'}
            className={cx(
              'press absolute top-2 right-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-bold',
              saved
                ? 'glass-strong w-9 text-ink'
                : 'grad w-9 transition-opacity duration-200 sm:w-auto sm:px-3 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
            )}
          >
            <Bookmark size={15} strokeWidth={2.4} fill={saved ? 'currentColor' : 'none'} />
            {!saved && <span className="hidden sm:inline">Сохранить</span>}
          </button>
        )}
      </div>
      <div className="px-1 pt-2">
        <div className="flex items-start gap-1">
          <Link to={`/p/${post.id}`} state={from} className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-semibold hover:underline">
            {post.title}
          </Link>
          {/* «…»: своё — статистика; чужое — «Не интересно» (в ленте «Для вас») и «Пожаловаться» */}
          <Menu
            label="Ещё"
            className="-mt-1.5 -mr-1.5 shrink-0"
            items={
              mine
                ? [{ label: 'Статистика', icon: BarChart3, onClick: () => nav(`/stats/${post.id}`) }]
                : [
                    ...(source === 'home'
                      ? [
                          {
                            label: 'Не интересно',
                            icon: EyeOff,
                            onClick: () => markNotInterested(post.id),
                          },
                        ]
                      : []),
                    { label: 'Пожаловаться', icon: Flag, onClick: () => openReport('post', post.id), danger: true },
                  ]
            }
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Link to={`/u/${author.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full">
            <Avatar user={author} size={20} />
            <span className="truncate text-xs">{author.name}</span>
          </Link>
          {okCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent" title="Получилось у повторивших">
              <CircleCheck size={13} strokeWidth={2.4} />
              {num(okCount)}
            </span>
          )}
          {failCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-500"
              title="Не получилось у повторивших"
            >
              <CircleX size={13} strokeWidth={2.4} />
              {num(failCount)}
            </span>
          )}
          {post.saves > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold" title="Добавили в избранное">
              <Bookmark size={13} strokeWidth={2.4} />
              {num(post.saves)}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * Скрытая идея: «Что не понравилось?» — варианты из того, чем она отличается от понравившегося (до 2 слов), категория,
 * «Слишком сложно», «Слишком долго», автор и «Уже попадалось». Ответ необязателен; «Вернуть» — отменить. DESIGN_WEB: «Не интересно».
 */
function HiddenPanel({ post }: { post: Post }) {
  const { hiddenNow, answerNotInterested, undoNotInterested, user } = useStore()
  const h = hiddenNow[post.id]
  const label = (o: string) =>
    o === 'seen'
      ? 'Уже попадалось'
      : o === 'd:сложно'
        ? 'Слишком сложно'
        : o === 'tm:долго'
          ? 'Слишком долго'
          : o.startsWith('t:')
            ? topicLabel(o.slice(2))
            : o.startsWith('u:')
              ? `Автор: ${user(o.slice(2)).name}`
              : cap(o)
  const thanks = (o: string) =>
    o === 'seen'
      ? 'Понятно. Похожие оставим'
      : o === 'd:сложно'
        ? 'Сложных идей будет меньше'
        : o === 'tm:долго'
          ? 'Долгих идей будет меньше'
          : o.startsWith('t:')
            ? `Идей из «${topicLabel(o.slice(2))}» будет меньше`
            : o.startsWith('u:')
              ? `Идеи автора ${user(o.slice(2)).name} больше не покажем`
              : `Идей про «${o}» будет меньше`
  const ratio = post.images[0]?.ratio ?? 1
  return (
    <div
      className="card fade-in flex flex-col justify-center gap-3 rounded-2xl p-4"
      style={{ aspectRatio: `1 / ${Math.min(Math.max(ratio, 0.8), 1.6)}` }}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <EyeOff size={16} strokeWidth={2.4} className="shrink-0 text-muted" />
        {h.answer ? 'Спасибо, учтём' : 'Скрыли'}
      </p>
      {h.answer ? (
        <p className="text-sm leading-5">{thanks(h.answer)}</p>
      ) : h.options === null ? (
        <Loader2 size={20} className="animate-spin text-muted" aria-label="Загружаем" />
      ) : (
        <>
          <p className="text-xs leading-4 text-muted">Что не понравилось? Так лента станет точнее</p>
          <div className="flex flex-wrap gap-1.5">
            {[...h.options, 'seen'].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => answerNotInterested(post.id, o)}
                className="press max-w-full truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-active"
              >
                {label(o)}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => undoNotInterested(post.id)}
        className="press inline-flex items-center gap-1.5 self-start rounded-full px-1 py-1 text-sm font-semibold text-accent hover:underline"
      >
        <Undo2 size={15} strokeWidth={2.4} /> Вернуть
      </button>
    </div>
  )
}
