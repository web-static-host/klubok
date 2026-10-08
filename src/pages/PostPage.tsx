import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Bookmark,
  ChefHat,
  CircleCheck,
  Clock,
  Gauge,
  Heart,
  Link2,
  SearchX,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num, plural, timeAgo } from '../lib'
import { Masonry } from '../components/Masonry'
import { Avatar, Button, Empty, IconButton, Picture, TypeBadge } from '../components/ui'

export function PostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { post, user, triesOf, toggleFollow, follows, likes, toggleLike, savedIn, posts, me } = useStore()
  const { openSave, openTried, toast } = useUi()
  const [checked, setChecked] = useState<number[]>([])
  const triesRef = useRef<HTMLElement>(null)
  const p = post(id)

  useEffect(() => {
    window.scrollTo(0, 0)
    setChecked([])
  }, [id])
  useEffect(() => {
    if (params.get('tab') === 'tries') triesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [params, id])

  if (!p) return <Empty icon={SearchX}>Такой идеи нет или её удалили.</Empty>

  const a = user(p.authorId)
  const tries = triesOf(p.id)
  const ok = tries.filter((t) => t.ok).length
  const pct = tries.length ? Math.round((ok / tries.length) * 100) : 0
  const photos = tries.filter((t) => t.img)
  const liked = likes.includes(p.id)
  const saved = savedIn(p.id)
  const isMine = p.authorId === me.id
  const more = posts.filter((x) => x.id !== p.id && x.topic === p.topic).slice(0, 12)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: p.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Ссылка скопирована')
      }
    } catch {
      /* пользователь отменил */
    }
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-3 pt-3 md:px-6 md:pt-6">
        <div className="mb-3 flex items-center gap-2">
          <IconButton icon={ArrowLeft} label="Назад" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} />
          <div className="flex-1" />
          <IconButton icon={Link2} label="Поделиться" onClick={share} />
          <IconButton
            icon={Bookmark}
            label={saved.length ? 'Сохранено' : 'Сохранить'}
            active={saved.length > 0}
            onClick={() => openSave(p.id)}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
          {/* картинки */}
          <div className="md:sticky md:top-20 md:self-start">
            {p.type === 'beforeafter' && p.images[1] ? (
              <div className="grid grid-cols-2 gap-2">
                {p.images.slice(0, 2).map((im, i) => (
                  <figure key={i} className="relative">
                    <Picture img={im} w={600} className="rounded-2xl" alt={`${p.title} — ${i ? 'после' : 'до'}`} />
                    <figcaption className="glass-strong absolute bottom-2 left-2 rounded-full px-3 py-1 text-xs font-bold">
                      {i ? 'После' : 'До'}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <Picture img={p.images[0]} w={900} className="rounded-2xl" alt={p.title} />
            )}
          </div>

          {/* текст */}
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full border chip-on px-2.5 py-1 text-xs font-semibold"
                title="Первая публикация этой идеи"
              >
                <BadgeCheck size={14} className="text-accent" strokeWidth={2.4} /> Оригинал
              </span>
              {p.type !== 'photo' && <TypeBadge type={p.type} />}
            </div>
            <h1 className="text-2xl leading-8 font-bold md:text-[28px] md:leading-9">{p.title}</h1>
            {p.text && <p className="mt-3 text-[15px] leading-relaxed">{p.text}</p>}

            {/* автор */}
            <div className="card mt-4 flex items-center gap-3 p-3">
              <Link to={`/u/${a.id}`} className="rounded-full">
                <Avatar user={a} size={44} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/u/${a.id}`} className="block truncate text-sm font-bold hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs">
                  {num(a.followers)} {plural(a.followers, 'подписчик', 'подписчика', 'подписчиков')} · {timeAgo(p.createdAt)}
                </span>
              </div>
              {!isMine && (
                <Button size="sm" kind={follows.includes(a.id) ? 'neutral' : 'secondary'} onClick={() => toggleFollow(a.id)}>
                  {follows.includes(a.id) ? 'Вы подписаны' : 'Подписаться'}
                </Button>
              )}
            </div>

            {/* рецепт */}
            {p.recipe && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { icon: Clock, t: p.recipe.time },
                    { icon: Users, t: `${p.recipe.servings} ${plural(p.recipe.servings, 'порция', 'порции', 'порций')}` },
                    { icon: Gauge, t: p.recipe.difficulty },
                  ].map(({ icon: I, t }) => (
                    <span key={t} className="card inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold">
                      <I size={16} /> {t}
                    </span>
                  ))}
                </div>
                <h2 className="section-label mt-6 mb-2">Ингредиенты</h2>
                <ul className="card divide-y divide-[var(--border)]">
                  {p.recipe.ingredients.map((ing, i) => {
                    const on = checked.includes(i)
                    return (
                      <li key={i}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setChecked((c) => (on ? c.filter((x) => x !== i) : [...c, i]))}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden
                            className={cx(
                              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                              on ? 'grad border-transparent' : 'border-line-strong bg-surface',
                            )}
                          >
                            {on && <Check size={13} strokeWidth={3.2} />}
                          </span>
                          <span className={cx(on && 'line-through opacity-60')}>{ing}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* шаги */}
            {!!(p.recipe?.steps.length || p.steps?.length) && (
              <>
                <h2 className="section-label mt-6 mb-2">Шаги</h2>
                <ol className="flex flex-col gap-2">
                  {(p.recipe ? p.recipe.steps.map((t) => ({ text: t, img: undefined })) : p.steps!).map((s, i) => (
                    <li key={i} className="card flex gap-3 p-3">
                      <span className="grad inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="pt-0.5 text-sm leading-relaxed">{s.text}</p>
                        {s.img && <Picture img={s.img} w={400} className="mt-2 w-40 rounded-xl" />}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {p.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <Link
                    key={t}
                    to={`/search?q=${encodeURIComponent(t)}`}
                    className="press rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-active"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-5 hidden items-center gap-2 md:flex">
              <Button className="flex-1" icon={CircleCheck} onClick={() => openTried(p.id)}>
                Я попробовал
              </Button>
              <button
                type="button"
                onClick={() => toggleLike(p.id)}
                aria-pressed={liked}
                aria-label="Нравится"
                className="press card inline-flex h-12 items-center gap-2 px-4 text-sm font-semibold hover:bg-active"
              >
                <Heart size={20} className={cx(liked && 'fill-rose-500 text-rose-500')} />
                {num(p.likes + (liked ? 1 : 0))}
              </button>
            </div>
            {saved.length > 0 && (
              <p className="mt-3 text-xs">
                В ваших папках:{' '}
                {saved.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 && ', '}
                    <Link to={`/folders/${f.id}`} className="font-semibold text-accent hover:underline">
                      {f.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            {/* повторили */}
            <section ref={triesRef} className="mt-8 scroll-mt-20" aria-labelledby="tries-h">
              <h2 id="tries-h" className="section-label mb-2">
                Повторили · {tries.length}
              </h2>
              {tries.length === 0 ? (
                <div className="card flex items-center gap-3 p-4">
                  <ChefHat size={28} strokeWidth={1.6} />
                  <p className="text-sm leading-relaxed">Ещё никто не отметился. Попробуйте первым и расскажите, как вышло.</p>
                </div>
              ) : (
                <>
                  <div className="card p-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-bold">{pct}% получилось</span>
                      <span className="text-xs">
                        {ok} из {tries.length}
                      </span>
                    </div>
                    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-elevated" role="img" aria-label={`${pct}% получилось`}>
                      <span className="grad h-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {photos.length > 0 && (
                    <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                      {photos.map((t) => (
                        <Picture
                          key={t.id}
                          img={{ ...t.img!, ratio: 1 }}
                          w={200}
                          className="h-[72px] w-[72px] shrink-0 rounded-xl"
                          alt={`Фото от ${user(t.userId).name}`}
                        />
                      ))}
                    </div>
                  )}

                  <ul className="mt-3 flex flex-col gap-2">
                    {tries.map((t) => {
                      const u = user(t.userId)
                      return (
                        <li key={t.id} className="card flex gap-3 p-3">
                          <Link to={`/u/${u.id}`} className="h-fit rounded-full">
                            <Avatar user={u} size={32} />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Link to={`/u/${u.id}`} className="text-sm font-semibold hover:underline">
                                {u.id === me.id ? 'Вы' : u.name}
                              </Link>
                              <span
                                className={cx(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                                  t.ok ? 'bg-accent/10 text-accent' : 'bg-rose-500/10 text-rose-500',
                                )}
                              >
                                {t.ok ? <ThumbsUp size={11} strokeWidth={2.6} /> : <ThumbsDown size={11} strokeWidth={2.6} />}
                                {t.ok ? 'Получилось' : 'Не получилось'}
                              </span>
                              <span className="text-[11px]">{timeAgo(t.createdAt)}</span>
                            </div>
                            {t.text && <p className="mt-1 text-sm leading-relaxed">{t.text}</p>}
                          </div>
                          {t.img && <Picture img={{ ...t.img, ratio: 1 }} w={200} className="h-16 w-16 shrink-0 rounded-xl" />}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* телефон: главное действие всегда под пальцем */}
      <div
        className="fixed inset-x-2 z-30 flex gap-2 md:hidden"
        style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 6px) + 54px + 8px)' }}
      >
        <Button className="flex-1 shadow-lg" icon={CircleCheck} onClick={() => openTried(p.id)}>
          Я попробовал
        </Button>
        <button
          type="button"
          onClick={() => toggleLike(p.id)}
          aria-pressed={liked}
          aria-label="Нравится"
          className="press glass-strong inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
        >
          <Heart size={20} className={cx(liked && 'fill-rose-500 text-rose-500')} />
        </button>
      </div>
      <div className="h-16 md:hidden" aria-hidden />

      {more.length > 0 && (
        <section className="mt-10 px-2 sm:px-3 md:px-4 lg:px-6" aria-labelledby="more-h">
          <h2 id="more-h" className="mb-3 px-1 text-lg font-bold md:text-center">
            Ещё идеи
          </h2>
          <Masonry posts={more} />
        </section>
      )}
    </>
  )
}
