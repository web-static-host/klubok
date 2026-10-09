import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Plus, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { Topic } from '../data/types'
import { Rejected, useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { RulesLink } from './RulesSheet'
import { useCheckedImages } from './useCheckedImages'
import { warmChecks } from '../supabase'
import { Button, Toggle } from './ui'
import { TopicPicker } from './TopicPicker'

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted disabled:opacity-60'
const MAX = 10
/** категорий у идеи — до 5 */
const MAX_TOPICS = 5

/** Создание поста: картинки (вся идея на них), название, категория — DESIGN_WEB 3.9 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addPost, me } = useStore()
  const { toast } = useUi()
  const nav = useNavigate()
  const { pathname } = useLocation()
  // картинки загружаются и проверяются сразу после выбора, в фоне
  const pics = useCheckedImages('post')
  const images = pics.items
  // нажали «Опубликовать», пока картинки ещё проверяются, — опубликуем сами, когда закончится
  const [waiting, setWaiting] = useState(false)
  const [beforeAfter, setBeforeAfter] = useState(false)
  const [title, setTitle] = useState('')
  // человек сам писал название — подбор по картинке его больше не трогает
  const [titleTouched, setTitleTouched] = useState(false)
  const [topics, setTopics] = useState<Topic[]>([])
  // человек сам менял категории — подбор по картинкам их больше не трогает
  const [topicsTouched, setTopicsTouched] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // перетаскивание миниатюр: хватаешь и тянешь — остальные раздвигаются на ходу; работает и пальцем
  const [dragKey, setDragKey] = useState<string | null>(null)
  const drag = useRef<{ key: string; x: number; y: number; active: boolean } | null>(null)
  const thumbs = useRef(new Map<string, HTMLElement>())
  // какая картинка показана крупно
  // выбранная картинка — по её ключу, а не номеру: при перестановке выбор остаётся на ней
  const [selKey, setSelKey] = useState<string | null>(null)
  const sel = Math.max(
    0,
    images.findIndex((i) => i.key === selKey),
  )
  const cur = images[sel]
  // «До и после» включено и выбрана 1-я или 2-я — крупно показываем обе рядом
  const pairView = beforeAfter && images.length >= 2 && sel < 2
  const label = (i: number) => (beforeAfter && i < 2 ? (i ? 'После' : 'До') : String(i + 1))

  /** Картинки из выбора файла, перетаскивания или вставки (Ctrl+V) */
  const addFiles = async (list: File[]) => {
    const files = list.filter((f) => f.type.startsWith('image/'))
    if (!files.length) return setErr('Можно добавлять только картинки')
    const room = MAX - images.length
    if (room <= 0) return setErr(`Не больше ${MAX} картинок`)
    pics.add(await Promise.all(files.slice(0, room).map((f) => fileToImg(f, 1400))))
    setErr(files.length > room ? `Добавлено ${room}: больше ${MAX} картинок нельзя` : '')
  }
  const addRef = useRef(addFiles)
  useEffect(() => {
    addRef.current = addFiles
  })

  // пока окно открыто: картинку, брошенную мимо, браузер не открывает; Ctrl+V вставляет картинку
  useEffect(() => {
    if (!open) return
    // окно открыли — будим проверку заранее, чтобы первая картинка не ждала запуска функции и входа в ИИ
    warmChecks()
    const stop = (e: DragEvent) => e.preventDefault()
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        addRef.current(files)
      }
    }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
      window.removeEventListener('paste', paste)
    }
  }, [open])

  const reset = () => {
    pics.reset()
    setWaiting(false)
    setBeforeAfter(false)
    setTitle('')
    setTitleTouched(false)
    setTopics([])
    setTopicsTouched(false)
    setSelKey(null)
    setErr('')
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  // категории, которые ИИ подобрал по картинкам (сначала — по первой), до 5; показываем их, пока человек сам не поменял
  const aiTopics = useMemo(() => [...new Set(images.flatMap((i) => i.topics ?? []))].slice(0, 5), [images])
  const shownTopics = topicsTouched ? topics : aiTopics
  // название, которое ИИ предложил по картинкам (по первой, где оно есть); показываем, пока человек не начал писать своё
  const aiTitle = images.find((i) => i.title)?.title ?? ''
  const shownTitle = titleTouched ? title : aiTitle
  // название и категории подбираются по картинке — до её проверки их не трогаем (иначе подбор и правка спорят)
  const locked = !images.length
    ? 'Сначала загрузите картинку'
    : images.some((i) => i.status !== 'checking')
      ? ''
      : 'Проверяем картинку — подберём сами…'

  const publish = async () => {
    setWaiting(false)
    if (!images.length) return setErr('Добавьте хотя бы одну картинку')
    // названия нет, а картинки ещё проверяются — подберётся по ним; публикуем, когда проверка закончится
    if (!shownTitle.trim() && (titleTouched || !pics.pending)) return setErr('Напишите название')
    // категорий нет, а картинки ещё проверяются — категории подберутся по ним; публикуем, когда проверка закончится
    const list = shownTopics
    if (!list.length && !pics.pending) return setErr('Выберите хотя бы одну категорию')
    if (beforeAfter && images.length < 3) return setErr('Для «до и после» добавьте ещё хотя бы одну картинку — как вы это сделали')
    if (pics.bad) return setErr('Уберите картинки, которые не прошли проверку (отмечены красным)')
    if (pics.pending) {
      setErr('')
      return setWaiting(true)
    }
    setBusy(true)
    try {
      await addPost({
        type: beforeAfter ? 'beforeafter' : 'photo',
        topics: list,
        title: shownTitle.trim().replace(/\s+/g, ' '),
        images: pics.result(),
      })
      setBusy(false)
      reset()
      onClose()
      toast('Опубликовано')
      // новая идея — первой в «Публикациях» профиля (подсвечена); уже в профиле — просто закрываем окно
      if (pathname !== '/me' && pathname !== `/u/${me.id}`) nav('/me')
    } catch (e) {
      setBusy(false)
      setErr(
        e instanceof Rejected
          ? `Не опубликовано: ${e.reasons.join('. ')}`
          : 'Не получилось опубликовать. Проверьте интернет и попробуйте ещё раз.',
      )
    }
  }

  // проверка картинок закончилась — публикуем, если просили
  const publishRef = useRef(publish)
  useEffect(() => {
    publishRef.current = publish
  })
  useEffect(() => {
    if (waiting && !pics.pending) publishRef.current()
  }, [waiting, pics.pending])

  return (
    <Sheet open={open} onClose={close} title="Новая идея" wide="xl">
      {/* как на странице идеи: картинки слева, название и категории справа; на телефоне — друг под другом */}
      <form
        className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start md:gap-6"
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files')) setDragOver(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.types.includes('Files')) addFiles([...e.dataTransfer.files])
        }}
        onSubmit={(e) => {
          e.preventDefault()
          publish()
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-sm leading-relaxed">
            Вся идея — на картинках: шаги, состав, подсказки. Без людей в кадре (руки можно). До {MAX} картинок, их будут листать. Перед
            публикацией всё проверяется по <RulesLink className="font-semibold text-accent hover:underline">правилам</RulesLink>.
          </p>
          {/* большая картинка — того же размера, что и пустое поле, поэтому окно не сжимается; ниже — ряд миниатюр */}
          {images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cx(
                'press flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold hover:bg-active md:aspect-[4/5] md:max-h-[56dvh]',
                dragOver ? 'border-accent bg-accent/10' : 'border-line-strong',
              )}
            >
              <ImagePlus size={32} strokeWidth={1.8} />
              {dragOver ? 'Отпустите, чтобы добавить' : 'Загрузить картинки'}
              <span className="px-4 text-center text-xs font-normal text-muted">
                Перетащите сюда, вставьте (Ctrl+V) или нажмите, чтобы выбрать. Можно несколько сразу
              </span>
            </button>
          ) : (
            <>
              <div
                className={cx(
                  'relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-elevated md:aspect-[4/5] md:max-h-[calc(56dvh-96px)]',
                  dragOver && 'outline-2 outline-offset-4 outline-accent outline-dashed',
                )}
              >
                {pairView ? (
                  // «До и после»: первые две картинки рядом — как они встанут в готовой идее
                  <div className="grid h-full grid-cols-2 gap-0.5">
                    {images.slice(0, 2).map((it, i) => (
                      <div key={it.key} className="relative min-w-0">
                        <img
                          src={it.preview.src}
                          alt={i ? 'После' : 'До'}
                          className={cx('h-full w-full object-contain', it.status === 'bad' && 'opacity-40')}
                        />
                        <span className="glass-strong absolute bottom-2 left-2 rounded-full px-3 py-1 text-xs font-bold">
                          {i ? 'После' : 'До'}
                        </span>
                        <button
                          type="button"
                          aria-label={`Убрать картинку «${i ? 'После' : 'До'}»`}
                          onClick={() => pics.remove(it.key)}
                          className="press glass-strong absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          <X size={16} strokeWidth={2.4} />
                        </button>
                        {it.status === 'checking' && (
                          <span className="glass-strong absolute top-1/2 left-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold">
                            <Loader2 size={13} className="animate-spin" /> Проверяем…
                          </span>
                        )}
                        {it.status === 'bad' && (
                          <span
                            className="absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-xl bg-rose-500 px-2 py-1.5 text-center text-[11px] leading-tight font-bold text-white"
                            role="alert"
                          >
                            {it.reasons?.join('. ') || 'Не прошла проверку'}
                          </span>
                        )}
                      </div>
                    ))}
                    {/* поменять «до» и «после» местами — кружок на шве между картинками */}
                    <button
                      type="button"
                      onClick={() => pics.move(0, 1)}
                      aria-label="Поменять «до» и «после» местами"
                      title="Поменять местами"
                      className="press glass-strong absolute top-1/2 left-1/2 inline-flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow"
                    >
                      <ArrowLeftRight size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <img
                      src={cur.preview.src}
                      alt={`Картинка ${sel + 1}`}
                      className={cx('h-full w-full object-contain', cur.status === 'bad' && 'opacity-40')}
                    />
                    <span className="glass-strong absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-bold">{label(sel)}</span>
                    <button
                      type="button"
                      aria-label={`Убрать картинку ${sel + 1}`}
                      onClick={() => pics.remove(cur.key)}
                      className="press glass-strong absolute top-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full"
                    >
                      <X size={18} strokeWidth={2.4} />
                    </button>
                    {cur.status === 'checking' && (
                      <span className="glass-strong absolute top-1/2 left-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
                        <Loader2 size={14} className="animate-spin" /> Проверяем…
                      </span>
                    )}
                    {cur.status === 'bad' && (
                      <span
                        className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl bg-rose-500 px-3 py-2 text-center text-xs leading-snug font-bold text-white"
                        role="alert"
                      >
                        <TriangleAlert size={16} className="mx-auto mb-1" />
                        {cur.reasons?.join('. ') || 'Не прошла проверку'}
                      </span>
                    )}
                    {/* порядок: передвинуть эту картинку левее / правее */}
                    <div className="absolute inset-x-2 bottom-2 flex justify-between">
                      {sel > 0 ? (
                        <button
                          type="button"
                          aria-label="Переставить левее"
                          onClick={() => {
                            pics.move(sel, -1)
                          }}
                          className="press glass-strong inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-2 text-xs font-bold"
                        >
                          <ChevronLeft size={16} /> Раньше
                        </button>
                      ) : (
                        <span />
                      )}
                      {sel < images.length - 1 && (
                        <button
                          type="button"
                          aria-label="Переставить правее"
                          onClick={() => {
                            pics.move(sel, 1)
                          }}
                          className="press glass-strong inline-flex h-9 items-center gap-1 rounded-full pr-2 pl-3 text-xs font-bold"
                        >
                          Позже <ChevronRight size={16} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {images.map((it, i) => (
                  <div
                    key={it.key}
                    ref={(el) => {
                      if (el) thumbs.current.set(it.key, el)
                      else thumbs.current.delete(it.key)
                    }}
                    className={cx('relative transition-transform', dragKey === it.key && 'z-10 scale-110')}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Картинка ${i + 1}: показать; перетащите, чтобы поменять порядок`}
                      aria-pressed={i === sel}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelKey(it.key))}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        drag.current = { key: it.key, x: e.clientX, y: e.clientY, active: false }
                        e.currentTarget.setPointerCapture(e.pointerId)
                      }}
                      onPointerMove={(e) => {
                        const d = drag.current
                        if (!d) return
                        if (!d.active) {
                          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
                          d.active = true
                          setDragKey(d.key)
                        }
                        // ставим на место той миниатюры, к центру которой ближе всего палец/мышь
                        let to = -1
                        let best = Infinity
                        images.forEach((im, k) => {
                          const r = thumbs.current.get(im.key)?.getBoundingClientRect()
                          if (!r) return
                          const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
                          if (dist < best) {
                            best = dist
                            to = k
                          }
                        })
                        const from = images.findIndex((im) => im.key === d.key)
                        if (to >= 0 && to !== from) pics.reorder(from, to)
                      }}
                      onPointerUp={() => {
                        const d = drag.current
                        drag.current = null
                        setDragKey(null)
                        if (d) setSelKey(d.key) // просто нажали или дотащили — показываем её крупно
                      }}
                      onPointerCancel={() => {
                        drag.current = null
                        setDragKey(null)
                      }}
                      className={cx(
                        'press relative block h-20 w-16 cursor-grab touch-none overflow-hidden rounded-xl bg-elevated ring-2 ring-offset-2 ring-offset-bg select-none',
                        i === sel ? 'ring-accent' : 'ring-transparent',
                        dragKey === it.key && 'cursor-grabbing shadow-lg',
                      )}
                    >
                      <img
                        src={it.preview.src}
                        alt=""
                        draggable={false}
                        className={cx('pointer-events-none h-full w-full object-cover', it.status === 'bad' && 'opacity-40')}
                      />
                      <span className="glass-strong absolute top-1 left-1 rounded-full px-1.5 text-[10px] leading-4 font-bold">
                        {label(i)}
                      </span>
                      <span className="absolute right-1 bottom-1">
                        {it.status === 'checking' && (
                          <span className="glass-strong inline-flex h-5 w-5 items-center justify-center rounded-full" title="Проверяем">
                            <Loader2 size={12} className="animate-spin" />
                          </span>
                        )}
                        {it.status === 'ok' && (
                          <span className="grad inline-flex h-5 w-5 items-center justify-center rounded-full" title="Проверено">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                        {it.status === 'bad' && (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"
                            title="Не прошла"
                          >
                            <TriangleAlert size={12} />
                          </span>
                        )}
                      </span>
                    </div>
                    {dragKey !== it.key && (
                      <button
                        type="button"
                        aria-label={`Убрать картинку ${i + 1}`}
                        onClick={() => pics.remove(it.key)}
                        className="press glass-strong absolute -top-1.5 -right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full shadow"
                      >
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    )}
                  </div>
                ))}
                {images.length < MAX && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label="Добавить ещё картинки"
                    className="press flex h-20 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line-strong text-[11px] font-semibold hover:bg-active"
                  >
                    <Plus size={18} />
                    Ещё
                  </button>
                )}
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) addFiles(files)
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <p className="section-label -mb-2">Название</p>
          <input
            value={shownTitle}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleTouched(true)
            }}
            maxLength={80}
            disabled={!!locked}
            placeholder={
              locked ||
              (pics.pending && !titleTouched
                ? 'Подберём название по картинке — или напишите своё'
                : 'Название, например «Сырники без муки»')
            }
            aria-label="Название"
            className={field}
          />
          {!titleTouched && aiTitle && (
            <p className="-mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
              <Sparkles size={13} className="text-accent" /> Название подобрано по картинке — можно поменять
            </p>
          )}

          <TopicPicker
            value={shownTopics}
            onChange={(v) => {
              setTopics(v)
              setTopicsTouched(true)
              setErr('')
            }}
            auto={!topicsTouched}
            max={MAX_TOPICS}
            locked={locked}
          />

          {images.length >= 2 && (
            <Toggle
              checked={beforeAfter}
              onChange={setBeforeAfter}
              label="До и после"
              hint="Первые две картинки — до и после. Далее добавьте ещё хотя бы одну картинку"
            >
              {beforeAfter && images.length < 3 && (
                <span className="mt-1 block text-xs font-semibold text-accent">Добавьте ещё картинку</span>
              )}
            </Toggle>
          )}

          {err && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
              {err}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || waiting}>
            {busy ? 'Публикуем…' : waiting ? `Опубликуем, как только проверим картинки (осталось ${pics.pending})` : 'Опубликовать'}
          </Button>
          {pics.pending > 0 && !waiting && (
            <p className="-mt-2 text-center text-xs">
              Картинки проверяются. Название и категории подберутся по ним сами — их можно поменять.
            </p>
          )}
        </div>
      </form>
    </Sheet>
  )
}
