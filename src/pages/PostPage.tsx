import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Bookmark, ChefHat, CircleCheck, Flag, Link2, SearchX, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import type { AiMeta, Try } from '../data/types'
import { topicLabel } from '../data/types'
import { Rejected, useStore, type PostRow } from '../store'
import { accessToken, restGet } from '../supabase'
import { trackFollowFromPost, trackLeave, trackOpen, trackShare, type Source } from '../track'
import { MoreLoader, usePaged } from '../components/Paged'
import { useUi } from '../ui-context'
import { cx, num, plural, timeAgo } from '../lib'
import { Masonry } from '../components/Masonry'
import { Gallery } from '../components/Gallery'
import { Sheet } from '../components/Sheet'
import { Bone, PostSkeleton } from '../components/Skeleton'
import { Avatar, Button, Empty, IconButton, Picture } from '../components/ui'

/** Сколько отзывов видно сразу; остальные — по кнопке */
const FIRST_TRIES = 3

export function PostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { post, user, triesOf, loadTries, toggleFollow, follows, savedIn, me, deletePost, authReady, addPostRows } = useStore()
  const { openSave, openTried, toast, openReport } = useUi()
  const loc = useLocation()
  const [allTries, setAllTries] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')
  // ТЕСТ: показать, что увидел ИИ; убрать после тестов
  const [showAi, setShowAi] = useState(false)
  const triesRef = useRef<HTMLElement>(null)
  const p = post(id)
  const mine = !!p && p.authorId === me.id

  // идеи нет среди загруженных (открыли по ссылке) — берём из базы; свою скрытую — с пропуском автора
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setMissing(false)
    if (post(id) || !authReady) return
    let live = true
    ;(async () => restGet<PostRow[]>(`posts?select=*&id=eq.${id}`, await accessToken()))()
      .then((rows) => {
        if (!live) return
        if (rows.length) addPostRows(rows)
        else setMissing(true)
      })
      .catch(() => live && setMissing(true))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authReady])

  // отзывы и ответы — только к открытой идее
  useEffect(() => {
    if (p) loadTries(p.id)
  }, [p?.id, loadTries]) // eslint-disable-line react-hooks/exhaustive-deps

  // статистика автора: открыли идею (откуда), сколько секунд смотрели (только пока вкладка видна) и до какой картинки долистали
  const src: Source = (loc.state as { src?: Source } | null)?.src ?? 'link'
  const maxSeen = useRef(1)
  const pid = p?.id
  useEffect(() => {
    if (!pid || !authReady || mine) return
    trackOpen(pid, src)
    maxSeen.current = 1
    let since = document.visibilityState === 'visible' ? Date.now() : 0
    let total = 0
    const flush = () => {
      if (since) total += Date.now() - since
      since = 0
      trackLeave(pid, total / 1000, maxSeen.current)
      total = 0
    }
    // вкладку спрятали или закрыли — отправляем сразу (после этого страница может уже не закрыться «по-хорошему»)
    const onVis = () => (document.visibilityState === 'hidden' ? flush() : (since = Date.now()))
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, authReady, mine])

  // «Ещё идеи»: с общими категориями, сначала — чаще сохраняемые; порциями
  const topicsList = p ? `{${p.topics.map((t) => `"${t.replace(/["\\]/g, '')}"`).join(',')}}` : '{}'
  const more = usePaged(
    `more:${id}`,
    (offset, limit) =>
      restGet<PostRow[]>(
        `posts?select=*&topics=ov.${encodeURIComponent(topicsList)}&id=neq.${id}&hidden=is.false&order=saves_count.desc,created_at.desc&offset=${offset}&limit=${limit}`,
      ),
    { enabled: !!p },
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])
  useEffect(() => {
    if (params.get('tab') === 'tries') triesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [params, id])

  if (!p) return missing ? <Empty icon={SearchX}>Такой идеи нет или её удалили.</Empty> : <PostSkeleton />
  // скрытую видит только автор
  if (p.hidden && p.authorId !== me.id) return <Empty icon={SearchX}>Такой идеи нет или её удалили.</Empty>

  const a = user(p.authorId)
  const loadedTries = triesOf(p.id)
  const tries = loadedTries ?? []
  const total = loadedTries ? tries.length : p.tries
  const ok = loadedTries ? tries.filter((t) => t.ok).length : p.triesOk
  const pct = total ? Math.round((ok / total) * 100) : 0
  const photos = tries.filter((t) => t.img)
  const saved = savedIn(p.id)
  const isMine = mine
  const morePosts = more.posts.filter((x) => x.id !== p.id && !x.hidden)
  const follow = () => {
    if (!follows.includes(p.authorId)) trackFollowFromPost(p.id)
    toggleFollow(p.authorId)
  }
  const shown = allTries || params.get('tab') === 'tries' ? tries : tries.slice(0, FIRST_TRIES)

  const share = async () => {
    const url = window.location.href
    if (!isMine) trackShare(p.id)
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

  const remove = async () => {
    setDeleting(true)
    setDeleteErr('')
    try {
      await deletePost(p.id)
      toast('Идея удалена')
      nav(`/u/${me.id}`, { replace: true })
    } catch (e) {
      setDeleting(false)
      setDeleteErr(e instanceof Rejected ? e.reasons.join('. ') : 'Не получилось удалить. Попробуйте ещё раз.')
    }
  }

  // «в избранное»: открывает выбор папки; рядом — сколько человек уже добавили
  const saveButton = (cls: string) => (
    <button
      type="button"
      onClick={() => openSave(p.id)}
      aria-pressed={saved.length > 0}
      aria-label={`${saved.length ? 'Сохранено' : 'Сохранить'}. В избранном у ${p.saves}`}
      title={`В избранном у ${p.saves} ${plural(p.saves, 'человека', 'человек', 'человек')}`}
      className={cls}
    >
      <Bookmark size={20} strokeWidth={2.2} fill={saved.length ? 'currentColor' : 'none'} />
      <span>{num(p.saves)}</span>
    </button>
  )

  return (
    <>
      <div className="mx-auto max-w-6xl px-3 pt-3 md:px-6 md:pt-6 md:pl-[72px] xl:pl-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
          {/* картинки — в них вся идея */}
          {/* «Назад» — слева от картинки, вплотную (место под неё — отступ страницы); на телефоне места нет — поверх картинки слева сверху */}
          <div className="relative md:sticky md:top-20 md:self-start">
            <Gallery key={p.id} post={p} onSeen={(n) => (maxSeen.current = Math.max(maxSeen.current, n))} />
            <IconButton
              icon={ArrowLeft}
              label="Назад"
              className="absolute top-2 left-2 z-10 shadow-sm md:top-0 md:-left-12 md:shadow-none"
              onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}
            />
          </div>

          <div className="min-w-0">
            {p.hidden && (
              <div className="mb-3 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-500" role="alert">
                <p className="font-bold">Идея скрыта — её видите только вы</p>
                <p className="mt-0.5">{p.hidden}. Удалите её и опубликуйте снова.</p>
              </div>
            )}
            {/* категории слева, «Удалить» и «Поделиться» — справа в том же ряду */}
            <div className="mb-3 flex items-start gap-2">
              <div className="flex flex-1 flex-wrap gap-2">
                {p.topics.map((t) => (
                  <Link
                    key={t}
                    to={`/search?q=${encodeURIComponent(topicLabel(t))}`}
                    className="press rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-active"
                  >
                    {topicLabel(t)}
                  </Link>
                ))}
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
              {isMine && <IconButton icon={BarChart3} label="Статистика идеи" onClick={() => nav(`/stats/${p.id}`)} />}
              {isMine && <IconButton icon={Trash2} label="Удалить идею" onClick={() => setAskDelete(true)} />}
              {!isMine && <IconButton icon={Flag} label="Пожаловаться" onClick={() => openReport('post', p.id)} />}
              <IconButton icon={Link2} label="Поделиться" onClick={share} />
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
                <Button size="sm" kind={follows.includes(a.id) ? 'neutral' : 'secondary'} onClick={follow}>
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
              {saveButton('press card inline-flex h-12 items-center gap-2 px-4 text-sm font-semibold hover:bg-active')}
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
                Повторили · {total}
              </h2>
              {!loadedTries ? (
                <div className="flex flex-col gap-2" role="status" aria-label="Загрузка отзывов">
                  <Bone className="h-[76px] rounded-2xl" />
                  {total > 0 && <Bone className="h-[76px] rounded-2xl" />}
                </div>
              ) : tries.length === 0 ? (
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
        {saveButton(
          'press glass-strong inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-2xl px-3 text-sm font-semibold shadow-lg',
        )}
      </div>
      <div className="h-16 md:hidden" aria-hidden />

      {morePosts.length > 0 && (
        <section className="mt-10 px-2 sm:px-3 md:px-4 lg:px-6" aria-labelledby="more-h">
          <h2 id="more-h" className="mb-3 px-1 text-lg font-bold md:text-center">
            Ещё идеи
          </h2>
          <Masonry posts={morePosts} source="more" />
          <MoreLoader list={more.list} onMore={more.more} onRetry={more.retry} />
        </section>
      )}

      <Sheet open={askDelete} onClose={() => !deleting && setAskDelete(false)} title="Удалить идею?">
        <p className="text-sm leading-relaxed">
          «{p.title}» пропадёт у всех: вместе с картинками, отметками «Я попробовал» и ответами на них. Вернуть не получится.
        </p>
        {deleteErr && (
          <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
            {deleteErr}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button kind="neutral" onClick={() => setAskDelete(false)} disabled={deleting}>
            Отмена
          </Button>
          <Button kind="danger" icon={Trash2} onClick={remove} disabled={deleting}>
            {deleting ? 'Удаляем…' : 'Удалить'}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/** Отзыв «Я попробовал» и ответы на него. Отвечать может любой, у автора поста — метка «автор» */
function TryItem({ t, authorId }: { t: Try; authorId: string }) {
  const { user, me, repliesOf, addReply, authed, setLoginOpen } = useStore()
  const { openReport } = useUi()
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
            {t.userId !== me.id && (
              <button type="button" className="press ml-auto text-muted hover:underline" onClick={() => openReport('try', t.id)}>
                Пожаловаться
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
                    {r.userId !== me.id && (
                      <button
                        type="button"
                        aria-label="Пожаловаться на ответ"
                        title="Пожаловаться"
                        className="press ml-auto inline-flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-active"
                        onClick={() => openReport('reply', r.id)}
                      >
                        <Flag size={13} />
                      </button>
                    )}
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
