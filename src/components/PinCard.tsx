import { Link } from 'react-router-dom'
import { Bookmark, Check, CircleCheck, CircleX, Images } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num } from '../lib'
import { Avatar, Picture, TopicBadge } from './ui'

/** Карточка ленты — DESIGN_WEB 3.3 */
export function PinCard({ post, folderId }: { post: Post; folderId?: string }) {
  const { user, triesOf, savedIn, folders, toggleDone } = useStore()
  const { openSave } = useUi()
  const author = user(post.authorId)
  const tries = triesOf(post.id)
  const okCount = tries.filter((t) => t.ok).length
  const failCount = tries.length - okCount
  const saved = savedIn(post.id).length > 0
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined
  const done = folder?.done.includes(post.id)

  return (
    <article className="group fade-up min-w-0">
      <div className="relative">
        <Link to={`/p/${post.id}`} className="block rounded-2xl" aria-label={post.title}>
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
          {post.type !== 'beforeafter' && post.images.length > 1 && (
            <span
              className="glass-strong pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
              title={`${post.images.length} картинок`}
            >
              <Images size={12} strokeWidth={2.4} /> {post.images.length}
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
        </Link>
        <TopicBadge topic={post.topic} className="pointer-events-none absolute top-2 left-2 max-w-[calc(100%-56px)]" />
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
        <Link to={`/p/${post.id}`} className="line-clamp-2 text-sm leading-5 font-semibold hover:underline">
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
        </div>
      </div>
    </article>
  )
}
