import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, CircleCheck, MessageCircle, Users } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore, type PostRow, type ProfileRow } from '../store'
import { useUi } from '../ui-context'
import { num, plural, timeAgo } from '../lib'
import { accessToken, restGet } from '../supabase'
import { trackView } from '../track'
import { MoreLoader, usePaged } from '../components/Paged'
import { MobileTop } from '../components/Layout'
import { Avatar, Button, Empty, TopicBadge } from '../components/ui'
import { Gallery } from '../components/Gallery'
import { Bone, FeedCardSkeleton } from '../components/Skeleton'

/** Лента подписок — одна колонка, как в Instagram (DESIGN_WEB 3.4) */
function FeedCard({ post }: { post: Post }) {
  const { user, savedIn, me } = useStore()
  const { openSave, openTried } = useUi()
  const a = user(post.authorId)
  const ok = post.triesOk
  const saved = savedIn(post.id).length > 0
  // статистика автора: показ в подписках
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || post.authorId === me.id || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        trackView(post.id, 'following')
        io.disconnect()
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [post.id, post.authorId, me.id])

  return (
    <article ref={box} className="card fade-up p-3">
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
          state={{ src: 'following' }}
          className="press inline-flex h-10 items-center gap-1.5 rounded-2xl px-2 text-sm font-semibold whitespace-nowrap hover:bg-active"
          aria-label="Отзывы повторивших"
        >
          <MessageCircle size={20} />
          {post.tries}
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

      <Link to={`/p/${post.id}`} state={{ src: 'following' }} className="mt-1 block px-1">
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
  const { follows, user, toggleFollow, me, mineReady, addUserRows } = useStore()
  // свои и тех, на кого подписан, — новые сверху, порциями
  const authors = [...follows, me.id].filter(Boolean)
  const { posts, list, more, retry } = usePaged(
    'following',
    async (offset, limit) =>
      authors.length
        ? restGet<PostRow[]>(
            `posts?select=*&author_id=in.(${authors.join(',')})&hidden=is.false&order=created_at.desc&offset=${offset}&limit=${limit}`,
            await accessToken(),
          )
        : [],
    { enabled: mineReady },
  )
  // кого почитать: популярные авторы, на которых ещё не подписан
  const [popular, setPopular] = useState<string[]>([])
  useEffect(() => {
    restGet<ProfileRow[]>('profiles?select=*&order=followers_count.desc&limit=20')
      .then((rows) => {
        addUserRows(rows)
        setPopular(rows.map((r) => r.id))
      })
      .catch(() => {})
  }, [addUserRows])
  const suggest = popular
    .filter((id) => id !== me.id && !follows.includes(id))
    .slice(0, 4)
    .map(user)
  const list2 = posts.filter((p) => !p.hidden)

  return (
    <>
      <MobileTop title="Подписки" />
      <div className="mx-auto flex max-w-[560px] flex-col gap-4 px-3 md:pt-6">
        {!mineReady || !list?.loaded ? (
          <>
            <div className="card p-3" role="status" aria-label="Загрузка">
              <Bone className="mb-3 h-3 w-28" />
              <div className="flex gap-2 overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <Bone key={i} className="h-[142px] w-32 shrink-0 rounded-2xl" />
                ))}
              </div>
            </div>
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </>
        ) : (
          <>
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
            {list2.length ? (
              <>
                {list2.map((p) => (
                  <FeedCard key={p.id} post={p} />
                ))}
                <MoreLoader list={list} onMore={more} onRetry={retry} />
              </>
            ) : (
              <Empty icon={Users}>Подпишитесь на авторов — их идеи появятся здесь.</Empty>
            )}
          </>
        )}
      </div>
    </>
  )
}
