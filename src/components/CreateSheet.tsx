import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ImagePlus, X } from 'lucide-react'
import type { Img, PostType, Topic } from '../data/types'
import { TOPICS, TYPE_META } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { Button, Chip, IconTile, Segmented, typeIcon } from './ui'

const DESCR: Record<PostType, string> = {
  photo: 'Картинка и пара слов — идея для вдохновения',
  recipe: 'Ингредиенты, время и шаги — чтобы можно было повторить',
  hack: 'Хитрость по шагам: как сделать проще',
  beforeafter: 'Два фото: как было и как стало',
}
const ORDER: PostType[] = ['photo', 'recipe', 'hack', 'beforeafter']

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/^\d+[.)]\s*/, ''))

/** «Что создать?» → форма — DESIGN_WEB 3.9 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addPost } = useStore()
  const { toast } = useUi()
  const nav = useNavigate()
  const [type, setType] = useState<PostType | null>(null)
  const [images, setImages] = useState<(Img | undefined)[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [topic, setTopic] = useState<Topic>('recipes')
  const [time, setTime] = useState('')
  const [servings, setServings] = useState('2')
  const [difficulty, setDifficulty] = useState<'Легко' | 'Средне' | 'Сложно'>('Легко')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const slot = useRef(0)

  const reset = () => {
    setType(null)
    setImages([])
    setTitle('')
    setText('')
    setTime('')
    setServings('2')
    setIngredients('')
    setSteps('')
    setErr('')
  }
  const close = () => {
    reset()
    onClose()
  }

  const pick = (t: PostType) => {
    setType(t)
    setTopic(t === 'recipe' ? 'recipes' : t === 'hack' ? 'hacks' : 'home')
  }

  const needImages = type === 'beforeafter' ? 2 : 1

  const publish = () => {
    if (!type) return
    const imgs = images.filter(Boolean) as Img[]
    if (imgs.length < needImages) return setErr(type === 'beforeafter' ? 'Добавьте оба фото: «до» и «после»' : 'Добавьте фото')
    if (!title.trim()) return setErr('Напишите название')
    if (type === 'recipe' && (!lines(ingredients).length || !lines(steps).length)) return setErr('Укажите ингредиенты и шаги')
    if (type === 'hack' && !lines(steps).length) return setErr('Опишите шаги')
    const id = addPost({
      type,
      topic,
      title: title.trim(),
      text: text.trim(),
      images: imgs,
      tags: [],
      recipe:
        type === 'recipe'
          ? { time: time.trim() || '—', servings: Number(servings) || 1, difficulty, ingredients: lines(ingredients), steps: lines(steps) }
          : undefined,
      steps: type === 'hack' ? lines(steps).map((s) => ({ text: s })) : undefined,
    })
    close()
    toast('Опубликовано')
    nav(`/p/${id}`)
  }

  return (
    <Sheet open={open} onClose={close} title={type ? TYPE_META[type].label : 'Что создать?'} wide={!!type}>
      {!type ? (
        <div className="flex flex-col gap-2">
          {ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              className="press card flex items-center gap-3 p-3 text-left hover:bg-active"
            >
              <IconTile icon={typeIcon(t)} colors={TYPE_META[t].colors} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{TYPE_META[t].label}</span>
                <span className="mt-0.5 block text-xs">{DESCR[t]}</span>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            publish()
          }}
        >
          <button
            type="button"
            onClick={() => setType(null)}
            className="press -mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent"
          >
            <ArrowLeft size={16} /> Другой формат
          </button>

          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: needImages }).map((_, i) => {
              const im = images[i]
              const label = type === 'beforeafter' ? (i === 0 ? 'Фото «До»' : 'Фото «После»') : 'Фото'
              return im ? (
                <div key={i} className="relative">
                  <img src={im.src} alt={label} className="aspect-[3/4] w-full rounded-2xl object-cover" />
                  <button
                    type="button"
                    aria-label="Убрать фото"
                    onClick={() => setImages((a) => a.map((x, j) => (j === i ? undefined : x)))}
                    className="press glass-strong absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full"
                  >
                    <X size={16} strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    slot.current = i
                    fileRef.current?.click()
                  }}
                  className="press flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm font-semibold hover:bg-active"
                >
                  <ImagePlus size={28} strokeWidth={1.8} />
                  {label}
                </button>
              )
            })}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                const im = await fileToImg(f)
                setImages((a) => {
                  const next = [...a]
                  next[slot.current] = im
                  return next
                })
                setErr('')
              }
              e.target.value = ''
            }}
          />

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={90}
            placeholder="Название"
            aria-label="Название"
            className={field}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Описание"
            aria-label="Описание"
            className={`${field} resize-none`}
          />

          <div>
            <p className="section-label mb-2">Тема</p>
            <div className="flex flex-wrap gap-2">
              {TOPICS.filter((t) => t.id !== 'all').map((t) => (
                <Chip key={t.id} active={topic === t.id} onClick={() => setTopic(t.id as Topic)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>

          {type === 'recipe' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="Время: 40 мин"
                  aria-label="Время"
                  className={field}
                />
                <input
                  value={servings}
                  onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="Порций"
                  aria-label="Порций"
                  className={field}
                />
              </div>
              <Segmented
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { id: 'Легко', label: 'Легко' },
                  { id: 'Средне', label: 'Средне' },
                  { id: 'Сложно', label: 'Сложно' },
                ]}
              />
              <textarea
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                rows={4}
                placeholder={'Ингредиенты — каждый с новой строки\nМука — 200 г\nЯйцо — 2 шт.'}
                aria-label="Ингредиенты"
                className={`${field} resize-y`}
              />
            </>
          )}
          {(type === 'recipe' || type === 'hack') && (
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={5}
              placeholder={'Шаги — каждый с новой строки\n1. …\n2. …'}
              aria-label="Шаги"
              className={`${field} resize-y`}
            />
          )}

          {err && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
              {err}
            </p>
          )}
          <Button type="submit" className="w-full">
            Опубликовать
          </Button>
        </form>
      )}
    </Sheet>
  )
}
