import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImagePlus, Plus, X } from 'lucide-react'
import type { Img, Topic } from '../data/types'
import { TOPICS } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'
const OWN = '__own'
const MAX = 10

/** Создание поста: картинки (вся идея на них), название, категория — DESIGN_WEB 3.9 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addPost } = useStore()
  const { toast } = useUi()
  const nav = useNavigate()
  const [images, setImages] = useState<Img[]>([])
  const [beforeAfter, setBeforeAfter] = useState(false)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState<Topic>('')
  const [own, setOwn] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setImages([])
    setBeforeAfter(false)
    setTitle('')
    setTopic('')
    setOwn('')
    setErr('')
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const move = (i: number, d: -1 | 1) =>
    setImages((a) => {
      const b = [...a]
      ;[b[i], b[i + d]] = [b[i + d], b[i]]
      return b
    })

  const publish = async () => {
    if (!images.length) return setErr('Добавьте хотя бы одну картинку')
    if (!title.trim()) return setErr('Напишите название')
    let t = topic
    if (topic === OWN) {
      const name = own.trim().replace(/\s+/g, ' ')
      if (!name) return setErr('Впишите свою категорию')
      // вписали существующую — берём её из списка
      t = TOPICS.find((x) => x.label.toLowerCase() === name.toLowerCase())?.id ?? name[0].toUpperCase() + name.slice(1)
    }
    if (!t) return setErr('Выберите категорию')
    setBusy(true)
    try {
      const id = await addPost({
        type: beforeAfter && images.length === 2 ? 'beforeafter' : 'photo',
        topic: t,
        title: title.trim().replace(/\s+/g, ' '),
        images,
      })
      setBusy(false)
      reset()
      onClose()
      toast('Опубликовано')
      nav(`/p/${id}`)
    } catch {
      setBusy(false)
      setErr('Не получилось опубликовать. Проверьте интернет и попробуйте ещё раз.')
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Новая идея" wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          publish()
        }}
      >
        <p className="text-sm leading-relaxed">
          Вся идея — на картинках: шаги, состав, подсказки. Без людей в кадре (руки можно). До {MAX} картинок, их будут листать.
        </p>
        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm font-semibold hover:bg-active"
          >
            <ImagePlus size={32} strokeWidth={1.8} />
            Загрузить картинки
            <span className="text-xs font-normal text-muted">Можно выбрать несколько сразу</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((im, i) => (
              <div key={i} className="relative">
                <img src={im.src} alt={`Картинка ${i + 1}`} className="aspect-[3/4] w-full rounded-xl bg-elevated object-contain" />
                <span className="glass-strong absolute top-1.5 left-1.5 rounded-full px-2 text-[11px] font-bold">
                  {beforeAfter && images.length === 2 ? (i ? 'После' : 'До') : i + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Убрать картинку ${i + 1}`}
                  onClick={() => setImages((a) => a.filter((_, j) => j !== i))}
                  className="press glass-strong absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                  {i > 0 ? (
                    <button
                      type="button"
                      aria-label="Переставить левее"
                      onClick={() => move(i, -1)}
                      className="press glass-strong inline-flex h-7 w-7 items-center justify-center rounded-full"
                    >
                      <ChevronLeft size={16} />
                    </button>
                  ) : (
                    <span />
                  )}
                  {i < images.length - 1 && (
                    <button
                      type="button"
                      aria-label="Переставить правее"
                      onClick={() => move(i, 1)}
                      className="press glass-strong inline-flex h-7 w-7 items-center justify-center rounded-full"
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {images.length < MAX && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-xs font-semibold hover:bg-active"
              >
                <Plus size={22} />
                Ещё
              </button>
            )}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])].slice(0, MAX - images.length)
            e.target.value = ''
            if (!files.length) return
            const added = await Promise.all(files.map((f) => fileToImg(f, 1400)))
            setImages((a) => [...a, ...added].slice(0, MAX))
            setErr('')
          }}
        />

        {images.length === 2 && (
          <label className="card flex cursor-pointer items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              checked={beforeAfter}
              onChange={(e) => setBeforeAfter(e.target.checked)}
              className="h-5 w-5 accent-accent"
            />
            <span className="text-sm">
              <b>До и после</b> — показать две картинки рядом
            </span>
          </label>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Название, например «Сырники без муки»"
          aria-label="Название"
          className={field}
        />

        <div>
          <p className="section-label mb-2">Категория</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <Chip key={t.id} active={topic === t.id} onClick={() => setTopic(t.id)}>
                {t.label}
              </Chip>
            ))}
            <Chip active={topic === OWN} onClick={() => setTopic(OWN)}>
              <span className="inline-flex items-center gap-1">
                <Plus size={14} strokeWidth={2.4} /> Своя
              </span>
            </Chip>
          </div>
          <input
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            maxLength={40}
            placeholder="Например: Аквариум"
            aria-label="Своя категория"
            className={cx(field, 'mt-2', topic !== OWN && 'hidden')}
          />
        </div>

        {err && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Публикуем…' : 'Опубликовать'}
        </Button>
      </form>
    </Sheet>
  )
}
