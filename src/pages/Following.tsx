import { Link } from 'react-router-dom'
import { Bookmark, CircleCheck, MessageCircle, Users } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { num, plural, timeAgo } from '../lib'
import { MobileTop } from '../components/Layout'
import { Avatar, Button, Empty, TopicBadge } from '../components/ui'
import { Gallery } from '../components/Gallery'

/** Лента подписок — одна колонка, как в Instagram (DESIGN_WEB 3.4) */
function FeedCard({ post }: { post: Post }) {
  const { user, triesOf, savedIn, me } = useStore()
  const { openSave, openTried } = useUi()
  const a = user(post.authorId)
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
        <TopicBadge topic={post.topics[0]} className="max-w-[45%]" />
      </header>

      <Gallery post={post} maxRatio={1.25} />

      <div className="mt-2 flex items-center gap-1">
        <Link
          to={`/p/${post.id}?tab=tries`}
          className="press inline-flex h-10 items-center gap-1.5 rounded-2xl px-2 text-sm font-semibold whitespace-nowrap hover:bg-active"
          aria-label="Отзывы повторивших"
        >
          <MessageCircle size={20} />
          {tries.length}
        </Link>
        {post.authorId !== me.id && (
          <button
            type="button"
            onClick={() => openTried(post.id)}
            className="press ml-1 inline-flex h-9 items-center gap-1.5 rounded-2xl border chip-on px-3 text-sm font-semibold whitespace-nowrap"
          >
            <CircleCheck size={16} strokeWidth={2.4} className="text-accent" /> Я попробовал
          </button>
        )}
        <button
          type="button"
          onClick={() => openSave(post.id)}
          aria-label={saved ? 'Сохранено' : 'Сохранить'}
          className="press ml-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-active"
        >
          <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
        </button>
        {post.saves > 0 && <span className="-ml-1 text-sm font-semibold">{num(post.saves)}</span>}
      </div>

      <Link to={`/p/${post.id}`} className="mt-1 block px-1">
        <h2 className="text-sm font-semibold">{post.title}</h2>
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
