import { Link } from 'react-router-dom'
import { Bookmark, CircleCheck, Heart, MessageCircle, Users } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num, plural, timeAgo } from '../lib'
import { MobileTop } from '../components/Layout'
import { Avatar, Button, Empty, Picture, TypeBadge } from '../components/ui'

/** Лента подписок — одна колонка, как в Instagram (DESIGN_WEB 3.4) */
function FeedCard({ post }: { post: Post }) {
  const { user, likes, toggleLike, triesOf, savedIn } = useStore()
  const { openSave, openTried } = useUi()
  const a = user(post.authorId)
  const liked = likes.includes(post.id)
  const tries = triesOf(post.id)
  const ok = tries.filter((t) => t.ok).length
  const saved = savedIn(post.id).length > 0

  return (
    <article className="card fade-up p-3">
      <header className="mb-3 flex items-center gap-3">
        <Link to={`/u/${a.id}`} className="rounded-full">
          <Avatar user={a} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/u/${a.id}`} className="block truncate text-sm font-bold hover:underline">
            {a.name}
          </Link>
          <span className="text-xs">{timeAgo(post.createdAt)}</span>
        </div>
        {post.type !== 'photo' && <TypeBadge type={post.type} />}
      </header>

      <Link to={`/p/${post.id}`} className="block rounded-xl">
        {post.type === 'beforeafter' && post.images[1] ? (
          <div className="grid grid-cols-2 gap-1.5">
            {post.images.slice(0, 2).map((im, i) => (
              <div key={i} className="relative">
                <Picture img={{ ...im, ratio: 1.25 }} w={400} className="rounded-xl" />
                <span className="glass-strong absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold">
                  {i ? 'После' : 'До'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Picture
            img={{ ...post.images[0], ratio: Math.min(post.images[0].ratio, 1.25) }}
            w={700}
            className="rounded-xl"
            alt={post.title}
          />
        )}
      </Link>

      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggleLike(post.id)}
          aria-pressed={liked}
          aria-label="Нравится"
          className="press inline-flex h-10 items-center gap-1.5 rounded-2xl px-2 text-sm font-semibold whitespace-nowrap hover:bg-active"
        >
          <Heart size={20} className={cx(liked && 'fill-rose-500 text-rose-500')} />
          {num(post.likes + (liked ? 1 : 0))}
        </button>
        <Link
          to={`/p/${post.id}?tab=tries`}
          className="press inline-flex h-10 items-center gap-1.5 rounded-2xl px-2 text-sm font-semibold whitespace-nowrap hover:bg-active"
          aria-label="Отзывы повторивших"
        >
          <MessageCircle size={20} />
          {tries.length}
        </Link>
        <button
          type="button"
          onClick={() => openTried(post.id)}
          className="press ml-1 inline-flex h-9 items-center gap-1.5 rounded-2xl border chip-on px-3 text-sm font-semibold whitespace-nowrap"
        >
          <CircleCheck size={16} strokeWidth={2.4} className="text-accent" /> Я попробовал
        </button>
        <button
          type="button"
          onClick={() => openSave(post.id)}
          aria-label={saved ? 'Сохранено' : 'Сохранить'}
          className="press ml-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-active"
        >
          <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <Link to={`/p/${post.id}`} className="mt-1 block px-1">
        <h2 className="text-sm font-semibold">{post.title}</h2>
        {post.text && <p className="mt-1 line-clamp-3 text-sm leading-relaxed">{post.text}</p>}
        {ok > 0 && (
          <p className="mt-2 text-xs font-semibold text-accent">
            Получилось у {ok} {plural(ok, 'человека', 'человек', 'человек')}
          </p>
        )}
      </Link>
    </article>
  )
}

export function Following() {
  const { posts, follows, users, toggleFollow, me } = useStore()
  const list = posts.filter((p) => follows.includes(p.authorId) || p.authorId === me.id).sort((a, b) => b.createdAt - a.createdAt)
  const suggest = users.filter((u) => u.id !== me.id && !follows.includes(u.id)).slice(0, 4)

  return (
    <>
      <MobileTop title="Подписки" />
      <div className="mx-auto flex max-w-[560px] flex-col gap-4 px-3 md:pt-6">
        {suggest.length > 0 && (
          <section aria-label="Кого почитать" className="card p-3">
            <p className="section-label mb-2">Кого почитать</p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {suggest.map((u) => (
                <div key={u.id} className="flex w-32 shrink-0 flex-col items-center rounded-2xl border border-line p-3 text-center">
                  <Link to={`/u/${u.id}`} className="flex flex-col items-center rounded-xl">
                    <Avatar user={u} size={48} />
                    <span className="mt-2 line-clamp-1 text-xs font-bold">{u.name}</span>
                    <span className="text-[11px]">{num(u.followers)} подп.</span>
                  </Link>
                  <Button size="sm" kind="secondary" className="mt-2 h-8 w-full px-2 text-xs" onClick={() => toggleFollow(u.id)}>
                    Подписаться
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
        {list.length ? (
          list.map((p) => <FeedCard key={p.id} post={p} />)
        ) : (
          <Empty icon={Users}>Подпишитесь на авторов — их идеи появятся здесь.</Empty>
        )}
      </div>
    </>
  )
}
