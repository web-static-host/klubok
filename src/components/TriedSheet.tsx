import { useRef, useState } from 'react'
import { Camera, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { Img } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { Button } from './ui'

/** «Я попробовал» — DESIGN_WEB 3.6: результат обязателен, фото и комментарий — по желанию */
export function TriedSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const { addTry, post } = useStore()
  const { toast } = useUi()
  const [ok, setOk] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const [img, setImg] = useState<Img | undefined>()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const p = postId ? post(postId) : undefined

  const close = () => {
    if (busy) return
    setOk(null)
    setText('')
    setImg(undefined)
    setErr('')
    onClose()
  }

  const submit = async () => {
    if (!postId) return
    if (ok === null) {
      setErr('Выберите результат: получилось или нет')
      return
    }
    setBusy(true)
    try {
      await addTry(postId, ok, text.trim() || undefined, img)
    } catch {
      setBusy(false)
      setErr('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.')
      return
    }
    setBusy(false)
    setOk(null)
    setText('')
    setImg(undefined)
    onClose()
    toast(ok ? 'Отлично! Ваш результат добавлен' : 'Спасибо, это поможет другим')
  }

  return (
    <Sheet open={!!postId} onClose={close} title="Я попробовал">
      {p && <p className="mb-3 line-clamp-1 text-sm">«{p.title}»</p>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Результат">
        {[
          { v: true, label: 'Получилось', icon: ThumbsUp },
          { v: false, label: 'Не получилось', icon: ThumbsDown },
        ].map(({ v, label, icon: Icon }) => {
          const on = ok === v
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setOk(v)
                setErr('')
              }}
              className={cx(
                'press flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-bold',
                on
                  ? v
                    ? 'border-accent/40 bg-accent/15 text-ink'
                    : 'border-rose-500/40 bg-rose-500/12 text-ink'
                  : 'border-line bg-surface hover:bg-active',
              )}
            >
              <span
                className={cx(
                  'inline-flex h-11 w-11 items-center justify-center rounded-2xl',
                  on ? (v ? 'grad' : 'bg-gradient-to-br from-[#FB7185] to-[#E11D48] text-white') : 'bg-elevated',
                )}
              >
                <Icon size={22} strokeWidth={on ? 2.4 : 2} />
              </span>
              {label}
            </button>
          )
        })}
      </div>
      {err && (
        <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
          {err}
        </p>
      )}

      <p className="section-label mt-5 mb-2">Фото результата · по желанию</p>
      {img ? (
        <div className="relative w-28">
          <img src={img.src} alt="Ваше фото" className="h-28 w-28 rounded-2xl object-cover" />
          <button
            type="button"
            aria-label="Убрать фото"
            onClick={() => setImg(undefined)}
            className="press glass-strong absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-5 text-sm font-semibold hover:bg-active"
        >
          <Camera size={18} /> Добавить фото
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) setImg(await fileToImg(f, 700))
          e.target.value = ''
        }}
      />

      <p className="section-label mt-5 mb-2">Комментарий · по желанию</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Что получилось, что бы сделали иначе"
        className="card w-full resize-none px-4 py-3 text-base outline-none placeholder:text-muted"
      />

      <Button className="mt-4 w-full" onClick={submit} disabled={busy}>
        {busy ? 'Отправляем…' : 'Отправить'}
      </Button>
    </Sheet>
  )
}
