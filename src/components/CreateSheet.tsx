import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImagePlus, Plus, X } from 'lucide-react'
import type { Img, Topic } from '../data/types'
import { TOPICS } from '../data/types'
import { Rejected, useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { RulesLink } from './RulesSheet'
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
  const [dragOver, setDragOver] = useState(false)

  /** Картинки из выбора файла, перетаскивания или вставки (Ctrl+V) */
  const addFiles = async (list: File[]) => {
    const pics = list.filter((f) => f.type.startsWith('image/'))
    if (!pics.length) return setErr('Можно добавлять только картинки')
    const room = MAX - images.length
    if (room <= 0) return setErr(`Не больше ${MAX} картинок`)
    const added = await Promise.all(pics.slice(0, room).map((f) => fileToImg(f, 1400)))
    setImages((a) => [...a, ...added].slice(0, MAX))
    setErr(pics.length > room ? `Добавлено ${room}: больше ${MAX} картинок нельзя` : '')
  }
  const addRef = useRef(addFiles)
  useEffect(() => {
    addRef.current = addFiles
  })

  // пока окно открыто: картинку, брошенную мимо, браузер не открывает; Ctrl+V вставляет картинку
  useEffect(() => {
    if (!open) return
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
    } catch (e) {
      setBusy(false)
      setErr(
        e instanceof Rejected
          ? `Не опубликовано: ${e.reasons.join('. ')}`
          : 'Не получилось опубликовать. Проверьте интернет и попробуйте ещё раз.',
      )
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Новая идея" wide>
      <form
        className="flex flex-col gap-4"
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
          addFiles([...e.dataTransfer.files])
        }}
        onSubmit={(e) => {
          e.preventDefault()
          publish()
        }}
      >
        <p className="text-sm leading-relaxed">
          Вся идея — на картинках: шаги, состав, подсказки. Без людей в кадре (руки можно). До {MAX} картинок, их будут листать. Перед
          публикацией всё проверяется по <RulesLink className="font-semibold text-accent hover:underline">правилам</RulesLink>.
        </p>
        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cx(
              'press flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold hover:bg-active',
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
          <div className={cx('grid grid-cols-3 gap-2 rounded-2xl', dragOver && 'outline-2 outline-offset-4 outline-accent outline-dashed')}>
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
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) addFiles(files)
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
          {busy ? 'Проверяем и публикуем…' : 'Опубликовать'}
        </Button>
      </form>
    </Sheet>
  )
}
