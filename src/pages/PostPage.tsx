import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Bookmark, ChefHat, CircleCheck, Heart, Link2, SearchX, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { AiMeta, Try } from '../data/types'
import { topicLabel } from '../data/types'
import { Rejected, useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, num, plural, timeAgo } from '../lib'
import { Masonry } from '../components/Masonry'
import { Gallery } from '../components/Gallery'
import { Avatar, Button, Empty, IconButton, Picture } from '../components/ui'

/** Сколько отзывов видно сразу; остальные — по кнопке */
const FIRST_TRIES = 3

export function PostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { post, user, triesOf, toggleFollow, follows, likes, toggleLike, savedIn, posts, me } = useStore()
  const { openSave, openTried, toast } = useUi()
  const [allTries, setAllTries] = useState(false)
  // ТЕСТ: показать, что увидел ИИ; убрать после тестов
  const [showAi, setShowAi] = useState(false)
  const triesRef = useRef<HTMLElement>(null)
  const p = post(id)

  useEffect(() => {
    window.scrollTo(0, 0)
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
  const shown = allTries || params.get('tab') === 'tries' ? tries : tries.slice(0, FIRST_TRIES)

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

  const likeButton = (cls: string) => (
    <button type="button" onClick={() => toggleLike(p.id)} aria-pressed={liked} aria-label="Нравится" className={cls}>
      <Heart size={20} className={cx(liked && 'fill-rose-500 text-rose-500')} />
      <span className="max-md:sr-only">{num(p.likes)}</span>
    </button>
  )

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
          {/* картинки — в них вся идея */}
          <div className="md:sticky md:top-20 md:self-start">
            <Gallery key={p.id} post={p} />
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full border chip-on px-2.5 py-1 text-xs font-semibold"
                title="Первая публикация этой идеи"
              >
                <BadgeCheck size={14} className="text-accent" strokeWidth={2.4} /> Оригинал
              </span>
              <Link
                to={`/search?q=${encodeURIComponent(topicLabel(p.topic))}`}
                className="press rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-active"
              >
                {topicLabel(p.topic)}
              </Link>
              {/* ТЕСТ: кнопка «Теги ИИ» — убрать после тестов */}
              <button
                type="button"
                onClick={() => setShowAi((v) => !v)}
                aria-expanded={showAi}
                className="press rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-semibold hover:bg-active"
              >
                Теги ИИ (тест)
              </button>
            </div>
            {showAi && (
              <div className="card mb-3 p-3 text-xs leading-relaxed">
                <p className="font-semibold">{p.ai?.checked ? 'Проверено ИИ' : 'ИИ не проверял (тестовый пост или ИИ был недоступен)'}</p>
                {p.ai?.meta ? (
                  <AiMetaView m={p.ai.meta} />
                ) : (
                  !!p.ai?.tags.length && (
                    <>
                      <p className="mt-2 text-muted">Старая проверка — подробной раскладки нет, только слова:</p>
                      <Words list={p.ai.tags} />
                    </>
                  )
                )}
                {p.ai?.text && (
                  <details className="mt-2">
                    <summary className="font-semibold">Описание и текст с картинок</summary>
                    <p className="mt-1 whitespace-pre-wrap">{p.ai.text}</p>
                  </details>
                )}
              </div>
            )}
            <h1 className="text-2xl leading-8 font-bold md:text-[28px] md:leading-9">{p.title}</h1>

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

            <div className="mt-5 hidden items-center gap-2 md:flex">
              {!isMine && (
                <Button className="flex-1" icon={CircleCheck} onClick={() => openTried(p.id)}>
                  Я попробовал
                </Button>
              )}
              {likeButton('press card inline-flex h-12 items-center gap-2 px-4 text-sm font-semibold hover:bg-active')}
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
                  <p className="text-sm leading-relaxed">
                    {isMine
                      ? 'Здесь появятся отзывы тех, кто повторит вашу идею.'
                      : 'Ещё никто не отметился. Попробуйте первым и расскажите, как вышло.'}
                  </p>
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
                    {shown.map((t) => (
                      <TryItem key={t.id} t={t} authorId={p.authorId} />
                    ))}
                  </ul>
                  {shown.length < tries.length && (
                    <Button kind="neutral" size="sm" className="mt-3 w-full" onClick={() => setAllTries(true)}>
                      Показать все отзывы · {tries.length}
                    </Button>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* телефон: главное действие всегда под пальцем */}
      <div
        className="fixed inset-x-2 z-30 flex justify-end gap-2 md:hidden"
        style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 6px) + 54px + 8px)' }}
      >
        {!isMine && (
          <Button className="flex-1 shadow-lg" icon={CircleCheck} onClick={() => openTried(p.id)}>
            Я попробовал
          </Button>
        )}
        {likeButton('press glass-strong inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg')}
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

/** Отзыв «Я попробовал» и ответы на него. Отвечать может любой, у автора поста — метка «автор» */
function TryItem({ t, authorId }: { t: Try; authorId: string }) {
  const { user, me, repliesOf, addReply, authed, setLoginOpen } = useStore()
  const replies = repliesOf(t.id)
  const [open, setOpen] = useState(false)
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const u = user(t.userId)

  const send = async () => {
    const v = text.trim()
    if (!v) return
    setBusy(true)
    setErr('')
    try {
      await addReply(t.id, v)
      setText('')
      setWriting(false)
      setOpen(true)
    } catch (e) {
      setErr(e instanceof Rejected ? `Не отправлено: ${e.reasons.join('. ')}` : 'Не получилось отправить. Попробуйте ещё раз.')
    }
    setBusy(false)
  }

  return (
    <li className="card p-3">
      <div className="flex gap-3">
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
          <div className="mt-1.5 flex gap-3 text-xs font-semibold">
            <button
              type="button"
              className="press text-accent hover:underline"
              onClick={() => (authed ? setWriting((w) => !w) : setLoginOpen(true))}
            >
              Ответить
            </button>
            {replies.length > 0 && (
              <button type="button" className="press hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Скрыть ответы' : `${replies.length} ${plural(replies.length, 'ответ', 'ответа', 'ответов')}`}
              </button>
            )}
          </div>
        </div>
        {t.img && <Picture img={{ ...t.img, ratio: 1 }} w={200} className="h-16 w-16 shrink-0 rounded-xl" />}
      </div>

      {open && replies.length > 0 && (
        <ul className="mt-3 ml-11 flex flex-col gap-3 border-l-2 border-line pl-3">
          {replies.map((r) => {
            const ru = user(r.userId)
            return (
              <li key={r.id} className="flex gap-2">
                <Link to={`/u/${ru.id}`} className="h-fit rounded-full">
                  <Avatar user={ru} size={24} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Link to={`/u/${ru.id}`} className="text-xs font-semibold hover:underline">
                      {ru.id === me.id ? 'Вы' : ru.name}
                    </Link>
                    {r.userId === authorId && <span className="rounded-full border chip-on px-1.5 text-[10px] font-bold">автор</span>}
                    <span className="text-[11px]">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{r.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {writing && (
        <form
          className="mt-3 ml-11 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={`Ответ для ${u.id === me.id ? 'себя' : u.name}`}
            aria-label="Ответ"
            className="card w-full resize-none px-3 py-2 text-sm outline-none placeholder:text-muted"
          />
          {err && (
            <p className="text-xs font-semibold text-rose-500" role="alert">
              {err}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px]">{text.length} / 500</span>
            <Button type="button" kind="neutral" size="sm" onClick={() => setWriting(false)}>
              Отмена
            </Button>
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              {busy ? 'Отправляем…' : 'Отправить'}
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}

// ТЕСТ: раскладка идеи от ИИ — убрать вместе с кнопкой «Теги ИИ»
function Words({ list }: { list: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {list.map((t) => (
        <span key={t} className="rounded-full border border-line bg-surface px-2 py-0.5 font-semibold">
          {t}
        </span>
      ))}
    </div>
  )
}

const META_ROWS: [keyof AiMeta, string][] = [
  ['idea', 'Идея'],
  ['kind', 'Вид'],
  ['main', 'Главное'],
  ['techniques', 'Способы'],
  ['tools', 'Инструменты'],
  ['occasion', 'Повод, время, место'],
  ['style', 'Характер, стиль'],
  ['related', 'Похожие темы (для рекомендаций)'],
  ['difficulty', 'Сложность'],
  ['time', 'Время'],
]

function AiMetaView({ m }: { m: AiMeta }) {
  return (
    <dl className="mt-2 grid gap-2">
      {META_ROWS.map(([k, label]) => {
        const v = m[k]
        const list = (Array.isArray(v) ? v : [v]).filter(Boolean)
        if (!list.length) return null
        return (
          <div key={k}>
            <dt className="text-muted">{label}</dt>
            <dd>
              <Words list={list} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
