import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus, Plus, X } from 'lucide-react'
import type { Img, Topic } from '../data/types'
import { TOPICS } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'
const OWN = '__own'

/** Заголовок — первая строка подписи; длинную обрезаем по слову */
function splitCaption(caption: string) {
  const [first, ...rest] = caption.trim().split('\n')
  const line = first.trim()
  if (line.length <= 90) return { title: line, text: rest.join('\n').trim() }
  const cut = line.slice(0, 90)
  return { title: cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 90) + '…', text: caption.trim() }
}

/** Создание поста: фото, подпись, категория — DESIGN_WEB 3.9 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addPost } = useStore()
  const { toast } = useUi()
  const nav = useNavigate()
  const [image, setImage] = useState<Img>()
  const [caption, setCaption] = useState('')
  const [topic, setTopic] = useState<Topic>('')
  const [own, setOwn] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setImage(undefined)
    setCaption('')
    setTopic('')
    setOwn('')
    setErr('')
    onClose()
  }

  const publish = () => {
    if (!image) return setErr('Добавьте фото')
    if (!caption.trim()) return setErr('Напишите подпись')
    let t = topic
    if (topic === OWN) {
      const name = own.trim().replace(/\s+/g, ' ')
      if (!name) return setErr('Впишите свою категорию')
      // вписали существующую — берём её из списка
      t = TOPICS.find((x) => x.label.toLowerCase() === name.toLowerCase())?.id ?? name[0].toUpperCase() + name.slice(1)
    }
    if (!t) return setErr('Выберите категорию')
    const id = addPost({ type: 'photo', topic: t, ...splitCaption(caption), images: [image], tags: [] })
    close()
    toast('Опубликовано')
    nav(`/p/${id}`)
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
        {image ? (
          <div className="relative mx-auto w-full max-w-sm">
            <img src={image.src} alt="Фото" className="max-h-[60vh] w-full rounded-2xl object-cover" />
            <button
              type="button"
              aria-label="Убрать фото"
              onClick={() => setImage(undefined)}
              className="press glass-strong absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm font-semibold hover:bg-active"
          >
            <ImagePlus size={32} strokeWidth={1.8} />
            Загрузить фото
            <span className="text-xs font-normal text-muted">Сама идея: еда, вещи, интерьер, растения — без людей</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) {
              setImage(await fileToImg(f))
              setErr('')
            }
            e.target.value = ''
          }}
        />

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={'Подпись\nПервая строка станет заголовком'}
          aria-label="Подпись"
          className={`${field} resize-y`}
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
        <Button type="submit" className="w-full">
          Опубликовать
        </Button>
      </form>
    </Sheet>
  )
}
