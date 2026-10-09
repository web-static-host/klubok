import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Check, CircleCheck, CircleX, Images } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num } from '../lib'
import { trackClick, trackView } from '../track'
import { Avatar, Picture, TopicBadge } from './ui'

/** Карточка ленты — DESIGN_WEB 3.3 */
export function PinCard({ post, folderId }: { post: Post; folderId?: string }) {
  const { user, triesOf, savedIn, folders, toggleDone, me, fresh } = useStore()
  const { openSave } = useUi()
  const author = user(post.authorId)
  const tries = triesOf(post.id)
  const okCount = tries.filter((t) => t.ok).length
  const failCount = tries.length - okCount
  const saved = savedIn(post.id).length > 0
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined
  const done = folder?.done.includes(post.id)

  // статистика автора: карточку увидели (видна хотя бы наполовину) и открыли. Свои не считаем.
  const mine = post.authorId === me.id
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || mine || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        trackView(post.id)
        io.disconnect()
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [post.id, mine])
  const open = () => !mine && trackClick(post.id)

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
          onClick={open}
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
        <Link to={`/p/${post.id}`} onClick={open} className="line-clamp-2 text-sm leading-5 font-semibold hover:underline">
          {post.title}
        </Link>
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
